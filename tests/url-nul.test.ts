import { describe, expect, it } from "vitest";
import { pathHasNul, searchWithoutNul, stripNul } from "@/lib/url-nul";

describe("url-nul", () => {
  it("erkennt %00 und rohe NUL-Bytes im Pfad", () => {
    expect(pathHasNul("/c/%00")).toBe(true);
    expect(pathHasNul("/c/fix-chor/p/%00")).toBe(true);
    expect(pathHasNul("/c/a\u0000b")).toBe(true);
    expect(pathHasNul("/c/fix-chor/p/ueber-uns")).toBe(false);
    // „%2500“ ist ein kodiertes Prozentzeichen, kein NUL.
    expect(pathHasNul("/c/%2500")).toBe(false);
  });

  it("entfernt NUL aus der Suche und laesst den Rest stehen", () => {
    expect(searchWithoutNul("?q=%00")).toBe("?q=");
    expect(searchWithoutNul("?q=ab%00c&page=2")).toBe("?q=abc&page=2");
    expect(searchWithoutNul("?%00")).toBe("");
    expect(searchWithoutNul("?q=chor")).toBeNull();
    expect(searchWithoutNul("")).toBeNull();
  });

  it("saeubert schon dekodierte Werte", () => {
    expect(stripNul("a\u0000b")).toBe("ab");
  });
});
