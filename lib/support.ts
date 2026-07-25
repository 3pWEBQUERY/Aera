import "server-only";
import { systemPrisma } from "./prisma";
import type { SupportTicketStatus } from "@/app/generated/prisma/client";

/**
 * Support tickets.
 *
 * Everything runs on the privileged client: the tables carry no tenantId, so
 * there is no tenant context to scope them by. Ownership is enforced here
 * instead — every read for a member is filtered by `userId`, never by an id
 * the browser supplied on its own.
 *
 * Unread is derived, not stored: a message is unread for us while it came from
 * outside and has no staff read mark, and unread for the member in the mirror
 * case. That keeps the badge honest even if a write is missed.
 */

export const SUBJECT_MAX = 120;
export const BODY_MAX = 5000;
const LIST_LIMIT = 100;

export interface TicketMessageView {
  id: string;
  body: string;
  fromStaff: boolean;
  authorName: string | null;
  createdAt: string;
  unread: boolean;
}

export interface TicketView {
  id: string;
  subject: string;
  status: SupportTicketStatus;
  email: string;
  name: string | null;
  isGuest: boolean;
  createdAt: string;
  lastMessageAt: string;
  messageCount: number;
  unreadCount: number;
  messages: TicketMessageView[];
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase().slice(0, 200);
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

// ---------------------------------------------------------------- writing

export async function createTicket(input: {
  userId: string | null;
  email: string;
  name: string | null;
  subject: string;
  body: string;
}): Promise<{ id: string }> {
  const now = new Date();
  const ticket = await systemPrisma.supportTicket.create({
    data: {
      userId: input.userId,
      email: normalizeEmail(input.email),
      name: input.name?.trim().slice(0, 120) || null,
      subject: input.subject.trim().slice(0, SUBJECT_MAX),
      lastMessageAt: now,
      messages: {
        create: {
          body: input.body.trim().slice(0, BODY_MAX),
          fromStaff: false,
          authorId: input.userId,
          // Der Absender hat seine eigene Nachricht offensichtlich gelesen.
          readByUserAt: now,
        },
      },
    },
    select: { id: true },
  });
  return ticket;
}

/** Reply from the member. Reopens the ticket — the ball is back with us. */
export async function replyAsUser(input: {
  ticketId: string;
  userId: string;
  body: string;
}): Promise<boolean> {
  const now = new Date();
  // Ownership im Where, nicht im Vorher-Check: sonst waere zwischen Pruefung
  // und Schreiben ein Fenster offen.
  const owned = await systemPrisma.supportTicket.findFirst({
    where: { id: input.ticketId, userId: input.userId },
    select: { id: true },
  });
  if (!owned) return false;

  await systemPrisma.$transaction([
    systemPrisma.supportMessage.create({
      data: {
        ticketId: owned.id,
        body: input.body.trim().slice(0, BODY_MAX),
        fromStaff: false,
        authorId: input.userId,
        readByUserAt: now,
      },
    }),
    systemPrisma.supportTicket.update({
      where: { id: owned.id },
      data: { status: "OPEN", lastMessageAt: now },
    }),
  ]);
  return true;
}

/** Reply from the platform team. */
export async function replyAsStaff(input: {
  ticketId: string;
  staffUserId: string;
  body: string;
  close?: boolean;
}): Promise<boolean> {
  const now = new Date();
  const ticket = await systemPrisma.supportTicket.findUnique({
    where: { id: input.ticketId },
    select: { id: true },
  });
  if (!ticket) return false;

  await systemPrisma.$transaction([
    systemPrisma.supportMessage.create({
      data: {
        ticketId: ticket.id,
        body: input.body.trim().slice(0, BODY_MAX),
        fromStaff: true,
        authorId: input.staffUserId,
        readByStaffAt: now,
      },
    }),
    systemPrisma.supportTicket.update({
      where: { id: ticket.id },
      data: {
        status: input.close ? "CLOSED" : "ANSWERED",
        lastMessageAt: now,
      },
    }),
    // Antworten heisst gelesen haben.
    systemPrisma.supportMessage.updateMany({
      where: { ticketId: ticket.id, fromStaff: false, readByStaffAt: null },
      data: { readByStaffAt: now },
    }),
  ]);
  return true;
}

export async function setTicketStatus(
  ticketId: string,
  status: SupportTicketStatus,
): Promise<void> {
  await systemPrisma.supportTicket.updateMany({
    where: { id: ticketId },
    data: { status },
  });
}

// ---------------------------------------------------------------- reading

function toView(
  ticket: {
    id: string;
    subject: string;
    status: SupportTicketStatus;
    email: string;
    name: string | null;
    userId: string | null;
    createdAt: Date;
    lastMessageAt: Date;
    messages: {
      id: string;
      body: string;
      fromStaff: boolean;
      createdAt: Date;
      readByStaffAt: Date | null;
      readByUserAt: Date | null;
      author: { name: string } | null;
    }[];
  },
  side: "staff" | "user",
): TicketView {
  const messages = ticket.messages.map((m) => ({
    id: m.id,
    body: m.body,
    fromStaff: m.fromStaff,
    authorName: m.author?.name ?? null,
    createdAt: m.createdAt.toISOString(),
    unread:
      side === "staff"
        ? !m.fromStaff && m.readByStaffAt === null
        : m.fromStaff && m.readByUserAt === null,
  }));
  return {
    id: ticket.id,
    subject: ticket.subject,
    status: ticket.status,
    email: ticket.email,
    name: ticket.name,
    isGuest: ticket.userId === null,
    createdAt: ticket.createdAt.toISOString(),
    lastMessageAt: ticket.lastMessageAt.toISOString(),
    messageCount: messages.length,
    unreadCount: messages.filter((m) => m.unread).length,
    messages,
  };
}

const MESSAGE_SELECT = {
  id: true,
  body: true,
  fromStaff: true,
  createdAt: true,
  readByStaffAt: true,
  readByUserAt: true,
  author: { select: { name: true } },
} as const;

/** Every ticket of one member, newest activity first. */
export async function listUserTickets(userId: string): Promise<TicketView[]> {
  const rows = await systemPrisma.supportTicket.findMany({
    where: { userId },
    orderBy: { lastMessageAt: "desc" },
    take: LIST_LIMIT,
    include: { messages: { orderBy: { createdAt: "asc" }, select: MESSAGE_SELECT } },
  });
  return rows.map((r) => toView(r, "user"));
}

export async function listAllTickets(
  status?: SupportTicketStatus,
): Promise<TicketView[]> {
  const rows = await systemPrisma.supportTicket.findMany({
    where: status ? { status } : undefined,
    orderBy: { lastMessageAt: "desc" },
    take: LIST_LIMIT,
    include: { messages: { orderBy: { createdAt: "asc" }, select: MESSAGE_SELECT } },
  });
  return rows.map((r) => toView(r, "staff"));
}

// ------------------------------------------------------------------ badges

/** Messages waiting for the platform team. Drives the admin sidebar dot. */
export async function staffUnreadCount(): Promise<number> {
  return systemPrisma.supportMessage.count({
    where: { fromStaff: false, readByStaffAt: null },
  });
}

/** Replies waiting for this member. Drives the account badge. */
export async function userUnreadCount(userId: string): Promise<number> {
  return systemPrisma.supportMessage.count({
    where: { fromStaff: true, readByUserAt: null, ticket: { userId } },
  });
}

/** Called when a side actually opens the thread list. */
export async function markReadForUser(userId: string): Promise<void> {
  await systemPrisma.supportMessage.updateMany({
    where: { fromStaff: true, readByUserAt: null, ticket: { userId } },
    data: { readByUserAt: new Date() },
  });
}

export async function markReadForStaff(ticketId?: string): Promise<void> {
  await systemPrisma.supportMessage.updateMany({
    where: {
      fromStaff: false,
      readByStaffAt: null,
      ...(ticketId ? { ticketId } : {}),
    },
    data: { readByStaffAt: new Date() },
  });
}
