export const CURRENT_TERMS_VERSION = "2026-07-19";
export const CURRENT_PRIVACY_VERSION = "2026-07-19";
export const CURRENT_WITHDRAWAL_VERSION = "2026-07-19";

export const LEGAL_DOCUMENT = {
  terms: "TERMS",
  privacyNotice: "PRIVACY_NOTICE",
} as const;

export interface ImmediatePerformanceConsent {
  consentedAt: Date;
  termsVersion: string;
}

/**
 * A required, unchecked form control is the evidence boundary for immediate
 * digital delivery. Callers must never infer consent from accepting the AGB.
 */
export function immediatePerformanceConsentFromForm(
  formData: FormData,
  now = new Date(),
): ImmediatePerformanceConsent | null {
  if (formData.get("immediatePerformanceConsent") !== "on") return null;
  return { consentedAt: now, termsVersion: CURRENT_WITHDRAWAL_VERSION };
}

export function immediatePerformanceConsentMetadata(
  consent: ImmediatePerformanceConsent,
): Record<string, string> {
  return {
    immediatePerformanceConsent: "true",
    withdrawalLossAcknowledged: "true",
    legalTermsVersion: consent.termsVersion,
    legalConsentAt: consent.consentedAt.toISOString(),
  };
}

export function immediatePerformanceConsentFromMetadata(
  metadata: Record<string, string | undefined>,
): ImmediatePerformanceConsent | null {
  if (
    metadata.immediatePerformanceConsent !== "true" ||
    metadata.withdrawalLossAcknowledged !== "true" ||
    !metadata.legalTermsVersion ||
    !metadata.legalConsentAt
  ) {
    return null;
  }
  const consentedAt = new Date(metadata.legalConsentAt);
  if (Number.isNaN(consentedAt.getTime())) return null;
  return { consentedAt, termsVersion: metadata.legalTermsVersion };
}
