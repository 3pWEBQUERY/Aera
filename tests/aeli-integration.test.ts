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
