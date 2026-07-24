import { NextResponse } from "next/server";
import { tenantHasFeature } from "@/lib/plan";
import { getLocale } from "next-intl/server";
import { requireTenantAdmin } from "@/lib/guards";
import { features } from "@/lib/env";
import { geminiRawMetered } from "@/lib/ai";
import {
  reserveCredit,
  settleCreditReservation,
  releaseCreditReservation,
  getOrCreateWallet,
  walletBalance,
} from "@/lib/credits";
import { buildPlannerPrompt, parsePlannerJson } from "@/lib/planner-ai";
import type { ContentPlanType } from "@/app/generated/prisma/client";

const TYPES: ContentPlanType[] = [
  "POST", "VIDEO", "STREAM", "STORY", "NEWSLETTER", "EVENT", "PRODUCT_DROP", "OTHER",
];
const TEXT_FALLBACK_TOKENS = 400;

/**
 * Planner AI helper.
 * POST { slug, type, brief?, title?, description? }
 *   → { title, description, checklist: string[], tips: string[], timingHint, balance }
 * Leases exactly one credit and meters the call like the assistant/studio.
 */
export async function POST(req: Request) {
  let body: {
    slug?: string;
    type?: string;
    brief?: string;
    title?: string;
    description?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad-json" }, { status: 400 });
  }

  const slug = String(body.slug ?? "");
  if (!slug) return NextResponse.json({ error: "missing-slug" }, { status: 400 });
  const { tenant, user } = await requireTenantAdmin(slug);
  // Package gate — mirrors the paywall on the planner page.
  if (!(await tenantHasFeature(tenant.id, "planner"))) {
    return NextResponse.json({ error: "plan_upgrade_required" }, { status: 402 });
  }

  if (!features.gemini) {
    return NextResponse.json({ error: "gemini-off" }, { status: 400 });
  }

  const type = (TYPES as string[]).includes(String(body.type))
    ? (body.type as ContentPlanType)
    : "POST";
  const locale = await getLocale();
  const { system, userText } = buildPlannerPrompt({
    type,
    brief: body.brief?.slice(0, 2000),
    title: body.title?.slice(0, 200),
    description: body.description?.slice(0, 2000),
    locale,
  });

  const reservation = await reserveCredit({
    tenantId: tenant.id,
    userId: user.id,
    conversationId: null,
    kind: "planner",
  });
  if (!reservation) {
    return NextResponse.json({ outOfCredits: true }, { status: 402 });
  }

  let result: Awaited<ReturnType<typeof geminiRawMetered>>;
  try {
    result = await geminiRawMetered([{ role: "user", parts: [{ text: userText }] }], {
      system,
      maxTokens: 900,
    });
  } catch (error) {
    await releaseCreditReservation(reservation);
    throw error;
  }
  if (!result.content) {
    await releaseCreditReservation(reservation);
    return NextResponse.json({ error: "gemini-off" }, { status: 400 });
  }

  const totalTokens =
    result.usage.totalTokens > 0 ? result.usage.totalTokens : TEXT_FALLBACK_TOKENS;
  await settleCreditReservation({
    reservation,
    promptTokens: result.usage.promptTokens,
    outputTokens: result.usage.outputTokens || totalTokens,
    totalTokens,
  });

  const text = (result.content.parts ?? []).map((p) => p.text ?? "").join("").trim();
  const plan = parsePlannerJson(text);
  const balance = walletBalance(await getOrCreateWallet(tenant.id));

  return NextResponse.json({ ...plan, balance });
}
