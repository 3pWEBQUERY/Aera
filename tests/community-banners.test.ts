import { describe, it, expect } from "vitest";
import {
  BANNER_MAX,
  bannerHref,
  bannerInSchedule,
  bannerVisible,
  emptyBanner,
  parseBanners,
  parseLayout,
  type BannerConfig,
} from "@/lib/layout";

/** Ein vollstaendiger, anzeigbarer Banner als Ausgangspunkt. */
function banner(overrides: Partial<BannerConfig> = {}): BannerConfig {
  return { ...emptyBanner("b1"), title: "Komm dazu", ...overrides };
}

describe("parseBanners", () => {
  it("gibt fuer alles Unbrauchbare eine leere Liste zurueck", () => {
    expect(parseBanners(null)).toEqual([]);
    expect(parseBanners("[]")).toEqual([]);
    expect(parseBanners({})).toEqual([]);
  });

  it("ergaenzt fehlende Felder mit den Standardwerten", () => {
    const [b] = parseBanners([{ title: "Hallo" }]);
    expect(b).toMatchObject({
      enabled: true,
      placement: "BOTTOM",
      tone: "DARK",
      audience: "ALL",
      trigger: "DELAY",
      frequency: "DISMISSED",
      dismissible: true,
    });
    expect(b.id).toBeTruthy();
  });

  it("faengt unbekannte Aufzaehlungswerte ab", () => {
    const [b] = parseBanners([
      { placement: "SIDEWAYS", tone: "NEON", trigger: "TELEPATHY", frequency: "HOURLY" },
    ]);
    expect(b).toMatchObject({
      placement: "BOTTOM",
      tone: "DARK",
      trigger: "DELAY",
      frequency: "DISMISSED",
    });
  });

  it("haelt sich an die Hoechstzahl", () => {
    expect(parseBanners(Array.from({ length: BANNER_MAX + 9 }, () => ({})))).toHaveLength(
      BANNER_MAX,
    );
  });

  it("vergibt doppelte Kennungen neu", () => {
    const list = parseBanners([{ id: "x" }, { id: "x" }]);
    expect(list[0].id).not.toBe(list[1].id);
  });

  /**
   * Sekunden und Prozent teilen sich ein Feld. Ohne getrennte Grenzen liesse
   * sich eine Scrolltiefe von 900 Prozent speichern — der Banner erschiene nie.
   */
  describe("Ausloeserwert", () => {
    it("begrenzt die Scrolltiefe auf 1 bis 100", () => {
      expect(parseBanners([{ trigger: "SCROLL", triggerValue: 900 }])[0].triggerValue).toBe(100);
      expect(parseBanners([{ trigger: "SCROLL", triggerValue: -5 }])[0].triggerValue).toBe(1);
    });

    it("laesst laengere Wartezeiten zu, aber nicht endlos", () => {
      expect(parseBanners([{ trigger: "DELAY", triggerValue: 45 }])[0].triggerValue).toBe(45);
      expect(parseBanners([{ trigger: "DELAY", triggerValue: 9_999 }])[0].triggerValue).toBe(300);
      expect(parseBanners([{ trigger: "DELAY", triggerValue: -3 }])[0].triggerValue).toBe(0);
    });

    it("rundet Kommawerte", () => {
      expect(parseBanners([{ trigger: "DELAY", triggerValue: 7.6 }])[0].triggerValue).toBe(8);
    });
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>",
    "//evil.test",
    "vbscript:x",
  ])("verwirft %s als Ziel", (href) => {
    expect(parseBanners([{ title: "t", href }])[0].href).toBe("");
  });

  it("laesst gueltige Ziele durch", () => {
    expect(parseBanners([{ href: "/c/aera/join" }])[0].href).toBe("/c/aera/join");
    expect(parseBanners([{ href: "https://aera.so" }])[0].href).toBe("https://aera.so");
  });

  it("nimmt nur vollstaendige Tagesangaben an", () => {
    expect(parseBanners([{ startAt: "2026-08-01", endAt: "2026-08-31" }])[0]).toMatchObject({
      startAt: "2026-08-01",
      endAt: "2026-08-31",
    });
    expect(parseBanners([{ startAt: "morgen", endAt: "2026-8-1" }])[0]).toMatchObject({
      startAt: "",
      endAt: "",
    });
  });

  it("ueberlebt einen Umlauf unveraendert", () => {
    const original = [banner({ id: "a" }), banner({ id: "b", placement: "CENTER" })];
    expect(parseBanners(JSON.parse(JSON.stringify(original)))).toEqual(original);
  });
});

describe("Ziel des Knopfes", () => {
  it("leitet feste Ziele aus dem Adressteil der Community ab", () => {
    const cases: [BannerConfig["targetType"], string][] = [
      ["JOIN", "/c/aera/join"],
      ["HOME", "/c/aera"],
      ["MEMBERS", "/c/aera/members"],
      ["LEADERBOARD", "/c/aera/leaderboard"],
      ["LIBRARY", "/c/aera/library"],
      ["LIVE", "/c/aera/live"],
      ["SEARCH", "/c/aera/search"],
    ];
    for (const [targetType, expected] of cases) {
      expect(bannerHref(banner({ targetType }), "aera", null)).toBe(expected);
    }
  });

  it("setzt Space und eigene Seite zusammen", () => {
    expect(bannerHref(banner({ targetType: "SPACE", targetValue: "forum" }), "aera", null)).toBe(
      "/c/aera/s/forum",
    );
    expect(bannerHref(banner({ targetType: "PAGE", targetValue: "ueber-mich" }), "aera", null)).toBe(
      "/c/aera/p/ueber-mich",
    );
  });

  it("nimmt die Trinkgeld-Adresse von aussen entgegen", () => {
    expect(bannerHref(banner({ targetType: "TIPS" }), "aera", "/c/aera/s/danke")).toBe(
      "/c/aera/s/danke",
    );
    // Ohne Trinkgeld-Space gibt es nichts zu verlinken.
    expect(bannerHref(banner({ targetType: "TIPS" }), "aera", null)).toBeNull();
  });

  it("gibt die frei gesetzte Adresse unveraendert zurueck", () => {
    expect(
      bannerHref(banner({ targetType: "LINK", href: "https://example.test" }), "aera", null),
    ).toBe("https://example.test");
  });

  /**
   * Ein Ziel, dessen Space geloescht oder dessen Seite umbenannt wurde, wird zu
   * einem Banner ohne Knopf — nicht zu einem Knopf auf eine Fehlerseite.
   */
  it("liefert kein Ziel, wenn die Auswahl fehlt", () => {
    expect(bannerHref(banner({ targetType: "SPACE", targetValue: "" }), "aera", null)).toBeNull();
    expect(bannerHref(banner({ targetType: "PAGE", targetValue: "" }), "aera", null)).toBeNull();
    expect(bannerHref(banner({ targetType: "LINK", href: "" }), "aera", null)).toBeNull();
    expect(bannerHref(banner({ targetType: "NONE" }), "aera", null)).toBeNull();
  });

  it("haelt Wert und Art zusammen", () => {
    // Ein Space-Slug an einem festen Ziel hat keine Bedeutung und faellt weg.
    expect(parseBanners([{ targetType: "JOIN", targetValue: "forum" }])[0].targetValue).toBe("");
    // Eine Adresse bleibt nur, wo sie hingehoert.
    expect(parseBanners([{ targetType: "JOIN", href: "https://x.test" }])[0].href).toBe("");
    expect(parseBanners([{ targetType: "LINK", href: "https://x.test" }])[0].href).toBe(
      "https://x.test",
    );
  });

  /**
   * Banner aus der Zeit vor der Zielauswahl kennen nur `href`. Sie duerfen
   * nicht still auf den Standard zurueckfallen — der Knopf zeigte sonst
   * woanders hin als am Tag, an dem der Creator ihn gesetzt hat.
   */
  describe("Banner von vorher", () => {
    it("liest eine gespeicherte Adresse als freien Link", () => {
      const [b] = parseBanners([{ title: "t", href: "https://alt.test" }]);
      expect(b.targetType).toBe("LINK");
      expect(bannerHref(b, "aera", null)).toBe("https://alt.test");
    });

    it("wird ohne Adresse zu einem Banner ohne Knopf", () => {
      expect(parseBanners([{ title: "t" }])[0].targetType).toBe("NONE");
    });
  });
});

describe("parseLayout", () => {
  it("startet ohne Einblendungen", () => {
    expect(parseLayout(null).banners).toEqual([]);
    expect(parseLayout({}).banners).toEqual([]);
  });

  it("liest gespeicherte Banner mit", () => {
    expect(parseLayout({ banners: [{ title: "Hallo" }] }).banners).toHaveLength(1);
  });
});

describe("bannerInSchedule", () => {
  it("gilt ohne Zeitraum immer", () => {
    expect(bannerInSchedule(banner(), "2026-08-02")).toBe(true);
  });

  it("beginnt am Starttag und endet am Endtag — beide eingeschlossen", () => {
    const b = banner({ startAt: "2026-08-02", endAt: "2026-08-04" });
    expect(bannerInSchedule(b, "2026-08-01")).toBe(false);
    expect(bannerInSchedule(b, "2026-08-02")).toBe(true);
    expect(bannerInSchedule(b, "2026-08-04")).toBe(true);
    expect(bannerInSchedule(b, "2026-08-05")).toBe(false);
  });

  it("versteht eine offene Seite des Zeitraums", () => {
    expect(bannerInSchedule(banner({ startAt: "2026-09-01" }), "2026-08-02")).toBe(false);
    expect(bannerInSchedule(banner({ endAt: "2026-09-01" }), "2026-08-02")).toBe(true);
  });
});

describe("bannerVisible", () => {
  const guest = { isMember: false, isStaff: false };
  const member = { isMember: true, isStaff: false };
  const staff = { isMember: true, isStaff: true };
  const today = "2026-08-02";

  it("zeigt abgeschaltete Banner nicht", () => {
    expect(bannerVisible(banner({ enabled: false }), guest, today)).toBe(false);
  });

  /** Ein Banner ohne Text waere eine leere Leiste ueber der Seite. */
  it("zeigt inhaltslose Banner nicht", () => {
    expect(bannerVisible(banner({ title: "", text: "" }), guest, today)).toBe(false);
    expect(bannerVisible(banner({ title: "", text: "Nur Text" }), guest, today)).toBe(true);
    expect(bannerVisible(banner({ title: "   " }), guest, today)).toBe(false);
  });

  it("beachtet die Zielgruppe", () => {
    expect(bannerVisible(banner({ audience: "GUESTS" }), guest, today)).toBe(true);
    expect(bannerVisible(banner({ audience: "GUESTS" }), member, today)).toBe(false);
    expect(bannerVisible(banner({ audience: "MEMBERS" }), guest, today)).toBe(false);
    expect(bannerVisible(banner({ audience: "MEMBERS" }), member, today)).toBe(true);
    expect(bannerVisible(banner({ audience: "STAFF" }), member, today)).toBe(false);
    expect(bannerVisible(banner({ audience: "STAFF" }), staff, today)).toBe(true);
    for (const viewer of [guest, member, staff]) {
      expect(bannerVisible(banner({ audience: "ALL" }), viewer, today)).toBe(true);
    }
  });

  it("beachtet den Zeitraum", () => {
    expect(bannerVisible(banner({ endAt: "2026-08-01" }), guest, today)).toBe(false);
  });
});
