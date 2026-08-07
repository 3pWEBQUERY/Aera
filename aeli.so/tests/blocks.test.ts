import { describe, expect, it } from "vitest";
import { blockVisibilityReason, isBlockLive, parseBlockConfig } from "@/lib/blocks";

const NOW = new Date("2026-08-07T12:00:00Z");
const gestern = new Date("2026-08-06T12:00:00Z");
const morgen = new Date("2026-08-08T12:00:00Z");

/**
 * Zeitfenster sind der Baustein, bei dem ein Fehler still passiert: entweder
 * steht am Montag noch der Vorverkauf vom Freitag, oder er erscheint gar
 * nicht. Beides merkt der Creator erst, wenn es zu spät ist.
 */
describe("isBlockLive", () => {
  it("zeigt einen Block ohne Fenster", () => {
    expect(isBlockLive({ isVisible: true, startsAt: null, endsAt: null }, NOW)).toBe(true);
  });

  it("versteckt, was ausgeblendet ist — auch innerhalb des Fensters", () => {
    expect(isBlockLive({ isVisible: false, startsAt: gestern, endsAt: morgen }, NOW)).toBe(false);
  });

  it("zeigt nur innerhalb des Fensters", () => {
    expect(isBlockLive({ isVisible: true, startsAt: gestern, endsAt: morgen }, NOW)).toBe(true);
    expect(isBlockLive({ isVisible: true, startsAt: morgen, endsAt: null }, NOW)).toBe(false);
    expect(isBlockLive({ isVisible: true, startsAt: null, endsAt: gestern }, NOW)).toBe(false);
  });

  it("behandelt das Ende als ausschließend", () => {
    // Ein Block „bis 12:00" ist um 12:00 vorbei, nicht erst um 12:01.
    expect(isBlockLive({ isVisible: true, startsAt: null, endsAt: NOW }, NOW)).toBe(false);
  });
});

describe("blockVisibilityReason", () => {
  it("benennt den Grund, damit das Studio ihn anzeigen kann", () => {
    expect(blockVisibilityReason({ isVisible: true, startsAt: null, endsAt: null }, NOW)).toBeNull();
    expect(blockVisibilityReason({ isVisible: false, startsAt: null, endsAt: null }, NOW)).toBe("hidden");
    expect(blockVisibilityReason({ isVisible: true, startsAt: morgen, endsAt: null }, NOW)).toBe("scheduled");
    expect(blockVisibilityReason({ isVisible: true, startsAt: null, endsAt: gestern }, NOW)).toBe("expired");
  });
});

describe("parseBlockConfig", () => {
  it("übersteht kaputte oder fremde Inhalte", () => {
    expect(parseBlockConfig(null)).toEqual({});
    expect(parseBlockConfig("kein objekt")).toEqual({});
  });

  it("behält bekannte Felder und wirft unbekannte weg", () => {
    const config = parseBlockConfig({ highlight: true, badge: "neu", fremd: "wert" });
    expect(config.highlight).toBe(true);
    expect(config.badge).toBe("neu");
    expect("fremd" in config).toBe(false);
  });

  it("verwirft Beträge außerhalb des erlaubten Bereichs", () => {
    expect(parseBlockConfig({ amounts: [50] }).amounts).toBeUndefined();
    expect(parseBlockConfig({ amounts: [300, 500] }).amounts).toEqual([300, 500]);
  });
});
