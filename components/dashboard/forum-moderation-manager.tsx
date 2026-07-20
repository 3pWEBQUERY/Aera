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
import { RichTextEditor } from "./rich-text-editor";
import { Textarea } from "@/components/ui/field";
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
  bodyHtml?: string | null;
  pollQuestion?: string | null;
  pollOptions?: string[];
  pollMultiple?: boolean;
  customSlug?: string | null;
  customHtml?: string | null;
  hideComments?: boolean;
  closeComments?: boolean;
  hideLikes?: boolean;
  hideMetaInfo?: boolean;
  hideFromFeatured?: boolean;
  disableTruncation?: boolean;
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

// Seed the rich editor when editing a legacy thread that only has plain text:
// escape it and wrap each non-empty line in a paragraph so it renders as HTML.
function plainToHtml(text: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const paras = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escape(block).replace(/\n/g, "<br>")}</p>`);
  return paras.join("");
}

export function ForumModerationManager({
  slug,
  space,
  threads,
  creator,
}: {
  slug: string;
  space: SpaceInfo;
  threads: ModThread[];
  creator: { name: string; email: string };
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ModThread | null>(null);
  const [nonce, setNonce] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const t = useTranslations("dashboard.forumMod");

  function openCreate() {
    setNonce((n) => n + 1);
    setEditing(null);
    setSettingsOpen(false);
    setCreateOpen(true);
  }
  function openEdit(thread: ModThread) {
    setNonce((n) => n + 1);
    setCreateOpen(false);
    setSettingsOpen(false);
    setEditing(thread);
  }
  function close() {
    setCreateOpen(false);
    setEditing(null);
    setSettingsOpen(false);
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
        headerAction={
          createOpen || editing ? (
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
            >
              <Icon name="settings" size={16} className="text-slate-400" />
              {t("settings")}
            </button>
          ) : null
        }
      >
        <ThreadForm
          key={nonce}
          slug={slug}
          space={space}
          thread={editing ?? undefined}
          creator={creator}
          settingsOpen={settingsOpen}
          onCloseSettings={() => setSettingsOpen(false)}
          onDone={close}
        />
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
  creator,
  settingsOpen,
  onCloseSettings,
  onDone,
}: {
  slug: string;
  space: SpaceInfo;
  thread?: ModThread;
  creator: { name: string; email: string };
  settingsOpen: boolean;
  onCloseSettings: () => void;
  onDone: () => void;
}) {
  const isEdit = !!thread;
  const [state, action, pending] = useActionState(isEdit ? updatePostAction : createSpacePostAction, initial);
  const t = useTranslations("dashboard.forumMod");
  const seededOptions =
    thread?.pollOptions && thread.pollOptions.length >= 2 ? thread.pollOptions : ["", ""];
  const [pollActive, setPollActive] = useState(!!thread?.pollQuestion);
  const [pollQuestion, setPollQuestion] = useState(thread?.pollQuestion ?? "");
  const [pollOptions, setPollOptions] = useState<string[]>(seededOptions);
  const [pollMultiple, setPollMultiple] = useState(!!thread?.pollMultiple);
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);
  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="tenant" value={slug} />
      {/* The forum composer always owns the post's poll, so the action knows to
          set it (when present) or clear it (when the editor was left empty). */}
      <input type="hidden" name="pollControl" value="1" />
      <input type="hidden" name="settingsControl" value="1" />
      {isEdit ? (
        <>
          <input type="hidden" name="postId" value={thread!.id} />
          <input type="hidden" name="spaceSlug" value={space.slug} />
        </>
      ) : (
        <input type="hidden" name="spaceId" value={space.id} />
      )}

      <RichTextEditor
        variant="seamless"
        tenant={slug}
        name="bodyHtml"
        defaultHtml={thread?.bodyHtml || (thread?.body ? plainToHtml(thread.body) : "")}
        placeholder={t("bodyPlaceholder")}
        pollActive={pollActive}
        onPollClick={() => setPollActive((v) => !v)}
        titleSlot={
          <>
            {state.error && (
              <div className="mb-4">
                <FormError message={state.error} />
              </div>
            )}
            <input
              name="title"
              required
              defaultValue={thread?.title ?? ""}
              placeholder={t("titlePlaceholder")}
              aria-label={t("titleLabel")}
              className="w-full border-0 bg-transparent p-0 text-2xl font-bold leading-tight text-slate-900 outline-none placeholder:text-slate-300 focus:ring-0 sm:text-[28px]"
            />
            {pollActive && (
              <PollEditor
                t={t}
                question={pollQuestion}
                setQuestion={setPollQuestion}
                options={pollOptions}
                setOptions={setPollOptions}
                multiple={pollMultiple}
                setMultiple={setPollMultiple}
                onRemove={() => setPollActive(false)}
              />
            )}
          </>
        }
      />

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3.5 sm:px-6">
        <p className="inline-flex min-w-0 items-center gap-1.5 text-xs text-slate-500">
          <Icon name="forum" size={14} className="shrink-0 text-slate-400" />
          <span className="truncate">{t("postingIn", { space: space.name })}</span>
        </p>
        <div className="flex shrink-0 items-center gap-2.5">
          <button type="button" onClick={onDone} className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100">{t("cancel")}</button>
          <button type="submit" disabled={pending} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50">
            {pending ? t("saving") : isEdit ? t("saveChanges") : t("sheetCreate")}
          </button>
        </div>
      </div>

      <SettingsPanel
        t={t}
        thread={thread}
        creator={creator}
        slug={slug}
        spaceSlug={space.slug}
        open={settingsOpen}
        onClose={onCloseSettings}
      />
    </form>
  );
}

function PollEditor({
  t,
  question,
  setQuestion,
  options,
  setOptions,
  multiple,
  setMultiple,
  onRemove,
}: {
  t: ReturnType<typeof useTranslations>;
  question: string;
  setQuestion: (v: string) => void;
  options: string[];
  setOptions: (v: string[]) => void;
  multiple: boolean;
  setMultiple: (v: boolean) => void;
  onRemove: () => void;
}) {
  const canAdd = options.length < 10;
  return (
    <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      {/* Presence of this input tells the action a poll was authored. */}
      <input type="hidden" name="hasPoll" value="1" />
      <div className="mb-3 flex items-center justify-between">
        <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <Icon name="gamification" size={15} className="text-violet-500" />
          {t("pollTitle")}
        </p>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs font-medium text-slate-400 transition hover:text-red-600"
        >
          {t("pollRemove")}
        </button>
      </div>
      <input
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        name="pollQuestion"
        placeholder={t("pollQuestionPlaceholder")}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
      />
      <div className="mt-2.5 space-y-2">
        {options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-300 text-[10px] font-semibold text-slate-400">
              {i + 1}
            </span>
            <input
              value={opt}
              onChange={(e) => setOptions(options.map((o, idx) => (idx === i ? e.target.value : o)))}
              name="pollOption"
              placeholder={t("pollOptionPlaceholder")}
              className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
            />
            {options.length > 2 && (
              <button
                type="button"
                onClick={() => setOptions(options.filter((_, idx) => idx !== i))}
                aria-label={t("pollRemove")}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
              >
                <Icon name="close" size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        {canAdd ? (
          <button
            type="button"
            onClick={() => setOptions([...options, ""])}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-600 transition hover:text-violet-700"
          >
            <Icon name="plus" size={14} />
            {t("pollAddOption")}
          </button>
        ) : (
          <span />
        )}
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600">
          <input
            type="checkbox"
            name="pollMultiple"
            checked={multiple}
            onChange={(e) => setMultiple(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
          />
          {t("pollMultipleLabel")}
        </label>
      </div>
    </div>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="mb-4 text-sm font-bold text-slate-900">{title}</h3>
      <div className="space-y-3.5">{children}</div>
    </div>
  );
}

function SettingsRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className="shrink-0 text-sm text-slate-700">{label}</span>
      <div className="w-full sm:w-72">{children}</div>
    </div>
  );
}

function SettingsToggle({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4">
      <span className="text-sm text-slate-700">{label}</span>
      <span className="relative inline-flex shrink-0">
        <input type="checkbox" name={name} defaultChecked={defaultChecked} className="peer sr-only" />
        <span className="h-5 w-9 rounded-full bg-slate-200 transition peer-checked:bg-slate-900 peer-focus-visible:ring-2 peer-focus-visible:ring-violet-300" />
        <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition peer-checked:translate-x-4" />
      </span>
    </label>
  );
}

/**
 * Post-settings screen that slides in over the composer. It lives inside the
 * form (so its fields submit with the topic) and is only visible when `open`;
 * when closed it sits off-screen to the right.
 */
function SettingsPanel({
  t,
  thread,
  creator,
  slug,
  spaceSlug,
  open,
  onClose,
}: {
  t: ReturnType<typeof useTranslations>;
  thread?: ModThread;
  creator: { name: string; email: string };
  slug: string;
  spaceSlug: string;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <div
      aria-hidden={!open}
      className={`fixed inset-0 z-[80] flex flex-col bg-white transition-transform duration-300 ease-out ${open ? "translate-x-0" : "pointer-events-none translate-x-full"}`}
    >
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-4 sm:px-5">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onClose}
            aria-label={t("back")}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <Icon name="chevron" size={20} className="rotate-90" />
          </button>
          <h2 className="text-base font-bold text-slate-900">{t("settingsTitle")}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98]"
        >
          {t("done")}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/60">
        <div className="mx-auto w-full max-w-xl space-y-5 px-5 py-8 sm:px-6">
          <SettingsSection title={t("secPublishing")}>
            <SettingsRow label={t("customSlug")}>
              <div className="flex items-center overflow-hidden rounded-lg border border-slate-300 focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-200">
                <span className="whitespace-nowrap bg-slate-50 px-2.5 py-2 text-xs text-slate-400">
                  /c/{slug}/…/{spaceSlug}/
                </span>
                <input
                  name="customSlug"
                  defaultValue={thread?.customSlug ?? ""}
                  placeholder={t("customSlugPlaceholder")}
                  className="min-w-0 flex-1 bg-white px-2.5 py-2 text-sm outline-none"
                />
              </div>
            </SettingsRow>
            <SettingsRow label={t("author")}>
              <div className="truncate rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-600" title={`${creator.name} (${creator.email})`}>
                {creator.name} ({creator.email})
              </div>
            </SettingsRow>
          </SettingsSection>

          <SettingsSection title={t("secEngagement")}>
            <SettingsToggle name="hideComments" label={t("hideComments")} defaultChecked={!!thread?.hideComments} />
            <SettingsToggle name="closeComments" label={t("closeComments")} defaultChecked={!!thread?.closeComments} />
            <SettingsToggle name="hideLikes" label={t("hideLikes")} defaultChecked={!!thread?.hideLikes} />
          </SettingsSection>

          <SettingsSection title={t("secDisplay")}>
            <SettingsToggle name="hideMetaInfo" label={t("hideMetaInfo")} defaultChecked={!!thread?.hideMetaInfo} />
            <SettingsToggle name="hideFromFeatured" label={t("hideFromFeatured")} defaultChecked={!!thread?.hideFromFeatured} />
            <SettingsToggle name="disableTruncation" label={t("disableTruncation")} defaultChecked={!!thread?.disableTruncation} />
          </SettingsSection>

          <SettingsSection title={t("secAdvanced")}>
            <div>
              <label htmlFor="ft-customhtml" className="mb-1.5 block text-sm font-medium text-slate-700">
                {t("customHtml")}
              </label>
              <textarea
                id="ft-customhtml"
                name="customHtml"
                defaultValue={thread?.customHtml ?? ""}
                rows={5}
                spellCheck={false}
                placeholder="<!-- Insert your code here -->"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-800 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
              />
              <p className="mt-1.5 text-xs text-slate-400">{t("customHtmlHint")}</p>
            </div>
          </SettingsSection>
        </div>
      </div>
    </div>
  );
}
