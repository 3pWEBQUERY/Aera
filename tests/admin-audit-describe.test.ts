import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  AUDIT_EVENT_KEYS,
  auditEventKey,
  auditMessageId,
  humanizeAction,
  targetFromMetadata,
} from "@/app/admin/audit/describe";

const root = path.resolve(__dirname, "..");
const LOCALES = [
  "de", "en", "da", "es", "fr", "it", "ja", "ko", "nb", "nl", "pl", "pt-BR", "ru", "sv", "uk", "zh-Hans", "zh-Hant",
];

function events(locale: string): Record<string, string> {
  const messages = JSON.parse(fs.readFileSync(path.join(root, "messages", `${locale}.json`), "utf8"));
  return messages.admin.audit.events;
}

/** Alle Schluessel, die der Code per writeAudit({ action: "..." }) schreibt. */
function auditActionsInCode(): Set<string> {
  const found = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "generated" || entry.name === "node_modules") continue;
        walk(full);
      } else if (/\.tsx?$/.test(entry.name)) {
        const src = fs.readFileSync(full, "utf8");
        for (const call of src.matchAll(/writeAudit\(\{([\s\S]*?)\}\)/g)) {
          const action = /action:\s*([^\n]+)/.exec(call[1]);
          if (!action) continue;
          for (const lit of action[1].matchAll(/"([a-zA-Z_.-]+\.[a-zA-Z_.-]+)"/g)) found.add(lit[1]);
        }
      }
    }
  };
  walk(path.join(root, "app"));
  walk(path.join(root, "lib"));
  return found;
}

describe("admin audit log in plain language", () => {
  it("has a sentence for every known key in every full locale", () => {
    for (const locale of LOCALES) {
      const ev = events(locale);
      const missing = AUDIT_EVENT_KEYS.filter((k) => !ev[auditMessageId(k)]);
      expect(missing, locale).toEqual([]);
    }
  });

  it("knows every literal action key written in app/ and lib/", () => {
    const known = new Set<string>(AUDIT_EVENT_KEYS);
    const unknown = [...auditActionsInCode()].filter((k) => !known.has(k));
    expect(unknown).toEqual([]);
  });

  it("derives more specific sentences from metadata", () => {
    expect(auditEventKey("member.update", { status: "BANNED" })).toBe("member.ban");
    expect(auditEventKey("member.update", { status: "ACTIVE" })).toBe("member.update");
    expect(auditEventKey("admin.tenant.update", { statusChanged: true, status: "SUSPENDED" })).toBe(
      "admin.tenant.suspend",
    );
    expect(auditEventKey("admin.tenant.update", { statusChanged: false, status: "ACTIVE" })).toBe(
      "admin.tenant.update",
    );
    expect(auditEventKey("admin.blog.feature", { featured: false })).toBe("admin.blog.unfeature");
    expect(auditEventKey("apple.iap.media-item", null)).toBe("apple.iap.media-item");
  });

  it("falls back readably for unknown keys", () => {
    expect(auditEventKey("something.new", {})).toBeNull();
    expect(humanizeAction("tenant.delete.queued")).toBe("tenant › delete › queued");
    expect(humanizeAction("space.chatSettings.update")).toBe("space › chat settings › update");
    expect(humanizeAction("user.password_reset.request")).toBe("user › password reset › request");
  });

  it("takes a target label from metadata when the record is gone", () => {
    expect(targetFromMetadata({ name: "Chor am Seeufer", slug: "chor" })).toBe("Chor am Seeufer");
    expect(targetFromMetadata({ email: "tom@example.test" })).toBe("tom@example.test");
    expect(targetFromMetadata({ recipients: 3 })).toBeNull();
    expect(targetFromMetadata(null)).toBeNull();
  });
});
