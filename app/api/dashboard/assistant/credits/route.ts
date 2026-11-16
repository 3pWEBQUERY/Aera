import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/guards";
import {
  CREDIT_PACKS,
  PLANS,
  getCreditSummary,
  getOrCreateWallet,
  endCreatorSubscription,
  updateCreatorSubscription,
} from "@/lib/credits";
import {
  createCreditPackCheckout,
} from "@/lib/stripe";
import { startTrackedCreatorPlanCheckout } from "@/lib/creator-checkout";
import { cancelMembershipStripeSubscription } from "@/lib/stripe-cleanup";
import { env, features } from "@/lib/env";
import type { CreatorPlan } from "@/app/generated/prisma/client";

// GET /api/dashboard/assistant/credits?slug= → { summary }
export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug") ?? "";
  if (!slug) return NextResponse.json({ error: "missing slug" }, { status: 400 });
  const { tenant } = await requireTenantAdmin(slug);
  const summary = await getCreditSummary(tenant.id);
  return NextResponse.json({
    summary: {
      ...summary,
      billingEnabled: features.creatorBilling,
      cancellationEnabled: features.stripe,
    },
  });
}

// POST { slug, action: "buy" | "plan", packId?, plan? } → { url }
export async function POST(req: Request) {
  let body: {
    slug?: string;
    action?: string;
    packId?: string;
    plan?: string;
    returnPath?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const slug = String(body.slug ?? "");
  const action = String(body.action ?? "");
  if (!slug || !action) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  if (action !== "buy" && action !== "plan" && action !== "cancel_plan") {
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
  // Changing or cancelling the creator's own paid plan is billing, which is
  // OWNER-only everywhere else (settings UI, plan.ts, Stripe Connect).
  const { tenant, user } = await requireTenantAdmin(
    slug,
    action === "buy" ? "ADMIN" : "OWNER",
  );
  if (action === "cancel_plan" && !features.stripe) {
    return NextResponse.json(
      { error: "stripe_unavailable", message: "Stripe is required to cancel this plan." },
      { status: 503 },
    );
  }
  if (action !== "cancel_plan" && !features.creatorBilling) {
    return NextResponse.json(
      {
        error: "billing_unavailable",
        message: "Credit purchases and plan changes require verified Stripe billing.",
      },
      { status: 503 },
    );
  }

  // Back to where the checkout started (e.g. the spaces page) — but only to a
  // page of this tenant's own dashboard, never to an arbitrary URL.
  const dashboardBase = `/dashboard/${encodeURIComponent(tenant.slug)}`;
  const requestedReturn = typeof body.returnPath === "string" ? body.returnPath : "";
  const returnPath =
    (requestedReturn === dashboardBase || requestedReturn.startsWith(`${dashboardBase}/`)) &&
    /^[\w\-/]+$/.test(requestedReturn)
      ? requestedReturn
      : `${dashboardBase}/assistant`;
  const returnUrl = `${env.APP_URL}${returnPath}`;
  let checkoutUrl: string | null = null;

  // Stripe errors (missing/placeholder key locally, network, invalid price)
  // used to escape as an HTTP 500 without a body the sheet could explain.
  // They now end in a JSON error the UI shows next to the clicked button.
  try {
    if (action === "cancel_plan") {
      const wallet = await getOrCreateWallet(tenant.id);
      if (!wallet.stripeSubscriptionId) {
        return NextResponse.json({ error: "no_active_creator_plan" }, { status: 409 });
      }
      const cancellation = await cancelMembershipStripeSubscription(wallet.stripeSubscriptionId);
      if (cancellation.mode === "immediate") {
        await endCreatorSubscription({
          tenantId: tenant.id,
          stripeSubscriptionId: wallet.stripeSubscriptionId,
        });
      } else {
        await updateCreatorSubscription({
          tenantId: tenant.id,
          stripeSubscriptionId: wallet.stripeSubscriptionId,
          status: wallet.creatorSubscriptionStatus ?? "ACTIVE",
          cancelAtPeriodEnd: true,
          currentPeriodEnd: cancellation.currentPeriodEnd,
        });
      }
      const summary = await getCreditSummary(tenant.id);
      return NextResponse.json({
        summary: {
          ...summary,
          billingEnabled: features.creatorBilling,
          cancellationEnabled: features.stripe,
        },
      });
    }

    if (action === "buy") {
      const pack = CREDIT_PACKS.find((entry) => entry.id === body.packId);
      if (!pack) {
        return NextResponse.json({ error: "unknown_pack" }, { status: 400 });
      }
      checkoutUrl = await createCreditPackCheckout({
        tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
        user: { id: user.id, email: user.email },
        pack,
        successUrl: `${returnUrl}?billing=success`,
        cancelUrl: `${returnUrl}?billing=canceled`,
      });
    } else {
      const planKey = String(body.plan ?? "") as CreatorPlan;
      const plan = PLANS[planKey];
      if (!plan || plan.priceCents <= 0) {
        return NextResponse.json({ error: "unknown_or_free_plan" }, { status: 400 });
      }
      const wallet = await getOrCreateWallet(tenant.id);
      if (wallet.stripeSubscriptionId) {
        return NextResponse.json(
          {
            error: "existing_subscription",
            message: "The current paid plan must be changed or canceled through its subscription.",
          },
          { status: 409 },
        );
      }
      checkoutUrl = await startTrackedCreatorPlanCheckout({
        tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
        user: { id: user.id, email: user.email },
        plan,
        stripeCustomerId: wallet.stripeCustomerId,
        successUrl: `${returnUrl}?billing=success`,
        cancelUrl: `${returnUrl}?billing=canceled`,
      });
    }
  } catch (error) {
    console.error("[credits] billing action failed", { action, tenantId: tenant.id, error });
    return NextResponse.json(
      { error: action === "cancel_plan" ? "cancel_failed" : "checkout_failed" },
      { status: 502 },
    );
  }

  if (!checkoutUrl) {
    return NextResponse.json({ error: "checkout_unavailable" }, { status: 503 });
  }
  return NextResponse.json({ url: checkoutUrl });
}
