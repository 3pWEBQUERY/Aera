"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { requirePlatformAdmin } from "@/lib/guards";
import { rateLimit } from "@/lib/rate-limit";
import { writeAudit } from "@/lib/audit";
import { tErr } from "@/lib/action-errors";
import {
  BODY_MAX,
  SUBJECT_MAX,
  createTicket,
  isValidEmail,
  markReadForStaff,
  replyAsStaff,
  replyAsUser,
  setTicketStatus,
} from "@/lib/support";

export interface SupportState {
  error?: string;
  ok?: boolean;
  /** Nur beim Anlegen gesetzt — die UI zeigt danach eine Bestätigung. */
  created?: boolean;
}

async function clientKey(): Promise<string> {
  const head = await headers();
  return (
    head.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    head.get("x-real-ip") ||
    "anonymous"
  );
}

/**
 * Ticket anlegen. Bewusst auch für Ausgeloggte: die Hilfe-Seite ist öffentlich
 * und wer nicht hineinkommt, kann sich sonst gerade nicht melden.
 */
export async function createTicketAction(
  _prev: SupportState,
  fd: FormData,
): Promise<SupportState> {
  const user = await getCurrentUser();

  // Gäste sind das Missbrauchsrisiko, deshalb pro Absender-IP gedeckelt.
  const key = user ? `support:new:${user.id}` : `support:new:${await clientKey()}`;
  if (!(await rateLimit(key, user ? 20 : 5, 60 * 60_000))) {
    return { error: await tErr("tooManyRequests") };
  }

  const subject = String(fd.get("subject") || "").trim();
  const body = String(fd.get("body") || "").trim();
  // Eingeloggte schreiben immer an ihre verifizierte Adresse — ein Feld im
  // Formular liesse sich fälschen und wir würden an Fremde antworten.
  const email = user ? user.email : String(fd.get("email") || "").trim();
  const name = user ? user.name : String(fd.get("name") || "").trim() || null;

  if (subject.length < 3 || subject.length > SUBJECT_MAX) {
    return { error: await tErr("supportSubjectInvalid") };
  }
  if (body.length < 10 || body.length > BODY_MAX) {
    return { error: await tErr("supportBodyInvalid") };
  }
  if (!isValidEmail(email)) return { error: await tErr("validEmail") };

  const ticket = await createTicket({
    userId: user?.id ?? null,
    email,
    name,
    subject,
    body,
  });

  await writeAudit({
    actorUserId: user?.id ?? null,
    action: "support.ticket.create",
    targetType: "SupportTicket",
    targetId: ticket.id,
    metadata: { guest: !user },
  });

  revalidatePath("/admin/support");
  revalidatePath("/admin");
  if (user) revalidatePath("/member/account");
  return { ok: true, created: true };
}

/** Antwort des Mitglieds im eigenen Ticket. */
export async function replyTicketAction(
  _prev: SupportState,
  fd: FormData,
): Promise<SupportState> {
  const user = await getCurrentUser();
  if (!user) return { error: await tErr("notLoggedIn") };
  if (!(await rateLimit(`support:reply:${user.id}`, 60, 60 * 60_000))) {
    return { error: await tErr("tooManyRequests") };
  }

  const body = String(fd.get("body") || "").trim();
  if (body.length < 2 || body.length > BODY_MAX) {
    return { error: await tErr("supportBodyInvalid") };
  }

  // replyAsUser prüft die Zugehörigkeit selbst — ein fremdes Ticket ist von
  // hier aus nicht erreichbar, egal welche id gepostet wird.
  const ok = await replyAsUser({
    ticketId: String(fd.get("ticketId") || ""),
    userId: user.id,
    body,
  });
  if (!ok) return { error: await tErr("noAccess") };

  revalidatePath("/member/account");
  revalidatePath("/admin/support");
  revalidatePath("/admin");
  return { ok: true };
}

/** Antwort des Plattform-Teams. */
export async function replyStaffAction(
  _prev: SupportState,
  fd: FormData,
): Promise<SupportState> {
  const admin = await requirePlatformAdmin();
  const body = String(fd.get("body") || "").trim();
  if (body.length < 2 || body.length > BODY_MAX) {
    return { error: await tErr("supportBodyInvalid") };
  }

  const ok = await replyAsStaff({
    ticketId: String(fd.get("ticketId") || ""),
    staffUserId: admin.id,
    body,
    close: fd.get("close") === "on",
  });
  if (!ok) return { error: await tErr("invalidInput") };

  await writeAudit({
    actorUserId: admin.id,
    action: "support.ticket.reply",
    targetType: "SupportTicket",
    targetId: String(fd.get("ticketId") || ""),
  });

  revalidatePath("/admin/support");
  revalidatePath("/admin");
  revalidatePath("/member/account");
  return { ok: true };
}

export async function setTicketStatusAction(fd: FormData): Promise<void> {
  await requirePlatformAdmin();
  const status = String(fd.get("status") || "");
  if (status !== "OPEN" && status !== "ANSWERED" && status !== "CLOSED") return;
  await setTicketStatus(String(fd.get("ticketId") || ""), status);
  revalidatePath("/admin/support");
  revalidatePath("/admin");
}

/** Als gelesen markieren, wenn das Team die Liste tatsächlich öffnet. */
export async function markSupportReadAction(fd: FormData): Promise<void> {
  await requirePlatformAdmin();
  await markReadForStaff(String(fd.get("ticketId") || "") || undefined);
  revalidatePath("/admin/support");
  revalidatePath("/admin");
}
