"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import prisma, { setTenantContext } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireTenantAdmin } from "@/lib/guards";
import { env, features } from "@/lib/env";
import {
  createBookingCheckout,
  platformFeeCents,
  retrieveProductCheckoutSession,
} from "@/lib/stripe";
import { isAllowedOneTimePriceCents } from "@/lib/apple-products";
import { tErr } from "@/lib/action-errors";

export interface ActionState {
  ok?: boolean;
  error?: string;
}
const ok: ActionState = { ok: true };
const devPaymentFallbackAllowed = process.env.NODE_ENV !== "production";

async function tenantBySlug(slug: string) {
  const tenant = await prisma.tenant.findUnique({ where: { slug, status: "ACTIVE" } });
  if (tenant) setTenantContext(tenant.id);
  return tenant;
}

function parseDate(raw: unknown): Date | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Staff creates a bookable slot in a BOOKING space. */
export async function createBookingSlotAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant, user } = await requireTenantAdmin(slug);
  const spaceId = String(fd.get("spaceId"));
  const space = await prisma.space.findFirst({ where: { id: spaceId, tenantId: tenant.id } });
  if (!space) return { error: "Space nicht gefunden." };
  const title = String(fd.get("title") || "").trim();
  if (title.length < 2) return { error: "Titel fehlt." };
  const startsAt = parseDate(fd.get("startsAt"));
  if (!startsAt) return { error: "Startzeit fehlt." };

  const priceCents = Math.max(0, Math.floor(Number(fd.get("priceCents") || 0) || 0));
  // Apple-IAP-Konformität: bezahlte Booking-Slots nur zu festen Apple-Preispunkten.
  if (priceCents > 0 && !isAllowedOneTimePriceCents(priceCents)) {
    return { error: await tErr("priceNotAllowed") };
  }

  await prisma.bookingSlot.create({
    data: {
      tenantId: tenant.id,
      spaceId: space.id,
      hostId: user.id,
      title,
      startsAt,
      durationMin: Math.max(5, Math.floor(Number(fd.get("durationMin") || 30) || 30)),
      priceCents,
      capacity: Math.max(1, Math.floor(Number(fd.get("capacity") || 1) || 1)),
    },
  });
  revalidatePath(`/dashboard/${slug}/spaces/${space.slug}`);
  revalidatePath(`/c/${slug}/s/${space.slug}`);
  return ok;
}

export async function deleteBookingSlotAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const slotId = String(fd.get("slotId"));
  const spaceSlug = String(fd.get("spaceSlug") || "");
  const slot = await prisma.bookingSlot.findFirst({ where: { id: slotId, tenantId: tenant.id } });
  if (slot) await prisma.bookingSlot.delete({ where: { id: slot.id } });
  revalidatePath(`/dashboard/${slug}/spaces/${spaceSlug}`);
  revalidatePath(`/c/${slug}/s/${spaceSlug}`);
}

/** Member reserves a slot; paid slots route through Stripe, capacity enforced. */
export async function reserveBookingAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const spaceSlug = String(fd.get("space") || "");
  const slotId = String(fd.get("slotId"));
  const back = spaceSlug ? `/c/${slug}/s/${spaceSlug}` : `/c/${slug}`;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(back)}`);
  const tenant = await tenantBySlug(slug);
  if (!tenant) return;
  const membership = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user!.id } },
  });
  if (membership?.status !== "ACTIVE") redirect(`/c/${slug}/join`);

  const slot = await prisma.bookingSlot.findFirst({
    where: { id: slotId, tenantId: tenant.id, isPublished: true },
  });
  if (!slot) redirect(back);

  const mine = await prisma.bookingReservation.findFirst({
    where: { slotId: slot.id, userId: user!.id, status: { in: ["CONFIRMED", "PENDING"] } },
  });
  if (mine?.status === "CONFIRMED") redirect(`${back}?reserved=${slot.id}`);
  if (mine?.status === "PENDING" && mine.stripeSessionId) {
    const existing = await retrieveProductCheckoutSession(mine.stripeSessionId);
    if (existing?.status === "open" && existing.url) redirect(existing.url);
    if (existing?.status === "complete") redirect(`${back}?reserved=${slot.id}`);
    if (!existing || existing.status === "expired") {
      await prisma.bookingReservation.updateMany({
        where: {
          id: mine.id,
          status: "PENDING",
          stripeSessionId: mine.stripeSessionId,
        },
        data: { status: "CANCELLED" },
      });
      redirect(`${back}?error=checkout`);
    }
  }

  // Capacity guard: count reservations that hold a seat (confirmed or pending).
  const held = await prisma.bookingReservation.count({
    where: { slotId: slot.id, status: { in: ["CONFIRMED", "PENDING"] } },
  });
  if (!mine && held >= slot.capacity) redirect(`${back}?full=${slot.id}`);

  // Free slot -> confirm immediately.
  if (slot.priceCents <= 0) {
    await prisma.bookingReservation.create({
      data: { tenantId: tenant.id, slotId: slot.id, userId: user!.id, status: "CONFIRMED" },
    });
    redirect(`${back}?reserved=${slot.id}`);
  }

  // Paid slot: create a pending reservation, then check out.
  const reservation = mine ?? await prisma.bookingReservation.create({
    data: { tenantId: tenant.id, slotId: slot.id, userId: user!.id, status: "PENDING" },
  });

  if (features.stripe) {
    const checkout = await createBookingCheckout({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        platformFeePercent: tenant.platformFeePercent,
        stripeAccountId: tenant.stripeAccountId,
      },
      booking: {
        reservationId: reservation.id,
        title: slot.title,
        priceCents: slot.priceCents,
        currency: slot.currency,
      },
      user: { id: user!.id, email: user!.email },
      successUrl: `${env.APP_URL}${back}?reserved=${slot.id}`,
      cancelUrl: `${env.APP_URL}${back}`,
    });
    if (!checkout) {
      await prisma.bookingReservation.delete({ where: { id: reservation.id } });
      redirect(`${back}?error=checkout`);
    }
    await prisma.bookingReservation.updateMany({
      where: {
        id: reservation.id,
        status: "PENDING",
        OR: [
          { stripeSessionId: null },
          { stripeSessionId: checkout.id },
        ],
      },
      data: { stripeSessionId: checkout.id },
    });
    redirect(checkout.url);
  }

  if (!devPaymentFallbackAllowed) {
    await prisma.bookingReservation.delete({ where: { id: reservation.id } });
    redirect(`${back}?error=payments-unavailable`);
  }

  await prisma.order.create({
    data: {
      tenantId: tenant.id,
      userId: user!.id,
      description: `Buchung: ${slot.title}`,
      amountCents: slot.priceCents,
      currency: slot.currency,
      platformFeeCents: platformFeeCents(slot.priceCents, tenant.platformFeePercent),
      status: "PAID",
    },
  });
  await prisma.bookingReservation.update({
    where: { id: reservation.id },
    data: { status: "CONFIRMED" },
  });
  redirect(`${back}?reserved=${slot.id}`);
}
