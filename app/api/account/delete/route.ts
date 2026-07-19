import { NextResponse } from "next/server";
import { getCurrentUser, verifyPassword } from "@/lib/auth";
import { clearSessionCookie } from "@/lib/session";
import { systemPrisma } from "@/lib/prisma";
import { queueUserDeletion } from "@/lib/data-lifecycle";
import { writeAudit } from "@/lib/audit";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

interface DeleteAccountBody {
  password?: unknown;
  confirmation?: unknown;
}

export async function POST(req: Request) {
  if (req.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const ip = await clientIp();
  if (!(await rateLimit(`account-delete:${user.id}:${ip}`, 5, 15 * 60_000))) {
    return NextResponse.json({ error: "too-many-attempts" }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as DeleteAccountBody;
  const password = typeof body.password === "string" ? body.password : "";
  const confirmation =
    typeof body.confirmation === "string" ? body.confirmation.trim() : "";
  if (confirmation.toLowerCase() !== user.email.toLowerCase()) {
    return NextResponse.json({ error: "confirmation-mismatch" }, { status: 400 });
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: "invalid-password" }, { status: 403 });
  }

  const [activeOwnedTenants, pendingOrders, pendingBookings, pendingCheckouts] =
    await Promise.all([
      systemPrisma.tenant.count({
        where: { ownerId: user.id, status: { not: "DELETING" } },
      }),
      systemPrisma.order.count({ where: { userId: user.id, status: "PENDING" } }),
      systemPrisma.bookingReservation.count({
        where: { userId: user.id, status: "PENDING" },
      }),
      systemPrisma.pendingCreatorCheckout.count({
        where: {
          userId: user.id,
          status: { in: ["CREATING", "OPEN"] },
          expiresAt: { gt: new Date() },
        },
      }),
    ]);
  if (activeOwnedTenants) {
    return NextResponse.json(
      { error: "owned-communities-must-be-deleted-first" },
      { status: 409 },
    );
  }
  if (pendingOrders || pendingBookings || pendingCheckouts) {
    return NextResponse.json(
      { error: "pending-payments-or-reservations" },
      { status: 409 },
    );
  }

  const deletionJobId = await queueUserDeletion({
    userId: user.id,
    requestedById: user.id,
    label: user.email,
  });
  await writeAudit({
    actorUserId: user.id,
    action: "user.delete.queued",
    targetType: "User",
    targetId: user.id,
    metadata: { deletionJobId },
  });
  await clearSessionCookie();
  return NextResponse.json(
    { ok: true, status: "DELETING", deletionJobId },
    { status: 202 },
  );
}

