import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/guards";
import {
  CREDIT_PACKS,
  PLANS,
  getCreditSummary,
  getOrCreateWallet,
  updateCreatorSubscription,
} from "@/lib/credits";
import {
  cancelSubscriptionAtPeriodEnd,
  createCreditPackCheckout,
  createCreatorPlanCheckout,
} from "@/lib/stripe";
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
    summary: { ...summary, billingEnabled: features.creatorBilling },
  });
}

// POST { slug, action: "buy" | "plan", packId?, plan? } → { url }
export async function POST(req: Request) {
  let body: { slug?: string; action?: string; packId?: string; plan?: string };
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

  const { tenant, user } = await requireTenantAdmin(slug);

  if (action !== "buy" && action !== "plan" && action !== "cancel_plan") {
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
  if (!features.creatorBilling) {
    return NextResponse.json(
      {
        error: "billing_unavailable",
        message: "Credit purchases and plan changes require verified Stripe billing.",
      },
      { status: 503 },
    );
  }

  const returnUrl = `${env.APP_URL}/dashboard/${encodeURIComponent(tenant.slug)}/assistant`;
  let checkoutUrl: string | null = null;

  if (action === "cancel_plan") {
    const wallet = await getOrCreateWallet(tenant.id);
    if (!wallet.stripeSubscriptionId) {
      return NextResponse.json({ error: "no_active_creator_plan" }, { status: 409 });
    }
    const periodEnd = await cancelSubscriptionAtPeriodEnd(wallet.stripeSubscriptionId);
    await updateCreatorSubscription({
      tenantId: tenant.id,
      stripeSubscriptionId: wallet.stripeSubscriptionId,
      status: wallet.creatorSubscriptionStatus ?? "ACTIVE",
      cancelAtPeriodEnd: true,
      currentPeriodEnd: periodEnd,
    });
    const summary = await getCreditSummary(tenant.id);
    return NextResponse.json({
      summary: { ...summary, billingEnabled: features.creatorBilling },
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
    checkoutUrl = await createCreatorPlanCheckout({
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
      user: { id: user.id, email: user.email },
      plan,
      stripeCustomerId: wallet.stripeCustomerId,
      successUrl: `${returnUrl}?billing=success`,
      cancelUrl: `${returnUrl}?billing=canceled`,
    });
  }

  if (!checkoutUrl) {
    return NextResponse.json({ error: "checkout_unavailable" }, { status: 503 });
  }
  return NextResponse.json({ url: checkoutUrl });
}
