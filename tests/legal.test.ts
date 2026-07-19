import { describe, expect, it } from "vitest";
import {
  CURRENT_WITHDRAWAL_VERSION,
  immediatePerformanceConsentFromForm,
  immediatePerformanceConsentFromMetadata,
  immediatePerformanceConsentMetadata,
} from "@/lib/legal";

describe("legal consent evidence", () => {
  it("does not infer immediate performance consent from any other field", () => {
    const form = new FormData();
    form.set("legalAcceptance", "on");

    expect(immediatePerformanceConsentFromForm(form)).toBeNull();
  });

  it("creates a versioned timestamp only for an explicit unchecked-box opt-in", () => {
    const now = new Date("2026-07-19T12:30:00.000Z");
    const form = new FormData();
    form.set("immediatePerformanceConsent", "on");

    expect(immediatePerformanceConsentFromForm(form, now)).toEqual({
      consentedAt: now,
      termsVersion: CURRENT_WITHDRAWAL_VERSION,
    });
  });

  it("round-trips valid Stripe metadata and rejects incomplete evidence", () => {
    const evidence = {
      consentedAt: new Date("2026-07-19T12:30:00.000Z"),
      termsVersion: "withdrawal-1",
    };
    const metadata = immediatePerformanceConsentMetadata(evidence);

    expect(immediatePerformanceConsentFromMetadata(metadata)).toEqual(evidence);
    expect(
      immediatePerformanceConsentFromMetadata({
        ...metadata,
        withdrawalLossAcknowledged: "false",
      }),
    ).toBeNull();
  });
});
