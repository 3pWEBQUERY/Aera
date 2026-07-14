"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  saveAnnouncementAction,
  deleteAnnouncementAction,
  toggleAnnouncementsOnlyAction,
} from "@/app/actions/announcements";
import type { ActionState } from "@/app/actions/dashboard";
import { Sheet } from "./sheet";
import { Icon } from "./icons";
import { ImageUpload } from "./image-upload";
import { Input, Label } from "@/components/ui/field";
import { Pill, FormError } from "@/components/ui/misc";
import { AnnouncementBar } from "@/components/community/announcement-banner";
import {
  ANNOUNCEMENT_DEFAULTS,
  type SpaceAnnouncement,
} from "@/lib/space-settings";
import { cn, formatDateTime } from "@/lib/utils";

const initial: ActionState = {};

function statusInfo(a: SpaceAnnouncement): { key: "statusDraft" | "statusExpired" | "statusLive"; cls: string } {
  if (!a.isPublished) return { key: "statusDraft", cls: "bg-slate-100 text-slate-600" };
  if (a.endsAt && new Date(a.endsAt) <= new Date())
    return { key: "statusExpired", cls: "bg-amber-100 text-amber-700" };
  return { key: "statusLive", cls: "bg-green-100 text-green-700" };
}

/** Datetime-local input value from an ISO string (local timezone). */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AnnouncementsManager({
  slug,
  spaceId,
  spaceName,
  announcements,
  announcementsOnly = false,
  standalone = false,
}: {
  slug: string;
  spaceId: string;
  spaceName: string;
  announcements: SpaceAnnouncement[];
  /** Space is a pure banner container (hidden from the community). */
  announcementsOnly?: boolean;
  /** Render as full page (banner-only spaces) instead of a section above the content manager. */
  standalone?: boolean;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<SpaceAnnouncement | null>(null);
  const t = useTranslations("dashboard.announcements");
  const locale = useLocale();

  return (
    <section className={standalone ? undefined : "mb-6 rounded-2xl border border-slate-200 bg-white p-5"}>
      {standalone && (
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white">
            <Icon name="megaphone" size={20} />
          </span>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{spaceName}</h1>
            <p className="text-sm text-slate-500">
              {t("standaloneSubtitle")}
            </p>
          </div>
        </div>
      )}
      <div className={standalone ? "rounded-2xl border border-slate-200 bg-white p-5" : undefined}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <Icon name="megaphone" size={18} className="text-[var(--brand)]" />
            {t("heading")}
            <Pill className="bg-slate-100 text-slate-500">{announcements.length}</Pill>
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {t("headingDesc")}
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 self-start rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
        >
          <Icon name="plus" size={16} /> {t("addBtn")}
        </button>
      </div>

      {/* Banner-only mode switch */}
      <form
        action={toggleAnnouncementsOnlyAction}
        className="mt-4 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-3"
      >
        <input type="hidden" name="tenant" value={slug} />
        <input type="hidden" name="spaceId" value={spaceId} />
        <input
          type="checkbox"
          name="enabled"
          id="ann-only"
          defaultChecked={announcementsOnly}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className="mt-0.5 h-4 w-4 accent-[var(--brand)]"
        />
        <label htmlFor="ann-only" className="min-w-0 cursor-pointer">
          <span className="block text-sm font-medium text-slate-800">
            {t("onlyToggleLabel")}
          </span>
          <span className="block text-xs text-slate-400">
            {t("onlyToggleHint")}
          </span>
        </label>
      </form>

      {announcements.length > 0 && (
        <div className="mt-4 space-y-2">
          {announcements.map((a) => {
            const st = statusInfo(a);
            return (
              <div
                key={a.id}
                onClick={() => setEditing(a)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setEditing(a);
                  }
                }}
                className={cn(
                  "group flex cursor-pointer items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2.5 transition hover:border-slate-200",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]",
                )}
              >
                <span
                  className="h-8 w-8 shrink-0 rounded-lg ring-1 ring-black/5"
                  style={{ backgroundColor: a.bgColor }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium text-slate-800">{a.title}</p>
                    <Pill className={st.cls}>{t(st.key)}</Pill>
                  </div>
                  <p className="truncate text-xs text-slate-400">
                    {a.endsAt ? t("endsAt", { date: formatDateTime(a.endsAt, locale) }) : t("noExpiry")}
                    {a.ctaLabel ? ` · ${t("buttonSuffix", { label: a.ctaLabel })}` : ""}
                    {a.showTimer ? ` · ${t("countdownSuffix")}` : ""}
                  </p>
                </div>
                <span className="hidden shrink-0 items-center gap-1.5 text-sm font-medium text-slate-500 sm:flex sm:opacity-0 sm:transition sm:group-hover:opacity-100">
                  <Icon name="settings" size={15} /> {t("edit")}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <Sheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t("sheetCreate")}
        subtitle={t("sheetCreateSubtitle")}
        icon="megaphone"
      >
        <AnnouncementForm slug={slug} spaceId={spaceId} onDone={() => setCreateOpen(false)} />
      </Sheet>
      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={t("sheetEdit")}
        subtitle={editing?.title}
        icon="megaphone"
      >
        {editing && (
          <AnnouncementForm
            key={editing.id}
            slug={slug}
            spaceId={spaceId}
            announcement={editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Sheet>
      </div>
    </section>
  );
}

const HEX = /^#[0-9a-fA-F]{6}$/;

function ColorInput({
  label,
  name,
  value,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const valid = HEX.test(draft);
  const t = useTranslations("dashboard.announcements");
  const commit = (v: string) => {
    setDraft(v);
    if (HEX.test(v)) onChange(v);
  };
  return (
    <div>
      <Label>{label}</Label>
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border p-1.5 transition focus-within:ring-2",
          valid
            ? "border-slate-300 focus-within:border-[var(--brand)] focus-within:ring-[var(--brand-ring)]"
            : "border-red-300 focus-within:ring-red-100",
        )}
      >
        <input
          type="color"
          value={valid ? draft : value}
          onChange={(e) => commit(e.target.value)}
          aria-label={t("pickAria", { label })}
          className="h-8 w-11 shrink-0 cursor-pointer rounded-md border-0 bg-transparent p-0"
        />
        <input
          type="text"
          value={draft}
          onChange={(e) => {
            const v = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
            commit(v.slice(0, 7));
          }}
          onBlur={() => {
            if (!valid) setDraft(value);
          }}
          spellCheck={false}
          aria-label={t("hexAria", { label })}
          className="w-full min-w-0 bg-transparent font-mono text-sm uppercase text-slate-600 outline-none"
        />
        <input type="hidden" name={name} value={value} />
      </div>
    </div>
  );
}

function Toggle({
  name,
  label,
  hint,
  checked,
  onChange,
}: {
  name: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 px-3.5 py-3 transition hover:bg-slate-50">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-[var(--brand)]"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        {hint && <span className="block text-xs text-slate-400">{hint}</span>}
      </span>
    </label>
  );
}

function AnnouncementForm({
  slug,
  spaceId,
  announcement,
  onDone,
}: {
  slug: string;
  spaceId: string;
  announcement?: SpaceAnnouncement;
  onDone: () => void;
}) {
  const isEdit = !!announcement;
  const [state, action, pending] = useActionState(saveAnnouncementAction, initial);
  const [deleting, setDeleting] = useState(false);
  const t = useTranslations("dashboard.announcements");

  // Controlled fields drive the live preview.
  const [title, setTitle] = useState(announcement?.title ?? "");
  const [message, setMessage] = useState(announcement?.message ?? "");
  const [bgColor, setBgColor] = useState(announcement?.bgColor ?? ANNOUNCEMENT_DEFAULTS.bgColor);
  const [textColor, setTextColor] = useState(announcement?.textColor ?? ANNOUNCEMENT_DEFAULTS.textColor);
  const [bgImageUrl, setBgImageUrl] = useState(announcement?.bgImageUrl ?? "");
  const [ctaLabel, setCtaLabel] = useState(announcement?.ctaLabel ?? "");
  const [ctaUrl, setCtaUrl] = useState(announcement?.ctaUrl ?? "");
  const [endsAt, setEndsAt] = useState(toLocalInput(announcement?.endsAt ?? null));
  const [showTimer, setShowTimer] = useState(announcement?.showTimer ?? false);
  const [isPublished, setIsPublished] = useState(announcement?.isPublished ?? true);

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  async function onDelete() {
    if (!announcement) return;
    if (!confirm(t("confirmDelete", { title: announcement.title }))) return;
    setDeleting(true);
    const fd = new FormData();
    fd.set("tenant", slug);
    fd.set("spaceId", spaceId);
    fd.set("announcementId", announcement.id);
    await deleteAnnouncementAction(fd);
    onDone();
  }

  const preview: SpaceAnnouncement = {
    id: "preview",
    title: title || t("previewTitle"),
    message,
    bgColor,
    textColor,
    bgImageUrl: bgImageUrl || null,
    ctaLabel: ctaLabel || null,
    ctaUrl: ctaUrl || "#",
    endsAt: endsAt ? new Date(endsAt).toISOString() : null,
    showTimer,
    isPublished: true,
    createdAt: new Date().toISOString(),
  };

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="tenant" value={slug} />
      <input type="hidden" name="spaceId" value={spaceId} />
      {isEdit && <input type="hidden" name="announcementId" value={announcement!.id} />}

      {/* Live preview pinned under the sheet header. */}
      <div className="shrink-0 border-b border-slate-200 bg-slate-50">
        <p className="px-6 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {t("preview")}
        </p>
        <div className="mt-2 overflow-hidden border-t border-black/5">
          <AnnouncementBar announcement={preview} preview />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-6 px-6 py-8">
          <FormError message={state.error} />

          <div>
            <Label htmlFor="an-title">{t("titleLabel")}</Label>
            <Input
              id="an-title"
              name="title"
              required
              maxLength={160}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("titlePlaceholder")}
              className="text-base"
            />
          </div>

          <div>
            <Label htmlFor="an-msg">{t("messageLabel")}</Label>
            <Input
              id="an-msg"
              name="message"
              maxLength={240}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t("messagePlaceholder")}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="an-cta">{t("ctaLabelLabel")}</Label>
              <Input
                id="an-cta"
                name="ctaLabel"
                maxLength={40}
                value={ctaLabel}
                onChange={(e) => setCtaLabel(e.target.value)}
                placeholder={t("ctaPlaceholder")}
              />
            </div>
            <div>
              <Label htmlFor="an-url">{t("ctaUrlLabel")}</Label>
              <Input
                id="an-url"
                name="ctaUrl"
                value={ctaUrl}
                onChange={(e) => setCtaUrl(e.target.value)}
                placeholder={t("ctaUrlPlaceholder", { slug })}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <ColorInput label={t("bgColor")} name="bgColor" value={bgColor} onChange={setBgColor} />
            <ColorInput label={t("textColor")} name="textColor" value={textColor} onChange={setTextColor} />
          </div>

          <div>
            <Label>{t("bgImageLabel")}</Label>
            <ImageUpload
              tenant={slug}
              name="bgImageUrl"
              purpose="announcement"
              defaultUrl={announcement?.bgImageUrl ?? null}
              onChange={setBgImageUrl}
            />
            <p className="mt-1.5 text-xs text-slate-400">
              {t("bgImageHint")}
            </p>
          </div>

          <div>
            <Label htmlFor="an-ends">{t("endsLabel")}</Label>
            <Input
              id="an-ends"
              name="endsAt"
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-400">
              {t("endsHint")}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Toggle
              name="showTimer"
              label={t("countdownToggle")}
              hint={t("countdownHint")}
              checked={showTimer}
              onChange={setShowTimer}
            />
            <Toggle
              name="isPublished"
              label={t("publishedToggle")}
              hint={t("publishedHint")}
              checked={isPublished}
              onChange={setIsPublished}
            />
          </div>

          {isEdit && (
            <div className="border-t border-slate-100 pt-5">
              <button
                type="button"
                onClick={onDelete}
                disabled={deleting}
                className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
              >
                <Icon name="archive" size={16} />
                {deleting ? t("deleting") : t("deleteBtn")}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
        <button
          type="button"
          onClick={onDone}
          className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
        >
          {t("cancel")}
        </button>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50"
        >
          {pending ? t("saving") : isEdit ? t("saveChanges") : t("createBtn")}
        </button>
      </div>
    </form>
  );
}
