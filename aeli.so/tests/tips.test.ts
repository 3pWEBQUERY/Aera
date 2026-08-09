import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  checkTipAmount,
  MAX_TIP_CENTS,
  MIN_TIP_CENTS,
  parseTipAmount,
} from "@/lib/tip-amount";

/**
 * Der einzige Baustein, bei dem etwas abgebucht wird.
 *
 * Zwei Dinge werden hier festgehalten, und beide haben denselben Grund: bei
 * Geld ist ein stiller Fehler teurer als ein lauter.
 *
 *   Die Betragspruefung. Sie laeuft im Browser und noch einmal auf dem Server,
 *   aus derselben Datei — ein zweites Zahlenpaar an zweiter Stelle waere die
 *   sicherste Art, sie auseinanderlaufen zu lassen.
 *
 *   Der Weg zum Auszahlungskonto. Er darf nur ueber `systemPrisma` laufen und
 *   muss den Besitzvergleich enthalten. Faellt einer der beiden weg, geht Geld
 *   an das Stripe-Konto eines Fremden — und man sieht es dem Code nicht an.
 */

describe("parseTipAmount", () => {
  it("nimmt Komma und Punkt", () => {
    expect(parseTipAmount("5")).toBe(500);
    expect(parseTipAmount("7,50")).toBe(750);
    expect(parseTipAmount("7.50")).toBe(750);
    expect(parseTipAmount("  3 ")).toBe(300);
    expect(parseTipAmount("0,99")).toBe(99);
  });

  it("verwirft alles, was kein Betrag ist", () => {
    for (const input of ["", "abc", "-5", "5,555", "1e3", "5 €", "٥", "Infinity", "5,"]) {
      expect(parseTipAmount(input), input).toBeNull();
    }
  });

  it("rundet nicht still auf drei Nachkommastellen", () => {
    // „3,456" ist keine Eingabe, die jemand so gemeint hat. Sie zu 3,46 zu
    // machen waere bei Geld die falsche Freundlichkeit.
    expect(parseTipAmount("3,456")).toBeNull();
  });
});

describe("checkTipAmount", () => {
  it("laesst die Grenzen selbst zu", () => {
    expect(checkTipAmount(MIN_TIP_CENTS)).toBeNull();
    expect(checkTipAmount(MAX_TIP_CENTS)).toBeNull();
  });

  it("meldet jede Ueberschreitung einzeln", () => {
    expect(checkTipAmount(null)).toBe("invalid");
    expect(checkTipAmount(MIN_TIP_CENTS - 1)).toBe("too-small");
    expect(checkTipAmount(MAX_TIP_CENTS + 1)).toBe("too-large");
    expect(checkTipAmount(0)).toBe("too-small");
  });
});

describe("Auszahlungskonto", () => {
  const payouts = readFileSync(new URL("../lib/payouts.ts", import.meta.url), "utf8");

  it("vergleicht den Besitzer in der Abfrage, nicht danach", () => {
    // Eine verknuepfte Community kann ueber einen Verbindungscode einem
    // ANDEREN Konto gehoeren. Steht der Vergleich in einem `if` nach der
    // Abfrage, kann ein spaeterer Umbau ihn wegnehmen, ohne dass etwas
    // auffaellt — in der `where`-Klausel kann er das nicht.
    expect(payouts).toMatch(/where:\s*\{[^}]*ownerId:\s*owner\.userId/s);
  });

  it("liest ausschliesslich ueber die privilegierte Verbindung", () => {
    // `Tenant.ownerId` und `Tenant.stripeAccountId` sind fuer `aeli_app`
    // gesperrt. Eine Abfrage ueber den RLS-Client scheiterte hier nicht
    // sichtbar, sondern faende schlicht nichts — und die Seite naehme dann
    // kein Geld mehr an, ohne zu sagen warum.
    expect(payouts).not.toMatch(/(^|[^m])\bprisma\.(tenant|aeliPayoutAccount)\./m);
    expect(payouts).toContain("systemPrisma.tenant.findFirst");
  });
});

/**
 * Der Spiegel fuehrt fuer `Tenant` zwei Spalten, die `aeli_app` nicht lesen
 * darf. Das ist nur deshalb ungefaehrlich, weil KEINE Abfrage auf `Tenant`
 * ueber den RLS-Client laeuft. Genau das prueft dieser Test — er ist die
 * Bedingung, unter der die Ausnahme im Spiegelschema zulaessig ist.
 */
describe("Tenant-Abfragen", () => {
  it("laufen nirgends ueber den RLS-Client", () => {
    const files = [
      "../lib/payouts.ts",
      "../lib/profile.ts",
      "../lib/aera-content.ts",
      "../app/actions/profile.ts",
      "../app/actions/payouts.ts",
      "../app/studio/einstellungen/page.tsx",
    ];
    for (const file of files) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      // `systemPrisma.tenant.` ist erlaubt, `prisma.tenant.` nicht.
      const offending = [...source.matchAll(/(\w*)prisma\.tenant\./gi)].filter(
        ([, prefix]) => prefix.toLowerCase() !== "system",
      );
      expect(offending.map((hit) => hit[0]), file).toEqual([]);
    }
  });
});
