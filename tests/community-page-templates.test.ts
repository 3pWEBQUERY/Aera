import { describe, it, expect } from "vitest";
import de from "@/messages/de.json";
import en from "@/messages/en.json";
import {
  PAGE_TEMPLATES,
  TEMPLATE_ICON,
  templateBlocks,
  type PageTemplateKey,
} from "@/lib/community-page-templates";
import { MAX_BLOCKS, isBlockEmpty, parsePageBlocks } from "@/lib/community-pages";

/** Sammelt alle Uebersetzungsschluessel, nach denen eine Vorlage fragt. */
function keysOf(template: PageTemplateKey): string[] {
  const seen: string[] = [];
  templateBlocks(
    template,
    (key) => {
      seen.push(key);
      return `Platzhalter ${key}`;
    },
    "aera",
  );
  return seen;
}

const catalogs = { de, en } as const;

describe("Seitenvorlagen", () => {
  it.each(PAGE_TEMPLATES)("%s hat ein Symbol", (key) => {
    expect(TEMPLATE_ICON[key]).toBeTruthy();
  });

  /**
   * Der teuerste Fehler in einem Vorlagensystem: ein Tippfehler im Schluessel.
   * Er faellt nirgends auf — die Seite zeigt dann einfach den Schluessel
   * statt des Textes, und zwar erst beim Creator.
   */
  describe.each(Object.entries(catalogs))("Texte in %s.json", (_name, catalog) => {
    const templates = (
      catalog as unknown as {
        dashboard: { pages: { templates: Record<string, unknown> } };
      }
    ).dashboard.pages.templates;
    const content = templates.content as Record<string, string>;

    it.each(PAGE_TEMPLATES)("%s: jeder Inhaltsschluessel ist uebersetzt", (key) => {
      for (const contentKey of keysOf(key)) {
        expect(content[contentKey], `templates.content.${contentKey} fehlt`).toBeTruthy();
      }
    });

    it.each(PAGE_TEMPLATES)("%s: Name, Hinweis und Titel sind uebersetzt", (key) => {
      const entry = templates[key] as { name?: string; hint?: string; title?: string };
      expect(entry?.name).toBeTruthy();
      expect(entry?.hint).toBeTruthy();
      expect(entry?.title).toBeTruthy();
    });
  });

  it("die leere Vorlage bleibt leer", () => {
    expect(templateBlocks("BLANK", (k) => k, "aera")).toEqual([]);
  });

  it.each(PAGE_TEMPLATES.filter((k) => k !== "BLANK"))("%s bringt Bausteine mit", (key) => {
    expect(templateBlocks(key, (k) => k, "aera").length).toBeGreaterThan(0);
  });

  /**
   * Eine Vorlage, die durch das Parsen anders wieder herauskommt, waere beim
   * Speichern still verstuemmelt worden — zu lange Texte, unbekannte Werte,
   * verworfene Adressen.
   */
  it.each(PAGE_TEMPLATES)("%s ueberlebt das Parsen unveraendert", (key) => {
    const blocks = templateBlocks(key, (k) => `Platzhalter ${k}`, "aera");
    expect(parsePageBlocks(JSON.parse(JSON.stringify(blocks)))).toEqual(blocks);
  });

  it.each(PAGE_TEMPLATES)("%s bleibt unter der Bausteingrenze", (key) => {
    expect(templateBlocks(key, (k) => k, "aera").length).toBeLessThanOrEqual(MAX_BLOCKS);
  });

  it("Vorlagen vergeben keine Kennung doppelt", () => {
    for (const key of PAGE_TEMPLATES) {
      const blocks = templateBlocks(key, (k) => k, "aera");
      expect(new Set(blocks.map((b) => b.id)).size).toBe(blocks.length);
    }
  });

  /**
   * Bild-, Galerie- und Videobausteine kommen absichtlich ohne Datei — der
   * Creator laedt seine eigene hoch. Sie duerfen deshalb leer sein. Alles
   * andere muss Text tragen, sonst zeichnet die oeffentliche Seite ihn gar
   * nicht erst und die Vorlage haette eine Luecke.
   */
  it.each(PAGE_TEMPLATES)("%s: nur Medienbausteine starten leer", (key) => {
    for (const block of templateBlocks(key, (k) => `Platzhalter ${k}`, "aera")) {
      if (["IMAGE", "GALLERY", "VIDEO"].includes(block.type)) continue;
      expect(isBlockEmpty(block), `${block.type} ist ohne Inhalt`).toBe(false);
    }
  });

  it("setzt Ziele auf die eigene Community", () => {
    for (const key of PAGE_TEMPLATES) {
      for (const block of templateBlocks(key, (k) => k, "meine-community")) {
        if (block.type !== "CTA" || !block.href) continue;
        expect(block.href.startsWith("/c/meine-community")).toBe(true);
      }
    }
  });
});
