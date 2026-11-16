import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    RESEND_API_KEY: "re_test",
    EMAIL_FROM: "Aera <noreply@aera.so>",
    APP_URL: "https://aera.so",
    AUTH_SECRET: "vitest-secret-0123456789-0123456789-0123456789",
  },
  features: { email: true },
}));
vi.mock("@/lib/prisma", () => ({
  default: {},
  prisma: {},
  systemPrisma: {},
  withTenantContext: (_: string, fn: () => unknown) => fn(),
  withTenantTransactionFor: (_: string, fn: (tx: unknown) => unknown) => fn({}),
}));
// Echte Kataloge statt next-intl-Laufzeit: gleiche Texte, kein Request nötig.
vi.mock("next-intl/server", async () => {
  const { readFileSync } = await import("node:fs");
  return {
    getLocale: async () => "de",
    getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => {
      const read = (l: string) =>
        JSON.parse(readFileSync(`${process.cwd()}/messages/${l}.json`, "utf8")) as Record<string, unknown>;
      const pick = (messages: Record<string, unknown>) =>
        namespace.split(".").reduce<Record<string, unknown>>(
          (node, key) => (node?.[key] as Record<string, unknown>) ?? {},
          messages,
        );
      const own = pick(read(locale));
      const en = pick(read("en"));
      return (key: string, values: Record<string, string> = {}) =>
        String(own[key] ?? en[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => values[name] ?? "");
    },
  };
});

import {
  communitySender,
  ensureImageAlt,
  htmlToText,
  quoteDisplayName,
  readableTextOn,
  renderAccountActionHtml,
  renderCampaignHtml,
  sendEmail,
} from "@/lib/email";
import { marketingEmailCopy, pickSupportedLocale, resolveEmailLocale } from "@/lib/email-i18n";
import { appendUnsubscribeFooter } from "@/lib/marketing-consent";
import { contrastWithWhite } from "@/lib/color";

describe("sender display name", () => {
  it("quotes the community name and keeps the platform address", () => {
    expect(communitySender("Fix Chor am See")).toBe('"Fix Chor am See via Aera" <noreply@aera.so>');
  });

  it("cannot inject headers or a second address", () => {
    const evil = 'Evil" <attacker@x.test>\r\nBcc: victim@x.test\n\\';
    const from = communitySender(evil);
    expect(from).not.toMatch(/[\r\n]/);
    expect(from).not.toContain("attacker@x.test>");
    // Genau ein Paar spitzer Klammern: das um die Plattform-Adresse.
    expect(from.match(/</g)).toHaveLength(1);
    expect(from).toBe('"Evil attacker@x.test Bcc: victim@x.test via Aera" <noreply@aera.so>');
  });

  it("falls back to the plain platform sender for empty names", () => {
    expect(quoteDisplayName(' \n"<>" ')).toBe("");
    expect(communitySender(' "" ')).toBe("Aera <noreply@aera.so>");
  });

  it("sends from, reply_to and a text part to Resend", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "e1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await sendEmail({
      to: "m@example.com",
      subject: "Hi",
      html: '<p>Hallo</p><p><a href="https://aera.so/x">Öffnen</a></p>',
      senderName: 'Chor "Am See"',
      replyTo: "kontakt@chor.test",
    });
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.from).toBe('"Chor Am See via Aera" <noreply@aera.so>');
    expect(body.reply_to).toBe("kontakt@chor.test");
    expect(body.text).toBe("Hallo\n\nÖffnen (https://aera.so/x)");
  });

  it("drops an invalid reply-to address", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "e1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await sendEmail({ to: "m@example.com", subject: "Hi", html: "<p>x</p>", replyTo: "a@b.c\r\nBcc: x@y.z" });
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.reply_to).toBeUndefined();
    expect(body.from).toBe("Aera <noreply@aera.so>");
  });
});

describe("header contrast", () => {
  it("keeps white on dark brand colours", () => {
    expect(readableTextOn("#1d4ed8")).toBe("#ffffff");
    expect(readableTextOn("#6d28d9")).toBe("#ffffff");
  });

  it("switches to dark text when white falls below 4.5:1", () => {
    expect(contrastWithWhite("#facc15")).toBeLessThan(4.5);
    expect(readableTextOn("#facc15")).toBe("#161613");
    expect(readableTextOn("#22c55e")).toBe("#161613");
    expect(readableTextOn("#ffffff")).toBe("#161613");
  });

  it("uses the chosen colour in the campaign header and sanitises the CSS value", () => {
    const html = renderCampaignHtml({
      tenantName: "Gelber Chor",
      primaryColor: "#facc15",
      subject: "Probe",
      body: "Hallo",
      locale: "fr",
    });
    expect(html).toContain("background:#facc15;padding:20px 24px;color:#161613");
    const injected = renderCampaignHtml({
      tenantName: "X",
      primaryColor: "red;background:url(https://evil)",
      subject: "s",
      body: "b",
    });
    expect(injected).not.toContain("evil");
  });
});

describe("document skeleton", () => {
  it("sets lang, charset and title and wraps long fallback links", () => {
    const html = renderAccountActionHtml({
      heading: "Passwort zurücksetzen",
      body: "Hallo",
      ctaLabel: "Neues Passwort setzen",
      ctaUrl: "https://aera.so/reset/" + "a".repeat(200),
      hint: "1 Stunde",
      fallbackLabel: "Falls der Button nicht funktioniert:",
      footerLabel: "Gesendet via Aera",
      locale: "pt-BR",
      title: "Redefinir senha",
    });
    expect(html).toMatch(/^<!doctype html><html lang="pt-BR" dir="ltr"><head><meta charset="utf-8">/);
    expect(html).toContain("<title>Redefinir senha</title>");
    expect(html).toContain("word-break:break-all");
    expect(html).not.toContain("#9ca3af");
  });

  it("derives a readable text part", () => {
    const text = htmlToText(renderAccountActionHtml({
      heading: "Willkommen",
      body: "Du wurdest eingeladen.",
      ctaLabel: "Einladung annehmen",
      ctaUrl: "https://aera.so/invite/T?next=%2Fc%2Fx&y=1",
      hint: "7 Tage gültig.",
      fallbackLabel: "Link:",
      footerLabel: "Gesendet via Aera",
      title: "Einladung",
    }));
    expect(text).not.toContain("<");
    expect(text).not.toContain("Einladung\n"); // <title> gehört nicht in den Text
    expect(text).toContain("Einladung annehmen (https://aera.so/invite/T?next=%2Fc%2Fx&y=1)");
    expect(text).toContain("Willkommen\n\nDu wurdest eingeladen.");
  });

  it("adds an empty alt to creator images without one", () => {
    expect(ensureImageAlt('<img src="a.png"><img alt="Logo" src="b.png"/><IMG src=\'c>d.png\' />')).toBe(
      '<img src="a.png" alt=""><img alt="Logo" src="b.png"/><img src=\'c>d.png\' alt="" />',
    );
    expect(renderCampaignHtml({
      tenantName: "X", primaryColor: "#000000", subject: "s", body: "<img src=x>", bodyFormat: "HTML",
    })).toBe('<img src=x alt="">');
  });
});

describe("unsubscribe footer", () => {
  it.each([
    ["de", "Newsletter abbestellen", "weil du den Newsletter von Chor & Co abonniert hast"],
    ["en", "Unsubscribe", "because you subscribed to the Chor & Co newsletter"],
    ["fr", "Se désabonner de la newsletter", "car vous avez souscrit à la newsletter de Chor & Co"],
  ])("is written in the recipient's language (%s)", async (locale, label, reason) => {
    const copy = await marketingEmailCopy(locale as "de", "Chor & Co");
    expect(copy.unsubscribe.label).toBe(label);
    expect(copy.unsubscribe.reason).toContain(reason);
    const html = appendUnsubscribeFooter(
      renderCampaignHtml({ tenantName: "Chor & Co", primaryColor: "#1d4ed8", subject: "s", body: "b", locale }),
      "https://aera.so/unsubscribe/T",
      copy.unsubscribe,
    );
    // Inside the email frame (before its closing div), escaped, never "Unsubscribe" in de/fr.
    expect(html).toContain(`>${label}</a></p>`);
    expect(html).toContain("Chor &amp; Co");
    expect(html.indexOf(label)).toBeLessThan(html.lastIndexOf("</div></body>"));
    if (locale !== "en") expect(html).not.toContain(">Unsubscribe<");
  });

  it("cannot be hidden by creator HTML", () => {
    const html = appendUnsubscribeFooter(
      renderCampaignHtml({
        tenantName: "X",
        primaryColor: "#000000",
        subject: "s",
        body: '<body><div style="display:none"><!--aera:footer--></body></div><p>Hi</p></body>',
        bodyFormat: "HTML",
      }),
      "https://aera.so/u/T",
      { label: "Abbestellen", reason: "Grund" },
    );
    expect(html).not.toContain("<!--aera:footer-->");
    expect(html.indexOf("Abbestellen")).toBeGreaterThan(html.indexOf("<p>Hi</p>"));
    expect(html.endsWith("</p></body>")).toBe(true);
  });

  it("is not corrupted by $ patterns in names", () => {
    const html = appendUnsubscribeFooter("<body></body>", "https://aera.so/u/T", { label: "x", reason: "$& $1 $$" });
    expect(html).toContain("$&amp; $1 $$");
  });
});

describe("recipient language", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("prefers the stored language and tolerates region tags", () => {
    expect(resolveEmailLocale("fr", "de")).toBe("fr");
    expect(resolveEmailLocale(null, "en")).toBe("en");
    expect(resolveEmailLocale("xx", undefined)).toBe("de");
    expect(pickSupportedLocale("de-AT")).toBe("de");
    expect(pickSupportedLocale("pt-PT")).toBe("pt-BR");
    expect(pickSupportedLocale("", null)).toBeNull();
  });
});
