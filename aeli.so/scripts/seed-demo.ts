/**
 * Ein Demo-Konto mit fertiger Seite — zum Anschauen und Ausprobieren.
 *
 *   DATABASE_URL=… npm run db:seed:demo
 *
 * Läuft über die privilegierte Verbindung, weil es einen `User` anlegt. Es ist
 * ein Entwicklungswerkzeug: es weigert sich, wenn NODE_ENV auf `production`
 * steht, damit niemand versehentlich ein Konto mit bekanntem Passwort in eine
 * echte Datenbank schreibt.
 */
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client.js";

const EMAIL = "demo@aeli.so";
const COMMUNITY_SLUG = "lichtwerk";
const PASSWORD = "aeli-demo-passwort";
const HANDLE = "marie";

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("seed-demo läuft nicht in Produktion — das Passwort steht im Quelltext.");
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL ist nicht gesetzt");

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    const user = await prisma.user.upsert({
      where: { email: EMAIL },
      update: {},
      create: {
        email: EMAIL,
        name: "Marie Lang",
        passwordHash: await bcrypt.hash(PASSWORD, 12),
        emailVerifiedAt: new Date(),
      },
    });

    await prisma.aeliProfile.deleteMany({ where: { userId: user.id } });

    // Eine kleine Aera-Community dazu. Ohne sie bleiben die AERA_*-Bausteine
    // leer, und man kann nicht sehen, ob sie funktionieren — ein Baustein, der
    // nichts anzeigt, sieht genauso aus wie einer, der kaputt ist.
    const tenantId = await seedCommunity(prisma, user.id);

    const profile = await prisma.aeliProfile.create({
      data: {
        userId: user.id,
        handle: HANDLE,
        displayName: "Marie Lang",
        bio: "Fotografin in Leipzig. Workshops, Prints und ein Newsletter, der wirklich nur einmal im Monat kommt.",
        theme: { preset: "mitternacht" },
        socials: [
          { platform: "instagram", url: "https://instagram.com/example" },
          { platform: "youtube", url: "https://youtube.com/@example" },
          { platform: "spotify", url: "https://open.spotify.com/artist/example" },
        ],
        status: "PUBLISHED",
        publishedAt: new Date(),
        seoDescription: "Workshops, Prints und ein Newsletter — alles an einer Stelle.",
        linkedTenantId: tenantId,
      },
    });

    await prisma.aeliBlock.createMany({
      data: [
        {
          profileId: profile.id,
          type: "HEADER",
          title: "Gerade aktuell",
          sortOrder: 0,
        },
        {
          profileId: profile.id,
          type: "LINK",
          title: "Workshop: Available Light",
          subtitle: "14. September · noch 3 Plätze",
          href: "https://example.com/workshop",
          icon: "📷",
          config: { highlight: true, badge: "fast voll" },
          sortOrder: 1,
        },
        {
          profileId: profile.id,
          type: "LINK",
          title: "Prints im Shop",
          href: "https://example.com/shop",
          icon: "🖼",
          sortOrder: 2,
          clickCount: 42,
        },
        { profileId: profile.id, type: "DIVIDER", sortOrder: 3 },
        {
          profileId: profile.id,
          type: "EMBED",
          title: "Making-of",
          config: { embedUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
          sortOrder: 4,
        },
        {
          profileId: profile.id,
          type: "NEWSLETTER",
          title: "Einmal im Monat",
          subtitle: "Ein Bild, ein Gedanke, kein Werbeblock.",
          sortOrder: 5,
        },
        {
          profileId: profile.id,
          type: "SOCIAL_ROW",
          sortOrder: 6,
        },
        {
          profileId: profile.id,
          type: "QR_SHARE",
          title: "Seite teilen",
          sortOrder: 7,
        },
        { profileId: profile.id, type: "AERA_EVENTS", title: "Nächste Termine", sortOrder: 8 },
        { profileId: profile.id, type: "AERA_TIERS", title: "Mitglied werden", sortOrder: 9 },
        { profileId: profile.id, type: "AERA_SHOP", title: "Aus dem Shop", sortOrder: 10 },
        { profileId: profile.id, type: "AERA_COURSES", title: "Kurse", sortOrder: 11 },
        { profileId: profile.id, type: "AERA_SPACES", title: "In der Community", sortOrder: 12 },
        {
          // Ein geplanter Block: im Studio sichtbar mit Hinweis, auf der Seite
          // noch nicht. Damit lässt sich das Zeitfenster ohne Warten prüfen.
          profileId: profile.id,
          type: "LINK",
          title: "Vorverkauf Frühjahr",
          href: "https://example.com/vorverkauf",
          startsAt: new Date(Date.now() + 7 * 86_400_000),
          sortOrder: 13,
        },
      ],
    });

    console.log(`✅ Demo angelegt.
   Community : /c/${COMMUNITY_SLUG} (verknüpft, speist die AERA_*-Bausteine)
   Anmeldung : ${EMAIL} / ${PASSWORD}
   Seite     : /p/${HANDLE}  (bzw. ${HANDLE}.<AELI_ROOT_DOMAIN>)`);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Die Gegenseite: eine Community mit genau dem, was die Bausteine lesen.
 *
 * Ein Raum bleibt bewusst intern und ein Kurs unveröffentlicht. Beides darf
 * auf der Bio-Seite NICHT auftauchen — wer die Policies anfasst, sieht hier
 * sofort, ob sie noch halten.
 */
async function seedCommunity(prisma: PrismaClient, ownerId: string): Promise<string> {
  const tenant = await prisma.tenant.upsert({
    where: { slug: COMMUNITY_SLUG },
    update: {},
    create: { name: "Lichtwerk", slug: COMMUNITY_SLUG, ownerId, tagline: "Die Community hinter den Workshops" },
  });

  await prisma.space.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.membershipTier.deleteMany({ where: { tenantId: tenant.id } });

  const [termine, shop, kurse] = await Promise.all([
    prisma.space.create({
      data: { tenantId: tenant.id, name: "Termine", slug: "termine", type: "EVENTS", visibility: "PUBLIC", icon: "📅", sortOrder: 0 },
    }),
    prisma.space.create({
      data: { tenantId: tenant.id, name: "Shop", slug: "shop", type: "SHOP", visibility: "PUBLIC", icon: "🛍", sortOrder: 1 },
    }),
    prisma.space.create({
      data: { tenantId: tenant.id, name: "Kurse", slug: "kurse", type: "COURSE", visibility: "PUBLIC", icon: "🎓", sortOrder: 2 },
    }),
  ]);
  const intern = await prisma.space.create({
    data: { tenantId: tenant.id, name: "Intern", slug: "intern", type: "FORUM", visibility: "MEMBERS", sortOrder: 3 },
  });

  const day = 86_400_000;
  await prisma.event.createMany({
    data: [
      { tenantId: tenant.id, spaceId: termine.id, title: "Available Light — Abendworkshop", slug: "available-light", startsAt: new Date(Date.now() + 6 * day), location: "Leipzig, Spinnerei", isOnline: false },
      { tenantId: tenant.id, spaceId: termine.id, title: "Portfolio-Runde", slug: "portfolio-runde", startsAt: new Date(Date.now() + 20 * day), isOnline: true },
      { tenantId: tenant.id, spaceId: termine.id, title: "Vorbei — darf nicht erscheinen", slug: "vorbei", startsAt: new Date(Date.now() - day), isOnline: true },
      { tenantId: tenant.id, spaceId: intern.id, title: "Intern — darf nicht erscheinen", slug: "intern-termin", startsAt: new Date(Date.now() + 2 * day), isOnline: true },
    ],
  });

  // Rohes SQL, und zwar aus genau dem Grund, der die Bausteine sicher macht:
  // `MembershipTier.entitlementKey` ist NOT NULL, steht aber nicht im
  // Spiegelschema — `aeli_app` bekommt die Spalte nicht zu sehen. Der
  // Aeli-Client kann sie deshalb nicht schreiben. Das Seed-Skript ist die
  // einzige Stelle, an der Aeli je Aera-Daten anlegt; ueberall sonst liest es
  // nur.
  for (const tier of [
    { name: "Mitlesen", slug: "mitlesen", key: "tier:frei", cents: 0, interval: "FREE", empfohlen: false, oeffentlich: true, text: null, order: 0 },
    { name: "Werkstatt", slug: "werkstatt", key: "tier:werkstatt", cents: 1200, interval: "MONTH", empfohlen: true, oeffentlich: true, text: "Feedback-Runden und alle Presets", order: 1 },
    { name: "Intern", slug: "intern-tier", key: "tier:intern", cents: 9900, interval: "YEAR", empfohlen: false, oeffentlich: false, text: null, order: 2 },
  ]) {
    await prisma.$executeRaw`
      INSERT INTO "MembershipTier"
        ("id", "tenantId", "name", "slug", "description", "entitlementKey",
         "priceCents", "interval", "isRecommended", "isPublic", "sortOrder")
      VALUES (${randomUUID()}, ${tenant.id}, ${tier.name}, ${tier.slug}, ${tier.text},
              ${tier.key}, ${tier.cents}, ${tier.interval}::"BillingInterval",
              ${tier.empfohlen}, ${tier.oeffentlich}, ${tier.order})`;
  }

  await prisma.product.createMany({
    data: [
      { tenantId: tenant.id, spaceId: shop.id, name: "Preset-Pack „Blaue Stunde“", slug: "preset-blaue-stunde", priceCents: 2400 },
      { tenantId: tenant.id, spaceId: shop.id, name: "Print A3, signiert", slug: "print-a3", priceCents: 6900, type: "PHYSICAL" },
      { tenantId: tenant.id, spaceId: shop.id, name: "Entwurf — darf nicht erscheinen", slug: "entwurf", priceCents: 100, isPublished: false },
    ],
  });

  await prisma.course.createMany({
    data: [
      { tenantId: tenant.id, spaceId: kurse.id, title: "Available Light von Grund auf", slug: "available-light-kurs", description: "Sechs Lektionen zu Licht, Belichtung und dem Mut zum Korn.", isPublished: true },
      { tenantId: tenant.id, spaceId: kurse.id, title: "Unveröffentlicht — darf nicht erscheinen", slug: "unveroeffentlicht", isPublished: false },
    ],
  });

  return tenant.id;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
