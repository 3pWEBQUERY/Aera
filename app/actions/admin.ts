"use server";

import { revalidatePath } from "next/cache";
import prisma, { systemPrisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/guards";
import { writeAudit } from "@/lib/audit";
import { isValidCategory } from "@/lib/categories";
import { normalizeLocale } from "@/i18n/locales";
import { signAccountToken, resetUrl } from "@/lib/tokens";
import { tErr } from "@/lib/action-errors";
import type { Prisma } from "@/app/generated/prisma/client";
import {
  assertStripeSubscriptionsInactive,
  StripeSubscriptionStillActiveError,
} from "@/lib/stripe-cleanup";
import { countOpenCreatorCheckouts } from "@/lib/creator-checkout";
import { queueTenantDeletion, queueUserDeletion } from "@/lib/data-lifecycle";

export interface AdminState {
  error?: string;
  ok?: boolean;
  /** Generated one-time link (password reset) to copy & share. */
  link?: string;
}

const ok: AdminState = { ok: true };

function prismaCode(e: unknown): string | undefined {
  return (e as { code?: string }).code;
}

// ---------------------------------------------------------------- Tenants
export async function adminUpdateTenantAction(
  _p: AdminState,
  fd: FormData,
): Promise<AdminState> {
  const admin = await requirePlatformAdmin();
  const tenantId = String(fd.get("tenantId"));
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return { error: await tErr("communityNotFound") };

  const name = String(fd.get("name") || "").trim().slice(0, 60);
  if (name.length < 2) return { error: await tErr("nameTooShort") };

  const feeRaw = Number(String(fd.get("platformFeePercent") || "").replace(",", "."));
  const fee = Number.isFinite(feeRaw) ? Math.min(50, Math.max(0, feeRaw)) : tenant.platformFeePercent;

  const categoryRaw = String(fd.get("category") ?? "").trim();
  const category = isValidCategory(categoryRaw) ? categoryRaw : null;

  const statusRaw = String(fd.get("status") ?? "");
  const status =
    statusRaw === "ACTIVE" || statusRaw === "SUSPENDED"
      ? statusRaw
      : tenant.status;

  const domainRaw = String(fd.get("customDomain") || "").trim().toLowerCase();
  const customDomain = /^[a-z0-9.-]{3,255}$/.test(domainRaw) ? domainRaw : null;

  try {
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        name,
        tagline: String(fd.get("tagline") || "").trim().slice(0, 160) || null,
        platformFeePercent: fee,
        customDomain,
        category,
        status,
      } as unknown as Prisma.TenantUpdateInput,
    });
  } catch (e) {
    if (prismaCode(e) === "P2002") return { error: await tErr("domainTaken") };
    throw e;
  }

  await writeAudit({
    tenantId: tenant.id,
    actorUserId: admin.id,
    action: "admin.tenant.update",
    metadata: {
      previousStatus: tenant.status,
      status,
      statusChanged: tenant.status !== status,
    },
  });
  revalidatePath("/admin/communities");
  revalidatePath(`/c/${tenant.slug}`, "layout");
  return ok;
}

export async function adminDeleteTenantAction(fd: FormData): Promise<AdminState> {
  const admin = await requirePlatformAdmin();
  const tenantId = String(fd.get("tenantId"));
  const confirm = String(fd.get("confirm") || "");
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return { error: await tErr("communityNotFound") };
  if (confirm !== tenant.slug) return { error: await tErr("tenantDeleteConfirmMismatch") };

  const [subscriptions, wallet, pendingOrders, pendingBookings, pendingCreatorCheckouts] = await Promise.all([
    prisma.subscription.findMany({
      where: { tenantId: tenant.id, stripeSubscriptionId: { not: null } },
      select: { stripeSubscriptionId: true },
    }),
    prisma.aiCreditWallet.findUnique({
      where: { tenantId: tenant.id },
      select: { stripeSubscriptionId: true },
    }),
    prisma.order.count({ where: { tenantId: tenant.id, status: "PENDING" } }),
    prisma.bookingReservation.count({
      where: { tenantId: tenant.id, status: "PENDING" },
    }),
    countOpenCreatorCheckouts(tenant.id),
  ]);
  if (pendingOrders > 0 || pendingBookings > 0 || pendingCreatorCheckouts > 0) {
    await writeAudit({
      actorUserId: admin.id,
      action: "admin.tenant.delete.blocked",
      targetType: "Tenant",
      targetId: tenant.id,
      metadata: {
        slug: tenant.slug,
        reason: "pending_payments_or_reservations",
        pendingOrders,
        pendingBookings,
        pendingCreatorCheckouts,
      },
    });
    return { error: await tErr("pendingPaymentsBlockDeletion") };
  }
  try {
    await assertStripeSubscriptionsInactive([
      ...subscriptions.map((subscription) => subscription.stripeSubscriptionId),
      wallet?.stripeSubscriptionId ?? null,
    ]);
  } catch (error) {
    await writeAudit({
      actorUserId: admin.id,
      action: "admin.tenant.delete.blocked",
      targetType: "Tenant",
      targetId: tenant.id,
      metadata: {
        slug: tenant.slug,
        reason:
          error instanceof StripeSubscriptionStillActiveError
            ? "stripe_subscription_active"
            : "stripe_verification_failed",
      },
    });
    return {
      error: await tErr(
        error instanceof StripeSubscriptionStillActiveError
          ? "tenantDeleteStripeSubscriptionsActive"
          : "tenantDeleteStripeCleanupFailed",
      ),
    };
  }

  const deletionJobId = await queueTenantDeletion({
    tenantId: tenant.id,
    requestedById: admin.id,
    label: tenant.slug,
  });
  await writeAudit({
    tenantId: tenant.id,
    actorUserId: admin.id,
    action: "admin.tenant.delete.queued",
    targetType: "Tenant",
    targetId: tenant.id,
    metadata: { slug: tenant.slug, name: tenant.name, deletionJobId },
  });
  revalidatePath("/admin/communities");
  return ok;
}

// ------------------------------------------------------------------ Users
export async function adminUpdateUserAction(
  _p: AdminState,
  fd: FormData,
): Promise<AdminState> {
  const admin = await requirePlatformAdmin();
  const userId = String(fd.get("userId"));
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { error: await tErr("userNotFound") };

  const name = String(fd.get("name") || "").trim().slice(0, 80);
  const email = String(fd.get("email") || "").trim().toLowerCase();
  if (name.length < 2) return { error: await tErr("nameTooShort") };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: await tErr("emailInvalid") };

  try {
    const emailChanged = email !== target.email;
    await prisma.user.update({
      where: { id: target.id },
      data: {
        name,
        email,
        ...(emailChanged
          ? {
              emailVerifiedAt: null,
              sessionVersion: { increment: 1 },
            }
          : {}),
      },
    });
  } catch (e) {
    if (prismaCode(e) === "P2002") return { error: await tErr("emailInUse") };
    throw e;
  }

  await writeAudit({
    actorUserId: admin.id,
    action: "admin.user.update",
    targetType: "User",
    targetId: target.id,
  });
  revalidatePath("/admin/users");
  return ok;
}

/** One-time password-reset link (1 h) the admin can hand to the user. */
export async function adminResetLinkAction(
  _p: AdminState,
  fd: FormData,
): Promise<AdminState> {
  const admin = await requirePlatformAdmin();
  const userId = String(fd.get("userId"));
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { error: await tErr("userNotFound") };

  const token = await signAccountToken(target, "reset", "1h");
  await writeAudit({
    actorUserId: admin.id,
    action: "admin.user.reset_link",
    targetType: "User",
    targetId: target.id,
  });
  return { ok: true, link: resetUrl(token) };
}

export async function adminDeleteUserAction(
  _p: AdminState,
  fd: FormData,
): Promise<AdminState> {
  const admin = await requirePlatformAdmin();
  const userId = String(fd.get("userId"));
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { error: await tErr("userNotFound") };
  if (target.id === admin.id) return { error: await tErr("cantDeleteYourself") };

  const ownedTenants = await prisma.tenant.count({ where: { ownerId: target.id } });
  if (ownedTenants > 0) {
    return { error: await tErr("userOwnsCommunities", { count: ownedTenants }) };
  }

  const [pendingOrders, pendingBookings, pendingCreatorCheckouts] = await Promise.all([
    prisma.order.count({ where: { userId: target.id, status: "PENDING" } }),
    prisma.bookingReservation.count({
      where: { userId: target.id, status: "PENDING" },
    }),
    prisma.pendingCreatorCheckout.count({
      where: {
        userId: target.id,
        status: { in: ["CREATING", "OPEN"] },
        expiresAt: { gt: new Date() },
      },
    }),
  ]);
  if (pendingOrders || pendingBookings || pendingCreatorCheckouts) {
    return { error: await tErr("pendingPaymentsBlockDeletion") };
  }

  const deletionJobId = await queueUserDeletion({
    userId: target.id,
    requestedById: admin.id,
    label: target.email,
  });

  await writeAudit({
    actorUserId: admin.id,
    action: "admin.user.delete.queued",
    targetType: "User",
    targetId: target.id,
    metadata: { deletionJobId },
  });
  revalidatePath("/admin/users");
  return ok;
}

// ------------------------------------------------------------------ Media
export async function adminDeleteMediaAction(fd: FormData): Promise<void> {
  const admin = await requirePlatformAdmin();
  const objectId = String(fd.get("objectId"));
  const object = await prisma.storageObject.findUnique({ where: { id: objectId } });
  if (!object) return;

  // The row becomes unreachable immediately, while the durable task retries
  // physical S3 deletion until it succeeds.
  await systemPrisma.$transaction(async (tx) => {
    await tx.objectDeletionTask.upsert({
      where: { key: object.key },
      create: {
        tenantId: object.tenantId,
        key: object.key,
        reason: "admin_media_deletion",
      },
      update: {
        tenantId: object.tenantId,
        reason: "admin_media_deletion",
        status: "PENDING",
        attempts: 0,
        nextAttemptAt: new Date(),
        leaseUntil: null,
        lastError: null,
        completedAt: null,
      },
    });
    await tx.storageObject.delete({ where: { id: object.id } });
  });
  await writeAudit({
    tenantId: object.tenantId,
    actorUserId: admin.id,
    action: "admin.media.delete",
    targetType: "StorageObject",
    targetId: object.id,
    metadata: { key: object.key, purpose: object.purpose },
  });
  revalidatePath("/admin/media");
}

// ------------------------------------------------------------------ Posts
export async function adminTogglePostPublishedAction(fd: FormData): Promise<void> {
  const admin = await requirePlatformAdmin();
  const postId = String(fd.get("postId"));
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: { tenant: { select: { slug: true } }, space: { select: { slug: true } } },
  });
  if (!post) return;

  await prisma.post.update({
    where: { id: post.id },
    data: { isPublished: !post.isPublished },
  });
  await writeAudit({
    tenantId: post.tenantId,
    actorUserId: admin.id,
    action: post.isPublished ? "admin.post.unpublish" : "admin.post.publish",
    targetType: "Post",
    targetId: post.id,
  });
  revalidatePath("/admin/posts");
  revalidatePath(`/c/${post.tenant.slug}/s/${post.space.slug}`);
  revalidatePath(`/c/${post.tenant.slug}`);
}

export async function adminDeletePostAction(fd: FormData): Promise<void> {
  const admin = await requirePlatformAdmin();
  const postId = String(fd.get("postId"));
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: { tenant: { select: { slug: true } }, space: { select: { slug: true } } },
  });
  if (!post) return;

  await prisma.post.delete({ where: { id: post.id } });
  await writeAudit({
    tenantId: post.tenantId,
    actorUserId: admin.id,
    action: "admin.post.delete",
    targetType: "Post",
    targetId: post.id,
    metadata: { title: post.title ?? undefined },
  });
  revalidatePath("/admin/posts");
  revalidatePath(`/c/${post.tenant.slug}/s/${post.space.slug}`);
  revalidatePath(`/c/${post.tenant.slug}`);
}

// ----------------------------------------------------------------- Orders
const ORDER_STATUSES = ["PENDING", "PAID", "REFUNDED", "FAILED"] as const;

export async function adminUpdateOrderAction(
  _p: AdminState,
  fd: FormData,
): Promise<AdminState> {
  const admin = await requirePlatformAdmin();
  const orderId = String(fd.get("orderId"));
  const status = String(fd.get("status")) as (typeof ORDER_STATUSES)[number];
  if (!ORDER_STATUSES.includes(status)) return { error: await tErr("invalidStatus") };

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { error: await tErr("orderNotFound") };

  await prisma.order.update({
    where: { id: order.id },
    data: { status, fulfilled: fd.get("fulfilled") === "on" },
  });
  await writeAudit({
    tenantId: order.tenantId,
    actorUserId: admin.id,
    action: "admin.order.update",
    targetType: "Order",
    targetId: order.id,
    metadata: { status },
  });
  revalidatePath("/admin/orders");
  return ok;
}

export async function adminDeleteOrderAction(fd: FormData): Promise<void> {
  const admin = await requirePlatformAdmin();
  const orderId = String(fd.get("orderId"));
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return;

  await prisma.order.delete({ where: { id: order.id } });
  await writeAudit({
    tenantId: order.tenantId,
    actorUserId: admin.id,
    action: "admin.order.delete",
    targetType: "Order",
    targetId: order.id,
  });
  revalidatePath("/admin/orders");
}

// ---------------------------------------------------------------- Help center
function helpSlugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => ({ ä: "ae", ö: "oe", ü: "ue", ß: "ss" })[c] ?? c)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function revalidateHelp() {
  revalidatePath("/hilfe");
  revalidatePath("/admin/help");
}

/** Create or update a help-center category. */
export async function adminSaveHelpCategoryAction(
  _p: AdminState,
  fd: FormData,
): Promise<AdminState> {
  const admin = await requirePlatformAdmin();
  const title = String(fd.get("title") ?? "").trim();
  if (title.length < 2) return { error: await tErr("helpTitleTooShort") };
  if (title.length > 80) return { error: await tErr("helpTitleTooLong") };
  const description = String(fd.get("description") ?? "").trim().slice(0, 240) || null;
  const locale = normalizeLocale(String(fd.get("locale") ?? "de"));

  const categoryId = String(fd.get("categoryId") ?? "");
  if (categoryId) {
    await prisma.helpCategory.update({
      where: { id: categoryId },
      data: { title, description },
    });
  } else {
    const base = helpSlugify(title) || "kategorie";
    let slug = base;
    for (let i = 2; await prisma.helpCategory.findFirst({ where: { locale, slug } }); i++) {
      slug = `${base}-${i}`;
    }
    await prisma.helpCategory.create({
      data: {
        locale,
        title,
        slug,
        description,
        sortOrder: await prisma.helpCategory.count({ where: { locale } }),
      },
    });
  }
  await writeAudit({
    actorUserId: admin.id,
    action: categoryId ? "admin.help.category.update" : "admin.help.category.create",
  });
  revalidateHelp();
  return ok;
}

export async function adminDeleteHelpCategoryAction(fd: FormData): Promise<void> {
  const admin = await requirePlatformAdmin();
  const categoryId = String(fd.get("categoryId"));
  await prisma.helpCategory.delete({ where: { id: categoryId } }).catch(() => null);
  await writeAudit({ actorUserId: admin.id, action: "admin.help.category.delete" });
  revalidateHelp();
}

export async function adminMoveHelpCategoryAction(fd: FormData): Promise<void> {
  await requirePlatformAdmin();
  const categoryId = String(fd.get("categoryId"));
  const dir = String(fd.get("dir")) === "up" ? -1 : 1;
  const moved = await prisma.helpCategory.findUnique({ where: { id: categoryId } });
  if (!moved) return;
  const all = await prisma.helpCategory.findMany({
    where: { locale: moved.locale },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const idx = all.findIndex((c) => c.id === categoryId);
  const target = idx + dir;
  if (idx === -1 || target < 0 || target >= all.length) return;
  await prisma.$transaction([
    prisma.helpCategory.update({ where: { id: all[idx].id }, data: { sortOrder: target } }),
    prisma.helpCategory.update({ where: { id: all[target].id }, data: { sortOrder: idx } }),
  ]);
  revalidateHelp();
}

/** Create or update a help article (question + answer). */
export async function adminSaveHelpArticleAction(
  _p: AdminState,
  fd: FormData,
): Promise<AdminState> {
  const admin = await requirePlatformAdmin();
  const categoryId = String(fd.get("categoryId") ?? "");
  const category = await prisma.helpCategory.findUnique({ where: { id: categoryId } });
  if (!category) return { error: await tErr("categoryNotFound") };

  const question = String(fd.get("question") ?? "").trim();
  if (question.length < 5) return { error: await tErr("helpQuestionTooShort") };
  if (question.length > 200) return { error: await tErr("helpQuestionTooLong") };
  const answer = String(fd.get("answer") ?? "").trim();
  if (!answer) return { error: await tErr("helpAnswerRequired") };
  if (answer.length > 8000) return { error: await tErr("helpAnswerTooLong") };
  const isPublished = fd.get("isPublished") === "on";

  const articleId = String(fd.get("articleId") ?? "");
  if (articleId) {
    await prisma.helpArticle.update({
      where: { id: articleId },
      data: { question, answer, isPublished, categoryId },
    });
  } else {
    await prisma.helpArticle.create({
      data: {
        categoryId,
        question,
        answer,
        isPublished,
        sortOrder: await prisma.helpArticle.count({ where: { categoryId } }),
      },
    });
  }
  await writeAudit({
    actorUserId: admin.id,
    action: articleId ? "admin.help.article.update" : "admin.help.article.create",
  });
  revalidateHelp();
  return ok;
}

export async function adminDeleteHelpArticleAction(fd: FormData): Promise<void> {
  const admin = await requirePlatformAdmin();
  const articleId = String(fd.get("articleId"));
  await prisma.helpArticle.delete({ where: { id: articleId } }).catch(() => null);
  await writeAudit({ actorUserId: admin.id, action: "admin.help.article.delete" });
  revalidateHelp();
}

export async function adminMoveHelpArticleAction(fd: FormData): Promise<void> {
  await requirePlatformAdmin();
  const articleId = String(fd.get("articleId"));
  const dir = String(fd.get("dir")) === "up" ? -1 : 1;
  const article = await prisma.helpArticle.findUnique({ where: { id: articleId } });
  if (!article) return;
  const all = await prisma.helpArticle.findMany({
    where: { categoryId: article.categoryId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const idx = all.findIndex((a) => a.id === articleId);
  const target = idx + dir;
  if (idx === -1 || target < 0 || target >= all.length) return;
  await prisma.$transaction([
    prisma.helpArticle.update({ where: { id: all[idx].id }, data: { sortOrder: target } }),
    prisma.helpArticle.update({ where: { id: all[target].id }, data: { sortOrder: idx } }),
  ]);
  revalidateHelp();
}
