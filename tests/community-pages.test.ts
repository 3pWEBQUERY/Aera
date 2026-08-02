import { describe, it, expect } from "vitest";
import {
  emptyBlock,
  isBlockEmpty,
  MAX_BLOCKS,
  PAGE_BLOCK_TYPES,
  pageSlugFrom,
  parsePageBlocks,
  uniquePageSlug,
  type PageBlock,
} from "@/lib/community-pages";
import { isExternalHref } from "@/lib/utils";

describe("parsePageBlocks", () => {
  it("gibt fuer alles Unbrauchbare eine leere Liste zurueck", () => {
    expect(parsePageBlocks(null)).toEqual([]);
    expect(parsePageBlocks(undefined)).toEqual([]);
    expect(parsePageBlocks("[]")).toEqual([]);
    expect(parsePageBlocks({})).toEqual([]);
    expect(parsePageBlocks([null, 3, "x", []])).toEqual([]);
  });

  it("wirft unbekannte Bausteintypen weg, statt sie durchzureichen", () => {
    const blocks = parsePageBlocks([
      { id: "a", type: "TEXT", html: "<p>hi</p>" },
      { id: "b", type: "IFRAME", html: "<iframe>" },
      { id: "c", type: "DIVIDER", style: "LINE" },
    ]);
    expect(blocks.map((b) => b.type)).toEqual(["TEXT", "DIVIDER"]);
  });

  it("ergaenzt fehlende Felder statt den Baustein fallen zu lassen", () => {
    const [block] = parsePageBlocks([{ type: "IMAGE", url: "https://x.test/a.jpg" }]);
    expect(block).toMatchObject({ type: "IMAGE", alt: "", caption: "", width: "WIDE" });
    expect(block.id).toBeTruthy();
  });

  it("faengt unbekannte Aufzaehlungswerte mit dem Standard ab", () => {
    const [image] = parsePageBlocks([{ type: "IMAGE", url: "/a.jpg", width: "GIGANTISCH" }]);
    expect(image).toMatchObject({ width: "WIDE" });
    const [divider] = parsePageBlocks([{ type: "DIVIDER", style: 42 }]);
    expect(divider).toMatchObject({ style: "LINE" });
  });

  it("vergibt doppelte Kennungen neu, damit Listen stabil bleiben", () => {
    const blocks = parsePageBlocks([
      { id: "same", type: "DIVIDER" },
      { id: "same", type: "DIVIDER" },
    ]);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].id).not.toBe(blocks[1].id);
  });

  it("haelt sich an die Obergrenze der Bausteine", () => {
    const many = Array.from({ length: MAX_BLOCKS + 15 }, () => ({ type: "DIVIDER" }));
    expect(parsePageBlocks(many)).toHaveLength(MAX_BLOCKS);
  });

  it("kuerzt ueberlange Texte", () => {
    const [block] = parsePageBlocks([{ type: "QUOTE", text: "x".repeat(9_000) }]);
    expect(block.type === "QUOTE" && block.text.length).toBe(2_000);
  });

  it("wirft Bilder ohne Adresse aus der Galerie", () => {
    const [block] = parsePageBlocks([
      {
        type: "GALLERY",
        images: [{ url: "https://x.test/a.jpg" }, { alt: "ohne Quelle" }, { url: "" }],
      },
    ]);
    expect(block.type === "GALLERY" && block.images).toHaveLength(1);
  });

  /**
   * Die eigentliche Vertrauensgrenze: Bausteine sind creator-geschrieben, aber
   * "vom Creator" sagt nichts ueber den Inhalt. Ein `javascript:`-Ziel landete
   * sonst ungefiltert im href der oeffentlichen Seite.
   */
  describe("Adressen", () => {
    const evil = [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "  javascript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "vbscript:msgbox",
      "file:///etc/passwd",
      "//evil.test/phish",
    ];

    it.each(evil)("verwirft %s im Aufruf-Baustein", (href) => {
      const [block] = parsePageBlocks([{ type: "CTA", title: "t", label: "l", href }]);
      expect(block.type === "CTA" && block.href).toBe("");
    });

    it.each(evil)("verwirft %s in der Linkliste", (href) => {
      const [block] = parsePageBlocks([{ type: "LINKS", items: [{ label: "l", href }] }]);
      expect(block.type === "LINKS" && block.items[0].href).toBe("");
    });

    it.each(evil)("verwirft %s als Bildquelle", (url) => {
      const [block] = parsePageBlocks([{ type: "IMAGE", url }]);
      expect(block.type === "IMAGE" && block.url).toBe("");
    });

    it("laesst http, https, mailto und eigene Pfade durch", () => {
      for (const href of [
        "https://aera.so/x",
        "http://aera.so/x",
        "mailto:hallo@aera.so",
        "/c/aera/join",
      ]) {
        const [block] = parsePageBlocks([{ type: "CTA", href }]);
        expect(block.type === "CTA" && block.href).toBe(href);
      }
    });

    it("laesst mailto nicht als Bildquelle durch", () => {
      const [block] = parsePageBlocks([{ type: "IMAGE", url: "mailto:x@y.test" }]);
      expect(block.type === "IMAGE" && block.url).toBe("");
    });
  });

  it("ueberlebt einen vollstaendigen Umlauf ohne Verlust", () => {
    const original = PAGE_BLOCK_TYPES.map((type) => emptyBlock(type));
    const round = parsePageBlocks(JSON.parse(JSON.stringify(original)));
    expect(round).toEqual(original);
  });
});

describe("isBlockEmpty", () => {
  it("haelt frische Bausteine fuer leer — ausser den Trenner", () => {
    for (const type of PAGE_BLOCK_TYPES) {
      expect(isBlockEmpty(emptyBlock(type))).toBe(type !== "DIVIDER");
    }
  });

  it("erkennt gefuellte Bausteine", () => {
    const block: PageBlock = { id: "a", type: "QUOTE", text: "Hallo", author: "", role: "" };
    expect(isBlockEmpty(block)).toBe(false);
  });

  it("haelt einen Text mit nur Leerzeichen weiter fuer leer", () => {
    const block: PageBlock = { id: "a", type: "TEXT", title: "   ", html: "  " };
    expect(isBlockEmpty(block)).toBe(true);
  });
});

describe("Adressteil", () => {
  it("leitet die Adresse aus dem Titel ab", () => {
    expect(pageSlugFrom("Über uns")).toBe("uber-uns");
    expect(pageSlugFrom("FAQ & Hilfe")).toBe("faq-hilfe");
  });

  it("faellt zurueck, wenn nichts Lateinisches uebrig bleibt", () => {
    expect(pageSlugFrom("关于我们")).toBe("seite");
    expect(pageSlugFrom("   ")).toBe("seite");
  });

  it("haengt eine Zahl an, bis die Adresse frei ist", () => {
    expect(uniquePageSlug("ueber", [])).toBe("ueber");
    expect(uniquePageSlug("ueber", ["ueber"])).toBe("ueber-2");
    expect(uniquePageSlug("ueber", ["ueber", "ueber-2"])).toBe("ueber-3");
  });

  it("bleibt auch mit Zaehler innerhalb der Laengengrenze", () => {
    const long = "a".repeat(60);
    const result = uniquePageSlug(long, [long]);
    expect(result.length).toBeLessThanOrEqual(60);
    expect(result).not.toBe(long);
  });
});

describe("isExternalHref", () => {
  it("erkennt eigene Pfade als intern", () => {
    expect(isExternalHref("/c/aera")).toBe(false);
    expect(isExternalHref("https://example.test")).toBe(true);
    expect(isExternalHref("mailto:x@y.test")).toBe(true);
  });
});
