"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  createSpacePostAction,
  updatePostAction,
  deletePostAction,
  updateCommentAction,
  deleteCommentAction,
  togglePinPostAction,
  type ActionState,
} from "@/app/actions/dashboard";
import { Sheet } from "./sheet";
import { Icon } from "./icons";
import { Input, Label, Textarea } from "@/components/ui/field";
import { Pill, FormError } from "@/components/ui/misc";
import { formatDate, excerpt } from "@/lib/utils";

export interface ModComment {
  id: string;
  body: string;
  authorName: string;
  createdAt: string | Date;
  parentId: string | null;
}
export interface ModThread {
  id: string;
  title: string | null;
  body: string;
  authorName: string;
  createdAt: string | Date;
  isPinned: boolean;
  score: number;
  commentCount: number;
  comments: ModComment[];
}
interface SpaceInfo {
  id: string;
  slug: string;
  name: string;
}

const initial: ActionState = {};

export function ForumModerationManager({
  slug,
  space,
  threads,
}: {
  slug: string;
  space: SpaceInfo;
  threads: ModThread[];
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ModThread | null>(null);
  const [nonce, setNonce] = useState(0);
  const t = useTranslations("dashboard.forumMod");

  function openCreate() {
    setNonce((n) => n + 1);
    setEditing(null);
    setCreateOpen(true);
  }
  function openEdit(thread: ModThread) {
    setNonce((n) => n + 1);
    setCreateOpen(false);
    setEditing(thread);
  }
  function close() {
    setCreateOpen(false);
    setEditing(null);
  }

  const totalComments = threads.reduce((s, th) => s + th.commentCount, 0);
  const pinned = threads.filter((th) => th.isPinned).length;
  const stats = [
    { label: t("statTopics"), value: threads.length },
    { label: t("statComments"), value: totalComments },
    { label: t("statPinned"), value: pinned },
  ];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white">
            <Icon name="forum" size={20} />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">{space.name}</h1>
              <Pill className="bg-slate-100 text-slate-500">{t("badge")}</Pill>
            </div>
            <p className="text-sm text-slate-400">{t("subtitle")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/c/${slug}/s/${space.slug}`} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
            <Icon name="external" size={16} className="text-slate-400" />
            {t("viewForum")}
          </Link>
          <button onClick={openCreate} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98]">
            <Icon name="plus" size={18} />
            {t("createTopic")}
          </button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{s.label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">{t("topics")}</h2>
          <span className="text-xs text-slate-400">{t("totalCount", { count: threads.length })}</span>
        </div>
        {threads.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-slate-500">{t("emptyTopics")}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {threads.map((t) => (
              <ThreadRow key={t.id} slug={slug} space={space} thread={t} onEdit={() => openEdit(t)} />
            ))}
          </ul>
        )}
      </div>

      <Sheet
        open={createOpen || !!editing}
        onClose={close}
        title={editing ? t("sheetEdit") : t("sheetCreate")}
        subtitle={space.name}
        icon="forum"
      >
        <ThreadForm key={nonce} slug={slug} space={space} thread={editing ?? undefined} onDone={close} />
      </Sheet>
    </div>
  );
}

function ThreadRow({
  slug,
  space,
  thread,
  onEdit,
}: {
  slug: string;
  space: SpaceInfo;
  thread: ModThread;
  onEdit: () => void;
}) {
  const [showComments, setShowComments] = useState(false);
  const t = useTranslations("dashboard.forumMod");
  const locale = useLocale();
  return (
    <li className="px-5 py-4">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/c/${slug}/s/${space.slug}/${thread.id}`} className="font-semibold text-slate-900 hover:underline">
              {thread.title || excerpt(thread.body, 70)}
            </Link>
            {thread.isPinned && <Pill className="bg-amber-100 text-amber-700">{t("pinned")}</Pill>}
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            {t.rich("threadBy", {
              author: thread.authorName,
              date: formatDate(thread.createdAt, locale),
              b: (chunks) => <span className="font-medium text-slate-500">{chunks}</span>,
            })}
          </p>
          {thread.title && thread.body && (
            <p className="mt-1 line-clamp-1 text-sm text-slate-500">{excerpt(thread.body, 160)}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <Icon name="gamification" size={13} className="text-slate-400" />
              {t("votes", { count: thread.score })}
            </span>
            <button onClick={() => setShowComments((v) => !v)} className="inline-flex items-center gap-1.5 font-medium text-slate-500 hover:text-slate-800">
              <Icon name="forum" size={13} className="text-slate-400" />
              {t("commentCount", { count: thread.commentCount })}
              <Icon name="chevron" size={12} className={`transition-transform ${showComments ? "rotate-180" : ""}`} />
            </button>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button onClick={onEdit} className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100" title={t("edit")}>
            <Icon name="settings" size={14} className="text-slate-400" />
            {t("edit")}
          </button>
          <form action={togglePinPostAction}>
            <input type="hidden" name="tenant" value={slug} />
            <input type="hidden" name="spaceSlug" value={space.slug} />
            <input type="hidden" name="postId" value={thread.id} />
            <button className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800" title={thread.isPinned ? t("unpin") : t("pin")}>
              <Icon name="tiers" size={14} />
              {thread.isPinned ? t("unpin") : t("pin")}
            </button>
          </form>
          <form action={deletePostAction}>
            <input type="hidden" name="tenant" value={slug} />
            <input type="hidden" name="spaceSlug" value={space.slug} />
            <input type="hidden" name="postId" value={thread.id} />
            <button className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-red-600 transition hover:bg-red-50" title={t("delete")}>
              <Icon name="archive" size={14} />
              {t("delete")}
            </button>
          </form>
        </div>
      </div>

      {showComments && (
        <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3">
          {thread.comments.length === 0 ? (
            <p className="text-xs text-slate-400">{t("noComments")}</p>
          ) : (
            thread.comments.map((c) => (
              <CommentItem key={c.id} slug={slug} space={space} comment={c} />
            ))
          )}
        </div>
      )}
    </li>
  );
}

function CommentItem({ slug, space, comment }: { slug: string; space: SpaceInfo; comment: ModComment }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(updateCommentAction, initial);
  const t = useTranslations("dashboard.forumMod");
  const locale = useLocale();
  useEffect(() => {
    if (state.ok) setEditing(false);
  }, [state.ok]);

  return (
    <div className={comment.parentId ? "ml-5 border-l border-slate-200 pl-3" : ""}>
      {editing ? (
        <form action={action} className="space-y-2">
          <input type="hidden" name="tenant" value={slug} />
          <input type="hidden" name="spaceSlug" value={space.slug} />
          <input type="hidden" name="commentId" value={comment.id} />
          <FormError message={state.error} />
          <Textarea name="body" rows={2} defaultValue={comment.body} required />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-200">{t("cancel")}</button>
            <button type="submit" disabled={pending} className="rounded-md bg-slate-900 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
              {pending ? t("saving") : t("save")}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-slate-400">
              {t.rich("commentBy", {
                author: comment.authorName,
                date: formatDate(comment.createdAt, locale),
                b: (chunks) => <span className="font-medium text-slate-600">{chunks}</span>,
              })}
            </p>
            <p className="text-sm text-slate-700">{comment.body}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button onClick={() => setEditing(true)} className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-200">{t("edit")}</button>
            <form action={deleteCommentAction}>
              <input type="hidden" name="tenant" value={slug} />
              <input type="hidden" name="spaceSlug" value={space.slug} />
              <input type="hidden" name="commentId" value={comment.id} />
              <button className="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100" aria-label={t("commentDeleteAria")}>{t("delete")}</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function ThreadForm({
  slug,
  space,
  thread,
  onDone,
}: {
  slug: string;
  space: SpaceInfo;
  thread?: ModThread;
  onDone: () => void;
}) {
  const isEdit = !!thread;
  const [state, action, pending] = useActionState(isEdit ? updatePostAction : createSpacePostAction, initial);
  const t = useTranslations("dashboard.forumMod");
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);
  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="tenant" value={slug} />
      {isEdit ? (
        <>
          <input type="hidden" name="postId" value={thread!.id} />
          <input type="hidden" name="spaceSlug" value={space.slug} />
        </>
      ) : (
        <input type="hidden" name="spaceId" value={space.id} />
      )}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl space-y-5 px-6 py-10">
          <FormError message={state.error} />
          <div>
            <Label htmlFor="ft-title">{t("titleLabel")}</Label>
            <Input id="ft-title" name="title" required defaultValue={thread?.title ?? ""} placeholder={t("titlePlaceholder")} className="text-base" />
          </div>
          <div>
            <Label htmlFor="ft-body">{t("bodyLabel")}</Label>
            <Textarea id="ft-body" name="body" rows={8} defaultValue={thread?.body ?? ""} placeholder={t("bodyPlaceholder")} />
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
        <button type="button" onClick={onDone} className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100">{t("cancel")}</button>
        <button type="submit" disabled={pending} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50">
          {pending ? t("saving") : isEdit ? t("saveChanges") : t("sheetCreate")}
        </button>
      </div>
    </form>
  );
}
