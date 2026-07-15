import prisma from "@/lib/prisma";
import { jsonError, jsonOk, requireMobileAuth, resolveTenant } from "@/lib/mobile/api";

// POST /api/mobile/v1/c/{slug}/booking/{slotId}/reserve → { status: "CONFIRMED" }
// Nur freie Slots — bezahlte Slots laufen über den IAP-Flow (/iap/validate,
// kind "booking"). Logik gespiegelt aus reserveBookingAction
// (app/actions/booking.ts, Free-Pfad) inkl. Kapazitäts-Guard.

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string; slotId: string }> },
) {
  const { slug, slotId } = await params;
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;
  const user = auth.user;

  const tenant = await resolveTenant(slug);
  if (!tenant) return jsonError("not_found", "Community not found.", 404);

  const membership = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
  });
  if (membership?.status !== "ACTIVE") {
    return jsonError("not_member", "Active membership required.", 403);
  }

  const slot = await prisma.bookingSlot.findFirst({
    where: { id: slotId, tenantId: tenant.id, isPublished: true },
  });
  if (!slot) return jsonError("not_found", "Booking slot not found.", 404);

  // Bezahlte Slots laufen ausschließlich über den IAP-Flow.
  if (slot.priceCents > 0) {
    return jsonError(
      "payment_required",
      "This slot is paid — purchase it via in-app purchase.",
      409,
    );
  }

  const mine = await prisma.bookingReservation.findFirst({
    where: { slotId: slot.id, userId: user.id, status: { in: ["CONFIRMED", "PENDING"] } },
  });
  if (mine) return jsonOk({ status: "CONFIRMED" });

  // Kapazitäts-Guard: belegte Plätze = CONFIRMED + PENDING.
  const held = await prisma.bookingReservation.count({
    where: { slotId: slot.id, status: { in: ["CONFIRMED", "PENDING"] } },
  });
  if (held >= slot.capacity) {
    return jsonError("validation", "This slot is fully booked.", 409);
  }

  await prisma.bookingReservation.create({
    data: { tenantId: tenant.id, slotId: slot.id, userId: user.id, status: "CONFIRMED" },
  });
  return jsonOk({ status: "CONFIRMED" });
}
