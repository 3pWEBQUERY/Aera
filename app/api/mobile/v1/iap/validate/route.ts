import { z } from "zod";
import prisma, { withTenantContext } from "@/lib/prisma";
import { AppleIapError, verifySignedTransaction } from "@/lib/apple-iap";
import {
  fulfillOneTimePurchase,
  fulfillTierPurchase,
  IapFulfillmentError,
} from "@/lib/mobile/apple-fulfillment";
import { jsonError, jsonOk, parseJsonBody, requireMobileAuth } from "@/lib/mobile/api";
import { buildViewerContext } from "@/lib/mobile/serializers";

// POST /api/mobile/v1/iap/validate
// { tenantSlug, jws, kind, refId? } → { ok: true, viewer }
// Verifiziert die JWS-signierte StoreKit-2-Transaktion (x5c-Kette gegen
// Apple Root CA – G3), prüft bundleId/Environment und das Produkt-Mapping
// (explizit oder Preis-Pool) und vergibt Membership/Entitlement/Order
// identisch zum Stripe-Webhook-Pfad — idempotent über transactionId bzw.
// originalTransactionId.
// refId ist nur bei kind:"tier" optional (Restore ohne lokalen Kaufkontext):
// dann leitet der Server das Tier aus der productId der Transaktion ab.

const schema = z
  .object({
    tenantSlug: z.string().min(1),
    jws: z.string().min(1),
    kind: z.enum(["tier", "product", "post", "media", "media-item", "tip", "request", "booking"]),
    refId: z.string().optional(),
  })
  .refine((body) => body.kind === "tier" || (body.refId !== undefined && body.refId.length > 0), {
    message: "refId is required for this kind.",
    path: ["refId"],
  });

export async function POST(req: Request) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;
  const user = auth.user;

  const parsed = await parseJsonBody(req, schema);
  if ("response" in parsed) return parsed.response;
  const { tenantSlug, jws, kind, refId } = parsed.data;

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug, status: "ACTIVE" },
  });
  if (!tenant) return jsonError("not_found", "Community not found.", 404);

  let txn;
  try {
    txn = await verifySignedTransaction(jws);
  } catch (e) {
    if (e instanceof AppleIapError) {
      // bundle-/environment-Fehler zählen für den Client ebenfalls als
      // ungültige Transaktion (Vertrag: 400 iap_invalid).
      return jsonError("iap_invalid", e.message, 400);
    }
    throw e;
  }
  // Widerrufene Transaktionen (Refund) nie fulfillen.
  if (typeof txn.revocationDate === "number") {
    return jsonError("iap_invalid", "Transaction has been revoked.", 400);
  }

  try {
    return await withTenantContext(tenant.id, async () => {
      if (kind === "tier") {
        // Leere/fehlende refId → Tier wird aus txn.productId abgeleitet.
        await fulfillTierPurchase({ tenant, userId: user.id, tierId: refId || undefined, txn });
      } else {
        // Für alle anderen kinds erzwingt das Schema eine nicht-leere refId.
        await fulfillOneTimePurchase({ tenant, userId: user.id, kind, refId: refId!, txn });
      }
      const { viewer } = await buildViewerContext(tenant, user);
      return jsonOk({ ok: true, viewer });
    });
  } catch (e) {
    if (e instanceof IapFulfillmentError) {
      return jsonError(e.code, e.message, e.status);
    }
    console.error(`IAP validate failed (${kind}, ${refId}):`, e);
    return jsonError("internal", "IAP fulfillment failed.", 500);
  }
}
