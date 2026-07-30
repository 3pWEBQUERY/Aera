import { describe, expect, it } from "vitest";
import {
  defaultHeroMenu,
  heroMenuHref,
  heroMenuVisible,
  parseHeroMenu,
  parseLayout,
  HERO_MENU_MAX,
  type HeroMenuItem,
} from "@/lib/layout";

/**
 * Das Menü der Kopfzeile.
 *
 * Der wichtigste Fall ist der stille: eine Community, die nie etwas
 * eingestellt hat, muss die Zeile weiter so sehen wie vorher. Danach kommt
 * die Unterscheidung zwischen "nichts gespeichert" und "ausdrücklich leer" —
 * wer alle Punkte entfernt, will eine leere Zeile und nicht die Vorgabe
 * zurück.
 */

const item = (over: Partial<HeroMenuItem> = {}): HeroMenuItem => ({
  id: "x",
  label: "",
  type: "MEMBERS",
  slot: "BAR",
  audience: "ALL",
  style: "PLAIN",
  ...over,
});

describe("parseHeroMenu", () => {
  it("falls back to the default when nothing is stored", () => {
    expect(parseHeroMenu(undefined)).toEqual(defaultHeroMenu());
    expect(parseHeroMenu(null)).toEqual(defaultHeroMenu());
    expect(parseHeroMenu({})).toEqual(defaultHeroMenu());
  });

  it("keeps an explicitly emptied menu empty", () => {
    const parsed = parseHeroMenu({ items: [], more: { enabled: false, label: "" } });

    expect(parsed.items).toEqual([]);
    expect(parsed.more.enabled).toBe(false);
  });

  it("drops items whose target is missing", () => {
    const parsed = parseHeroMenu({
      items: [
        { type: "SPACE" },
        { type: "LINK", value: "  " },
        { type: "SPACE", value: "blog" },
        { type: "MEMBERS" },
      ],
    });

    expect(parsed.items.map((i) => i.type)).toEqual(["SPACE", "MEMBERS"]);
  });

  it("ignores unknown types and repairs duplicate ids", () => {
    const parsed = parseHeroMenu({
      items: [
        { id: "same", type: "MEMBERS" },
        { id: "same", type: "LEADERBOARD" },
        { type: "NONSENSE" },
      ],
    });

    expect(parsed.items).toHaveLength(2);
    expect(new Set(parsed.items.map((i) => i.id)).size).toBe(2);
  });

  it("gives audience-bound types their sensible default", () => {
    const parsed = parseHeroMenu({
      items: [{ type: "JOIN" }, { type: "LIBRARY" }, { type: "DASHBOARD" }],
    });

    expect(parsed.items.map((i) => i.audience)).toEqual(["GUESTS", "MEMBERS", "STAFF"]);
  });

  it("caps the number of items", () => {
    const parsed = parseHeroMenu({
      items: Array.from({ length: HERO_MENU_MAX + 8 }, () => ({ type: "MEMBERS" })),
    });

    expect(parsed.items).toHaveLength(HERO_MENU_MAX);
  });
});

describe("parseLayout", () => {
  it("carries the menu alongside sections, nav and header", () => {
    const cfg = parseLayout({ heroMenu: { items: [{ type: "SEARCH", slot: "MORE" }] } });

    expect(cfg.heroMenu.items).toEqual([
      expect.objectContaining({ type: "SEARCH", slot: "MORE" }),
    ]);
    // Der Rest darf davon unberührt bleiben.
    expect(cfg.header.variant).toBe("EDITORIAL");
  });

  it("gives a layout without a menu the default one", () => {
    expect(parseLayout({ nav: [] }).heroMenu).toEqual(defaultHeroMenu());
  });
});

describe("heroMenuVisible", () => {
  const guest = { isMember: false, isStaff: false };
  const member = { isMember: true, isStaff: false };
  const staff = { isMember: true, isStaff: true };

  it("shows guest-only items to guests alone", () => {
    const i = item({ audience: "GUESTS" });
    expect(heroMenuVisible(i, guest)).toBe(true);
    expect(heroMenuVisible(i, member)).toBe(false);
  });

  it("shows member-only items to members and staff", () => {
    const i = item({ audience: "MEMBERS" });
    expect(heroMenuVisible(i, guest)).toBe(false);
    expect(heroMenuVisible(i, member)).toBe(true);
    expect(heroMenuVisible(i, staff)).toBe(true);
  });

  it("reserves staff items for staff", () => {
    const i = item({ audience: "STAFF" });
    expect(heroMenuVisible(i, member)).toBe(false);
    expect(heroMenuVisible(i, staff)).toBe(true);
  });

  it("reproduces the previous hard-wired row for a guest", () => {
    const visible = defaultHeroMenu()
      .items.filter((i) => heroMenuVisible(i, guest))
      .map((i) => `${i.slot}:${i.type}`);

    expect(visible).toEqual([
      "BAR:JOIN",
      "BAR:TIPS",
      "MORE:MEMBERS",
      "MORE:LEADERBOARD",
      "MORE:SHARE",
    ]);
  });
});

describe("heroMenuHref", () => {
  it("resolves built-in targets inside the community", () => {
    expect(heroMenuHref(item({ type: "MEMBERS" }), "demo")).toBe("/c/demo/members");
    expect(heroMenuHref(item({ type: "LIVE" }), "demo")).toBe("/c/demo/live");
    expect(heroMenuHref(item({ type: "SPACE", value: "blog" }), "demo")).toBe("/c/demo/s/blog");
    expect(heroMenuHref(item({ type: "DASHBOARD" }), "demo")).toBe("/dashboard/demo");
  });

  it("has no address for the share action", () => {
    expect(heroMenuHref(item({ type: "SHARE" }), "demo")).toBeNull();
  });

  it("leaves the tip space address to the caller", () => {
    // Der Trinkgeld-Space heisst je Community anders; ohne Adresse kein Punkt.
    expect(heroMenuHref(item({ type: "TIPS" }), "demo")).toBeNull();
    expect(heroMenuHref(item({ type: "TIPS", value: "/c/demo/s/tips" }), "demo")).toBe(
      "/c/demo/s/tips",
    );
  });
});
