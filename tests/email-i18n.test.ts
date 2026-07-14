import { describe, expect, it } from "vitest";
import { renderAccountActionHtml, renderCampaignHtml } from "@/lib/email";

describe("localized email templates", () => {
  it("uses the supplied campaign footer instead of a fixed language", () => {
    const html = renderCampaignHtml({
      tenantName: "Demo",
      primaryColor: "#111111",
      subject: "News",
      body: "Hello",
      footerLabel: "Sent via Aera",
    });

    expect(html).toContain("Sent via Aera");
    expect(html).not.toContain("Gesendet via Aera");
  });

  it("uses localized fallback and footer labels in account emails", () => {
    const html = renderAccountActionHtml({
      heading: "Reset password",
      body: "Choose a new password.",
      ctaLabel: "Continue",
      ctaUrl: "https://example.com/reset",
      hint: "This link expires soon.",
      fallbackLabel: "If the button does not work:",
      footerLabel: "Sent via Aera",
    });

    expect(html).toContain("If the button does not work:");
    expect(html).toContain("Sent via Aera");
    expect(html).not.toContain("Falls der Button nicht funktioniert");
  });
});
