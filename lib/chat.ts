import "server-only";
import { randomUUID } from "node:crypto";
import prisma from "./prisma";

/**
 * Chat spaces (SpaceType `CHAT`).
 *
 * A chat space is an ordinary Space; its messages live in `ChatMessage` keyed by
 * `spaceId`. Access is governed by the space's own visibility / entitlement gate
 * (see `canAccess`), exactly like every other space type — there is no separate
 * membership model. Every query is tenant-scoped.
 */

const MAX_BODY = 4000;
const PAGE = 80;

export interface ChatUser {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface ChatMessageRow {
  id: string;
  body: string;
  createdAt: string; // ISO
  user: ChatUser;
}

function toRow(m: {
  id: string;
  body: string;
  createdAt: Date;
  user: { id: string; name: string; avatarUrl: string | null };
}): ChatMessageRow {
  return {
    id: m.id,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
    user: m.user,
  };
}

/** Most recent messages for a chat space, returned oldest → newest. */
export async function fetchSpaceMessages(
  tenantId: string,
  spaceId: string,
  limit = PAGE,
): Promise<ChatMessageRow[]> {
  const rows = await prisma.chatMessage.findMany({
    where: { tenantId, spaceId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
  });
  return rows.map(toRow).reverse();
}

/** New messages strictly after `afterIso` (ascending) — used for polling. */
export async function fetchSpaceMessagesSince(
  tenantId: string,
  spaceId: string,
  afterIso: string,
): Promise<ChatMessageRow[]> {
  const after = new Date(afterIso);
  if (Number.isNaN(after.getTime())) return [];
  const rows = await prisma.chatMessage.findMany({
    where: { tenantId, spaceId, createdAt: { gt: after } },
    orderBy: { createdAt: "asc" },
    take: 200,
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
  });
  return rows.map(toRow);
}

/** Persist a message and return it (with author) for optimistic rendering. */
export async function insertSpaceMessage(
  tenantId: string,
  spaceId: string,
  userId: string,
  rawBody: string,
  maxLen: number = MAX_BODY,
): Promise<ChatMessageRow | null> {
  const body = rawBody.trim().slice(0, Math.max(1, maxLen));
  if (!body) return null;
  const m = await prisma.chatMessage.create({
    data: { tenantId, spaceId, userId, body },
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
  });
  return toRow(m);
}

/** Timestamp of a member's most recent message in a space (for slow mode). */
export async function lastMessageAt(
  tenantId: string,
  spaceId: string,
  userId: string,
): Promise<Date | null> {
  const m = await prisma.chatMessage.findFirst({
    where: { tenantId, spaceId, userId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return m?.createdAt ?? null;
}

// ---------------------------------------------------------------- Admin / stats
export interface ChatStats {
  messageCount: number;
  participantCount: number;
  lastAt: string | null;
}

export async function chatStats(tenantId: string, spaceId: string): Promise<ChatStats> {
  const [messageCount, participants, last] = await Promise.all([
    prisma.chatMessage.count({ where: { tenantId, spaceId } }),
    prisma.chatMessage.findMany({
      where: { tenantId, spaceId },
      distinct: ["userId"],
      select: { userId: true },
    }),
    prisma.chatMessage.findFirst({
      where: { tenantId, spaceId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);
  return {
    messageCount,
    participantCount: participants.length,
    lastAt: last ? last.createdAt.toISOString() : null,
  };
}

/** Newest-first messages for the moderation view. */
export async function recentMessagesForAdmin(
  tenantId: string,
  spaceId: string,
  limit = 40,
): Promise<ChatMessageRow[]> {
  const rows = await prisma.chatMessage.findMany({
    where: { tenantId, spaceId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
  });
  return rows.map(toRow);
}

// ================================================================ Direct messages
// 1:1 conversations between two community members. Group chats are CHAT spaces
// (see above); direct messages live in Conversation(kind = "DIRECT").

export interface HubThread {
  kind: "GROUP" | "DIRECT";
  /** Space slug for groups · conversation id for DMs. */
  id: string;
  title: string;
  avatarColor: string | null; // groups
  otherAvatar: string | null; // DMs
  lastBody: string | null;
  lastAt: string | null; // ISO
  unread: boolean;
}

const DM_COLORS = ["#2563eb", "#7c3aed", "#db2777", "#ea580c", "#059669", "#0891b2"];

export function groupColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  return DM_COLORS[Math.abs(h) % DM_COLORS.length];
}

export interface HubGroupInput {
  spaceId: string;
  slug: string;
  name: string;
}

/** Unified inbox list: accessible group chats + the member's direct messages. */
export async function listHubThreads(
  tenantId: string,
  userId: string,
  groups: HubGroupInput[],
): Promise<HubThread[]> {
  const groupIds = groups.map((g) => g.spaceId);
  const [groupLasts, dmConvos] = await Promise.all([
    groupIds.length
      ? prisma.chatMessage.findMany({
          where: { tenantId, spaceId: { in: groupIds } },
          orderBy: { createdAt: "desc" },
          distinct: ["spaceId"],
          select: { spaceId: true, body: true, createdAt: true },
        })
      : Promise.resolve([] as { spaceId: string | null; body: string; createdAt: Date }[]),
    prisma.conversation.findMany({
      where: { tenantId, kind: "DIRECT", members: { some: { userId } } },
      include: {
        members: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
        messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, createdAt: true } },
      },
    }),
  ]);

  const lastBySpace = new Map<string, { body: string; createdAt: Date }>();
  for (const m of groupLasts) if (m.spaceId) lastBySpace.set(m.spaceId, { body: m.body, createdAt: m.createdAt });

  const out: HubThread[] = [];

  for (const g of groups) {
    const last = lastBySpace.get(g.spaceId) ?? null;
    out.push({
      kind: "GROUP",
      id: g.slug,
      title: g.name,
      avatarColor: groupColor(g.slug),
      otherAvatar: null,
      lastBody: last?.body ?? null,
      lastAt: last ? last.createdAt.toISOString() : null,
      unread: false,
    });
  }

  for (const c of dmConvos) {
    const me = c.members.find((m) => m.userId === userId);
    const other = c.members.find((m) => m.userId !== userId);
    if (!other) continue;
    const last = c.messages[0] ?? null;
    out.push({
      kind: "DIRECT",
      id: c.id,
      title: other.user.name,
      avatarColor: null,
      otherAvatar: other.user.avatarUrl,
      lastBody: last?.body ?? null,
      lastAt: last ? last.createdAt.toISOString() : null,
      unread: !!last && (!me?.lastReadAt || last.createdAt > me.lastReadAt),
    });
  }

  out.sort((a, b) => {
    if (a.lastAt && b.lastAt) return a.lastAt < b.lastAt ? 1 : -1;
    if (a.lastAt) return -1;
    if (b.lastAt) return 1;
    return a.title.localeCompare(b.title);
  });
  return out;
}

export async function isDirectMember(
  tenantId: string,
  conversationId: string,
  userId: string,
): Promise<boolean> {
  const m = await prisma.conversationMember.findFirst({
    where: { tenantId, conversationId, userId },
    select: { id: true },
  });
  return !!m;
}

export interface DirectThread {
  id: string;
  otherUser: ChatUser;
  messages: ChatMessageRow[];
}

export async function getDirectThread(
  tenantId: string,
  userId: string,
  conversationId: string,
  limit = 80,
): Promise<DirectThread | null> {
  const convo = await prisma.conversation.findFirst({
    where: { id: conversationId, tenantId, kind: "DIRECT", members: { some: { userId } } },
    include: { members: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } } },
  });
  if (!convo) return null;
  const other = convo.members.find((m) => m.userId !== userId);
  if (!other) return null;

  const rows = await prisma.chatMessage.findMany({
    where: { tenantId, conversationId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
  });
  await markDirectRead(tenantId, conversationId, userId);
  return {
    id: convo.id,
    otherUser: other.user,
    messages: rows.map(toRow).reverse(),
  };
}

export async function fetchDirectSince(
  tenantId: string,
  conversationId: string,
  afterIso: string,
): Promise<ChatMessageRow[]> {
  const after = new Date(afterIso);
  if (Number.isNaN(after.getTime())) return [];
  const rows = await prisma.chatMessage.findMany({
    where: { tenantId, conversationId, createdAt: { gt: after } },
    orderBy: { createdAt: "asc" },
    take: 200,
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
  });
  return rows.map(toRow);
}

export async function insertDirectMessage(
  tenantId: string,
  conversationId: string,
  userId: string,
  rawBody: string,
): Promise<ChatMessageRow | null> {
  const body = rawBody.trim().slice(0, MAX_BODY);
  if (!body) return null;
  const m = await prisma.chatMessage.create({
    data: { tenantId, conversationId, userId, body },
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
  });
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: new Date() },
  });
  await markDirectRead(tenantId, conversationId, userId);
  return toRow(m);
}

async function markDirectRead(tenantId: string, conversationId: string, userId: string): Promise<void> {
  await prisma.conversationMember.updateMany({
    where: { tenantId, conversationId, userId },
    data: { lastReadAt: new Date() },
  });
}

/** Find (or create) the DM thread between two members. */
export async function findOrCreateDirect(
  tenantId: string,
  meId: string,
  otherId: string,
): Promise<string> {
  const existing = await prisma.conversation.findFirst({
    where: {
      tenantId,
      kind: "DIRECT",
      AND: [
        { members: { some: { userId: meId } } },
        { members: { some: { userId: otherId } } },
      ],
    },
    select: { id: true },
  });
  if (existing) return existing.id;

  const convo = await prisma.conversation.create({
    data: {
      tenantId,
      kind: "DIRECT",
      createdById: meId,
      members: {
        create: [
          { id: randomUUID(), tenantId, userId: meId },
          { id: randomUUID(), tenantId, userId: otherId },
        ],
      },
    },
    select: { id: true },
  });
  return convo.id;
}
