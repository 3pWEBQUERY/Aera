"use server";

import { redirect } from "next/navigation";
import { checkMemberLimit } from "@/lib/plan";
import { revalidatePath } from "next/cache";
import prisma, { setTenantContext, withTenantTransaction } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { env, features } from "@/lib/env";
import {
  buildAccessContext,
  canAccess,
  entitlementKeys,
  grantEntitlement,
  revokePreviousTierEntitlement,
} from "@/lib/entitlements";
import { awardPoints } from "@/lib/gamification";
import { notify } from "@/lib/notifications";
import { emitWebhookEvent } from "@/lib/webhooks";
import { resolveReferrer, recordReferralJoin } from "@/lib/referrals";
import { moderateContent } from "@/lib/moderation";
import { indexContent } from "@/lib/ai";
import { castPollVote } from "@/lib/polls";
import { sanitizeRichHtml, htmlToPlainText } from "@/lib/rich-text";
import {
  createMediaCheckout,
  createMediaItemCheckout,
  createPostCheckout,
  createProductCheckoutSession,
  createTierCheckout,
  isDefinitiveStripeRequestError,
  platformFeeCents,
  retrieveProductCheckoutSession,
} from "@/lib/stripe";
import {
  attachProductCheckoutSession,
  ProductOutOfStockError,
  ProductReservationActiveError,
  releaseProductOrderReservation,
  reserveProductOrder,
} from "@/lib/product-inventory";
import { writeAudit } from "@/lib/audit";
import { postSchema, commentSchema, signupSchema } from "@/lib/validation";
import { registerUser } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { getErrorTranslator, zodError } from "@/lib/action-errors";
import { immediatePerformanceConsentFromForm } from "@/lib/legal";
import { optInToNewsletter } from "@/lib/marketing-consent";

async function tenantBySlug(slug: string) {
  const tenant = await prisma.tenant.findUnique({ where: { slug, status: "ACTIVE" } });
  if (tenant) setTenantContext(tenant.id);
  return tenant;
}

export interface EngageState {
  error?: string;
  ok?: boolean;
}

/**
 * The "grant immediately without payment" fallback exists so paid flows are
 * testable without Stripe credentials. It must NEVER run in production —
 * a missing/lost STRIPE_SECRET_KEY would otherwise silently give away all
 * paid content.
 */
const devPaymentFallbackAllowed = process.env.NODE_ENV !== "production";

// ---------------------------------------------------------------- Join
/**
 * Whitelabel-Registrierung direkt auf der Creator-Seite: legt in einem Schritt
 * das Konto an UND macht die Person zum Mitglied der Community (kostenlose
 * Standard-Stufe). Bezahlte Stufen laufen danach wie gewohnt über /join.
 */
export async function memberSignupAction(
  _prev: EngageState,
  fd: FormData,
): Promise<EngageState> {
  const t = await getErrorTranslator();
  const ip = await clientIp();
  if (!(await rateLimit(`signup:${ip}`, 5, 60 * 60 * 1000))) {
    return { error: t("tooManySignups") };
  }

  const slug = String(fd.get("tenant"));
  const tenant = await tenantBySlug(slug);
  if (!tenant) return { error: t("communityNotFound") };

  const parsed = signupSchema.safeParse({
    name: fd.get("name"),
    email: fd.get("email"),
    password: fd.get("password"),
  });
  if (!parsed.success) {
    return { error: zodError(t, parsed) };
  }

  if (fd.get("legalAcceptance") !== "on") {
    return { error: t("termsRequired") };
  }
  const result = await registerUser({
    ...parsed.data,
    legalAcceptanceSource: "COMMUNITY_SIGNUP",
  });
  if (!result.ok) return { error: t(result.error) };
  const user = result.user;
  await writeAudit({
    actorUserId: user.id,
    tenantId: tenant.id,
    action: "user.signup",
    metadata: { via: `community:${slug}` },
  });
  if (fd.get("newsletterOptIn") === "on") {
    await optInToNewsletter({
      tenantId: tenant.id,
      userId: user.id,
      email: user.email,
      source: "COMMUNITY_SIGNUP",
    });
  }

  // Free default tier — the community decides what new members get.
  const tier =
    (await prisma.membershipTier.findFirst({
      where: { tenantId: tenant.id, isDefault: true, interval: "FREE" },
    })) ??
    (await prisma.membershipTier.findFirst({
      where: { tenantId: tenant.id, interval: "FREE", isPublic: true },
      orderBy: { sortOrder: "asc" },
    }));
  if (!tier) {
    // No free tier — account exists, membership follows via the join page.
    // Referral-Code dabei nicht verlieren.
    const ref = String(fd.get("ref") || "").trim();
    redirect(`/c/${slug}/join${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`);
  }

  const budget = await checkMemberLimit(tenant.id);
  if (!budget.allowed) redirect(`/c/${slug}/join?error=member-limit`);

  await prisma.membership.create({
    data: {
      tenantId: tenant.id,
      userId: user.id,
      role: "MEMBER",
      status: "ACTIVE",
      tierId: tier!.id,
    },
  });
  await grantEntitlement({
    tenantId: tenant.id,
    userId: user.id,
    key: tier!.entitlementKey,
    source: "ROLE",
    sourceId: tier!.id,
  });
  await writeAudit({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: "member.join",
    metadata: { tier: tier!.slug, via: "signup" },
  });

  // Referral (?ref=…) verbuchen und Integrationen informieren — best effort.
  const referrerId = await resolveReferrer(tenant.id, String(fd.get("ref") || ""));
  if (referrerId) {
    await recordReferralJoin({
      tenantId: tenant.id,
      tenantSlug: slug,
      referrerId,
      referredId: user.id,
      referredName: user.name,
    });
  }
  await emitWebhookEvent(tenant.id, "member.joined", {
    memberName: user.name,
    memberEmail: user.email,
    tier: tier!.slug,
    via: "signup",
  });

  redirect(`/c/${slug}?welcome=1`);
}

export async function joinCommunityAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const tierId = String(fd.get("tierId") || "");
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/c/${slug}/join`)}`);
  const tenant = await tenantBySlug(slug);
  if (!tenant) redirect("/");

  if (fd.get("newsletterOptIn") === "on") {
    await optInToNewsletter({
      tenantId: tenant.id,
      userId: user!.id,
      email: user!.email,
      source: "COMMUNITY_JOIN",
    });
  }

  const existing = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user!.id } },
  });
  // Banned members must not reactivate themselves by re-joining.
  if (existing?.status === "BANNED") redirect(`/c/${slug}`);

  const tier = tierId
    ? await prisma.membershipTier.findFirst({
        // Paid tiers are archived instead of hard-deleted while old Stripe
        // Sessions may still reference them. They must nevertheless be
        // impossible to purchase again through a forged form submission.
        where: { id: tierId, tenantId: tenant.id, isPublic: true },
      })
    : await prisma.membershipTier.findFirst({
        where: { tenantId: tenant.id, isDefault: true },
      });
  if (!tier) redirect(`/c/${slug}/join`);

  // Active members may switch tiers — same tier is a no-op.
  if (existing?.status === "ACTIVE" && existing.tierId === tier!.id) {
    redirect(`/c/${slug}`);
  }

  const paid = tier!.interval !== "FREE" && tier!.priceCents > 0;
  const legalConsent = paid ? immediatePerformanceConsentFromForm(fd) : null;
  if (paid && !legalConsent) {
    redirect(`/c/${slug}/join?error=legal-consent`);
  }

  // Until plan changes are implemented against the existing Stripe
  // subscription, fail closed. Starting another checkout here would create a
  // second recurring subscription and could double-charge the member.
  if (existing?.status === "ACTIVE" && existing.tierId !== tier!.id) {
    const activeStripeSubscription = await prisma.subscription.findFirst({
      where: {
        tenantId: tenant.id,
        userId: user!.id,
        stripeSubscriptionId: { not: null },
        status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] },
      },
      select: { id: true },
    });
    if (activeStripeSubscription) {
      redirect(`/c/${slug}/join?error=active-subscription`);
    }
  }

  // Paid + Stripe configured -> go to checkout; entitlement granted on webhook.
  if (paid && features.stripe && (tier!.interval === "MONTH" || tier!.interval === "YEAR")) {
    const url = await createTierCheckout({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        platformFeePercent: tenant.platformFeePercent,
        stripeAccountId: tenant.stripeAccountId,
      },
      tier: {
        id: tier!.id,
        name: tier!.name,
        priceCents: tier!.priceCents,
        currency: tier!.currency,
        interval: tier!.interval as "MONTH" | "YEAR",
      },
      user: { id: user!.id, email: user!.email },
      consent: legalConsent ?? undefined,
      successUrl: `${env.APP_URL}/c/${slug}?welcome=1`,
      cancelUrl: `${env.APP_URL}/c/${slug}/join`,
    });
    // Checkout creation failed -> never fall through to a free grant.
    if (!url) redirect(`/c/${slug}/join?error=checkout`);
    redirect(url!);
  }

  // Paid tier, but no working payment path -> only dev may grant for free.
  if (paid && !devPaymentFallbackAllowed) {
    redirect(`/c/${slug}/join?error=payments-unavailable`);
  }

  // Package cap: a community may only keep growing while its plan allows it.
  // Existing members (tier switch, re-activation) are never blocked.
  if (!existing || existing.status !== "ACTIVE") {
    const budget = await checkMemberLimit(tenant.id);
    if (!budget.allowed) redirect(`/c/${slug}/join?error=member-limit`);
  }

  // Free join, or paid without Stripe (dev only) -> activate immediately.
  await prisma.membership.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user!.id } },
    create: {
      tenantId: tenant.id,
      userId: user!.id,
      role: "MEMBER",
      status: "ACTIVE",
      tierId: tier!.id,
    },
    update: { status: "ACTIVE", tierId: tier!.id },
  });
  // Switching tiers: revoke the previous tier's entitlement before granting.
  if (existing && existing.tierId !== tier!.id) {
    await revokePreviousTierEntitlement({
      tenantId: tenant.id,
      userId: user!.id,
      previousTierId: existing.tierId,
      keepKey: tier!.entitlementKey,
    });
  }
  await grantEntitlement({
    tenantId: tenant.id,
    userId: user!.id,
    key: tier!.entitlementKey,
    source: paid ? "TIER" : "ROLE",
    sourceId: tier!.id,
  });
  if (paid) {
    await prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        userId: user!.id,
        tierId: tier!.id,
        status: "ACTIVE",
      },
    });
  }
  await writeAudit({
    tenantId: tenant.id,
    actorUserId: user!.id,
    action: "member.join",
    metadata: { tier: tier!.slug },
  });

  // Nur echte Neu-Beitritte werben/melden — Tier-Wechsel aktiver Mitglieder nicht.
  if (!existing) {
    const referrerId = await resolveReferrer(tenant.id, String(fd.get("ref") || ""));
    if (referrerId) {
      await recordReferralJoin({
        tenantId: tenant.id,
        tenantSlug: slug,
        referrerId,
        referredId: user!.id,
        referredName: user!.name,
      });
    }
  }
  if (existing?.status !== "ACTIVE") {
    await emitWebhookEvent(tenant.id, "member.joined", {
      memberName: user!.name,
      memberEmail: user!.email,
      tier: tier!.slug,
      via: "join",
    });
  }

  redirect(`/c/${slug}?welcome=1`);
}

// ---------------------------------------------------------------- Posts
async function spaceAccess(tenantId: string, spaceSlug: string, userId: string | null) {
  const space = await prisma.space.findFirst({
    where: { tenantId, slug: spaceSlug },
  });
  if (!space) return { space: null, allowed: false } as const;
  const ctx = await buildAccessContext(tenantId, userId);
  return { space, allowed: canAccess(space, ctx), ctx } as const;
}

export async function createPostAction(
  _p: EngageState,
  fd: FormData,
): Promise<EngageState> {
  const slug = String(fd.get("tenant"));
  const spaceSlug = String(fd.get("space"));
  const t = await getErrorTranslator();
  const user = await getCurrentUser();
  if (!user) return { error: t("notLoggedIn") };
  const tenant = await tenantBySlug(slug);
  if (!tenant) return { error: t("communityNotFound") };

  const acc = await spaceAccess(tenant.id, spaceSlug, user.id);
  if (!acc.space || !acc.allowed) return { error: t("noAccessSpace") };

  // The forum popover submits rich `bodyHtml`; the inline feed composer submits
  // a plain `body` validated by postSchema.
  const rawHtml = fd.get("bodyHtml");
  let title: string | null;
  let bodyText: string;
  let bodyHtml: string | null = null;
  if (rawHtml !== null) {
    title = String(fd.get("title") || "").trim().slice(0, 200) || null;
    const sanitized = String(rawHtml) ? sanitizeRichHtml(String(rawHtml)) : "";
    const plain = sanitized ? htmlToPlainText(sanitized) : "";
    const hasMedia = sanitized ? /<(img|video)/i.test(sanitized) : false;
    bodyHtml = sanitized && (plain || hasMedia) ? sanitized : null;
    bodyText = bodyHtml ? plain : "";
    if (!bodyHtml && !title) return { error: t("contentRequired") };
  } else {
    const parsed = postSchema.safeParse({
      title: fd.get("title") ?? "",
      body: fd.get("body"),
    });
    if (!parsed.success) return { error: zodError(t, parsed) };
    title = parsed.data.title || null;
    bodyText = parsed.data.body;
  }

  const post = await prisma.post.create({
    data: {
      tenantId: tenant.id,
      spaceId: acc.space.id,
      authorId: user.id,
      title,
      body: bodyText,
      bodyHtml,
    },
  });
  await indexContent({
    tenantId: tenant.id,
    sourceType: "POST",
    sourceId: post.id,
    title: title || undefined,
    content: bodyText || title || "",
  });
  await awardPoints({
    tenantId: tenant.id,
    userId: user.id,
    trigger: "POST_CREATED",
    refType: "Post",
    refId: post.id,
  });
  // Auto-Moderation (Staff ausgenommen) — blockiert das Posten nie.
  if (!acc.ctx.isStaff) {
    await moderateContent({
      tenantId: tenant.id,
      refType: "Post",
      refId: post.id,
      authorId: user.id,
      text: [title, bodyText].filter(Boolean).join("\n"),
    });
  }
  revalidatePath(`/c/${slug}/s/${spaceSlug}`);
  return { ok: true };
}

export async function createCommentAction(
  _p: EngageState,
  fd: FormData,
): Promise<EngageState> {
  const slug = String(fd.get("tenant"));
  const postId = String(fd.get("postId"));
  const t = await getErrorTranslator();
  const user = await getCurrentUser();
  if (!user) return { error: t("notLoggedIn") };
  const tenant = await tenantBySlug(slug);
  if (!tenant) return { error: t("communityNotFound") };

  const post = await prisma.post.findFirst({
    where: { id: postId, tenantId: tenant.id },
  });
  if (!post) return { error: t("postNotFound") };
  // Authorize against the space the post actually lives in — never against a
  // client-supplied space slug.
  const space = await prisma.space.findFirst({
    where: { id: post.spaceId, tenantId: tenant.id },
  });
  if (!space) return { error: t("noAccess") };
  const ctx = await buildAccessContext(tenant.id, user.id);
  if (!canAccess(space, ctx)) return { error: t("noAccess") };

  const parsed = commentSchema.safeParse({
    body: fd.get("body"),
    parentId: fd.get("parentId") ?? "",
  });
  if (!parsed.success)
    return { error: zodError(t, parsed) };

  // A parent comment must belong to the same post and tenant.
  if (parsed.data.parentId) {
    const parent = await prisma.comment.findFirst({
      where: { id: parsed.data.parentId, postId: post.id, tenantId: tenant.id },
    });
    if (!parent) return { error: t("invalidCommentRef") };
  }

  const comment = await prisma.comment.create({
    data: {
      tenantId: tenant.id,
      postId: post.id,
      authorId: user.id,
      body: parsed.data.body,
      parentId: parsed.data.parentId || null,
    },
  });
  await awardPoints({
    tenantId: tenant.id,
    userId: user.id,
    trigger: "COMMENT_CREATED",
    refType: "Post",
    refId: post.id,
  });

  // Auto-Moderation (Staff ausgenommen) — blockiert das Kommentieren nie.
  if (!ctx.isStaff) {
    await moderateContent({
      tenantId: tenant.id,
      refType: "Comment",
      refId: comment.id,
      authorId: user.id,
      text: parsed.data.body,
    });
  }

  // In-App-Benachrichtigungen: Beitragsautor + ggf. Autor des Elternkommentars.
  const postHref = `/c/${slug}/s/${space.slug}/${post.id}`;
  await notify({
    tenantId: tenant.id,
    userId: post.authorId,
    actorId: user.id,
    type: "POST_COMMENT",
    message: `${user.name} hat deinen Beitrag kommentiert.`,
    href: postHref,
    refType: "Comment",
    refId: comment.id,
  });
  if (parsed.data.parentId) {
    const parent = await prisma.comment.findFirst({
      where: { id: parsed.data.parentId, tenantId: tenant.id },
      select: { authorId: true },
    });
    // Doppelte Benachrichtigung vermeiden, wenn Beitrag & Elternkommentar
    // von derselben Person stammen.
    if (parent && parent.authorId !== post.authorId) {
      await notify({
        tenantId: tenant.id,
        userId: parent.authorId,
        actorId: user.id,
        type: "COMMENT_REPLY",
        message: `${user.name} hat auf deinen Kommentar geantwortet.`,
        href: postHref,
        refType: "Comment",
        refId: comment.id,
      });
    }
  }
  revalidatePath(`/c/${slug}/s/${space.slug}/${postId}`);
  return { ok: true };
}

export async function toggleReactionAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const postId = String(fd.get("postId"));
  const spaceSlug = String(fd.get("space"));
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/c/${slug}/s/${spaceSlug}`)}`);
  const tenant = await tenantBySlug(slug);
  if (!tenant) return;

  // The post must belong to this tenant, and the user must be allowed to see
  // the space it lives in — never trust the client-supplied space slug.
  const post = await prisma.post.findFirst({
    where: { id: postId, tenantId: tenant.id },
    include: { space: true },
  });
  if (!post) return;
  const ctx = await buildAccessContext(tenant.id, user!.id);
  if (!canAccess(post.space, ctx)) return;

  const existing = await prisma.reaction.findFirst({
    where: { tenantId: tenant.id, postId, userId: user!.id, type: "LIKE" },
  });
  if (existing) {
    await prisma.reaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.reaction.create({
      data: { tenantId: tenant.id, postId, userId: user!.id, type: "LIKE" },
    });
    // Anti-farming: like/unlike cycles must not mint points repeatedly.
    const alreadyAwarded = await prisma.pointsLedger.findFirst({
      where: {
        tenantId: tenant.id,
        userId: user!.id,
        refType: "Post",
        refId: postId,
        rule: { trigger: "REACTION_GIVEN" },
      },
    });
    if (!alreadyAwarded) {
      await awardPoints({
        tenantId: tenant.id,
        userId: user!.id,
        trigger: "REACTION_GIVEN",
        refType: "Post",
        refId: postId,
      });
    }
    // Beitragsautor benachrichtigen (dedupliziert über refId, damit
    // Like/Unlike-Zyklen nicht spammen).
    await notify({
      tenantId: tenant.id,
      userId: post.authorId,
      actorId: user!.id,
      type: "REACTION",
      message: `${user!.name} gefällt dein Beitrag.`,
      href: `/c/${slug}/s/${post.space.slug}/${postId}`,
      refType: "Post",
      refId: postId,
    });
  }
  revalidatePath(`/c/${slug}/s/${post.space.slug}`);
  revalidatePath(`/c/${slug}/s/${post.space.slug}/${postId}`);
}

export async function votePollAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const postId = String(fd.get("postId"));
  const spaceSlug = String(fd.get("space"));
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/c/${slug}/s/${spaceSlug}/${postId}`)}`);
  }
  const tenant = await tenantBySlug(slug);
  if (!tenant) return;
  // Never trust the client space slug: resolve the post + its space server-side.
  const post = await prisma.post.findFirst({
    where: { id: postId, tenantId: tenant.id },
    include: { space: true },
  });
  if (!post) return;
  const ctx = await buildAccessContext(tenant.id, user!.id);
  if (!canAccess(post.space, ctx)) return;
  const indices = fd
    .getAll("optionIndex")
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n));
  await castPollVote(tenant.id, postId, user!.id, indices);
  revalidatePath(`/c/${slug}/s/${post.space.slug}/${postId}`);
  revalidatePath(`/c/${slug}/s/${post.space.slug}`);
}

// ---------------------------------------------------------------- Events
export async function rsvpEventAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const eventId = String(fd.get("eventId"));
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/c/${slug}`)}`);
  const tenant = await tenantBySlug(slug);
  if (!tenant) return;
  const event = await prisma.event.findFirst({
    where: { id: eventId, tenantId: tenant.id },
    include: { space: true },
  });
  if (!event) return;

  const existing = await prisma.eventRsvp.findUnique({
    where: { eventId_userId: { eventId, userId: user!.id } },
  });
  if (existing) {
    await prisma.eventRsvp.delete({ where: { id: existing.id } });
  } else {
    await prisma.eventRsvp.create({
      data: { tenantId: tenant.id, eventId, userId: user!.id, status: "GOING" },
    });
    await awardPoints({
      tenantId: tenant.id,
      userId: user!.id,
      trigger: "EVENT_RSVP",
      refType: "Event",
      refId: eventId,
    });
  }
  revalidatePath(`/c/${slug}/s/${event.space.slug}`);
  revalidatePath(`/c/${slug}`);
}

// ---------------------------------------------------------------- Lessons
export async function completeLessonAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const lessonId = String(fd.get("lessonId"));
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/c/${slug}`)}`);
  const tenant = await tenantBySlug(slug);
  if (!tenant) return;
  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, tenantId: tenant.id },
  });
  if (!lesson) return;

  // Drip-Content serverseitig durchsetzen (Staff ausgenommen).
  if (lesson.dripAfterDays && lesson.dripAfterDays > 0) {
    const membership = await prisma.membership.findUnique({
      where: { tenantId_userId: { tenantId: tenant.id, userId: user!.id } },
    });
    const { isLessonUnlocked } = await import("@/lib/drip");
    const { roleAtLeast } = await import("@/lib/tenant");
    const isStaff =
      membership?.status === "ACTIVE" && roleAtLeast(membership.role, "MODERATOR");
    if (!isStaff && !isLessonUnlocked(membership?.joinedAt ?? null, lesson.dripAfterDays)) {
      return;
    }
  }

  const existing = await prisma.lessonProgress.findUnique({
    where: { lessonId_userId: { lessonId, userId: user!.id } },
  });
  if (!existing) {
    await prisma.lessonProgress.create({
      data: { tenantId: tenant.id, lessonId, userId: user!.id },
    });
    await awardPoints({
      tenantId: tenant.id,
      userId: user!.id,
      trigger: "LESSON_COMPLETED",
      refType: "Lesson",
      refId: lessonId,
    });
  }
  revalidatePath(`/c/${slug}`);
}

// ---------------------------------------------------------------- Purchase
export async function purchaseProductAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const productId = String(fd.get("productId"));
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/c/${slug}`)}`);
  const tenant = await tenantBySlug(slug);
  if (!tenant) return;
  const product = await prisma.product.findFirst({
    where: { id: productId, tenantId: tenant.id, isPublished: true },
  });
  if (!product) return;

  const shippingCents = product.requiresShipping && !product.freeShipping ? product.shippingCents : 0;
  const digitalConsent =
    product.priceCents > 0 && product.type !== "PHYSICAL"
      ? immediatePerformanceConsentFromForm(fd)
      : null;
  if (product.priceCents > 0 && product.type !== "PHYSICAL" && !digitalConsent) {
    redirect(`/c/${slug}?error=legal-consent`);
  }

  if (features.stripe && product.priceCents > 0) {
    // Reserve before Stripe can accept money. A duplicate submit reuses the
    // same order/idempotency key; it can never reserve a second unit.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let reservation: { id: string; expiresAt: Date };
      let existingStripeSessionId: string | null = null;
      try {
        reservation = await reserveProductOrder({
          tenantId: tenant.id,
          userId: user!.id,
          product,
          platformFeeCents: platformFeeCents(product.priceCents, tenant.platformFeePercent),
        });
      } catch (error) {
        if (error instanceof ProductOutOfStockError) {
          redirect(`/c/${slug}?soldout=${product.id}`);
        }
        if (!(error instanceof ProductReservationActiveError) || !error.expiresAt) {
          redirect(`/c/${slug}?error=checkout`);
        }
        reservation = { id: error.orderId, expiresAt: error.expiresAt };
        existingStripeSessionId = error.stripeSessionId;
        // A Session may exist even when the best-effort attachment failed.
        // Never replay potentially edited product parameters in that case.
        if (!existingStripeSessionId) redirect(`/c/${slug}?error=checkout`);
      }

      if (digitalConsent) {
        await prisma.order.updateMany({
          where: { id: reservation.id, tenantId: tenant.id, userId: user!.id },
          data: {
            immediatePerformanceConsentedAt: digitalConsent.consentedAt,
            withdrawalLossAcknowledgedAt: digitalConsent.consentedAt,
            legalTermsVersion: digitalConsent.termsVersion,
          },
        });
      }

      let checkout;
      try {
        checkout = existingStripeSessionId
          ? await retrieveProductCheckoutSession(existingStripeSessionId)
          : await createProductCheckoutSession({
              tenant: {
                id: tenant.id,
                name: tenant.name,
                slug: tenant.slug,
                platformFeePercent: tenant.platformFeePercent,
                stripeAccountId: tenant.stripeAccountId,
              },
              product: {
                id: product.id,
                name: product.name,
                priceCents: product.priceCents,
                currency: product.currency,
                requiresShipping: product.requiresShipping,
                freeShipping: product.freeShipping,
                shippingCents: product.shippingCents,
              },
              user: { id: user!.id, email: user!.email },
              reservation: { orderId: reservation.id, expiresAt: reservation.expiresAt },
              consent: digitalConsent ?? undefined,
              successUrl: `${env.APP_URL}/c/${slug}?purchased=${product.id}`,
              cancelUrl: `${env.APP_URL}/c/${slug}`,
            });
      } catch (error) {
        // Validation/auth/idempotency errors prove that Session creation did
        // not succeed. Transport/API timeouts stay reserved because Stripe may
        // have accepted the request before the connection was lost.
        const missingExistingSession =
          existingStripeSessionId &&
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "resource_missing";
        if (
          (!existingStripeSessionId && isDefinitiveStripeRequestError(error)) ||
          missingExistingSession
        ) {
          await releaseProductOrderReservation(
            reservation.id,
            new Date(),
            existingStripeSessionId ?? undefined,
          );
        }
        console.error("Product Checkout Session could not be confirmed:", error);
        redirect(`/c/${slug}?error=checkout`);
      }

      if (!checkout) {
        // No Stripe call was possible (missing config / Connect not ready).
        await releaseProductOrderReservation(reservation.id);
        redirect(`/c/${slug}?error=checkout`);
      }
      if (checkout.status === "expired") {
        await releaseProductOrderReservation(reservation.id, new Date(), checkout.id);
        if (attempt === 0) continue;
        redirect(`/c/${slug}?error=checkout`);
      }
      if (checkout.status === "complete") {
        redirect(`/c/${slug}?purchased=${product.id}`);
      }
      if (!checkout.url) redirect(`/c/${slug}?error=checkout`);
      try {
        await attachProductCheckoutSession(reservation.id, checkout.id);
      } catch (error) {
        // The Session metadata carries the order id, so the webhook can repair
        // this association even when this best-effort write fails.
        console.error("Product Checkout Session could not be attached:", error);
      }
      redirect(checkout.url);
    }
    redirect(`/c/${slug}?error=checkout`);
  }

  // Priced product, but no working payment path -> only dev may grant for free.
  if (product.priceCents > 0 && !devPaymentFallbackAllowed) {
    redirect(`/c/${slug}?error=payments-unavailable`);
  }

  // Free product, or no Stripe (dev only): the stock claim and paid order are
  // one transaction. A failed order insert therefore cannot silently consume
  // the last unit.
  const freeOrderCreated = await withTenantTransaction(async (tx) => {
    const limited = product.stock !== null;
    const claimed = await tx.product.updateMany({
      where: {
        id: product.id,
        tenantId: tenant.id,
        isPublished: true,
        ...(limited ? { stock: { gt: 0 } } : {}),
      },
      data: limited
        ? { stock: { decrement: 1 } }
        : { isPublished: true },
    });
    if (claimed.count === 0) return false;
    await tx.order.create({
      data: {
        tenantId: tenant.id,
        userId: user!.id,
        productId: product.id,
        description: product.name,
        amountCents: product.priceCents + shippingCents,
        currency: product.currency,
        platformFeeCents: platformFeeCents(product.priceCents, tenant.platformFeePercent),
        shippingCents,
        status: "PAID",
        grantedEntitlementKey: product.grantsEntitlementKey,
        inventoryReservedAt: product.stock !== null ? new Date() : null,
        immediatePerformanceConsentedAt: digitalConsent?.consentedAt,
        withdrawalLossAcknowledgedAt: digitalConsent?.consentedAt,
        legalTermsVersion: digitalConsent?.termsVersion,
      },
    });
    return true;
  });
  if (!freeOrderCreated) redirect(`/c/${slug}?soldout=${product.id}`);
  if (product.grantsEntitlementKey) {
    await grantEntitlement({
      tenantId: tenant.id,
      userId: user!.id,
      key: product.grantsEntitlementKey,
      source: "PURCHASE",
      sourceId: product.id,
    });
  }
  await awardPoints({
    tenantId: tenant.id,
    userId: user!.id,
    trigger: "PURCHASE",
    refType: "Product",
    refId: product.id,
  });
  redirect(`/c/${slug}?purchased=${product.id}`);
}

// ---------------------------------------------------------------- Media packages
export async function purchaseMediaPackageAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const spaceSlug = String(fd.get("space") || "");
  const packageId = String(fd.get("packageId"));
  const backTo = spaceSlug ? `/c/${slug}/s/${spaceSlug}` : `/c/${slug}`;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(backTo)}`);
  const tenant = await tenantBySlug(slug);
  if (!tenant) return;
  const pkg = await prisma.mediaPackage.findFirst({
    where: { id: packageId, tenantId: tenant.id, isPublished: true },
  });
  if (!pkg) return;

  // Already owned or free — grant/no-op and go back.
  if (pkg.priceCents <= 0) {
    redirect(backTo);
  }
  const legalConsent = immediatePerformanceConsentFromForm(fd);
  if (!legalConsent) redirect(`${backTo}?error=legal-consent`);
  const keys = await entitlementKeys(tenant.id, user!.id);
  if (keys.has(pkg.entitlementKey)) redirect(`${backTo}?open=${pkg.id}`);

  if (features.stripe) {
    const url = await createMediaCheckout({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        platformFeePercent: tenant.platformFeePercent,
        stripeAccountId: tenant.stripeAccountId,
      },
      pkg: { id: pkg.id, title: pkg.title, priceCents: pkg.priceCents, currency: pkg.currency },
      user: { id: user!.id, email: user!.email },
      consent: legalConsent,
      successUrl: `${env.APP_URL}${backTo}?purchased=${pkg.id}`,
      cancelUrl: `${env.APP_URL}${backTo}`,
    });
    // Checkout creation failed -> never fall through to a free grant.
    if (!url) redirect(`${backTo}?error=checkout`);
    redirect(url!);
  }

  // Paid package, but no working payment path -> only dev may grant for free.
  if (!devPaymentFallbackAllowed) {
    redirect(`${backTo}?error=payments-unavailable`);
  }

  // No Stripe (dev only) -> record a completed order and grant access immediately.
  await prisma.order.create({
    data: {
      tenantId: tenant.id,
      userId: user!.id,
      description: `Medien: ${pkg.title}`,
      amountCents: pkg.priceCents,
      currency: pkg.currency,
      platformFeeCents: platformFeeCents(pkg.priceCents, tenant.platformFeePercent),
      status: "PAID",
      immediatePerformanceConsentedAt: legalConsent.consentedAt,
      withdrawalLossAcknowledgedAt: legalConsent.consentedAt,
      legalTermsVersion: legalConsent.termsVersion,
    },
  });
  await grantEntitlement({
    tenantId: tenant.id,
    userId: user!.id,
    key: pkg.entitlementKey,
    source: "PURCHASE",
    sourceId: pkg.id,
  });
  await awardPoints({
    tenantId: tenant.id,
    userId: user!.id,
    trigger: "PURCHASE",
    refType: "MediaPackage",
    refId: pkg.id,
  });
  redirect(`${backTo}?purchased=${pkg.id}`);
}

// ---------------------------------------------------------------- Single media item (PPV)
export async function purchaseMediaItemAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const spaceSlug = String(fd.get("space") || "");
  const itemId = String(fd.get("itemId"));
  const backTo = spaceSlug ? `/c/${slug}/s/${spaceSlug}` : `/c/${slug}`;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(backTo)}`);
  const tenant = await tenantBySlug(slug);
  if (!tenant) return;
  const item = await prisma.mediaItem.findFirst({
    where: { id: itemId, tenantId: tenant.id },
    include: { package: { select: { title: true, currency: true, id: true } } },
  });
  if (!item) redirect(backTo);
  // Mint a stable key on first purchase attempt if the item was priced without one.
  const entKey = item!.entitlementKey ?? `media-item:${item!.id}`;
  if (item!.priceCents <= 0) redirect(backTo);
  const legalConsent = immediatePerformanceConsentFromForm(fd);
  if (!legalConsent) redirect(`${backTo}?error=legal-consent`);
  const keys = await entitlementKeys(tenant.id, user!.id);
  if (keys.has(entKey)) redirect(`${backTo}?open=${item!.packageId}`);

  const currency = item!.package.currency || "eur";
  if (features.stripe) {
    const url = await createMediaItemCheckout({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        platformFeePercent: tenant.platformFeePercent,
        stripeAccountId: tenant.stripeAccountId,
      },
      item: { id: item!.id, title: item!.package.title, priceCents: item!.priceCents, currency },
      user: { id: user!.id, email: user!.email },
      consent: legalConsent,
      successUrl: `${env.APP_URL}${backTo}?purchased=${item!.packageId}`,
      cancelUrl: `${env.APP_URL}${backTo}`,
    });
    if (!url) redirect(`${backTo}?error=checkout`);
    redirect(url!);
  }

  if (!devPaymentFallbackAllowed) {
    redirect(`${backTo}?error=payments-unavailable`);
  }

  await prisma.order.create({
    data: {
      tenantId: tenant.id,
      userId: user!.id,
      description: `Medium: ${item!.package.title}`,
      amountCents: item!.priceCents,
      currency,
      platformFeeCents: platformFeeCents(item!.priceCents, tenant.platformFeePercent),
      status: "PAID",
      grantedEntitlementKey: entKey,
      immediatePerformanceConsentedAt: legalConsent.consentedAt,
      withdrawalLossAcknowledgedAt: legalConsent.consentedAt,
      legalTermsVersion: legalConsent.termsVersion,
    },
  });
  await grantEntitlement({
    tenantId: tenant.id,
    userId: user!.id,
    key: entKey,
    source: "PURCHASE",
    sourceId: item!.id,
  });
  await awardPoints({
    tenantId: tenant.id,
    userId: user!.id,
    trigger: "PURCHASE",
    refType: "MediaItem",
    refId: item!.id,
  });
  redirect(`${backTo}?purchased=${item!.packageId}`);
}

// ---------------------------------------------------------------- Paid posts / videos (PPV)
export async function purchasePostAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const spaceSlug = String(fd.get("space") || "");
  const postId = String(fd.get("postId"));
  const backTo = spaceSlug ? `/c/${slug}/s/${spaceSlug}` : `/c/${slug}`;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(backTo)}`);
  const tenant = await tenantBySlug(slug);
  if (!tenant) return;
  const post = await prisma.post.findFirst({
    where: { id: postId, tenantId: tenant.id, isPublished: true },
    select: { id: true, title: true, priceCents: true, currency: true, entitlementKey: true },
  });
  if (!post || !post.entitlementKey) redirect(backTo);

  // Free or already owned — nothing to buy.
  if (post!.priceCents <= 0) redirect(backTo);
  const legalConsent = immediatePerformanceConsentFromForm(fd);
  if (!legalConsent) redirect(`${backTo}?error=legal-consent`);
  const keys = await entitlementKeys(tenant.id, user!.id);
  if (keys.has(post!.entitlementKey!)) redirect(`${backTo}?open=${post!.id}`);

  if (features.stripe) {
    const url = await createPostCheckout({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        platformFeePercent: tenant.platformFeePercent,
        stripeAccountId: tenant.stripeAccountId,
      },
      post: {
        id: post!.id,
        title: post!.title || "Beitrag",
        priceCents: post!.priceCents,
        currency: post!.currency,
      },
      user: { id: user!.id, email: user!.email },
      consent: legalConsent,
      successUrl: `${env.APP_URL}${backTo}?purchased=${post!.id}`,
      cancelUrl: `${env.APP_URL}${backTo}`,
    });
    if (!url) redirect(`${backTo}?error=checkout`);
    redirect(url!);
  }

  if (!devPaymentFallbackAllowed) {
    redirect(`${backTo}?error=payments-unavailable`);
  }

  await prisma.order.create({
    data: {
      tenantId: tenant.id,
      userId: user!.id,
      description: `Beitrag: ${post!.title || post!.id}`,
      amountCents: post!.priceCents,
      currency: post!.currency,
      platformFeeCents: platformFeeCents(post!.priceCents, tenant.platformFeePercent),
      status: "PAID",
      grantedEntitlementKey: post!.entitlementKey,
      immediatePerformanceConsentedAt: legalConsent.consentedAt,
      withdrawalLossAcknowledgedAt: legalConsent.consentedAt,
      legalTermsVersion: legalConsent.termsVersion,
    },
  });
  await grantEntitlement({
    tenantId: tenant.id,
    userId: user!.id,
    key: post!.entitlementKey!,
    source: "PURCHASE",
    sourceId: post!.id,
  });
  await awardPoints({
    tenantId: tenant.id,
    userId: user!.id,
    trigger: "PURCHASE",
    refType: "Post",
    refId: post!.id,
  });
  redirect(`${backTo}?purchased=${post!.id}`);
}

// ---------------------------------------------------------------- Forum votes
/**
 * Up/down vote on a forum post or comment. One active vote per target — voting
 * the same direction again removes it; the opposite direction replaces it.
 */
export async function voteAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const spaceSlug = String(fd.get("space"));
  const targetType = String(fd.get("targetType")); // "post" | "comment"
  const targetId = String(fd.get("targetId"));
  const postId = String(fd.get("postId") || "");
  const dir = String(fd.get("dir"));
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/c/${slug}/s/${spaceSlug}`)}`);
  }
  const tenant = await tenantBySlug(slug);
  if (!tenant || (dir !== "UP" && dir !== "DOWN")) return;

  // The target must belong to this tenant, and the user must be allowed to
  // access the space it lives in — never trust client-supplied identifiers.
  const targetSpace =
    targetType === "comment"
      ? (
          await prisma.comment.findFirst({
            where: { id: targetId, tenantId: tenant.id },
            include: { post: { include: { space: true } } },
          })
        )?.post.space
      : (
          await prisma.post.findFirst({
            where: { id: targetId, tenantId: tenant.id },
            include: { space: true },
          })
        )?.space;
  if (!targetSpace) return;
  const ctx = await buildAccessContext(tenant.id, user!.id);
  if (!canAccess(targetSpace, ctx)) return;

  const scope =
    targetType === "comment"
      ? { tenantId: tenant.id, userId: user!.id, commentId: targetId }
      : { tenantId: tenant.id, userId: user!.id, postId: targetId };

  const existing = await prisma.reaction.findMany({
    where: { ...scope, type: { in: ["UP", "DOWN"] } },
  });
  const same = existing.find((r) => r.type === dir);
  if (existing.length) {
    await prisma.reaction.deleteMany({ where: { id: { in: existing.map((e) => e.id) } } });
  }
  if (!same) {
    await prisma.reaction.create({
      data: {
        tenantId: tenant.id,
        userId: user!.id,
        type: dir,
        ...(targetType === "comment" ? { commentId: targetId } : { postId: targetId }),
      },
    });
    if (dir === "UP") {
      // Anti-farming: toggling a vote on the same target must not mint
      // points more than once — ever.
      const alreadyAwarded = await prisma.pointsLedger.findFirst({
        where: {
          tenantId: tenant.id,
          userId: user!.id,
          refType: targetType,
          refId: targetId,
          rule: { trigger: "REACTION_GIVEN" },
        },
      });
      if (!alreadyAwarded) {
        await awardPoints({
          tenantId: tenant.id,
          userId: user!.id,
          trigger: "REACTION_GIVEN",
          refType: targetType,
          refId: targetId,
        });
      }
    }
  }
  revalidatePath(`/c/${slug}/s/${spaceSlug}`);
  if (postId) revalidatePath(`/c/${slug}/s/${spaceSlug}/${postId}`);
}
