"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import prisma, {
  setTenantContext,
  systemPrisma,
  withTenantTransaction,
} from "@/lib/prisma";
import { requireTenantAdmin } from "@/lib/guards";
import { PLATFORM_CURRENCY } from "@/lib/currency";
import { uniqueChildSlug } from "@/lib/slug";
import { nameStatus } from "@/lib/tenant-name";
import { indexContent, removeFromIndex } from "@/lib/ai";
import { writeAudit } from "@/lib/audit";
import { hashPassword, getCurrentUser } from "@/lib/auth";
import { grantEntitlement, revokePreviousTierEntitlement } from "@/lib/entitlements";
import {
  spaceSchema,
  tierSchema,
  productSchema,
  eventSchema,
  campaignSchema,
} from "@/lib/validation";
import { slugify } from "@/lib/utils";
import { isAllowedOneTimePriceCents } from "@/lib/apple-products";
import { sendEmail, renderAccountActionHtml, renderCampaignHtml } from "@/lib/email";
import { signAccountToken, inviteUrl } from "@/lib/tokens";
import { features } from "@/lib/env";
import { sanitizeRichHtml, htmlToPlainText } from "@/lib/rich-text";
import { parsePollForm, savePostPoll } from "@/lib/polls";
import { parsePostSettingsForm, savePostSettings } from "@/lib/post-settings";
import { isValidCategory } from "@/lib/categories";
import { tErr, zodErr } from "@/lib/action-errors";
import { canManageTenantMembership } from "@/lib/capabilities";
import { queueNewsletterAudienceBatch } from "@/lib/newsletter-delivery";
import type { Prisma } from "@/app/generated/prisma/client";
import { getTranslations } from "next-intl/server";
import {
  assertStripeSubscriptionsInactive,
  cancelStripeSubscriptionsImmediately,
  StripeSubscriptionStillActiveError,
} from "@/lib/stripe-cleanup";
import { countOpenCreatorCheckouts } from "@/lib/creator-checkout";
import { queueTenantDeletion } from "@/lib/data-lifecycle";

export interface ActionState {
  error?: string;
  ok?: boolean;
  /** Invite link for freshly created member accounts (copy & share). */
  inviteUrl?: string;
}

const ok: ActionState = { ok: true };

// ---------------------------------------------------------------- Spaces
export async function createSpaceAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const parsed = spaceSchema.safeParse({
    name: fd.get("name"),
    type: fd.get("type"),
    description: fd.get("description") ?? "",
    visibility: fd.get("visibility"),
    requiredEntitlementKey: fd.get("requiredEntitlementKey") ?? "",
  });
  if (!parsed.success)
    return { error: await zodErr(parsed) };

  const space = await prisma.space.create({
    data: {
      tenantId: tenant.id,
      name: parsed.data.name,
      slug: await uniqueChildSlug("space", tenant.id, parsed.data.name),
      type: parsed.data.type,
      description: parsed.data.description || null,
      visibility: parsed.data.visibility,
      requiredEntitlementKey: parsed.data.requiredEntitlementKey || null,
      sortOrder: await prisma.space.count({ where: { tenantId: tenant.id } }),
    },
  });
  await writeAudit({
    tenantId: tenant.id,
    action: "space.create",
    targetType: "Space",
    targetId: space.id,
  });
  revalidatePath(`/dashboard/${slug}/spaces`);
  revalidatePath(`/dashboard/${slug}`, "layout");
  revalidatePath(`/c/${slug}`);
  return ok;
}

export async function toggleSpaceArchiveAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const spaceId = String(fd.get("spaceId"));
  const { tenant } = await requireTenantAdmin(slug);
  const space = await prisma.space.findFirst({
    where: { id: spaceId, tenantId: tenant.id },
  });
  if (space) {
    await prisma.space.update({
      where: { id: space.id },
      data: { isArchived: !space.isArchived },
    });
  }
  revalidatePath(`/dashboard/${slug}/spaces`);
  revalidatePath(`/dashboard/${slug}`, "layout");
}

export async function updateSpaceAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const spaceId = String(fd.get("spaceId"));
  const parsed = spaceSchema.safeParse({
    name: fd.get("name"),
    type: fd.get("type"),
    description: fd.get("description") ?? "",
    visibility: fd.get("visibility"),
    requiredEntitlementKey: fd.get("requiredEntitlementKey") ?? "",
  });
  if (!parsed.success)
    return { error: await zodErr(parsed) };

  const space = await prisma.space.findFirst({
    where: { id: spaceId, tenantId: tenant.id },
  });
  if (!space) return { error: await tErr("spaceNotFound") };

  // Slug stays stable so existing links keep working.
  await prisma.space.update({
    where: { id: space.id },
    data: {
      name: parsed.data.name,
      type: parsed.data.type,
      description: parsed.data.description || null,
      visibility: parsed.data.visibility,
      requiredEntitlementKey: parsed.data.requiredEntitlementKey || null,
    },
  });
  await writeAudit({
    tenantId: tenant.id,
    action: "space.update",
    targetType: "Space",
    targetId: space.id,
  });
  revalidatePath(`/dashboard/${slug}/spaces`);
  revalidatePath(`/dashboard/${slug}`, "layout");
  revalidatePath(`/c/${slug}`);
  return ok;
}

export async function deleteSpaceAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const spaceId = String(fd.get("spaceId"));
  const { tenant } = await requireTenantAdmin(slug);
  const space = await prisma.space.findFirst({
    where: { id: spaceId, tenantId: tenant.id },
  });
  if (space) {
    await prisma.space.delete({ where: { id: space.id } });
    await writeAudit({
      tenantId: tenant.id,
      action: "space.delete",
      targetType: "Space",
      targetId: space.id,
    });
  }
  revalidatePath(`/dashboard/${slug}/spaces`);
  revalidatePath(`/dashboard/${slug}`, "layout");
  revalidatePath(`/c/${slug}`);
}

// ---------------------------------------------------------------- Tiers
export async function createTierAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const parsed = tierSchema.safeParse({
    name: fd.get("name"),
    description: fd.get("description") ?? "",
    priceCents: fd.get("priceCents"),
    interval: fd.get("interval"),
  });
  if (!parsed.success)
    return { error: await zodErr(parsed) };

  const baseSlug = slugify(parsed.data.name);
  const exists = await prisma.membershipTier.findFirst({
    where: { tenantId: tenant.id, slug: baseSlug },
  });
  // Key must derive from the FINAL slug — otherwise two tiers share a key.
  const tierSlug = exists ? `${baseSlug}-${Date.now()}` : baseSlug;
  const isRecommended = fd.get("isRecommended") === "true";
  const created = await prisma.membershipTier.create({
    data: {
      tenantId: tenant.id,
      name: parsed.data.name,
      slug: tierSlug,
      description: parsed.data.description || null,
      coverUrl: String(fd.get("coverUrl") || "") || null,
      isRecommended,
      priceCents: parsed.data.interval === "FREE" ? 0 : parsed.data.priceCents,
      currency: PLATFORM_CURRENCY,
      interval: parsed.data.interval,
      entitlementKey: `tier:${tierSlug}`,
      isPublic: fd.get("isPublic") !== "false",
      sortOrder: await prisma.membershipTier.count({
        where: { tenantId: tenant.id },
      }),
    } as unknown as Prisma.MembershipTierUncheckedCreateInput,
  });
  if (isRecommended) {
    await prisma.membershipTier.updateMany({
      where: { tenantId: tenant.id, id: { not: created.id } },
      data: { isRecommended: false } as unknown as Prisma.MembershipTierUpdateManyMutationInput,
    });
  }
  revalidatePath(`/dashboard/${slug}/tiers`);
  revalidatePath(`/c/${slug}/join`);
  return ok;
}

export async function updateTierAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const tierId = String(fd.get("tierId"));
  const parsed = tierSchema.safeParse({
    name: fd.get("name"),
    description: fd.get("description") ?? "",
    priceCents: fd.get("priceCents"),
    interval: fd.get("interval"),
  });
  if (!parsed.success)
    return { error: await zodErr(parsed) };

  const tier = await prisma.membershipTier.findFirst({
    where: { id: tierId, tenantId: tenant.id },
  });
  if (!tier) return { error: await tErr("tierNotFound") };

  const makeDefault = fd.get("isDefault") === "true";
  const isRecommended = fd.get("isRecommended") === "true";
  // Slug + entitlementKey stay stable so existing paywalls/entitlements hold.
  await prisma.membershipTier.update({
    where: { id: tier.id },
    data: {
      name: parsed.data.name,
      description: parsed.data.description || null,
      coverUrl: String(fd.get("coverUrl") || "") || null,
      isRecommended,
      priceCents: parsed.data.interval === "FREE" ? 0 : parsed.data.priceCents,
      interval: parsed.data.interval,
      isPublic: fd.get("isPublic") !== "false",
    } as unknown as Prisma.MembershipTierUpdateInput,
  });
  if (isRecommended) {
    await prisma.membershipTier.updateMany({
      where: { tenantId: tenant.id, id: { not: tier.id } },
      data: { isRecommended: false } as unknown as Prisma.MembershipTierUpdateManyMutationInput,
    });
  }

  if (makeDefault && !tier.isDefault) {
    await prisma.membershipTier.updateMany({
      where: { tenantId: tenant.id, id: { not: tier.id } },
      data: { isDefault: false },
    });
    await prisma.membershipTier.update({
      where: { id: tier.id },
      data: { isDefault: true },
    });
  }

  await writeAudit({
    tenantId: tenant.id,
    action: "tier.update",
    targetType: "MembershipTier",
    targetId: tier.id,
  });
  revalidatePath(`/dashboard/${slug}/tiers`);
  revalidatePath(`/c/${slug}/join`);
  return ok;
}

export async function deleteTierAction(fd: FormData): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const tierId = String(fd.get("tierId"));
  const tier = await prisma.membershipTier.findFirst({
    where: { id: tierId, tenantId: tenant.id },
  });
  if (!tier) return { error: await tErr("tierNotFound") };
  // The default tier is protected (free joiners rely on it).
  if (tier.isDefault) return { error: await tErr("defaultTierCantDelete") };

  // A Stripe Checkout Session references tierId before a local Subscription
  // exists. Paid tiers are therefore soft-deleted: keeping the row guarantees
  // that a late paid webhook can still fulfil the purchase safely.
  if (tier.priceCents > 0) {
    await prisma.membershipTier.update({
      where: { id: tier.id },
      data: { isPublic: false },
    });
    await writeAudit({
      tenantId: tenant.id,
      action: "tier.delete.blocked",
      targetType: "MembershipTier",
      targetId: tier.id,
      metadata: { reason: "paid_tier_archived_for_checkout_safety" },
    });
    revalidatePath(`/dashboard/${slug}/tiers`);
    revalidatePath(`/c/${slug}/join`);
    return { error: await tErr("paidTierArchivedInsteadOfDeleted") };
  }

  const incompleteLocalSubscriptions = await prisma.subscription.count({
    where: { tenantId: tenant.id, tierId: tier.id, status: "INCOMPLETE" },
  });
  if (incompleteLocalSubscriptions > 0) {
    await writeAudit({
      tenantId: tenant.id,
      action: "tier.delete.blocked",
      targetType: "MembershipTier",
      targetId: tier.id,
      metadata: { reason: "local_subscription_incomplete" },
    });
    return { error: await tErr("pendingPaymentsBlockDeletion") };
  }

  const stripeSubscriptions = await prisma.subscription.findMany({
    where: {
      tenantId: tenant.id,
      tierId: tier.id,
      stripeSubscriptionId: { not: null },
    },
    select: { stripeSubscriptionId: true },
  });
  try {
    // Deleting a tier must not silently terminate customer contracts. Stripe
    // has to confirm that every historical reference is already terminal.
    await assertStripeSubscriptionsInactive(
      stripeSubscriptions.map((subscription) => subscription.stripeSubscriptionId),
    );
  } catch (error) {
    await writeAudit({
      tenantId: tenant.id,
      action: "tier.delete.blocked",
      targetType: "MembershipTier",
      targetId: tier.id,
      metadata: {
        reason:
          error instanceof StripeSubscriptionStillActiveError
            ? "stripe_subscription_active"
            : "stripe_verification_failed",
      },
    });
    return { error: await tErr("tierDeleteStripeBlocked") };
  }

  await withTenantTransaction(async (tx) => {
    await tx.subscription.deleteMany({ where: { tenantId: tenant.id, tierId: tier.id } });
    await tx.membership.updateMany({
      where: { tenantId: tenant.id, tierId: tier.id },
      data: { tierId: null },
    });
    await tx.entitlement.deleteMany({
      where: { tenantId: tenant.id, key: tier.entitlementKey },
    });
    await tx.membershipTier.delete({ where: { id: tier.id } });
  });
  await writeAudit({
    tenantId: tenant.id,
    action: "tier.delete",
    targetType: "MembershipTier",
    targetId: tier.id,
  });
  revalidatePath(`/dashboard/${slug}/tiers`);
  return ok;
}

// ---------------------------------------------------------------- Products
/** Shipping & inventory fields — only meaningful for physical products. */
/** Collect the product gallery image URLs from repeated `images` fields. */
function productImages(fd: FormData, max = 8): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of fd.getAll("images")) {
    const url = String(v).trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length >= max) break;
  }
  return out;
}

function productShippingData(fd: FormData, type: string) {
  if (type !== "PHYSICAL") {
    return { requiresShipping: false, freeShipping: false, shippingCents: 0, stock: null };
  }
  const free = fd.get("freeShipping") === "true";
  const ship = Number(fd.get("shippingCents") || 0);
  const stockRaw = String(fd.get("stock") || "").trim();
  return {
    requiresShipping: true,
    freeShipping: free,
    shippingCents: free ? 0 : Math.max(0, ship || 0),
    stock: stockRaw === "" ? null : Math.max(0, Number(stockRaw) || 0),
  };
}

export async function createProductAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const parsed = productSchema.safeParse({
    name: fd.get("name"),
    description: fd.get("description") ?? "",
    priceCents: fd.get("priceCents"),
    type: fd.get("type"),
    downloadUrl: fd.get("downloadUrl") ?? "",
  });
  if (!parsed.success)
    return { error: await zodErr(parsed) };

  const productSlug = await uniqueChildSlug("product", tenant.id, parsed.data.name);
  const images = productImages(fd);
  const product = await prisma.product.create({
    data: {
      tenantId: tenant.id,
      name: parsed.data.name,
      slug: productSlug,
      description: parsed.data.description || null,
      priceCents: parsed.data.priceCents,
      currency: PLATFORM_CURRENCY,
      type: parsed.data.type,
      downloadUrl: parsed.data.downloadUrl || null,
      images,
      coverUrl: images[0] ?? (String(fd.get("coverUrl") || "") || null),
      isPublished: fd.get("isPublished") !== "false",
      grantsEntitlementKey: `product:${productSlug}`,
      ...productShippingData(fd, parsed.data.type),
    },
  });
  await indexContent({
    tenantId: tenant.id,
    sourceType: "PRODUCT",
    sourceId: product.id,
    title: product.name,
    content: parsed.data.description || product.name,
  });
  revalidatePath(`/dashboard/${slug}/products`);
  return ok;
}

export async function updateProductAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const productId = String(fd.get("productId"));
  const parsed = productSchema.safeParse({
    name: fd.get("name"),
    description: fd.get("description") ?? "",
    priceCents: fd.get("priceCents"),
    type: fd.get("type"),
    downloadUrl: fd.get("downloadUrl") ?? "",
  });
  if (!parsed.success)
    return { error: await zodErr(parsed) };

  const product = await prisma.product.findFirst({
    where: { id: productId, tenantId: tenant.id },
  });
  if (!product) return { error: await tErr("productNotFound") };

  // Slug + grantsEntitlementKey stay stable so existing purchases keep access.
  const imagesSubmitted = fd.get("imagesSubmitted") !== null;
  const cover = fd.get("coverUrl");
  const images = productImages(fd);
  await prisma.product.update({
    where: { id: product.id },
    data: {
      name: parsed.data.name,
      description: parsed.data.description || null,
      priceCents: parsed.data.priceCents,
      type: parsed.data.type,
      downloadUrl: parsed.data.downloadUrl || null,
      isPublished: fd.get("isPublished") !== "false",
      // The gallery field drives both the image list and the cover.
      ...(imagesSubmitted
        ? { images, coverUrl: images[0] ?? null }
        : cover !== null
          ? { coverUrl: String(cover) || null }
          : {}),
      ...productShippingData(fd, parsed.data.type),
    },
  });
  await indexContent({
    tenantId: tenant.id,
    sourceType: "PRODUCT",
    sourceId: product.id,
    title: parsed.data.name,
    content: parsed.data.description || parsed.data.name,
  });
  await writeAudit({
    tenantId: tenant.id,
    action: "product.update",
    targetType: "Product",
    targetId: product.id,
  });
  revalidatePath(`/dashboard/${slug}/products`);
  return ok;
}

export async function deleteProductAction(fd: FormData): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const productId = String(fd.get("productId"));
  const product = await prisma.product.findFirst({
    where: { id: productId, tenantId: tenant.id },
  });
  if (!product) return { error: await tErr("productNotFound") };

  // Stop new checkouts before inspecting orders. Product checkout creates a
  // PENDING order before Stripe, so any open Session is now locally visible.
  await prisma.product.update({
    where: { id: product.id },
    data: { isPublished: false },
  });
  const linkedOrders = await prisma.order.count({
    where: { tenantId: tenant.id, productId: product.id },
  });
  if (linkedOrders > 0) {
    await writeAudit({
      tenantId: tenant.id,
      action: "product.delete.blocked",
      targetType: "Product",
      targetId: product.id,
      metadata: { reason: "linked_orders", linkedOrders },
    });
    revalidatePath(`/dashboard/${slug}/products`);
    revalidatePath(`/c/${slug}`);
    return { error: await tErr("productArchivedBecauseOrdersExist") };
  }

  await removeFromIndex(tenant.id, "PRODUCT", product.id);
  await prisma.product.delete({ where: { id: product.id } });
  await writeAudit({
    tenantId: tenant.id,
    action: "product.delete",
    targetType: "Product",
    targetId: product.id,
  });
  revalidatePath(`/dashboard/${slug}/products`);
  return ok;
}

// ---------------------------------------------------------------- Courses
/** Parse the online/offline delivery fields of a course from a form. */
function courseFormatData(fd: FormData) {
  const format = String(fd.get("format") || "ONLINE") === "OFFLINE" ? "OFFLINE" : "ONLINE";
  const startsRaw = String(fd.get("startsAt") || "");
  const startsAt = startsRaw ? new Date(startsRaw) : null;
  const cap = Number(fd.get("capacity") || 0);
  return {
    format,
    videoUrl: String(fd.get("videoUrl") || "") || null,
    streamUrl: String(fd.get("streamUrl") || "") || null,
    location: String(fd.get("location") || "") || null,
    address: String(fd.get("address") || "") || null,
    startsAt: startsAt && !isNaN(startsAt.getTime()) ? startsAt : null,
    capacity: cap > 0 ? cap : null,
  };
}

export async function createCourseAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const title = String(fd.get("title") || "").trim();
  const spaceId = String(fd.get("spaceId") || "");
  if (title.length < 2) return { error: await tErr("titleRequired") };

  // Use the selected course space, else find/create a default one.
  let space = spaceId
    ? await prisma.space.findFirst({
        where: { id: spaceId, tenantId: tenant.id, type: "COURSE" },
      })
    : await prisma.space.findFirst({ where: { tenantId: tenant.id, type: "COURSE" } });
  if (!space) {
    space = await prisma.space.create({
      data: {
        tenantId: tenant.id,
        name: "Kurse",
        slug: await uniqueChildSlug("space", tenant.id, "Kurse"),
        type: "COURSE",
        visibility: "MEMBERS",
      },
    });
  }

  const course = await prisma.course.create({
    data: {
      tenantId: tenant.id,
      spaceId: space.id,
      title,
      slug: await uniqueChildSlug("course", tenant.id, title),
      description: String(fd.get("description") || "") || null,
      coverUrl: String(fd.get("coverUrl") || "") || null,
      isPublished: fd.get("isPublished") !== "false",
      ...courseFormatData(fd),
    },
  });
  await indexContent({
    tenantId: tenant.id,
    sourceType: "COURSE",
    sourceId: course.id,
    title: course.title,
    content: course.description || course.title,
  });
  revalidatePath(`/dashboard/${slug}`, "layout");
  return ok;
}

export async function createLessonAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const courseId = String(fd.get("courseId") || "");
  const title = String(fd.get("title") || "").trim();
  if (title.length < 2) return { error: await tErr("titleRequiredShort") };
  const course = await prisma.course.findFirst({
    where: { id: courseId, tenantId: tenant.id },
  });
  if (!course) return { error: await tErr("courseNotFound") };

  const dripRaw = Number(fd.get("dripAfterDays"));
  await prisma.lesson.create({
    data: {
      tenantId: tenant.id,
      courseId: course.id,
      title,
      slug: slugify(title) + "-" + Math.random().toString(36).slice(2, 6),
      content: String(fd.get("content") || ""),
      videoUrl: String(fd.get("videoUrl") || "") || null,
      // Drip-Content: 0/leer = sofort verfügbar.
      dripAfterDays:
        Number.isFinite(dripRaw) && dripRaw > 0 ? Math.min(Math.round(dripRaw), 365) : null,
      sortOrder: await prisma.lesson.count({ where: { courseId: course.id } }),
    },
  });
  revalidatePath(`/dashboard/${slug}`, "layout");
  return ok;
}

// ---------------------------------------------------------------- Events
export async function createEventAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const parsed = eventSchema.safeParse({
    title: fd.get("title"),
    description: fd.get("description") ?? "",
    startsAt: fd.get("startsAt"),
    location: fd.get("location") ?? "",
    isOnline: fd.get("isOnline") ?? "",
    meetingUrl: fd.get("meetingUrl") ?? "",
  });
  if (!parsed.success)
    return { error: await zodErr(parsed) };
  const startsAt = new Date(parsed.data.startsAt);
  if (isNaN(startsAt.getTime())) return { error: await tErr("invalidStartDate") };

  const spaceIdInput = String(fd.get("spaceId") || "");
  let space = spaceIdInput
    ? await prisma.space.findFirst({
        where: { id: spaceIdInput, tenantId: tenant.id, type: { in: ["EVENTS", "CALENDAR"] } },
      })
    : await prisma.space.findFirst({ where: { tenantId: tenant.id, type: "EVENTS" } });
  if (!space) {
    space = await prisma.space.create({
      data: {
        tenantId: tenant.id,
        name: "Events",
        slug: await uniqueChildSlug("space", tenant.id, "Events"),
        type: "EVENTS",
        visibility: "MEMBERS",
      },
    });
  }
  const capacityRaw = Number(fd.get("capacity") || 0);
  const event = await prisma.event.create({
    data: {
      tenantId: tenant.id,
      spaceId: space.id,
      title: parsed.data.title,
      slug: await uniqueChildSlug("event", tenant.id, parsed.data.title),
      description: parsed.data.description || null,
      startsAt,
      location: parsed.data.location || null,
      isOnline: Boolean(parsed.data.isOnline),
      meetingUrl: parsed.data.meetingUrl || null,
      coverUrl: String(fd.get("coverUrl") || "") || null,
      capacity: capacityRaw > 0 ? capacityRaw : null,
    },
  });
  await indexContent({
    tenantId: tenant.id,
    sourceType: "EVENT",
    sourceId: event.id,
    title: event.title,
    content: parsed.data.description || event.title,
  });
  revalidatePath(`/dashboard/${slug}`, "layout");
  return ok;
}

// ---------------------------------------------------------------- Newsletter
function parseCampaignSchedule(fd: FormData): Date | null {
  const raw = String(fd.get("scheduledAt") || "").trim();
  if (!raw) return null;
  const offset = Number(fd.get("timezoneOffset"));
  // datetime-local deliberately has no zone. Convert the creator's browser
  // wall-clock value to UTC instead of interpreting it in Railway's timezone.
  const localMatch = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(raw);
  let millis: number;
  if (localMatch && Number.isFinite(offset)) {
    const [, year, month, day, hour, minute] = localMatch;
    millis =
      Date.UTC(+year!, +month! - 1, +day!, +hour!, +minute!) +
      Math.min(Math.max(offset, -840), 840) * 60_000;
  } else {
    millis = Date.parse(raw);
  }
  return Number.isFinite(millis) && millis > Date.now() + 60_000
    ? new Date(millis)
    : null;
}

export async function createCampaignAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant, user } = await requireTenantAdmin(slug);
  const parsed = campaignSchema.safeParse({
    subject: fd.get("subject"),
    body: fd.get("body"),
    segmentId: fd.get("segmentId") ?? "",
  });
  if (!parsed.success)
    return { error: await zodErr(parsed) };
  const scheduledAt = parseCampaignSchedule(fd);

  await prisma.newsletterCampaign.create({
    data: {
      tenantId: tenant.id,
      subject: parsed.data.subject,
      body: parsed.data.body,
      segmentId: parsed.data.segmentId || null,
      createdById: user.id,
      status: scheduledAt ? "SCHEDULED" : "DRAFT",
      scheduledAt,
    },
  });
  revalidatePath(`/dashboard/${slug}/newsletter`);
  return ok;
}

export async function sendCampaignAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const campaignId = String(fd.get("campaignId"));
  const { tenant } = await requireTenantAdmin(slug);
  const campaign = await prisma.newsletterCampaign.findFirst({
    where: { id: campaignId, tenantId: tenant.id },
  });
  if (!campaign || campaign.status === "SENT") {
    revalidatePath(`/dashboard/${slug}/newsletter`);
    return;
  }

  // Atomic state transition. An already-SENDING campaign is deliberately
  // resumable: the unique delivery key makes a repeated queue operation safe.
  const locked = await prisma.newsletterCampaign.updateMany({
    where: { id: campaign.id, tenantId: tenant.id, status: { in: ["DRAFT", "SCHEDULED"] } },
    data: { status: "SENDING" },
  });
  if (locked.count === 0) {
    const current = await prisma.newsletterCampaign.findFirst({
      where: { id: campaign.id, tenantId: tenant.id },
      select: { status: true },
    });
    if (current?.status !== "SENDING") {
      revalidatePath(`/dashboard/${slug}/newsletter`);
      return;
    }
  }

  // Snapshot a bounded audience page at a time. Very large sends are resumed
  // by the newsletter cron from their durable SENDING state instead of loading
  // every member into one server-action request.
  const footerLabel = (await getTranslations("uiMigration.emails"))("sentVia");
  let recipientCount = 0;
  for (let batch = 0; batch < 4; batch++) {
    const result = await queueNewsletterAudienceBatch({
      id: campaign.id,
      tenantId: tenant.id,
      subject: campaign.subject,
      body: campaign.body,
      segmentId: campaign.segmentId,
      status: "SENDING",
      scheduledAt: campaign.scheduledAt,
      tenant: { name: tenant.name, primaryColor: tenant.primaryColor },
      footerLabel,
    });
    recipientCount = result.total;
    if (!result.hasMore) break;
  }
  await writeAudit({
    tenantId: tenant.id,
    action: "campaign.queue",
    targetType: "NewsletterCampaign",
    targetId: campaign.id,
    metadata: { recipients: recipientCount },
  });
  revalidatePath(`/dashboard/${slug}/newsletter`);
}

export async function createSegmentAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const name = String(fd.get("name") || "").trim();
  if (name.length < 2) return { error: await tErr("nameRequired") };
  const description = String(fd.get("description") || "").trim().slice(0, 300) || null;
  const tierSlug = String(fd.get("tierSlug") || "");
  const minPoints = Number(fd.get("minPoints") || 0);
  const activeSinceDays = Number(fd.get("activeSinceDays") || 0);
  await prisma.segment.create({
    data: {
      tenantId: tenant.id,
      name,
      description,
      rules: {
        ...(tierSlug ? { tierSlug } : {}),
        ...(minPoints > 0 ? { minPoints } : {}),
        ...(activeSinceDays > 0 ? { activeSinceDays: Math.floor(activeSinceDays) } : {}),
      },
    },
  });
  revalidatePath(`/dashboard/${slug}/newsletter`);
  return ok;
}

/** Sendet den aktuellen Kampagnen-Entwurf als Test-E-Mail an den Admin selbst. */
export async function sendCampaignTestAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant, user } = await requireTenantAdmin(slug);
  const subject = String(fd.get("subject") || "").trim();
  const body = String(fd.get("body") || "").trim();
  if (!subject || !body) return { error: await tErr("invalidData") };
  const footerLabel = (await getTranslations("uiMigration.emails"))("sentVia");
  const html = renderCampaignHtml({
    tenantName: tenant.name,
    primaryColor: tenant.primaryColor,
    subject,
    body,
    footerLabel,
  });
  const result = await sendEmail({
    to: user.email,
    subject: `[Test] ${subject}`,
    html,
  });
  if (!result.ok) return { error: result.error ?? "send-failed" };
  return ok;
}

// ---------------------------------------------------------------- Gamification
export async function createBadgeAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const name = String(fd.get("name") || "").trim();
  const type = String(fd.get("type") || "points");
  const threshold = Number(fd.get("threshold") || 0);
  if (name.length < 2) return { error: await tErr("nameRequired") };
  await prisma.badge.create({
    data: {
      tenantId: tenant.id,
      name,
      description: String(fd.get("description") || "") || null,
      criteria: { type, threshold },
    },
  });
  revalidatePath(`/dashboard/${slug}/gamification`);
  return ok;
}

export async function updateRulePointsAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const ruleId = String(fd.get("ruleId"));
  const points = Number(fd.get("points") || 0);
  const { tenant } = await requireTenantAdmin(slug);
  await prisma.gamificationRule.updateMany({
    where: { id: ruleId, tenantId: tenant.id },
    data: { points, isActive: points > 0 },
  });
  revalidatePath(`/dashboard/${slug}/gamification`);
}

const GAMIFICATION_TRIGGERS = [
  "POST_CREATED",
  "COMMENT_CREATED",
  "REACTION_GIVEN",
  "LESSON_COMPLETED",
  "EVENT_RSVP",
  "DAILY_LOGIN",
  "PURCHASE",
  "REFERRAL",
] as const;
type GTrigger = (typeof GAMIFICATION_TRIGGERS)[number];

export async function createRuleAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const name = String(fd.get("name") || "").trim();
  const trigger = String(fd.get("trigger") || "");
  const points = Math.max(0, Number(fd.get("points") || 0) || 0);
  const maxPerDayRaw = Number(fd.get("maxPerDay") || 0);
  const maxPerDay = maxPerDayRaw > 0 ? maxPerDayRaw : null;

  if (name.length < 2) return { error: await tErr("enterName") };
  if (!GAMIFICATION_TRIGGERS.includes(trigger as GTrigger)) {
    return { error: await tErr("chooseValidTrigger") };
  }
  await prisma.gamificationRule.create({
    data: {
      tenantId: tenant.id,
      name,
      trigger: trigger as GTrigger,
      points,
      isActive: points > 0,
      maxPerDay,
    },
  });
  revalidatePath(`/dashboard/${slug}/gamification`);
  return ok;
}

export async function deleteRuleAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const ruleId = String(fd.get("ruleId"));
  await prisma.gamificationRule.deleteMany({ where: { id: ruleId, tenantId: tenant.id } });
  revalidatePath(`/dashboard/${slug}/gamification`);
}

// ---------------------------------------------------------------- Members
export async function updateMemberRoleAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const membershipId = String(fd.get("membershipId"));
  const role = String(fd.get("role"));
  const { tenant, role: actorRole } = await requireTenantAdmin(slug, "ADMIN");
  if (!["MEMBER", "MODERATOR", "ADMIN"].includes(role)) return;
  const membership = await prisma.membership.findFirst({
    where: { id: membershipId, tenantId: tenant.id },
  });
  if (
    membership &&
    canManageTenantMembership(
      actorRole,
      membership.role,
      role as "MEMBER" | "MODERATOR" | "ADMIN",
    )
  ) {
    await prisma.membership.update({
      where: { id: membership.id },
      // @ts-expect-error validated string literal
      data: { role },
    });
  }
  revalidatePath(`/dashboard/${slug}/members`);
}

const ROLES = ["MEMBER", "MODERATOR", "ADMIN"];
const STATUSES = ["ACTIVE", "PENDING", "BANNED"];

/** Add a member by email — finds or creates the user, then the membership. */
export async function createMemberAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant, role: actorRole } = await requireTenantAdmin(slug);

  const email = String(fd.get("email") || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: await tErr("validEmail") };
  }
  const role = String(fd.get("role") || "MEMBER");
  const tierId = String(fd.get("tierId") || "");
  const avatar = String(fd.get("avatarUrl") || "");
  if (!ROLES.includes(role)) return { error: await tErr("invalidRole") };
  if (
    !canManageTenantMembership(
      actorRole,
      "MEMBER",
      role as "MEMBER" | "MODERATOR" | "ADMIN",
    )
  ) {
    return { error: await tErr("noPermission") };
  }

  // Identity lookup/account creation is intentionally global. It uses the
  // explicit system client; all tenant rows below remain under RLS.
  let user = await systemPrisma.user.findUnique({ where: { email } });
  let isNewAccount = false;
  if (!user) {
    isNewAccount = true;
    user = await systemPrisma.user.create({
      data: {
        email,
        name: email.split("@")[0],
        passwordHash: await hashPassword(randomUUID()),
        avatarUrl: avatar || null,
      },
    });
  }

  const existing = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
  });
  if (existing) return { error: await tErr("alreadyMember") };

  const tier = tierId
    ? await prisma.membershipTier.findFirst({ where: { id: tierId, tenantId: tenant.id } })
    : await prisma.membershipTier.findFirst({ where: { tenantId: tenant.id, isDefault: true } });

  await prisma.membership.create({
    data: {
      tenantId: tenant.id,
      userId: user.id,
      role: role as "MEMBER" | "MODERATOR" | "ADMIN",
      status: "ACTIVE",
      tierId: tier?.id ?? null,
    },
  });
  if (tier) {
    await grantEntitlement({
      tenantId: tenant.id,
      userId: user.id,
      key: tier.entitlementKey,
      source: "MANUAL",
      sourceId: tier.id,
    });
  }
  // New accounts get an invite link (7 days) to set their own password —
  // without it they could never log in (random password, no reset knowledge).
  let inviteLink: string | undefined;
  if (isNewAccount) {
    const token = await signAccountToken(user, "invite", "7d");
    // After activation the new member lands directly in the community.
    inviteLink = `${inviteUrl(token)}?next=${encodeURIComponent(`/c/${slug}`)}`;
    if (features.email) {
      const tMail = await getTranslations("uiMigration.emails");
      await sendEmail({
        to: user.email,
        subject: tMail("inviteSubject", { community: tenant.name }),
        html: renderAccountActionHtml({
          heading: tMail("inviteHeading", { community: tenant.name }),
          body: tMail("inviteBody", { community: tenant.name }),
          ctaLabel: tMail("inviteCta"),
          ctaUrl: inviteLink,
          hint: tMail("inviteHint"),
          fallbackLabel: tMail("fallbackLink"),
          footerLabel: tMail("sentVia"),
        }),
      });
    }
  }

  await writeAudit({
    tenantId: tenant.id,
    action: "member.add",
    targetType: "Membership",
    metadata: { email, role },
  });
  revalidatePath(`/dashboard/${slug}/members`);
  return { ok: true, inviteUrl: inviteLink };
}

/** Edit a member's role, tier and status. Owners are protected. */
export async function updateMemberAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant, role: actorRole } = await requireTenantAdmin(slug);
  const membershipId = String(fd.get("membershipId"));
  const role = String(fd.get("role") || "MEMBER");
  const status = String(fd.get("status") || "ACTIVE");
  const tierId = String(fd.get("tierId") || "");

  if (!ROLES.includes(role)) return { error: await tErr("invalidRole") };
  if (!STATUSES.includes(status)) return { error: await tErr("invalidStatus") };

  const membership = await prisma.membership.findFirst({
    where: { id: membershipId, tenantId: tenant.id },
  });
  if (!membership) return { error: await tErr("memberNotFound") };
  if (membership.role === "OWNER") return { error: await tErr("ownerCantEdit") };
  if (
    !canManageTenantMembership(
      actorRole,
      membership.role,
      role as "MEMBER" | "MODERATOR" | "ADMIN",
    )
  ) {
    return { error: await tErr("noPermission") };
  }

  const tier = tierId
    ? await prisma.membershipTier.findFirst({ where: { id: tierId, tenantId: tenant.id } })
    : null;
  if (tierId && !tier) return { error: await tErr("tierNotFound") };

  const billingAccessChanges =
    membership.tierId !== (tier?.id ?? null) || status !== "ACTIVE";
  let canceledStripeSubscriptions = 0;
  if (billingAccessChanges) {
    const stripeSubscriptions = await prisma.subscription.findMany({
      where: {
        tenantId: tenant.id,
        userId: membership.userId,
        stripeSubscriptionId: { not: null },
      },
      select: { stripeSubscriptionId: true },
    });
    try {
      // Never remove or change paid access locally while an external contract
      // can continue charging. Tier changes become an explicit manual grant
      // only after every prior Stripe subscription is terminal.
      await cancelStripeSubscriptionsImmediately(
        stripeSubscriptions.map((subscription) => subscription.stripeSubscriptionId),
      );
      canceledStripeSubscriptions = stripeSubscriptions.length;
    } catch {
      await writeAudit({
        tenantId: tenant.id,
        action: "member.update.blocked",
        targetType: "Membership",
        targetId: membership.id,
        metadata: { reason: "stripe_cleanup_failed" },
      });
      return { error: await tErr("stripeCancelFailed") };
    }
  }

  await withTenantTransaction(async (tx) => {
    await tx.membership.update({
      where: { id: membership.id },
      data: {
        role: role as "MEMBER" | "MODERATOR" | "ADMIN",
        status: status as "ACTIVE" | "PENDING" | "BANNED",
        tierId: tier?.id ?? null,
      },
    });
    if (billingAccessChanges) {
      await tx.subscription.updateMany({
        where: {
          tenantId: tenant.id,
          userId: membership.userId,
          status: { not: "CANCELED" },
        },
        data: { status: "CANCELED", cancelAtPeriodEnd: false },
      });
    }
  });

  // Downgrade/switch: drop the previous tier's entitlement so access follows
  // the new tier. Runs before the grant below and no-ops when unchanged.
  if (membership.tierId !== (tier?.id ?? null)) {
    await revokePreviousTierEntitlement({
      tenantId: tenant.id,
      userId: membership.userId,
      previousTierId: membership.tierId,
      keepKey: tier?.entitlementKey ?? null,
    });
  }

  // Banned/pending members never retain a tier entitlement, even when the
  // selected tier itself did not change.
  if (status !== "ACTIVE" && tier) {
    await prisma.entitlement.deleteMany({
      where: {
        tenantId: tenant.id,
        userId: membership.userId,
        key: tier.entitlementKey,
      },
    });
  }

  const avatar = fd.get("avatarUrl");
  if (avatar !== null) {
    await systemPrisma.user.update({
      where: { id: membership.userId },
      data: { avatarUrl: String(avatar) || null },
      select: { id: true },
    });
  }

  if (tier && status === "ACTIVE") {
    await grantEntitlement({
      tenantId: tenant.id,
      userId: membership.userId,
      key: tier.entitlementKey,
      source: "MANUAL",
      sourceId: tier.id,
    });
  }
  await writeAudit({
    tenantId: tenant.id,
    action: "member.update",
    targetType: "Membership",
    targetId: membership.id,
    metadata: { role, status, canceledStripeSubscriptions },
  });
  revalidatePath(`/dashboard/${slug}/members`);
  return { ok: true };
}

/** Edit the current user's own profile (name + avatar). Used by owners/admins. */
export async function updateOwnProfileAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const user = await getCurrentUser();
  if (!user) return { error: await tErr("notAuthenticated") };

  const tenant = await prisma.tenant.findUnique({ where: { slug, status: "ACTIVE" } });
  if (!tenant) return { error: await tErr("communityNotFound") };
  setTenantContext(tenant.id);
  const membership = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
  });
  if (membership?.status !== "ACTIVE") {
    return { error: await tErr("notMemberOfCommunity") };
  }

  const name = String(fd.get("name") || "").trim();
  if (name.length < 2) return { error: await tErr("enterYourName") };
  const avatar = fd.get("avatarUrl");

  await systemPrisma.user.update({
    where: { id: user.id },
    data: {
      name,
      ...(avatar !== null ? { avatarUrl: String(avatar) || null } : {}),
    },
    select: { id: true },
  });
  await writeAudit({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: "profile.update",
  });
  revalidatePath(`/dashboard/${slug}/members`);
  return { ok: true };
}

/** Remove a member from the community (membership + tenant entitlements). */
export async function deleteMemberAction(fd: FormData): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant, role: actorRole } = await requireTenantAdmin(slug);
  const membershipId = String(fd.get("membershipId"));
  const membership = await prisma.membership.findFirst({
    where: { id: membershipId, tenantId: tenant.id },
  });
  if (!membership) return { error: await tErr("memberNotFound") };
  if (membership.role === "OWNER") return { error: await tErr("ownerCantEdit") };
  if (!canManageTenantMembership(actorRole, membership.role)) {
    return { error: await tErr("noPermission") };
  }

  const stripeSubscriptions = await prisma.subscription.findMany({
    where: {
      tenantId: tenant.id,
      userId: membership.userId,
      stripeSubscriptionId: { not: null },
    },
    select: { stripeSubscriptionId: true },
  });
  try {
    // Administrative removal is immediate: cancel every remotely referenced
    // subscription before revoking local access or deleting the membership.
    await cancelStripeSubscriptionsImmediately(
      stripeSubscriptions.map((subscription) => subscription.stripeSubscriptionId),
    );
  } catch {
    await writeAudit({
      tenantId: tenant.id,
      action: "member.remove.blocked",
      targetType: "Membership",
      targetId: membership.id,
      metadata: { reason: "stripe_cleanup_failed" },
    });
    return { error: await tErr("memberRemoveStripeFailed") };
  }

  await withTenantTransaction(async (tx) => {
    await tx.subscription.updateMany({
      where: { tenantId: tenant.id, userId: membership.userId, status: { not: "CANCELED" } },
      data: { status: "CANCELED", cancelAtPeriodEnd: false },
    });
    // Only tier/role grants — purchased products stay with the user.
    await tx.entitlement.deleteMany({
      where: {
        tenantId: tenant.id,
        userId: membership.userId,
        source: { in: ["TIER", "ROLE"] },
      },
    });
    await tx.membership.delete({ where: { id: membership.id } });
  });
  await writeAudit({
    tenantId: tenant.id,
    action: "member.remove",
    targetType: "Membership",
    targetId: membership.id,
    metadata: { stripeSubscriptionsCanceled: stripeSubscriptions.length },
  });
  revalidatePath(`/dashboard/${slug}/members`);
  return ok;
}

// ---------------------------------------------------------------- Branding
const BRAND_HEX = /^#[0-9a-fA-F]{6}$/;

/** Only accept #RRGGBB — the values end up in style attributes and emails. */
function safeBrandColor(v: FormDataEntryValue | null, fallback: string): string {
  const s = String(v ?? "").trim();
  return BRAND_HEX.test(s) ? s : fallback;
}

export async function updateBrandingAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);

  const nextName = String(fd.get("name") || tenant.name).slice(0, 60);
  if ((await nameStatus(nextName, slug)) === "taken") {
    return { error: await tErr("nameTaken") };
  }

  const categoryRaw = String(fd.get("category") ?? "").trim();
  const category = isValidCategory(categoryRaw) ? categoryRaw : null;

  await prisma.tenant.update({
    where: { id: tenant.id },
    // Cast: `category` ist neu im Schema — nach dem Pull einmal
    // `npm run db:migrate` ausführen (wendet Migration an + prisma generate).
    data: {
      name: String(fd.get("name") || tenant.name).slice(0, 60),
      tagline: String(fd.get("tagline") || "") || null,
      description: String(fd.get("description") || "") || null,
      logoUrl: String(fd.get("logoUrl") || "") || null,
      primaryColor: safeBrandColor(fd.get("primaryColor"), tenant.primaryColor),
      accentColor: safeBrandColor(fd.get("accentColor"), tenant.accentColor),
      category,
    } as unknown as Prisma.TenantUpdateInput,
  });
  revalidatePath(`/dashboard/${slug}/settings`);
  revalidatePath(`/c/${slug}`);
  revalidatePath("/home");
  return ok;
}

// ---------------------------------------------------------------- Events (edit)
export async function updateEventAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const eventId = String(fd.get("eventId"));
  const parsed = eventSchema.safeParse({
    title: fd.get("title"),
    description: fd.get("description") ?? "",
    startsAt: fd.get("startsAt"),
    location: fd.get("location") ?? "",
    isOnline: fd.get("isOnline") ?? "",
    meetingUrl: fd.get("meetingUrl") ?? "",
  });
  if (!parsed.success)
    return { error: await zodErr(parsed) };
  const startsAt = new Date(parsed.data.startsAt);
  if (isNaN(startsAt.getTime())) return { error: await tErr("invalidStartDate") };

  const event = await prisma.event.findFirst({
    where: { id: eventId, tenantId: tenant.id },
  });
  if (!event) return { error: await tErr("eventNotFound") };

  const cover = fd.get("coverUrl");
  const capacityRaw = Number(fd.get("capacity") || 0);
  await prisma.event.update({
    where: { id: event.id },
    data: {
      title: parsed.data.title,
      description: parsed.data.description || null,
      startsAt,
      location: parsed.data.location || null,
      isOnline: Boolean(parsed.data.isOnline),
      meetingUrl: parsed.data.meetingUrl || null,
      capacity: capacityRaw > 0 ? capacityRaw : null,
      ...(cover !== null ? { coverUrl: String(cover) || null } : {}),
    },
  });
  await indexContent({
    tenantId: tenant.id,
    sourceType: "EVENT",
    sourceId: event.id,
    title: parsed.data.title,
    content: parsed.data.description || parsed.data.title,
  });
  await writeAudit({ tenantId: tenant.id, action: "event.update", targetType: "Event", targetId: event.id });
  revalidatePath(`/dashboard/${slug}`, "layout");
  revalidatePath(`/c/${slug}`);
  return ok;
}

export async function deleteEventAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const eventId = String(fd.get("eventId"));
  const event = await prisma.event.findFirst({ where: { id: eventId, tenantId: tenant.id } });
  if (event) {
    await removeFromIndex(tenant.id, "EVENT", event.id);
    await prisma.event.delete({ where: { id: event.id } });
    await writeAudit({ tenantId: tenant.id, action: "event.delete", targetType: "Event", targetId: event.id });
  }
  revalidatePath(`/dashboard/${slug}`, "layout");
}

// ---------------------------------------------------------------- Courses (edit)
export async function updateCourseAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const courseId = String(fd.get("courseId"));
  const title = String(fd.get("title") || "").trim();
  if (title.length < 2) return { error: await tErr("titleRequired") };

  const course = await prisma.course.findFirst({ where: { id: courseId, tenantId: tenant.id } });
  if (!course) return { error: await tErr("courseNotFound") };

  const cover = fd.get("coverUrl");
  await prisma.course.update({
    where: { id: course.id },
    data: {
      title,
      description: String(fd.get("description") || "") || null,
      isPublished: fd.get("isPublished") !== "false",
      ...(cover !== null ? { coverUrl: String(cover) || null } : {}),
      ...courseFormatData(fd),
    },
  });
  await indexContent({
    tenantId: tenant.id,
    sourceType: "COURSE",
    sourceId: course.id,
    title,
    content: String(fd.get("description") || "") || title,
  });
  await writeAudit({ tenantId: tenant.id, action: "course.update", targetType: "Course", targetId: course.id });
  revalidatePath(`/dashboard/${slug}`, "layout");
  return ok;
}

export async function deleteCourseAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const courseId = String(fd.get("courseId"));
  const course = await prisma.course.findFirst({ where: { id: courseId, tenantId: tenant.id } });
  if (course) {
    await removeFromIndex(tenant.id, "COURSE", course.id);
    await prisma.course.delete({ where: { id: course.id } });
    await writeAudit({ tenantId: tenant.id, action: "course.delete", targetType: "Course", targetId: course.id });
  }
  revalidatePath(`/dashboard/${slug}`, "layout");
}

export async function updateLessonAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const lessonId = String(fd.get("lessonId"));
  const title = String(fd.get("title") || "").trim();
  if (title.length < 2) return { error: await tErr("titleRequiredShort") };
  const lesson = await prisma.lesson.findFirst({ where: { id: lessonId, tenantId: tenant.id } });
  if (!lesson) return { error: await tErr("lessonNotFound") };
  const dripRaw = Number(fd.get("dripAfterDays"));
  await prisma.lesson.update({
    where: { id: lesson.id },
    data: {
      title,
      content: String(fd.get("content") || ""),
      videoUrl: String(fd.get("videoUrl") || "") || null,
      dripAfterDays:
        Number.isFinite(dripRaw) && dripRaw > 0 ? Math.min(Math.round(dripRaw), 365) : null,
    },
  });
  revalidatePath(`/dashboard/${slug}`, "layout");
  return ok;
}

export async function deleteLessonAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const lessonId = String(fd.get("lessonId"));
  const lesson = await prisma.lesson.findFirst({ where: { id: lessonId, tenantId: tenant.id } });
  if (lesson) await prisma.lesson.delete({ where: { id: lesson.id } });
  revalidatePath(`/dashboard/${slug}`, "layout");
}

// ---------------------------------------------------------------- Newsletter (edit)
export async function updateCampaignAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const campaignId = String(fd.get("campaignId"));
  const parsed = campaignSchema.safeParse({
    subject: fd.get("subject"),
    body: fd.get("body"),
    segmentId: fd.get("segmentId") ?? "",
  });
  if (!parsed.success)
    return { error: await zodErr(parsed) };

  const campaign = await prisma.newsletterCampaign.findFirst({
    where: { id: campaignId, tenantId: tenant.id },
  });
  if (!campaign) return { error: await tErr("campaignNotFound") };
  if (campaign.status === "SENT" || campaign.status === "SENDING")
    return { error: await tErr("sentCampaignReadonly") };
  const scheduledAt = parseCampaignSchedule(fd);

  await prisma.newsletterCampaign.update({
    where: { id: campaign.id },
    data: {
      subject: parsed.data.subject,
      body: parsed.data.body,
      segmentId: parsed.data.segmentId || null,
      scheduledAt,
      status: scheduledAt ? "SCHEDULED" : "DRAFT",
    },
  });
  revalidatePath(`/dashboard/${slug}/newsletter`);
  return ok;
}

export async function deleteCampaignAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const campaignId = String(fd.get("campaignId"));
  const campaign = await prisma.newsletterCampaign.findFirst({
    where: { id: campaignId, tenantId: tenant.id },
  });
  if (campaign && (campaign.status === "DRAFT" || campaign.status === "SCHEDULED")) {
    await prisma.newsletterCampaign.delete({ where: { id: campaign.id } });
    await writeAudit({ tenantId: tenant.id, action: "campaign.delete", targetType: "NewsletterCampaign", targetId: campaign.id });
  }
  revalidatePath(`/dashboard/${slug}/newsletter`);
}

export async function deleteSegmentAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const segmentId = String(fd.get("segmentId"));
  const segment = await prisma.segment.findFirst({ where: { id: segmentId, tenantId: tenant.id } });
  if (segment) await prisma.segment.delete({ where: { id: segment.id } });
  revalidatePath(`/dashboard/${slug}/newsletter`);
}

// ---------------------------------------------------------------- Gamification (edit)
export async function updateBadgeAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const badgeId = String(fd.get("badgeId"));
  const name = String(fd.get("name") || "").trim();
  const type = String(fd.get("type") || "points");
  const threshold = Number(fd.get("threshold") || 0);
  if (name.length < 2) return { error: await tErr("nameRequired") };
  const badge = await prisma.badge.findFirst({ where: { id: badgeId, tenantId: tenant.id } });
  if (!badge) return { error: await tErr("badgeNotFound") };
  await prisma.badge.update({
    where: { id: badge.id },
    data: {
      name,
      description: String(fd.get("description") || "") || null,
      criteria: { type, threshold },
    },
  });
  revalidatePath(`/dashboard/${slug}/gamification`);
  return ok;
}

export async function deleteBadgeAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const badgeId = String(fd.get("badgeId"));
  const badge = await prisma.badge.findFirst({ where: { id: badgeId, tenantId: tenant.id } });
  if (badge) await prisma.badge.delete({ where: { id: badge.id } });
  revalidatePath(`/dashboard/${slug}/gamification`);
}

// ---------------------------------------------------------------- Media packages
interface MediaInput {
  type: "IMAGE" | "VIDEO";
  url: string;
  caption?: string;
  priceCents?: number;
  isPreview?: boolean;
  teaserUrl?: string;
}
function parseMediaItems(raw: string): MediaInput[] {
  try {
    const arr = JSON.parse(raw) as MediaInput[];
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((m) => m && typeof m.url === "string" && (m.type === "IMAGE" || m.type === "VIDEO"))
      .map((m) => ({
        type: m.type,
        url: m.url,
        caption: typeof m.caption === "string" ? m.caption : undefined,
        priceCents: Math.max(0, Math.floor(Number(m.priceCents) || 0)),
        isPreview: m.isPreview === true,
        teaserUrl: typeof m.teaserUrl === "string" && m.teaserUrl ? m.teaserUrl : undefined,
      }));
  } catch {
    return [];
  }
}
function parseAvailableUntil(raw: unknown): Date | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
function coverFrom(items: MediaInput[]): string | null {
  return items.find((m) => m.type === "IMAGE")?.url ?? null;
}

export async function createMediaPackageAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const spaceId = String(fd.get("spaceId"));
  const space = await prisma.space.findFirst({ where: { id: spaceId, tenantId: tenant.id } });
  if (!space) return { error: await tErr("spaceNotFound") };

  const title = String(fd.get("title") || "").trim();
  if (title.length < 2) return { error: await tErr("titleRequired") };
  const items = parseMediaItems(String(fd.get("items") || "[]"));
  if (items.length === 0) return { error: await tErr("uploadOneMedia") };

  const priceCents = Math.max(0, Number(fd.get("priceCents") || 0) || 0);
  // Apple-IAP-Konformität: bezahltes Paket + bepreiste Einzel-Medien nur zu
  // festen Apple-Preispunkten.
  if (priceCents > 0 && !isAllowedOneTimePriceCents(priceCents)) {
    return { error: await tErr("priceNotAllowed") };
  }
  if (items.some((m) => (m.priceCents ?? 0) > 0 && !isAllowedOneTimePriceCents(m.priceCents ?? 0))) {
    return { error: await tErr("priceNotAllowed") };
  }
  const pkgSlug = await uniqueChildSlug("mediaPackage", tenant.id, title);

  const pkg = await prisma.mediaPackage.create({
    data: {
      tenantId: tenant.id,
      spaceId: space.id,
      title,
      slug: pkgSlug,
      description: String(fd.get("description") || "") || null,
      coverUrl: coverFrom(items),
      priceCents,
      currency: PLATFORM_CURRENCY,
      entitlementKey: `media:${pkgSlug}`,
      isPublished: fd.get("isPublished") !== "false",
      availableUntil: parseAvailableUntil(fd.get("availableUntil")),
      items: {
        create: items.map((m, i) => ({
          tenantId: tenant.id,
          type: m.type,
          url: m.url,
          caption: m.caption || null,
          sortOrder: i,
          priceCents: m.priceCents ?? 0,
          currency: PLATFORM_CURRENCY,
          isPreview: m.isPreview ?? false,
          teaserUrl: m.teaserUrl ?? null,
        })),
      },
    },
  });
  // Mint stable per-item entitlement keys for individually priced media.
  const pricedItems = await prisma.mediaItem.findMany({
    where: { packageId: pkg.id, priceCents: { gt: 0 } },
    select: { id: true },
  });
  for (const it of pricedItems) {
    await prisma.mediaItem.update({
      where: { id: it.id },
      data: { entitlementKey: `media-item:${it.id}` },
    });
  }
  await indexContent({
    tenantId: tenant.id,
    sourceType: "PRODUCT",
    sourceId: pkg.id,
    title,
    content: String(fd.get("description") || "") || title,
  });
  revalidatePath(`/dashboard/${slug}/spaces/${space.slug}`);
  revalidatePath(`/c/${slug}/s/${space.slug}`);
  return ok;
}

export async function updateMediaPackageAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const packageId = String(fd.get("packageId"));
  const spaceSlug = String(fd.get("spaceSlug") || "");
  const pkg = await prisma.mediaPackage.findFirst({ where: { id: packageId, tenantId: tenant.id } });
  if (!pkg) return { error: await tErr("packageNotFound") };
  const title = String(fd.get("title") || "").trim();
  if (title.length < 2) return { error: await tErr("titleRequired") };

  const pkgPriceCents = Math.max(0, Number(fd.get("priceCents") || 0) || 0);
  // Apple-IAP-Konformität: bezahltes Paket + bepreiste Einzel-Medien nur zu
  // festen Apple-Preispunkten.
  if (pkgPriceCents > 0 && !isAllowedOneTimePriceCents(pkgPriceCents)) {
    return { error: await tErr("priceNotAllowed") };
  }

  // Optionally append newly uploaded items.
  const newItems = parseMediaItems(String(fd.get("items") || "[]"));
  if (newItems.some((m) => (m.priceCents ?? 0) > 0 && !isAllowedOneTimePriceCents(m.priceCents ?? 0))) {
    return { error: await tErr("priceNotAllowed") };
  }
  if (newItems.length) {
    const start = await prisma.mediaItem.count({ where: { packageId: pkg.id } });
    await prisma.mediaItem.createMany({
      data: newItems.map((m, i) => ({
        tenantId: tenant.id,
        packageId: pkg.id,
        type: m.type,
        url: m.url,
        caption: m.caption || null,
        sortOrder: start + i,
        priceCents: m.priceCents ?? 0,
        currency: PLATFORM_CURRENCY,
        isPreview: m.isPreview ?? false,
        teaserUrl: m.teaserUrl ?? null,
      })),
    });
    const pricedNew = await prisma.mediaItem.findMany({
      where: { packageId: pkg.id, priceCents: { gt: 0 }, entitlementKey: null },
      select: { id: true },
    });
    for (const it of pricedNew) {
      await prisma.mediaItem.update({
        where: { id: it.id },
        data: { entitlementKey: `media-item:${it.id}` },
      });
    }
  }

  const firstImage = await prisma.mediaItem.findFirst({
    where: { packageId: pkg.id, type: "IMAGE" },
    orderBy: { sortOrder: "asc" },
    select: { url: true },
  });
  await prisma.mediaPackage.update({
    where: { id: pkg.id },
    data: {
      title,
      description: String(fd.get("description") || "") || null,
      priceCents: pkgPriceCents,
      isPublished: fd.get("isPublished") !== "false",
      availableUntil: parseAvailableUntil(fd.get("availableUntil")),
      coverUrl: firstImage?.url ?? pkg.coverUrl,
    },
  });
  revalidatePath(`/dashboard/${slug}/spaces/${spaceSlug}`);
  revalidatePath(`/c/${slug}/s/${spaceSlug}`);
  return ok;
}

export async function deleteMediaPackageAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const packageId = String(fd.get("packageId"));
  const spaceSlug = String(fd.get("spaceSlug") || "");
  const pkg = await prisma.mediaPackage.findFirst({ where: { id: packageId, tenantId: tenant.id } });
  if (pkg) {
    await removeFromIndex(tenant.id, "PRODUCT", pkg.id);
    await prisma.mediaPackage.delete({ where: { id: pkg.id } });
  }
  revalidatePath(`/dashboard/${slug}/spaces/${spaceSlug}`);
  revalidatePath(`/c/${slug}/s/${spaceSlug}`);
}

export async function deleteMediaItemAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const itemId = String(fd.get("itemId"));
  const spaceSlug = String(fd.get("spaceSlug") || "");
  const item = await prisma.mediaItem.findFirst({ where: { id: itemId, tenantId: tenant.id } });
  if (item) await prisma.mediaItem.delete({ where: { id: item.id } });
  revalidatePath(`/dashboard/${slug}/spaces/${spaceSlug}`);
  revalidatePath(`/c/${slug}/s/${spaceSlug}`);
}

// ---------------------------------------------------------------- Settings
export async function updateCustomDomainAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const domain = String(fd.get("customDomain") || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");

  if (domain) {
    if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(domain)) {
      return { error: await tErr("validDomain") };
    }
    const taken = await prisma.tenant.findFirst({
      where: { customDomain: domain, id: { not: tenant.id } },
    });
    if (taken) return { error: await tErr("domainTaken") };
  }

  await systemPrisma.tenant.update({
    where: { id: tenant.id },
    data: {
      customDomain: domain || null,
      // Jede Änderung erfordert einen frischen DNS-Nachweis.
      customDomainVerifiedAt:
        domain && domain === tenant.customDomain
          ? tenant.customDomainVerifiedAt
          : null,
    },
  });
  await writeAudit({ tenantId: tenant.id, action: "tenant.domain", metadata: { domain } });
  revalidatePath(`/dashboard/${slug}/settings`);
  return ok;
}

/** Prüft die DNS-Einträge der hinterlegten Domain und schaltet sie frei. */
export async function verifyCustomDomainAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  if (!tenant.customDomain) {
    return { error: await tErr("saveDomainFirst") };
  }

  const { checkDomainDns } = await import("@/lib/domains");
  const result = await checkDomainDns(tenant.customDomain, tenant.id);
  if (!result.verified) {
    return { error: result.detail };
  }

  await systemPrisma.tenant.update({
    where: { id: tenant.id },
    data: { customDomainVerifiedAt: new Date() },
  });
  await writeAudit({
    tenantId: tenant.id,
    action: "tenant.domain.verify",
    metadata: { domain: tenant.customDomain },
  });
  revalidatePath(`/dashboard/${slug}/settings`);
  return ok;
}

export async function deleteTenantAction(fd: FormData): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant, user } = await requireTenantAdmin(slug, "OWNER");
  const confirm = String(fd.get("confirm") || "").trim();
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
      actorUserId: user.id,
      action: "tenant.delete.blocked",
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
      actorUserId: user.id,
      action: "tenant.delete.blocked",
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
    requestedById: user.id,
    label: tenant.slug,
  });
  await writeAudit({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: "tenant.delete.queued",
    targetType: "Tenant",
    targetId: tenant.id,
    metadata: { slug: tenant.slug, name: tenant.name, deletionJobId },
  });
  revalidatePath(`/dashboard/${slug}`, "layout");
  return ok;
}

// ---------------------------------------------------------------- Space content
/** Create a post (feed/forum/blog/gallery/video) inside a space — admin side. */
export async function createSpacePostAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant, user } = await requireTenantAdmin(slug);
  const spaceId = String(fd.get("spaceId"));
  const space = await prisma.space.findFirst({ where: { id: spaceId, tenantId: tenant.id } });
  if (!space) return { error: await tErr("spaceNotFound") };

  const title = String(fd.get("title") || "").trim();
  const rawHtml = String(fd.get("bodyHtml") || "");
  let bodyHtml = rawHtml ? sanitizeRichHtml(rawHtml) : null;
  const plain = bodyHtml ? htmlToPlainText(bodyHtml) : "";
  const htmlHasMedia = bodyHtml ? /<(img|video)/i.test(bodyHtml) : false;
  // Treat a blank editor (e.g. the seeded empty paragraph) as no content.
  if (bodyHtml && !plain && !htmlHasMedia) bodyHtml = null;
  // For blog posts the plain text comes from the rich editor; otherwise the textarea.
  const body = bodyHtml ? plain : String(fd.get("body") || "").trim();
  const imageUrl = String(fd.get("imageUrl") || "") || null;
  const videoUrl = String(fd.get("videoUrl") || "") || null;
  if (!body && !bodyHtml && !imageUrl && !videoUrl && !title) {
    return { error: await tErr("contentRequired") };
  }

  // Pay-per-view / pay-per-post
  const priceCents = Math.max(0, Math.floor(Number(fd.get("priceCents") || 0) || 0));
  // Apple-IAP-Konformität: bezahlte Posts nur zu festen Apple-Preispunkten.
  if (priceCents > 0 && !isAllowedOneTimePriceCents(priceCents)) {
    return { error: await tErr("priceNotAllowed") };
  }
  const teaserUrl = String(fd.get("teaserUrl") || "") || null;
  // Scheduling: an ISO/`datetime-local` value in the future keeps the post hidden.
  const rawSchedule = String(fd.get("scheduledAt") || "").trim();
  const scheduledDate = rawSchedule ? new Date(rawSchedule) : null;
  const validSchedule =
    scheduledDate && !Number.isNaN(scheduledDate.getTime()) && scheduledDate.getTime() > Date.now()
      ? scheduledDate
      : null;

  const post = await prisma.post.create({
    data: {
      tenantId: tenant.id,
      spaceId: space.id,
      authorId: user.id,
      title: title || null,
      body,
      bodyHtml,
      imageUrl,
      videoUrl,
      priceCents,
      currency: PLATFORM_CURRENCY,
      teaserUrl,
      scheduledAt: validSchedule,
      // Scheduled posts publish later via /api/cron/posts.
      isPublished: validSchedule ? false : true,
      publishedAt: validSchedule ?? undefined,
    },
  });
  // Paid posts need a stable entitlement key referencing the post id.
  if (priceCents > 0) {
    const keyPrefix = space.type === "VIDEOS" ? "video" : "post";
    await prisma.post.update({
      where: { id: post.id },
      data: { entitlementKey: `${keyPrefix}:${post.id}` },
    });
  }
  // Optional poll authored in the composer.
  const poll = parsePollForm(fd);
  if (poll) await savePostPoll(tenant.id, post.id, poll);
  // Composer "Settings" panel (present only when the forum composer submits it).
  if (fd.get("settingsControl") === "1") {
    await savePostSettings(tenant.id, post.id, parsePostSettingsForm(fd));
  }
  await indexContent({
    tenantId: tenant.id,
    sourceType: "POST",
    sourceId: post.id,
    title: title || undefined,
    content: body || title || space.name,
  });
  revalidatePath(`/dashboard/${slug}/spaces/${space.slug}`);
  revalidatePath(`/c/${slug}/s/${space.slug}`);
  return ok;
}

export async function deletePostAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const postId = String(fd.get("postId"));
  const spaceSlug = String(fd.get("spaceSlug") || "");
  const post = await prisma.post.findFirst({ where: { id: postId, tenantId: tenant.id } });
  if (post) {
    await removeFromIndex(tenant.id, "POST", post.id);
    await prisma.post.delete({ where: { id: post.id } });
  }
  revalidatePath(`/dashboard/${slug}/spaces/${spaceSlug}`);
  revalidatePath(`/c/${slug}/s/${spaceSlug}`);
}

/** Create a knowledge-base article inside a KNOWLEDGE space. */
export async function createArticleAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const spaceId = String(fd.get("spaceId"));
  const space = await prisma.space.findFirst({ where: { id: spaceId, tenantId: tenant.id } });
  if (!space) return { error: await tErr("spaceNotFound") };
  const title = String(fd.get("title") || "").trim();
  const body = String(fd.get("body") || "").trim();
  if (title.length < 2) return { error: await tErr("titleRequired") };

  const article = await prisma.knowledgeArticle.create({
    data: {
      tenantId: tenant.id,
      spaceId: space.id,
      title,
      slug: await uniqueChildSlug("knowledgeArticle", tenant.id, title),
      body,
    },
  });
  await indexContent({
    tenantId: tenant.id,
    sourceType: "ARTICLE",
    sourceId: article.id,
    title,
    content: body || title,
  });
  revalidatePath(`/dashboard/${slug}/spaces/${space.slug}`);
  revalidatePath(`/c/${slug}/s/${space.slug}`);
  return ok;
}

export async function updateArticleAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const articleId = String(fd.get("articleId"));
  const spaceSlug = String(fd.get("spaceSlug") || "");
  const article = await prisma.knowledgeArticle.findFirst({ where: { id: articleId, tenantId: tenant.id } });
  if (!article) return { error: await tErr("articleNotFound") };
  const title = String(fd.get("title") || "").trim();
  const body = String(fd.get("body") || "").trim();
  if (title.length < 2) return { error: await tErr("titleRequired") };

  await prisma.knowledgeArticle.update({ where: { id: article.id }, data: { title, body } });
  await indexContent({ tenantId: tenant.id, sourceType: "ARTICLE", sourceId: article.id, title, content: body || title });
  revalidatePath(`/dashboard/${slug}/spaces/${spaceSlug}`);
  revalidatePath(`/c/${slug}/s/${spaceSlug}`);
  return ok;
}

export async function deleteArticleAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const articleId = String(fd.get("articleId"));
  const spaceSlug = String(fd.get("spaceSlug") || "");
  const article = await prisma.knowledgeArticle.findFirst({ where: { id: articleId, tenantId: tenant.id } });
  if (article) {
    await removeFromIndex(tenant.id, "ARTICLE", article.id);
    await prisma.knowledgeArticle.delete({ where: { id: article.id } });
  }
  revalidatePath(`/dashboard/${slug}/spaces/${spaceSlug}`);
  revalidatePath(`/c/${slug}/s/${spaceSlug}`);
}

/** Persist per-space display settings (sorting, pagination, layout, …). */
export async function updateSpaceSettingsAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const spaceId = String(fd.get("spaceId"));
  const space = await prisma.space.findFirst({ where: { id: spaceId, tenantId: tenant.id } });
  if (!space) return { error: await tErr("spaceNotFound") };

  const existing =
    space.settings && typeof space.settings === "object" && !Array.isArray(space.settings)
      ? (space.settings as Record<string, unknown>)
      : {};
  const settings = {
    ...existing,
    sort: String(fd.get("sort") || "NEWEST"),
    pageSize: Math.max(0, Math.min(100, Number(fd.get("pageSize") || 10) || 0)),
    layout: String(fd.get("layout") || "LIST"),
    showSearch: fd.get("showSearch") !== "false",
    showIndex: fd.get("showIndex") !== "false",
    showDates: fd.get("showDates") !== "false",
  };
  await prisma.space.update({ where: { id: space.id }, data: { settings } });
  revalidatePath(`/dashboard/${slug}/spaces/${space.slug}`);
  revalidatePath(`/c/${slug}/s/${space.slug}`);
  return ok;
}

/** Persist blog display settings (card layout, columns, pagination, meta …). */
export async function updateBlogSettingsAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const spaceId = String(fd.get("spaceId"));
  const space = await prisma.space.findFirst({ where: { id: spaceId, tenantId: tenant.id } });
  if (!space) return { error: await tErr("spaceNotFound") };

  const existing =
    space.settings && typeof space.settings === "object" && !Array.isArray(space.settings)
      ? (space.settings as Record<string, unknown>)
      : {};
  const settings = {
    ...existing,
    layout: String(fd.get("layout") || "MAGAZINE"),
    featured: fd.get("featured") !== "false",
    columns: Number(fd.get("columns")) === 2 ? 2 : 3,
    pageSize: Math.max(0, Math.min(60, Number(fd.get("pageSize") || 9) || 0)),
    sort: String(fd.get("sort") || "NEWEST"),
    showExcerpt: fd.get("showExcerpt") !== "false",
    showAuthor: fd.get("showAuthor") !== "false",
    showDate: fd.get("showDate") !== "false",
    showReadTime: fd.get("showReadTime") !== "false",
    showCover: fd.get("showCover") !== "false",
  };
  await prisma.space.update({ where: { id: space.id }, data: { settings } });
  revalidatePath(`/dashboard/${slug}/spaces/${space.slug}`);
  revalidatePath(`/c/${slug}/s/${space.slug}`);
  return ok;
}

/** Persist chat-space settings (topic, post policy, slow mode, limits). */
export async function updateChatSettingsAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const spaceId = String(fd.get("spaceId"));
  const space = await prisma.space.findFirst({ where: { id: spaceId, tenantId: tenant.id } });
  if (!space) return { error: await tErr("spaceNotFound") };

  const existing =
    space.settings && typeof space.settings === "object" && !Array.isArray(space.settings)
      ? (space.settings as Record<string, unknown>)
      : {};
  const clamp = (v: FormDataEntryValue | null, min: number, max: number, dflt: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= min ? Math.min(max, Math.floor(n)) : dflt;
  };
  const settings = {
    ...existing,
    topic: String(fd.get("topic") ?? "").slice(0, 280),
    postPolicy: fd.get("postPolicy") === "STAFF" ? "STAFF" : "ALL",
    slowModeSeconds: clamp(fd.get("slowModeSeconds"), 0, 3600, 0),
    maxMessageLength: clamp(fd.get("maxMessageLength"), 1, 10000, 2000),
    historyLimit: clamp(fd.get("historyLimit"), 20, 300, 80),
  };
  await prisma.space.update({ where: { id: space.id }, data: { settings } });
  await writeAudit({
    tenantId: tenant.id,
    action: "space.chatSettings.update",
    targetType: "Space",
    targetId: space.id,
  });
  revalidatePath(`/dashboard/${slug}/spaces/${space.slug}`);
  revalidatePath(`/c/${slug}/s/${space.slug}`);
  return ok;
}

/** Persist story-space settings (default lifetime, viewer autoplay). */
export async function updateStorySettingsAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const spaceId = String(fd.get("spaceId"));
  const space = await prisma.space.findFirst({ where: { id: spaceId, tenantId: tenant.id } });
  if (!space) return { error: await tErr("spaceNotFound") };

  const existing =
    space.settings && typeof space.settings === "object" && !Array.isArray(space.settings)
      ? (space.settings as Record<string, unknown>)
      : {};
  const ttl = Number(fd.get("defaultTtlHours"));
  const autoplay = Number(fd.get("autoplaySeconds"));
  const settings = {
    ...existing,
    defaultTtlHours: Number.isFinite(ttl) && ttl >= 1 ? Math.min(168, Math.floor(ttl)) : 24,
    autoplaySeconds:
      Number.isFinite(autoplay) && autoplay > 0 ? Math.min(30, Math.floor(autoplay)) : 0,
  };
  await prisma.space.update({ where: { id: space.id }, data: { settings } });
  await writeAudit({
    tenantId: tenant.id,
    action: "space.storySettings.update",
    targetType: "Space",
    targetId: space.id,
  });
  revalidatePath(`/dashboard/${slug}/spaces/${space.slug}`);
  revalidatePath(`/c/${slug}/s/${space.slug}`);
  return ok;
}

/** Moderation: delete a single chat message from a chat space. */
export async function deleteChatMessageAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const messageId = String(fd.get("messageId"));
  const spaceSlug = String(fd.get("spaceSlug") || "");
  await prisma.chatMessage.deleteMany({ where: { id: messageId, tenantId: tenant.id } });
  await writeAudit({
    tenantId: tenant.id,
    action: "chatMessage.delete",
    targetType: "ChatMessage",
    targetId: messageId,
  });
  revalidatePath(`/dashboard/${slug}/spaces/${spaceSlug}`);
  revalidatePath(`/c/${slug}/s/${spaceSlug}`);
}

/** Moderation: delete any comment (and its replies) in the tenant. */
export async function deleteCommentAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const commentId = String(fd.get("commentId"));
  const spaceSlug = String(fd.get("spaceSlug") || "");
  const comment = await prisma.comment.findFirst({
    where: { id: commentId, tenantId: tenant.id },
    include: { post: { select: { id: true } } },
  });
  if (comment) {
    await prisma.comment.delete({ where: { id: comment.id } });
    await writeAudit({ tenantId: tenant.id, action: "comment.delete", targetType: "Comment", targetId: comment.id });
    if (comment.post) revalidatePath(`/c/${slug}/s/${spaceSlug}/${comment.post.id}`);
  }
  revalidatePath(`/dashboard/${slug}/spaces/${spaceSlug}`);
  revalidatePath(`/c/${slug}/s/${spaceSlug}`);
}

/** Moderation: pin / unpin a forum thread. */
export async function togglePinPostAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const postId = String(fd.get("postId"));
  const spaceSlug = String(fd.get("spaceSlug") || "");
  const post = await prisma.post.findFirst({ where: { id: postId, tenantId: tenant.id } });
  if (post) {
    await prisma.post.update({ where: { id: post.id }, data: { isPinned: !post.isPinned } });
  }
  revalidatePath(`/dashboard/${slug}/spaces/${spaceSlug}`);
  revalidatePath(`/c/${slug}/s/${spaceSlug}`);
}

/** Moderation: edit any post (title / body). */
export async function updatePostAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const postId = String(fd.get("postId"));
  const spaceSlug = String(fd.get("spaceSlug") || "");
  const post = await prisma.post.findFirst({ where: { id: postId, tenantId: tenant.id } });
  if (!post) return { error: await tErr("postNotFound") };

  const title = String(fd.get("title") || "").trim();

  // Rich blog content arrives as `bodyHtml`; forum/plain edits use `body`.
  const rawHtml = fd.get("bodyHtml");
  let bodyHtmlUpdate: { bodyHtml: string | null } | Record<string, never> = {};
  let body: string;
  if (rawHtml !== null) {
    const sanitized = String(rawHtml) ? sanitizeRichHtml(String(rawHtml)) : null;
    const plain = sanitized ? htmlToPlainText(sanitized) : "";
    const htmlHasMedia = sanitized ? /<(img|video)/i.test(sanitized) : false;
    const normalized = sanitized && (plain || htmlHasMedia) ? sanitized : null;
    bodyHtmlUpdate = { bodyHtml: normalized };
    body = normalized ? plain : "";
  } else {
    body = String(fd.get("body") || "").trim();
  }
  if (!title && !body && !("bodyHtml" in bodyHtmlUpdate && bodyHtmlUpdate.bodyHtml)) {
    return { error: await tErr("titleOrTextRequired") };
  }

  const image = fd.get("imageUrl");
  const video = fd.get("videoUrl");
  const rawPrice = fd.get("priceCents");
  const teaser = fd.get("teaserUrl");
  // Price change: keep/mint/clear the stable entitlement key accordingly.
  let priceUpdate: Record<string, unknown> = {};
  if (rawPrice !== null) {
    const priceCents = Math.max(0, Math.floor(Number(rawPrice) || 0));
    // Apple-IAP-Konformität: bezahlte Posts nur zu festen Apple-Preispunkten.
    if (priceCents > 0 && !isAllowedOneTimePriceCents(priceCents)) {
      return { error: await tErr("priceNotAllowed") };
    }
    const space = await prisma.space.findFirst({
      where: { id: post.spaceId, tenantId: tenant.id },
      select: { type: true },
    });
    const prefix = space?.type === "VIDEOS" ? "video" : "post";
    priceUpdate = {
      priceCents,
      entitlementKey: priceCents > 0 ? post.entitlementKey ?? `${prefix}:${post.id}` : null,
    };
  }
  await prisma.post.update({
    where: { id: post.id },
    data: {
      title: title || null,
      body,
      ...bodyHtmlUpdate,
      ...(image !== null ? { imageUrl: String(image) || null } : {}),
      ...(video !== null ? { videoUrl: String(video) || null } : {}),
      ...(teaser !== null ? { teaserUrl: String(teaser) || null } : {}),
      ...priceUpdate,
    },
  });
  // The forum composer submits pollControl so the poll is set or cleared here.
  if (fd.get("pollControl") === "1") {
    await savePostPoll(tenant.id, post.id, parsePollForm(fd));
  }
  if (fd.get("settingsControl") === "1") {
    await savePostSettings(tenant.id, post.id, parsePostSettingsForm(fd));
  }
  await indexContent({
    tenantId: tenant.id,
    sourceType: "POST",
    sourceId: post.id,
    title: title || undefined,
    content: body || title,
  });
  revalidatePath(`/dashboard/${slug}/spaces/${spaceSlug}`);
  revalidatePath(`/c/${slug}/s/${spaceSlug}`);
  revalidatePath(`/c/${slug}/s/${spaceSlug}/${post.id}`);
  return ok;
}

/** Moderation: edit a comment's text. */
export async function updateCommentAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const commentId = String(fd.get("commentId"));
  const spaceSlug = String(fd.get("spaceSlug") || "");
  const body = String(fd.get("body") || "").trim();
  if (body.length < 1) return { error: await tErr("commentNotEmpty") };
  const comment = await prisma.comment.findFirst({
    where: { id: commentId, tenantId: tenant.id },
    include: { post: { select: { id: true } } },
  });
  if (!comment) return { error: await tErr("commentNotFound") };
  await prisma.comment.update({ where: { id: comment.id }, data: { body } });
  revalidatePath(`/dashboard/${slug}/spaces/${spaceSlug}`);
  if (comment.post) revalidatePath(`/c/${slug}/s/${spaceSlug}/${comment.post.id}`);
  return ok;
}

// ---------------------------------------------------------------- Media library
export async function createMediaFolderAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const name = String(fd.get("name") || "").trim();
  if (name.length < 1) return { error: await tErr("enterName") };
  if (name.length > 60) return { error: await tErr("nameTooLong") };
  const color = normalizeFolderColor(fd.get("color"));

  const maxOrder = await prisma.mediaFolder.aggregate({
    where: { tenantId: tenant.id },
    _max: { sortOrder: true },
  });
  await prisma.mediaFolder.create({
    data: {
      tenantId: tenant.id,
      name,
      color,
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
    },
  });
  revalidatePath(`/dashboard/${slug}/media`);
  return ok;
}

/** Accepted folder accent colors. Anything else falls back to the default. */
const FOLDER_COLORS = [
  "#C2410C", "#B45309", "#475569", "#BE123C",
  "#6D28D9", "#1D4ED8", "#0F766E", "#15803D",
];
const DEFAULT_FOLDER_COLOR = FOLDER_COLORS[0]!;

function normalizeFolderColor(raw: FormDataEntryValue | null): string {
  const value = String(raw ?? "").trim().toUpperCase();
  return FOLDER_COLORS.includes(value) ? value : DEFAULT_FOLDER_COLOR;
}

export async function renameMediaFolderAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const folderId = String(fd.get("folderId") || "");
  const name = String(fd.get("name") || "").trim();
  if (name.length < 1 || name.length > 60) return { error: await tErr("enterName") };
  const color = normalizeFolderColor(fd.get("color"));

  const folder = await prisma.mediaFolder.findFirst({
    where: { id: folderId, tenantId: tenant.id },
  });
  if (!folder) return { error: await tErr("invalidData") };

  await prisma.mediaFolder.update({
    where: { id: folder.id },
    data: { name, color },
  });
  revalidatePath(`/dashboard/${slug}/media`);
  return ok;
}

export async function deleteMediaFolderAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const folderId = String(fd.get("folderId") || "");
  const folder = await prisma.mediaFolder.findFirst({
    where: { id: folderId, tenantId: tenant.id },
  });
  if (!folder) return;

  await withTenantTransaction(async (tx) => {
    await tx.storageObject.updateMany({
      where: { tenantId: tenant.id, folderId: folder.id },
      data: { folderId: null },
    });
    await tx.mediaFolder.delete({ where: { id: folder.id } });
  });
  revalidatePath(`/dashboard/${slug}/media`);
}

export async function moveMediaToFolderAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const objectId = String(fd.get("objectId") || "");
  const folderRaw = String(fd.get("folderId") || "");
  const folderId = folderRaw === "" || folderRaw === "null" ? null : folderRaw;

  const object = await prisma.storageObject.findFirst({
    where: { id: objectId, tenantId: tenant.id },
  });
  if (!object) return;

  if (folderId) {
    const folder = await prisma.mediaFolder.findFirst({
      where: { id: folderId, tenantId: tenant.id },
    });
    if (!folder) return;
  }

  await prisma.storageObject.update({
    where: { id: object.id },
    data: { folderId },
  });
  revalidatePath(`/dashboard/${slug}/media`);
}

export async function renameMediaAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const objectId = String(fd.get("objectId") || "");
  const displayName = String(fd.get("displayName") || "").trim();
  if (displayName.length > 120) return { error: await tErr("titleTooLong120") };

  const object = await prisma.storageObject.findFirst({
    where: { id: objectId, tenantId: tenant.id },
  });
  if (!object) return { error: await tErr("invalidData") };

  await prisma.storageObject.update({
    where: { id: object.id },
    data: { displayName: displayName || null },
  });
  revalidatePath(`/dashboard/${slug}/media`);
  return ok;
}

export async function deleteMediaAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const { tenant, user } = await requireTenantAdmin(slug);
  const objectId = String(fd.get("objectId") || "");
  const object = await prisma.storageObject.findFirst({
    where: { id: objectId, tenantId: tenant.id },
  });
  if (!object) return;

  await systemPrisma.$transaction(async (tx) => {
    await tx.objectDeletionTask.upsert({
      where: { key: object.key },
      create: {
        tenantId: tenant.id,
        key: object.key,
        reason: "creator_media_deletion",
      },
      update: {
        tenantId: tenant.id,
        reason: "creator_media_deletion",
        status: "PENDING",
        attempts: 0,
        nextAttemptAt: new Date(),
        leaseUntil: null,
        lastError: null,
        completedAt: null,
      },
    });
    await tx.storageObject.deleteMany({
      where: { id: object.id, tenantId: tenant.id },
    });
  });
  await writeAudit({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: "media.delete",
    targetType: "StorageObject",
    targetId: object.id,
    metadata: { key: object.key, purpose: object.purpose },
  });
  revalidatePath(`/dashboard/${slug}/media`);
}

// Reservierte Subdomains, die niemand als Community-Adresse belegen darf.
const RESERVED_SUBDOMAINS = new Set([
  "www", "app", "api", "admin", "dashboard", "mail", "email", "ftp", "blog",
  "help", "hilfe", "status", "cdn", "assets", "static", "account", "auth",
  "login", "signup", "start", "home", "c", "stripe", "webhook", "webhooks",
  "billing", "docs", "support", "team", "root", "system", "no-reply", "noreply",
]);

/**
 * Setzt die Wunsch-Subdomain der Community (<sub>.aera.so). Leer oder gleich dem
 * Slug entfernt die Wunsch-Subdomain — die Standardadresse (Slug) bleibt aktiv.
 */
export async function updateSubdomainAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const sub = String(fd.get("subdomain") || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split(".")[0]
    .trim();

  if (!sub || sub === tenant.slug) {
    if (tenant.subdomain !== null) {
      await prisma.tenant.update({ where: { id: tenant.id }, data: { subdomain: null } });
      await writeAudit({ tenantId: tenant.id, action: "tenant.subdomain", metadata: { subdomain: null } });
      revalidatePath(`/dashboard/${slug}/settings`);
    }
    return ok;
  }

  if (sub.length < 3 || sub.length > 63 || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(sub)) {
    return { error: await tErr("subInvalid") };
  }
  if (RESERVED_SUBDOMAINS.has(sub)) {
    return { error: await tErr("subReserved") };
  }
  const taken = await prisma.tenant.findFirst({
    where: { id: { not: tenant.id }, OR: [{ subdomain: sub }, { slug: sub }] },
    select: { id: true },
  });
  if (taken) return { error: await tErr("subTaken") };

  await prisma.tenant.update({ where: { id: tenant.id }, data: { subdomain: sub } });
  await writeAudit({ tenantId: tenant.id, action: "tenant.subdomain", metadata: { subdomain: sub } });
  revalidatePath(`/dashboard/${slug}/settings`);
  return ok;
}
