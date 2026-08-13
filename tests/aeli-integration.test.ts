import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { issueLinkCode, verifyLinkCode, linkCodesConfigured } from "@/lib/aeli-link-code";
import { checkHandle, normalizeHandle } from "@/lib/aeli-handle";

const ROOT = join(import.meta.dirname, "..");

/**
 * Aera und Aeli sind zwei Apps, die getrennt ausgeliefert werden. Zwei Dateien
 * müssen sie trotzdem Zeichen für Zeichen teilen: die Handle-Regeln (weil eine
 * Aeli-Seite auch aus Aeras Dashboard heraus angelegt werden kann) und das
 * Format des Verbindungscodes (weil die eine Seite ihn ausstellt und die andere
 * ihn prüft).
 *
 * Ein Kommentar „bitte synchron halten" hält niemanden davon ab, nur eine der
 * beiden zu ändern. Dieser Test tut es.
 */
describe("gespiegelte Dateien zwischen Aera und Aeli", () => {
  /** Vergleicht ohne den Kopfkommentar — der darf und soll sich unterscheiden. */
  function body(path: string): string {
    const text = readFileSync(join(ROOT, path), "utf8");
    const end = text.indexOf("*/");
    return text.slice(end + 2).trim();
  }

  it("die Handle-Regeln sind in beiden Apps identisch", () => {
    expect(body("lib/aeli-handle.ts")).toBe(body("aeli.so/lib/handle.ts"));
  });

  it("das Format des Verbindungscodes ist in beiden Apps identisch", () => {
    expect(body("lib/aeli-link-code.ts")).toBe(body("aeli.so/lib/link-code.ts"));
  });
});

describe("Verbindungscode", () => {
  const SECRET = "test-secret-0123456789-0123456789";
  const withSecret = <T,>(fn: () => T): T => {
    const before = process.env.AELI_LINK_SECRET;
    process.env.AELI_LINK_SECRET = SECRET;
    try {
      return fn();
    } finally {
      if (before === undefined) delete process.env.AELI_LINK_SECRET;
      else process.env.AELI_LINK_SECRET = before;
    }
  };

  it("erkennt einen selbst ausgestellten Code", () => {
    withSecret(() => {
      const code = issueLinkCode("tenant_abc");
      expect(verifyLinkCode(code)).toEqual({ ok: true, tenantId: "tenant_abc" });
    });
  });

  it("verzeiht Leerzeichen und Zeilenumbrüche beim Kopieren", () => {
    withSecret(() => {
      const code = issueLinkCode("tenant_abc");
      expect(verifyLinkCode(` ${code.slice(0, 10)}\n${code.slice(10)} `)).toEqual({
        ok: true,
        tenantId: "tenant_abc",
      });
    });
  });

  it("weist einen veränderten Code ab", () => {
    withSecret(() => {
      const code = issueLinkCode("tenant_abc");
      // Ein Zeichen in der Nutzlast — genau das, was jemand versuchen würde,
      // um sich an eine fremde Community zu hängen.
      const parts = code.split(".");
      const tampered = [parts[0], parts[1]!.slice(0, -1) + "X", parts[2]].join(".");
      expect(verifyLinkCode(tampered).ok).toBe(false);
    });
  });

  it("weist einen Code mit fremdem Geheimnis ab", () => {
    const foreign = withSecret(() => issueLinkCode("tenant_abc"));
    process.env.AELI_LINK_SECRET = "ein-ganz-anderes-geheimnis-0123456789";
    expect(verifyLinkCode(foreign)).toEqual({ ok: false, reason: "invalid" });
    delete process.env.AELI_LINK_SECRET;
  });

  it("läuft nach 30 Minuten ab", () => {
    withSecret(() => {
      const issued = Date.parse("2026-08-07T10:00:00Z");
      const code = issueLinkCode("tenant_abc", issued);
      expect(verifyLinkCode(code, issued + 29 * 60_000).ok).toBe(true);
      expect(verifyLinkCode(code, issued + 31 * 60_000)).toEqual({ ok: false, reason: "expired" });
    });
  });

  it("weist Unsinn ab, statt daran zu scheitern", () => {
    withSecret(() => {
      for (const code of ["", "AELI1", "AELI1.a.b.c", "hallo", "AELI1..", "X.Y.Z"]) {
        expect(verifyLinkCode(code).ok, code).toBe(false);
      }
    });
  });

  it("gilt ohne konfiguriertes Geheimnis als nicht eingerichtet", () => {
    const before = process.env.AELI_LINK_SECRET;
    delete process.env.AELI_LINK_SECRET;
    expect(linkCodesConfigured()).toBe(false);
    if (before !== undefined) process.env.AELI_LINK_SECRET = before;
  });
});

describe("Handle-Regeln in Aera", () => {
  it("verhalten sich wie drüben", () => {
    expect(normalizeHandle("Marie Lang")).toBe("marie-lang");
    expect(normalizeHandle("Müller")).toBe("mueller");
    expect(checkHandle("login")).toBe("reserved");
    expect(checkHandle("marie")).toBeNull();
  });
});

/**
 * Der Startschalter.
 *
 * Aeli ist fertig gebaut, aber noch nicht angekündigt. Bis dahin darf im
 * Dashboard nichts davon zu sehen sein — und, wichtiger, nichts davon
 * erreichbar. Eine ausgeblendete Fläche, deren Server-Actions weiter
 * antworten, ist ein Vorhang und keine Tür: eine Action ist ein Endpunkt, und
 * wer ihre Kennung kennt, ruft sie ohne die Oberfläche auf.
 *
 * Der Test liest den Quelltext, weil es die einzige Stelle ist, an der sich
 * „jede Action fragt zuerst" überhaupt festhalten lässt.
 */
describe("Aeli bleibt bis zum Start unsichtbar", () => {
  const source = (path: string) => readFileSync(join(ROOT, path), "utf8");

  it("ist standardmäßig aus", () => {
    // Ein Schalter, den man vergisst umzulegen, zeigt nichts; einer, den man
    // vergisst auszuschalten, zeigt Unfertiges.
    const env = source("lib/env.ts");
    expect(env).toMatch(/AELI_LAUNCHED:\s*\(process\.env\.AELI_LAUNCHED \?\? ""\)/);
    expect(env).toContain("aeli: env.AELI_LAUNCHED");
  });

  it("blendet die Fläche im Dashboard aus, ohne sie zu laden", () => {
    const page = source("app/(creator)/dashboard/[slug]/settings/page.tsx");
    expect(page).toMatch(/features\.aeli && role === "OWNER"/);
  });

  it("schließt jede Server-Action", () => {
    const actions = source("app/actions/aeli.ts");
    const exported = [...actions.matchAll(/export async function (\w+)/g)].map((hit) => hit[1]!);
    expect(exported.length).toBeGreaterThan(0);

    for (const name of exported) {
      const start = actions.indexOf(`export async function ${name}`);
      const body = actions.slice(start, start + 900);
      expect(body, `${name} fragt nicht zuerst nach dem Schalter`).toContain("if (!launched())");
    }
  });

  it("schließt die Handle-Prüfung", () => {
    // 404 und nicht 403: „gesperrt" verrät, dass es den Endpunkt gibt.
    const route = source("app/api/aeli/handle/route.ts");
    expect(route).toMatch(/if \(!features\.aeli\)[\s\S]{0,120}status: 404/);
  });
});
