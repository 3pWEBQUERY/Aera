"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  createStoryAction,
  updateStoryAction,
  deleteStoryAction,
  type ActionState,
} from "@/app/actions/stories";
import { updateStorySettingsAction } from "@/app/actions/dashboard";
import type { StorySettings } from "@/lib/space-settings";
import { Sheet } from "./sheet";
import { Icon } from "./icons";
import { ImageUpload } from "./image-upload";
import { VideoUpload } from "./video-upload";
import { Input, Label } from "@/components/ui/field";
import { FormError, EmptyState } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export interface StoryRow {
  id: string;
  imageUrl: string | null;
  videoUrl: string | null;
  caption: string | null;
  publishAt: string;
  expiresAt: string;
}

interface SpaceInfo {
  id: string;
  slug: string;
  name: string;
}

const initial: ActionState = {};

type Tab = "active" | "scheduled" | "archived";

/** ISO → value for <input type="datetime-local"> in the viewer's local zone. */
function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Whole hours between publish and expiry — used to prefill the lifetime field. */
function ttlHoursOf(story: StoryRow): number {
  const ms = new Date(story.expiresAt).getTime() - new Date(story.publishAt).getTime();
  return Math.max(1, Math.min(168, Math.round(ms / 3_600_000)));
}

export function StoriesManager({
  slug,
  space,
  active,
  scheduled,
  archived,
  settings,
}: {
  slug: string;
  space: SpaceInfo;
  active: StoryRow[];
  scheduled: StoryRow[];
  archived: StoryRow[];
  settings: StorySettings;
}) {
  const [tab, setTab] = useState<Tab>("active");
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editing, setEditing] = useState<StoryRow | null>(null);
  const [nonce, setNonce] = useState(0);
  const t = useTranslations("dashboard.stories");
  const locale = useLocale();
  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
    [locale],
  );

  const rows = tab === "active" ? active : tab === "scheduled" ? scheduled : archived;
  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "active", label: t("tabActive"), count: active.length },
    { key: "scheduled", label: t("tabScheduled"), count: scheduled.length },
    { key: "archived", label: t("tabArchived"), count: archived.length },
  ];

  const emptyText =
    tab === "scheduled"
      ? { title: t("scheduledEmpty"), hint: t("scheduledEmptyHint") }
      : tab === "archived"
        ? { title: t("archivedEmpty"), hint: t("archivedEmptyHint") }
        : { title: t("emptyTitle"), hint: t("emptyHint") };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{space.name}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSettingsOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <Icon name="settings" size={17} />
            {t("settings")}
          </button>
          <button
            onClick={() => {
              setNonce((n) => n + 1);
              setCreateOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98]"
          >
            <Icon name="plus" size={18} />
            {t("create")}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-5 flex items-center gap-1.5" role="tablist">
        {tabs.map((tb) => (
          <button
            key={tb.key}
            role="tab"
            aria-selected={tab === tb.key}
            onClick={() => setTab(tb.key)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-semibold transition",
              tab === tb.key
                ? "bg-slate-900 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
            )}
          >
            {tb.label} ({tb.count})
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="sparkles" title={emptyText.title} hint={emptyText.hint} />
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {rows.map((s) => (
            <div
              key={s.id}
              className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-900"
              style={{ aspectRatio: "9 / 16" }}
            >
              {s.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={s.imageUrl}
                  alt=""
                  className={cn("absolute inset-0 h-full w-full object-cover", tab === "archived" && "opacity-60")}
                />
              ) : s.videoUrl ? (
                <video
                  src={s.videoUrl}
                  muted
                  playsInline
                  preload="metadata"
                  className={cn("absolute inset-0 h-full w-full object-cover", tab === "archived" && "opacity-60")}
                />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center text-white/40">
                  <Icon name="videos" size={22} />
                </span>
              )}

              {/* status badge */}
              {tab === "scheduled" && (
                <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                  <Icon name="clock" size={11} />
                  {dateFmt.format(new Date(s.publishAt))}
                </span>
              )}
              {tab === "archived" && (
                <span className="absolute left-1.5 top-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white/90 backdrop-blur-sm">
                  {t("archivedBadge")}
                </span>
              )}

              {/* actions */}
              <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(s);
                    setNonce((n) => n + 1);
                  }}
                  aria-label={t("edit")}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/55 text-white backdrop-blur-sm transition hover:bg-black/75"
                >
                  <Icon name="edit" size={13} />
                </button>
                <form action={deleteStoryAction}>
                  <input type="hidden" name="tenant" value={slug} />
                  <input type="hidden" name="storyId" value={s.id} />
                  <input type="hidden" name="spaceSlug" value={space.slug} />
                  <button
                    type="submit"
                    aria-label={t("delete")}
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/55 text-white backdrop-blur-sm transition hover:bg-red-600"
                  >
                    <Icon name="trash" size={13} />
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}

      <Sheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t("createTitle")}
        subtitle={space.name}
        icon="sparkles"
      >
        <StoryForm
          key={`create-${nonce}`}
          slug={slug}
          space={space}
          defaultTtl={settings.defaultTtlHours}
          onDone={() => setCreateOpen(false)}
        />
      </Sheet>

      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={t("editTitle")}
        subtitle={space.name}
        icon="edit"
      >
        {editing && (
          <StoryForm
            key={`edit-${editing.id}-${nonce}`}
            slug={slug}
            space={space}
            story={editing}
            defaultTtl={ttlHoursOf(editing)}
            onDone={() => setEditing(null)}
          />
        )}
      </Sheet>

      <Sheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title={t("settingsTitle")}
        subtitle={space.name}
        icon="settings"
      >
        <StorySettingsForm
          slug={slug}
          space={space}
          settings={settings}
          onDone={() => setSettingsOpen(false)}
        />
      </Sheet>
    </div>
  );
}

function StoryForm({
  slug,
  space,
  story,
  defaultTtl,
  onDone,
}: {
  slug: string;
  space: SpaceInfo;
  story?: StoryRow;
  defaultTtl: number;
  onDone: () => void;
}) {
  const isEdit = !!story;
  const [state, action, pending] = useActionState(
    isEdit ? updateStoryAction : createStoryAction,
    initial,
  );
  const t = useTranslations("dashboard.stories");
  // Prefill the schedule only when the story is still scheduled for the future.
  const scheduledFuture =
    story && new Date(story.publishAt).getTime() > Date.now() ? toDatetimeLocal(story.publishAt) : "";

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="tenant" value={slug} />
      <input type="hidden" name="spaceId" value={space.id} />
      <input type="hidden" name="spaceSlug" value={space.slug} />
      {isEdit && <input type="hidden" name="storyId" value={story!.id} />}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl space-y-5 px-6 py-10">
          <FormError message={state.error} />
          <div>
            <Label>{t("imageLabel")}</Label>
            <ImageUpload tenant={slug} name="imageUrl" purpose="story" defaultUrl={story?.imageUrl ?? null} />
          </div>
          <div>
            <Label>{t("videoLabel")}</Label>
            <VideoUpload tenant={slug} name="videoUrl" purpose="story-video" defaultUrl={story?.videoUrl ?? null} />
          </div>
          <div>
            <Label htmlFor="st-caption">{t("captionLabel")}</Label>
            <Input
              id="st-caption"
              name="caption"
              maxLength={280}
              defaultValue={story?.caption ?? ""}
              placeholder={t("captionPlaceholder")}
            />
          </div>
          <div>
            <Label htmlFor="st-ttl">{t("ttlLabel")}</Label>
            <Input id="st-ttl" name="ttlHours" type="number" min={1} max={168} defaultValue={defaultTtl} />
            <p className="mt-1 text-xs text-slate-400">{t("ttlHint")}</p>
          </div>
          <div>
            <Label htmlFor="st-schedule">{t("scheduleLabel")}</Label>
            <Input id="st-schedule" name="publishAt" type="datetime-local" defaultValue={scheduledFuture} />
            <p className="mt-1 text-xs text-slate-400">{t("scheduleHint")}</p>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
        <button type="button" onClick={onDone} className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100">
          {t("cancel")}
        </button>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? t("saving") : isEdit ? t("save") : t("create")}
        </button>
      </div>
    </form>
  );
}

const AUTOPLAY_OPTIONS = [0, 3, 5, 8, 10, 15];

function StorySettingsForm({
  slug,
  space,
  settings,
  onDone,
}: {
  slug: string;
  space: SpaceInfo;
  settings: StorySettings;
  onDone: () => void;
}) {
  const t = useTranslations("dashboard.stories");
  const [state, action, pending] = useActionState(updateStorySettingsAction, initial);
  const [autoplay, setAutoplay] = useState(settings.autoplaySeconds);

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="tenant" value={slug} />
      <input type="hidden" name="spaceId" value={space.id} />
      <input type="hidden" name="autoplaySeconds" value={autoplay} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl space-y-6 px-6 py-10">
          <FormError message={state.error} />
          <div>
            <Label htmlFor="st-default-ttl">{t("defaultTtlLabel")}</Label>
            <Input
              id="st-default-ttl"
              name="defaultTtlHours"
              type="number"
              min={1}
              max={168}
              defaultValue={settings.defaultTtlHours}
            />
            <p className="mt-1 text-xs text-slate-400">{t("defaultTtlHint")}</p>
          </div>
          <div>
            <Label>{t("autoplayLabel")}</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {AUTOPLAY_OPTIONS.map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => setAutoplay(sec)}
                  aria-pressed={autoplay === sec}
                  className={cn(
                    "rounded-xl border px-3.5 py-2 text-sm font-medium transition",
                    autoplay === sec
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                  )}
                >
                  {sec === 0 ? t("autoplayOff") : t("autoplaySeconds", { count: sec })}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-400">{t("autoplayHint")}</p>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
        <button type="button" onClick={onDone} className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100">
          {t("cancel")}
        </button>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? t("saving") : t("save")}
        </button>
      </div>
    </form>
  );
}
