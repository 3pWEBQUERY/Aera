import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cardIndexBySlug, freeCardSlug, normalizeCardSlug, toPageCard } from "@/lib/cards";
import { resolveTheme } from "@/lib/themes";

/**
 * Der Stapel.
 *
 * Drei Dinge werden hier festgehalten, und alle drei sind Stellen, an denen ein
 * Fehler still bleibt:
 *
 *   Die Vererbung des Designs. Eine Karte ohne eigenes Theme muss das der Seite
 *   BEKOMMEN, nicht eine Kopie davon behalten — sonst laesst sich ein Stapel
 *   nie wieder an einer Stelle umfaerben.
 *
 *   Die Adressen. Zwei Karten mit demselben Slug waeren ein Datenbankfehler
 *   beim Speichern, kein Hinweis beim Tippen.
 *
 *   Der Umzug in der Migration. Bestehende Bausteine mussten auf eine Karte —
 *   in der falschen Reihenfolge scheitert `NOT NULL`, und zwar erst in
 *   Produktion.
 */

const PAGE_THEME = { preset: "mitternacht" } as const;

function card(theme: unknown) {
  return {
    id: "c1",
    slug: "start",
    title: "Start",
    icon: null,
    theme,
    blocks: [],
  };
}

describe("Design einer Karte", () => {
  it("erbt das der Seite, wenn sie keins hat", () => {
    const resolved = toPageCard(card(null), PAGE_THEME);
    expect(resolved.ownTheme).toBe(false);
    expect(resolved.theme.accent).toBe(resolveTheme(PAGE_THEME).accent);
  });

  it("behaelt ihr eigenes, wenn sie eins hat", () => {
    const resolved = toPageCard(card({ preset: "neon" }), PAGE_THEME);
    expect(resolved.ownTheme).toBe(true);
    expect(resolved.theme.accent).not.toBe(resolveTheme(PAGE_THEME).accent);
    expect(resolved.theme.accent).toBe(resolveTheme({ preset: "neon" }).accent);
  });

  it("unterscheidet ein fehlendes Theme von einem leeren", () => {
    // `undefined` und `null` heissen beide „wie die Seite". Ein leeres Objekt
    // dagegen ist eine Entscheidung: der Creator hat ein eigenes Design
    // angelegt und alles auf Voreinstellung gelassen.
    expect(toPageCard(card(undefined), PAGE_THEME).ownTheme).toBe(false);
    expect(toPageCard(card(null), PAGE_THEME).ownTheme).toBe(false);
    expect(toPageCard(card({}), PAGE_THEME).ownTheme).toBe(true);
  });
});

describe("normalizeCardSlug", () => {
  it("macht aus einem Titel eine Adresse", () => {
    expect(normalizeCardSlug("Musik")).toBe("musik");
    expect(normalizeCardSlug("Über mich")).toBe("ueber-mich");
    expect(normalizeCardSlug("  Shop & Prints  ")).toBe("shop-prints");
    expect(normalizeCardSlug("Grüße!")).toBe("gruesse");
  });

  it("gibt leer zurueck, wenn nichts uebrig bleibt", () => {
    expect(normalizeCardSlug("!!!")).toBe("");
    expect(normalizeCardSlug("")).toBe("");
  });

  it("laesst keine Striche am Rand stehen", () => {
    expect(normalizeCardSlug("-shop-")).toBe("shop");
    expect(normalizeCardSlug("a".repeat(50) + " b")).not.toMatch(/-$/);
  });
});

describe("freeCardSlug", () => {
  it("nimmt den Wunsch, wenn er frei ist", () => {
    expect(freeCardSlug(["start"], "Shop")).toBe("shop");
  });

  it("zaehlt hoch statt zu meckern", () => {
    // Zwei Karten „Shop" sind kein Fehler, den man dem Creator vorhalten
    // muesste.
    expect(freeCardSlug(["shop"], "Shop")).toBe("shop-2");
    expect(freeCardSlug(["shop", "shop-2"], "Shop")).toBe("shop-3");
  });

  it("faellt auf karte zurueck, wenn der Titel nichts hergibt", () => {
    expect(freeCardSlug([], "!!!")).toBe("karte");
    expect(freeCardSlug(["karte"], "")).toBe("karte-2");
  });
});

describe("cardIndexBySlug", () => {
  const cards = [{ slug: "start" }, { slug: "musik" }, { slug: "shop" }];

  it("findet die gemeinte Karte", () => {
    expect(cardIndexBySlug(cards, "musik")).toBe(1);
    expect(cardIndexBySlug(cards, undefined)).toBe(0);
  });

  it("faellt bei unbekanntem Slug auf die erste zurueck", () => {
    // Eine umbenannte Karte soll einen alten Link nicht ins Leere laufen
    // lassen, sondern auf den Stapel — dort findet man sie wieder.
    expect(cardIndexBySlug(cards, "gibt-es-nicht")).toBe(0);
  });
});

/**
 * Der Umzug bestehender Bausteine.
 *
 * Die Reihenfolge in der Migration ist keine Stilfrage: `cardId` ist NOT NULL,
 * und es gab schon Bausteine. Wer die Schritte vertauscht, merkt es nicht
 * lokal auf einer leeren Datenbank — sondern beim Ausrollen.
 */
describe("Migration 20260810120000_aeli_cards", () => {
  const sql = readFileSync(
    new URL("../../prisma/migrations/20260810120000_aeli_cards/migration.sql", import.meta.url),
    "utf8",
  );

  it("legt die Spalte nullbar an, fuellt sie und macht sie erst dann pflicht", () => {
    const addColumn = sql.indexOf('ADD COLUMN "cardId" TEXT');
    const insertCards = sql.indexOf('INSERT INTO "AeliCard"');
    const backfill = sql.indexOf('UPDATE "AeliBlock" b');
    const notNull = sql.indexOf('ALTER COLUMN "cardId" SET NOT NULL');

    for (const step of [addColumn, insertCards, backfill, notNull]) {
      expect(step).toBeGreaterThan(-1);
    }
    expect(addColumn).toBeLessThan(insertCards);
    expect(insertCards).toBeLessThan(backfill);
    expect(backfill).toBeLessThan(notNull);
  });

  it("schliesst versteckte Karten aus dem oeffentlichen Lesepfad aus", () => {
    // Auf beiden Ebenen: die Karte selbst und ihre Bausteine. Ohne die zweite
    // waere eine versteckte Karte unsichtbar, ihre Links aber abrufbar.
    expect(sql).toMatch(/CREATE POLICY aeli_public_card[\s\S]*?"isVisible" = TRUE/);
    expect(sql).toMatch(/CREATE POLICY aeli_public_block[\s\S]*?c\."isVisible" = TRUE/);
  });
});
