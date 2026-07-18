/**
 * Snappt bestehende bezahlte Preise auf die festen Apple-Preispunkte
 * (siehe lib/apple-products.ts). Ziel: Apple-IAP-Konformität — jeder bezahlte
 * Inhalt muss exakt einem Apple-Preispunkt entsprechen.
 *
 * Regeln:
 *  - Es wird immer auf den NÄCHSTHÖHEREN erlaubten Preispunkt gerundet (nie
 *    niedriger als der aktuelle Preis), damit kein Creator Umsatz verliert.
 *  - Liegt der Preis über dem Maximum, wird auf das Maximum gesetzt.
 *  - Bereits konforme Preise bleiben unverändert (idempotent).
 *  - Kostenlose Inhalte (priceCents = 0) bleiben kostenlos.
 *  - PHYSICAL-Produkte werden NICHT angetastet (nur Web-Verkauf, freier Preis).
 *
 * Betroffen: Tiers (non-FREE), digitale Produkte, PPV-Posts, Medien-Pakete,
 * Einzel-Medien, bepreiste Requests, Booking-Slots.
 *
 * Standardmäßig DRY-RUN (nur Ausgabe). Echte Änderungen NUR mit `--apply`.
 *
 *   npm run db:snap-prices             # dry-run (zeigt geplante Änderungen)
 *   npm run db:snap-prices -- --apply  # schreibt die Änderungen
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import {
  ONE_TIME_PRICE_POINTS,
  SUBSCRIPTION_PRICE_POINTS,
} from "../lib/apple-products";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes("--apply");
const ONE_TIME = [...ONE_TIME_PRICE_POINTS].sort((a, b) => a - b);
const SUBSCRIPTION = [...SUBSCRIPTION_PRICE_POINTS].sort((a, b) => a - b);

/** Nächsthöherer erlaubter Preispunkt (>= cents); über Maximum → Maximum. */
function snapUp(cents: number, points: number[]): number {
  if (cents <= 0) return cents;
  for (const p of points) if (p >= cents) return p;
  return points[points.length - 1]!;
}

function eur(cents: number): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}

interface Change {
  label: string;
  from: number;
  to: number;
}

async function main() {
  console.log(
    APPLY
      ? "== snap-prices-to-apple: APPLY (schreibt Änderungen) =="
      : "== snap-prices-to-apple: DRY-RUN (keine Änderungen; --apply zum Schreiben) ==",
  );

  let totalScanned = 0;
  let totalChanged = 0;
  const summary: Record<string, number> = {};

  async function process<T extends { id: string; priceCents: number }>(
    kind: string,
    points: number[],
    rows: T[],
    describe: (r: T) => string,
    update: (id: string, to: number) => Promise<unknown>,
  ) {
    const changes: Change[] = [];
    for (const r of rows) {
      totalScanned++;
      const to = snapUp(r.priceCents, points);
      if (to !== r.priceCents) {
        changes.push({ label: describe(r), from: r.priceCents, to });
        if (APPLY) await update(r.id, to);
      }
    }
    summary[kind] = changes.length;
    totalChanged += changes.length;
    console.log(`\n[${kind}] ${rows.length} bepreist · ${changes.length} anzupassen`);
    for (const c of changes) {
      console.log(`  ${eur(c.from)} → ${eur(c.to)}  ${c.label}`);
    }
  }

  // --- Tiers (non-FREE, priceCents > 0) → Abo-Preispunkte ---
  const tiers = await prisma.membershipTier.findMany({
    where: { priceCents: { gt: 0 }, interval: { in: ["MONTH", "YEAR"] } },
    select: { id: true, priceCents: true, name: true, interval: true },
  });
  await process(
    "Tiers",
    SUBSCRIPTION,
    tiers,
    (t) => `Tier "${t.name}" (${t.interval})`,
    (id, to) => prisma.membershipTier.update({ where: { id }, data: { priceCents: to } }),
  );

  // --- Digitale Produkte (type != PHYSICAL, priceCents > 0) → One-Time ---
  const products = await prisma.product.findMany({
    where: { priceCents: { gt: 0 }, type: { not: "PHYSICAL" } },
    select: { id: true, priceCents: true, name: true, type: true },
  });
  await process(
    "Produkte (digital)",
    ONE_TIME,
    products,
    (p) => `Produkt "${p.name}" (${p.type})`,
    (id, to) => prisma.product.update({ where: { id }, data: { priceCents: to } }),
  );

  // --- PPV-Posts (priceCents > 0) → One-Time ---
  const posts = await prisma.post.findMany({
    where: { priceCents: { gt: 0 } },
    select: { id: true, priceCents: true, title: true },
  });
  await process(
    "PPV-Posts",
    ONE_TIME,
    posts,
    (p) => `Post "${p.title ?? p.id}"`,
    (id, to) => prisma.post.update({ where: { id }, data: { priceCents: to } }),
  );

  // --- Medien-Pakete (priceCents > 0) → One-Time ---
  const packages = await prisma.mediaPackage.findMany({
    where: { priceCents: { gt: 0 } },
    select: { id: true, priceCents: true, title: true },
  });
  await process(
    "Medien-Pakete",
    ONE_TIME,
    packages,
    (p) => `Paket "${p.title}"`,
    (id, to) => prisma.mediaPackage.update({ where: { id }, data: { priceCents: to } }),
  );

  // --- Einzel-Medien (priceCents > 0) → One-Time ---
  const items = await prisma.mediaItem.findMany({
    where: { priceCents: { gt: 0 } },
    select: { id: true, priceCents: true, caption: true },
  });
  await process(
    "Einzel-Medien",
    ONE_TIME,
    items,
    (i) => `Medium "${i.caption ?? i.id}"`,
    (id, to) => prisma.mediaItem.update({ where: { id }, data: { priceCents: to } }),
  );

  // --- Requests (priceCents > 0) → One-Time ---
  const requests = await prisma.memberRequest.findMany({
    where: { priceCents: { gt: 0 } },
    select: { id: true, priceCents: true, title: true },
  });
  await process(
    "Requests",
    ONE_TIME,
    requests,
    (r) => `Request "${r.title}"`,
    (id, to) => prisma.memberRequest.update({ where: { id }, data: { priceCents: to } }),
  );

  // --- Booking-Slots (priceCents > 0) → One-Time ---
  const slots = await prisma.bookingSlot.findMany({
    where: { priceCents: { gt: 0 } },
    select: { id: true, priceCents: true, title: true },
  });
  await process(
    "Booking-Slots",
    ONE_TIME,
    slots,
    (s) => `Slot "${s.title}"`,
    (id, to) => prisma.bookingSlot.update({ where: { id }, data: { priceCents: to } }),
  );

  console.log("\n== Zusammenfassung ==");
  for (const [kind, n] of Object.entries(summary)) {
    console.log(`  ${kind}: ${n} ${n === 1 ? "Änderung" : "Änderungen"}`);
  }
  console.log(
    `\n${totalScanned} bepreiste Inhalte geprüft · ${totalChanged} ${totalChanged === 1 ? "Änderung" : "Änderungen"} ${APPLY ? "angewendet" : "geplant (dry-run)"}.`,
  );
  if (!APPLY && totalChanged > 0) {
    console.log("Hinweis: Mit `--apply` erneut ausführen, um die Änderungen zu schreiben.");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("snap-prices-to-apple fehlgeschlagen:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
