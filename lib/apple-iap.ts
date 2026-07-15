import "server-only";
import { X509Certificate } from "node:crypto";
import { compactVerify, decodeProtectedHeader } from "jose";
import { env } from "./env";

/**
 * Apple-IAP: Verifizierung JWS-signierter StoreKit-2-Transaktionen und
 * App Store Server Notifications V2.
 *
 * Die Signaturkette (`x5c`-Header) wird gegen die eingebettete Apple Root CA
 * – G3 geprüft: jedes Zertifikat muss vom nächsten in der Kette ausgestellt
 * und signiert sein, der Anker muss die eingebettete Root sein. Erst danach
 * wird die JWS-Signatur (ES256) mit dem Leaf-Zertifikat verifiziert.
 */

// Apple Root CA - G3 (https://www.apple.com/certificateauthority/)
// Subject:  CN=Apple Root CA - G3, OU=Apple Certification Authority, O=Apple Inc., C=US
// Gültig:   2014-04-30 – 2039-04-30
// SHA-256:  63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79
const APPLE_ROOT_CA_G3_PEM = `-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----`;

export class AppleIapError extends Error {
  constructor(
    public readonly code:
      | "iap_invalid"
      | "iap_bundle_mismatch"
      | "iap_environment"
      | "iap_product_mismatch",
    message: string,
  ) {
    super(message);
    this.name = "AppleIapError";
  }
}

// -------------------------------------------------------------- Payload-Typen
/** App Store Server API: JWSTransactionDecodedPayload (Teilmenge). */
export interface JWSTransactionDecodedPayload {
  transactionId: string;
  originalTransactionId: string;
  webOrderLineItemId?: string;
  bundleId?: string;
  productId: string;
  subscriptionGroupIdentifier?: string;
  purchaseDate?: number;
  originalPurchaseDate?: number;
  /** Ablauf des Abos (ms since epoch) — nur bei Auto-Renewable Subscriptions. */
  expiresDate?: number;
  quantity?: number;
  /** "Auto-Renewable Subscription" | "Non-Consumable" | "Consumable" | "Non-Renewing Subscription" */
  type?: string;
  inAppOwnershipType?: string;
  signedDate?: number;
  revocationDate?: number;
  revocationReason?: number;
  offerType?: number;
  /** "Production" | "Sandbox" */
  environment?: string;
  storefront?: string;
  storefrontId?: string;
  transactionReason?: string;
  price?: number;
  currency?: string;
  appAccountToken?: string;
}

/** App Store Server API: JWSRenewalInfoDecodedPayload (Teilmenge). */
export interface JWSRenewalInfoDecodedPayload {
  originalTransactionId?: string;
  autoRenewProductId?: string;
  productId?: string;
  /** 1 = Auto-Renew aktiv, 0 = deaktiviert. */
  autoRenewStatus?: number;
  expirationIntent?: number;
  gracePeriodExpiresDate?: number;
  isInBillingRetryPeriod?: boolean;
  environment?: string;
  signedDate?: number;
}

/** App Store Server Notifications V2: responseBodyV2DecodedPayload (Teilmenge). */
export interface AppleNotificationV2DecodedPayload {
  notificationType: string;
  subtype?: string;
  notificationUUID?: string;
  version?: string;
  signedDate?: number;
  data?: {
    appAppleId?: number;
    bundleId?: string;
    bundleVersion?: string;
    environment?: string;
    status?: number;
    signedTransactionInfo?: string;
    signedRenewalInfo?: string;
  };
}

// -------------------------------------------------------------- Verifizierung
function loadRoot(): X509Certificate {
  return new X509Certificate(APPLE_ROOT_CA_G3_PEM);
}

/**
 * Prüft die x5c-Kette einer signierten Apple-Payload und verifiziert die
 * JWS-Signatur mit dem Leaf-Zertifikat. Wirft AppleIapError bei jedem Fehler.
 */
async function verifyAppleJws(jws: string): Promise<unknown> {
  let x5c: string[];
  let alg: string | undefined;
  try {
    const header = decodeProtectedHeader(jws);
    alg = header.alg;
    x5c = Array.isArray(header.x5c) ? (header.x5c as string[]) : [];
  } catch {
    throw new AppleIapError("iap_invalid", "Malformed JWS header.");
  }
  if (alg !== "ES256") {
    throw new AppleIapError("iap_invalid", `Unexpected JWS algorithm: ${alg ?? "none"}.`);
  }
  if (x5c.length < 2) {
    throw new AppleIapError("iap_invalid", "JWS is missing its x5c certificate chain.");
  }

  let certs: X509Certificate[];
  try {
    certs = x5c.map((b64) => new X509Certificate(Buffer.from(b64, "base64")));
  } catch {
    throw new AppleIapError("iap_invalid", "Invalid certificate in x5c chain.");
  }

  // Gültigkeitsfenster aller Zertifikate.
  const now = Date.now();
  for (const cert of certs) {
    if (now < Date.parse(cert.validFrom) || now > Date.parse(cert.validTo)) {
      throw new AppleIapError("iap_invalid", "Certificate in x5c chain is expired or not yet valid.");
    }
  }

  // Kette: jedes Zertifikat muss vom nächsten ausgestellt UND signiert sein.
  for (let i = 0; i < certs.length - 1; i++) {
    const child = certs[i]!;
    const issuer = certs[i + 1]!;
    if (!child.checkIssued(issuer) || !child.verify(issuer.publicKey)) {
      throw new AppleIapError("iap_invalid", "x5c certificate chain does not verify.");
    }
  }

  // Anker: das letzte Kettenglied muss die eingebettete Apple Root CA – G3
  // sein (byte-identisch) oder direkt von ihr ausgestellt und signiert sein.
  const root = loadRoot();
  const last = certs[certs.length - 1]!;
  const anchored =
    last.raw.equals(root.raw) || (last.checkIssued(root) && last.verify(root.publicKey));
  if (!anchored) {
    throw new AppleIapError("iap_invalid", "x5c chain is not anchored in Apple Root CA - G3.");
  }

  // Signatur der Payload mit dem Leaf-Zertifikat prüfen.
  try {
    const { payload } = await compactVerify(jws, certs[0]!.publicKey, {
      algorithms: ["ES256"],
    });
    return JSON.parse(new TextDecoder().decode(payload)) as unknown;
  } catch {
    throw new AppleIapError("iap_invalid", "JWS signature verification failed.");
  }
}

function assertBundleId(bundleId: string | undefined): void {
  if (!env.APPLE_BUNDLE_ID) {
    throw new AppleIapError("iap_invalid", "APPLE_BUNDLE_ID is not configured.");
  }
  if (bundleId !== env.APPLE_BUNDLE_ID) {
    throw new AppleIapError(
      "iap_bundle_mismatch",
      `Transaction bundleId "${bundleId ?? ""}" does not match APPLE_BUNDLE_ID.`,
    );
  }
}

function assertEnvironment(environment: string | undefined): void {
  if (environment === "Production") return;
  if (environment === "Sandbox" && env.APPLE_IAP_ALLOW_SANDBOX) return;
  throw new AppleIapError(
    "iap_environment",
    `Environment "${environment ?? ""}" is not accepted (Production only; set APPLE_IAP_ALLOW_SANDBOX=1 for Sandbox).`,
  );
}

/**
 * Verifiziert eine signierte StoreKit-2-Transaktion (JWS) inkl. bundleId- und
 * Environment-Prüfung und liefert die dekodierte Payload.
 */
export async function verifySignedTransaction(
  jws: string,
): Promise<JWSTransactionDecodedPayload> {
  const payload = (await verifyAppleJws(jws)) as JWSTransactionDecodedPayload;
  if (!payload || typeof payload.transactionId !== "string" || typeof payload.productId !== "string") {
    throw new AppleIapError("iap_invalid", "Transaction payload is missing required fields.");
  }
  assertBundleId(payload.bundleId);
  assertEnvironment(payload.environment);
  return payload;
}

/** Verifiziert eine signierte Renewal-Info (JWS) ohne bundleId-Feld-Prüfung. */
export async function verifySignedRenewalInfo(
  jws: string,
): Promise<JWSRenewalInfoDecodedPayload> {
  return (await verifyAppleJws(jws)) as JWSRenewalInfoDecodedPayload;
}

/**
 * Verifiziert den `signedPayload` einer App Store Server Notification V2
 * inkl. bundleId- und Environment-Prüfung der eingebetteten `data`.
 */
export async function verifyNotificationPayload(
  signedPayload: string,
): Promise<AppleNotificationV2DecodedPayload> {
  const payload = (await verifyAppleJws(signedPayload)) as AppleNotificationV2DecodedPayload;
  if (!payload || typeof payload.notificationType !== "string") {
    throw new AppleIapError("iap_invalid", "Notification payload is missing notificationType.");
  }
  if (payload.data) {
    assertBundleId(payload.data.bundleId);
    assertEnvironment(payload.data.environment);
  }
  return payload;
}
