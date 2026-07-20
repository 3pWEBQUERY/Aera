import "server-only";
import { randomUUID } from "node:crypto";
import prisma from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";

/**
 * Poll storage helpers.
 *
 * A poll lives inline on its Post (`pollQuestion` / `pollOptions` /
 * `pollMultiple`) and its votes in `PollVote`. Access goes through raw SQL:
 * the generated Prisma client is not regenerated in every environment, and raw
 * queries keep this feature working without a typed delegate. All queries are
 * explicitly scoped by `tenantId` (raw SQL runs on the privileged connection,
 * so app-level scoping is the isolation boundary here).
 *
 * Reads are defensive: before the migration is applied the columns/table do
 * not exist, so a failed query is treated as "no poll" instead of a crash.
 */

export const POLL_MAX_OPTIONS = 10;
const POLL_MIN_OPTIONS = 2;
const MAX_OPTION_LEN = 120;
const MAX_QUESTION_LEN = 200;

export interface PollDraft {
  question: string;
  options: string[];
  multiple: boolean;
}

export interface PollView {
  question: string;
  multiple: boolean;
  totalVotes: number;
  options: { index: number; label: string; votes: number }[];
  myVotes: number[];
}

type PollRow = {
  pollQuestion: string | null;
  pollOptions: string[] | null;
  pollMultiple: boolean;
};

/**
 * Read the poll fields the composer submits. Returns null when the composer
 * had no active poll or the poll is incomplete (fewer than two real options).
 */
export function parsePollForm(fd: FormData): PollDraft | null {
  if (fd.get("hasPoll") !== "1") return null;
  const question = String(fd.get("pollQuestion") || "").trim().slice(0, MAX_QUESTION_LEN);
  const options = fd
    .getAll("pollOption")
    .map((o) => String(o).trim().slice(0, MAX_OPTION_LEN))
    .filter(Boolean)
    .slice(0, POLL_MAX_OPTIONS);
  const multiple = fd.get("pollMultiple") === "on";
  if (!question || options.length < POLL_MIN_OPTIONS) return null;
  return { question, options, multiple };
}

/** Persist (poll set) or clear (poll null) a post's poll. Tenant-scoped. */
export async function savePostPoll(
  tenantId: string,
  postId: string,
  poll: PollDraft | null,
): Promise<void> {
  try {
    if (poll) {
      await prisma.$executeRaw`
        UPDATE "Post"
        SET "pollQuestion" = ${poll.question},
            "pollOptions" = ${poll.options},
            "pollMultiple" = ${poll.multiple}
        WHERE "id" = ${postId} AND "tenantId" = ${tenantId}`;
    } else {
      await prisma.$executeRaw`
        UPDATE "Post"
        SET "pollQuestion" = NULL,
            "pollOptions" = ARRAY[]::text[],
            "pollMultiple" = false
        WHERE "id" = ${postId} AND "tenantId" = ${tenantId}`;
      await prisma.$executeRaw`
        DELETE FROM "PollVote" WHERE "postId" = ${postId} AND "tenantId" = ${tenantId}`;
    }
  } catch {
    // Poll columns/table not migrated yet — leave the post as-is so the
    // create/update still succeeds.
  }
}

/** The raw poll definition attached to a post, or null. */
export async function getPostPollDraft(
  tenantId: string,
  postId: string,
): Promise<PollDraft | null> {
  try {
    const rows = await prisma.$queryRaw<PollRow[]>`
      SELECT "pollQuestion", "pollOptions", "pollMultiple"
      FROM "Post" WHERE "id" = ${postId} AND "tenantId" = ${tenantId} LIMIT 1`;
    const row = rows[0];
    if (!row?.pollQuestion || !row.pollOptions?.length) return null;
    return { question: row.pollQuestion, options: row.pollOptions, multiple: row.pollMultiple };
  } catch {
    return null;
  }
}

/** Poll drafts for a set of posts (moderation list seeding). Empty on failure. */
export async function getPollDraftsForPosts(
  tenantId: string,
  postIds: string[],
): Promise<Map<string, PollDraft>> {
  const map = new Map<string, PollDraft>();
  if (!postIds.length) return map;
  try {
    const rows = await prisma.$queryRaw<(PollRow & { id: string })[]>`
      SELECT "id", "pollQuestion", "pollOptions", "pollMultiple"
      FROM "Post"
      WHERE "tenantId" = ${tenantId} AND "id" IN (${Prisma.join(postIds)})`;
    for (const r of rows) {
      if (r.pollQuestion && r.pollOptions?.length) {
        map.set(r.id, {
          question: r.pollQuestion,
          options: r.pollOptions,
          multiple: r.pollMultiple,
        });
      }
    }
  } catch {
    // Poll columns not migrated yet.
  }
  return map;
}

/** Full poll view for rendering: labels, per-option counts and the viewer's votes. */
export async function readPostPoll(
  tenantId: string,
  postId: string,
  userId: string | null,
): Promise<PollView | null> {
  try {
    const rows = await prisma.$queryRaw<PollRow[]>`
      SELECT "pollQuestion", "pollOptions", "pollMultiple"
      FROM "Post" WHERE "id" = ${postId} AND "tenantId" = ${tenantId} LIMIT 1`;
    const row = rows[0];
    if (!row?.pollQuestion || !row.pollOptions?.length) return null;

    const counts = await prisma.$queryRaw<{ optionIndex: number; c: bigint }[]>`
      SELECT "optionIndex", COUNT(*)::bigint AS c
      FROM "PollVote"
      WHERE "postId" = ${postId} AND "tenantId" = ${tenantId}
      GROUP BY "optionIndex"`;
    const countMap = new Map<number, number>();
    let total = 0;
    for (const c of counts) {
      const n = Number(c.c);
      countMap.set(Number(c.optionIndex), n);
      total += n;
    }

    let myVotes: number[] = [];
    if (userId) {
      const mine = await prisma.$queryRaw<{ optionIndex: number }[]>`
        SELECT "optionIndex" FROM "PollVote"
        WHERE "postId" = ${postId} AND "tenantId" = ${tenantId} AND "userId" = ${userId}`;
      myVotes = mine.map((m) => Number(m.optionIndex));
    }

    return {
      question: row.pollQuestion,
      multiple: row.pollMultiple,
      totalVotes: total,
      options: row.pollOptions.map((label, index) => ({
        index,
        label,
        votes: countMap.get(index) ?? 0,
      })),
      myVotes,
    };
  } catch {
    return null;
  }
}

/**
 * Replace a member's vote(s) for a post's poll. Single-choice polls keep at
 * most one row; option indices are validated against the poll definition.
 */
export async function castPollVote(
  tenantId: string,
  postId: string,
  userId: string,
  optionIndices: number[],
): Promise<void> {
  const draft = await getPostPollDraft(tenantId, postId);
  if (!draft) return;
  const optionCount = draft.options.length;
  let chosen = [
    ...new Set(
      optionIndices.filter((i) => Number.isInteger(i) && i >= 0 && i < optionCount),
    ),
  ];
  if (!draft.multiple) chosen = chosen.slice(0, 1);

  await prisma.$executeRaw`
    DELETE FROM "PollVote"
    WHERE "postId" = ${postId} AND "tenantId" = ${tenantId} AND "userId" = ${userId}`;
  for (const idx of chosen) {
    await prisma.$executeRaw`
      INSERT INTO "PollVote" ("id", "tenantId", "postId", "userId", "optionIndex", "createdAt")
      VALUES (${randomUUID()}, ${tenantId}, ${postId}, ${userId}, ${idx}, NOW())`;
  }
}
