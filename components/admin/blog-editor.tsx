"use client";

import { useActionState, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  deletePostAction,
  duplicatePostAction,
  savePostAction,
  type BlogState,
} from "@/app/actions/platform-blog";
import { RichTextEditor } from "@/components/dashboard/rich-text-editor";
import { PlatformImageUpload } from "./platform-image-upload";
import { Icon } from "@/components/dashboard/icons";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { FormError } from "@/components/ui/misc";
import { uploadPlatformBlogFile } from "@/lib/client-upload";
import { BLOG_CATEGORIES, MAX_EXCERPT_LENGTH, blogSlug } from "@/lib/blog";
import { cn, formatDateTime } from "@/lib/utils";

export interface BlogDraft {
  id: string | null;
  locale: string;
  slug: string;
  title: string;
  excerpt: string;
  bodyHtml: string;
  coverUrl: string;
  coverAlt: string;
  category: string;
  status: "DRAFT" | "PUBLISHED";
  /** ISO oder leer. */
  publishedAt: string;
  isFeatured: boolean;
  seoTitle: string;
  seoDescription: string;
  noindex: boolean;
}

const SEO_TITLE_MAX = 70;
const SEO_DESC_MAX = 200;

/**
 * Der Blogeditor des Admin-Bereichs.
 *
 * Zwei Spalten, und die Aufteilung ist die eigentliche Entscheidung: links
 * steht ausschliesslich das, was spaeter jemand liest — Titelbild, Titel, Text.
 * Rechts steht alles, was daruber entscheidet, wann und wo es erscheint. Wer
 * schreibt, schaut nach links; wer veroeffentlicht, nach rechts. Alles in einer
 * Spalte haette bedeutet, dass man beim Schreiben an Suchmaschinen denkt.
 *
 * Der Text laeuft durch denselben Editor wie die Beitraege der Creator
 * (components/dashboard/rich-text-editor.tsx). Ein zweiter waere ein zweiter
 * Satz Fehler; er bekommt hier nur einen anderen Upload-Weg, weil die
 * Plattform keine Community ist.
 */
export function BlogEditor({
  post,
  locales,
  blogUrl,
  justCreated = false,
}: {
  post: BlogDraft;
  /** Die Sprachen, in denen es den Blog gibt. */
  locales: { value: string; label: string }[];
  /** Basis fuer die Adressvorschau, z. B. "https://aera.so/blog". */
  blogUrl: string;
  /** Nach dem Anlegen: einmalige Bestaetigung statt eines stillen Sprungs. */
  justCreated?: boolean;
}) {
  const t = useTranslations("admin.blog");
  const uiLocale = useLocale();
  const [state, action, pending] = useActionState(savePostAction, {} as BlogState);

  const [title, setTitle] = useState(post.title);
  const [slug, setSlug] = useState(post.slug);
  // Solange die Adresse dem Titel folgt, wird sie beim Tippen mitgeschrieben.
  // Sobald jemand sie anfasst, hoert das auf — sonst zerbricht ein Umbenennen
  // still einen geteilten Link.
  const [slugTouched, setSlugTouched] = useState(Boolean(post.slug));
  const [status, setStatus] = useState(post.status);
  const [publishedAt, setPublishedAt] = useState(post.publishedAt);
  const [excerpt, setExcerpt] = useState(post.excerpt);
  const [seoTitle, setSeoTitle] = useState(post.seoTitle);
  const [seoDescription, setSeoDescription] = useState(post.seoDescription);
  const [cover, setCover] = useState(post.coverUrl);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const ids = {
    title: useId(),
    slug: useId(),
    excerpt: useId(),
    coverAlt: useId(),
    category: useId(),
    locale: useId(),
    date: useId(),
    seoTitle: useId(),
    seoDesc: useId(),
  };

  const effectiveSlug = slugTouched ? slug : blogSlug(title);

  // Nach dem Speichern ist nichts mehr offen, es steht dran wann — und oben
  // steht der Stand, den der Server tatsaechlich gespeichert hat.
  useEffect(() => {
    if (!state.ok) return;
    setDirty(false);
    setSavedAt(new Date());
    if (state.status) setStatus(state.status);
    if (state.publishedAt !== undefined) setPublishedAt(state.publishedAt);
  }, [state.ok, state.status, state.publishedAt]);

  /**
   * Die Warnung vor dem Verlassen.
   *
   * Ein halb geschriebener Beitrag ist eine Stunde Arbeit, und ein
   * versehentlicher Klick auf „Zurueck" macht sie zunichte. Der Browser zeigt
   * seinen eigenen Text — mehr geht nicht, und mehr braucht es auch nicht.
   */
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const scheduled = useMemo(() => {
    if (status !== "PUBLISHED" || !publishedAt) return null;
    const when = new Date(publishedAt);
    return !Number.isNaN(when.getTime()) && when > new Date() ? when : null;
  }, [status, publishedAt]);

  return (
    <form
      action={action}
      onChange={() => setDirty(true)}
      className="pb-10"
    >
      <input type="hidden" name="id" value={post.id ?? ""} />
      <input type="hidden" name="slug" value={effectiveSlug} />
      <input type="hidden" name="publishedAt" value={publishedAt} />
      {/* `status` kommt bewusst NICHT von hier, sondern vom gedrueckten Knopf —
          siehe SaveButton. Stuende es zusaetzlich hier, gaebe es das Feld
          zweimal und der erste Wert gewaenne, also immer der alte. */}

      {/* Kopfzeile: wo man ist, was der Stand ist, was man tun kann. */}
      <div className="sticky top-0 z-20 -mx-4 mb-6 border-b border-slate-200 bg-slate-50/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/admin/blog"
            className="flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-900"
          >
            <Icon name="chevron" size={16} className="rotate-180" />
            {t("backToList")}
          </Link>

          <StatusPill status={status} scheduled={Boolean(scheduled)} t={t} />

          <span className="min-w-0 flex-1 truncate text-xs text-slate-400">
            {savedAt
              ? t("savedAt", { time: formatDateTime(savedAt, uiLocale) })
              : dirty
                ? t("unsaved")
                : ""}
          </span>

          <div className="flex shrink-0 items-center gap-2">
            {post.id && status === "PUBLISHED" && (
              <a
                href={`${blogUrl}/${effectiveSlug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-white hover:text-slate-900"
              >
                <Icon name="external" size={15} />
                {t("view")}
              </a>
            )}
            <SaveButton pending={pending} status={status} t={t} />
          </div>
        </div>
      </div>

      {justCreated && !dirty && (
        <p className="mb-5 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          <Icon name="check" size={16} className="shrink-0" />
          {t("created")}
        </p>
      )}

      <FormError message={state.error} />

      <div className="mt-4 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* ---------------------------------------------------- Der Beitrag */}
        <div className="min-w-0 space-y-5">
          <div>
            <PlatformImageUpload
              name="coverUrl"
              defaultUrl={post.coverUrl}
              endpoint="/api/admin/blog-media"
              hint={t("coverHint")}
              onChange={(url) => {
                setCover(url);
                setDirty(true);
              }}
            />
            {cover && (
              <div className="mt-3">
                <Label htmlFor={ids.coverAlt}>{t("coverAlt")}</Label>
                <Input
                  id={ids.coverAlt}
                  name="coverAlt"
                  defaultValue={post.coverAlt}
                  maxLength={200}
                  placeholder={t("coverAltPlaceholder")}
                />
                <p className="mt-1.5 text-xs leading-5 text-slate-400">{t("coverAltHint")}</p>
              </div>
            )}
          </div>

          <div>
            <label htmlFor={ids.title} className="sr-only">
              {t("titleLabel")}
            </label>
            <input
              id={ids.title}
              name="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={160}
              placeholder={t("titlePlaceholder")}
              className="w-full rounded-xl border border-transparent bg-transparent px-1 py-1 text-3xl font-bold leading-tight tracking-tight text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-slate-200 focus:bg-white"
            />
          </div>

          <RichTextEditor
            name="bodyHtml"
            defaultHtml={post.bodyHtml}
            placeholder={t("bodyPlaceholder")}
            uploadFile={(file) => uploadPlatformBlogFile(file)}
            // Bild und Video ja, Dokumente nein — /api/admin/blog-media nimmt
            // nur Medien an.
            hideAttachments
            onChange={() => setDirty(true)}
          />
        </div>

        {/* ------------------------------------------------ Die Einstellungen */}
        <aside className="space-y-4 lg:sticky lg:top-24">
          <Panel title={t("publishing")}>
            <fieldset>
              <legend className="sr-only">{t("statusLabel")}</legend>
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
                {(["DRAFT", "PUBLISHED"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={status === value}
                    onClick={() => {
                      setStatus(value);
                      setDirty(true);
                      // Beim ersten Veroeffentlichen steht sonst kein Datum im
                      // Feld, und der Beitrag saehe geplant aus statt live.
                      if (value === "PUBLISHED" && !publishedAt) {
                        setPublishedAt(new Date().toISOString());
                      }
                    }}
                    className={cn(
                      "rounded-lg px-3 py-2 text-sm font-semibold transition",
                      status === value
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-900",
                    )}
                  >
                    {t(value === "DRAFT" ? "statusDraft" : "statusPublished")}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="mt-4">
              <Label htmlFor={ids.date}>{t("dateLabel")}</Label>
              <input
                id={ids.date}
                type="datetime-local"
                value={toLocalInput(publishedAt)}
                onChange={(event) => {
                  // Der sichtbare Wert ist Ortszeit, gespeichert wird UTC. Ohne
                  // diese Umrechnung wuerde ein Beitrag, den jemand in Berlin
                  // auf 09:00 legt, auf einem Server in UTC um 11:00 erscheinen.
                  const parsed = new Date(event.target.value);
                  setPublishedAt(
                    event.target.value && !Number.isNaN(parsed.getTime())
                      ? parsed.toISOString()
                      : "",
                  );
                  setDirty(true);
                }}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-ring)]"
              />
              <p className="mt-1.5 text-xs leading-5 text-slate-400">
                {scheduled
                  ? t("scheduledFor", { date: formatDateTime(scheduled, uiLocale) })
                  : t("dateHint")}
              </p>
            </div>

            <label className="mt-4 flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                name="isFeatured"
                defaultChecked={post.isFeatured}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-[var(--brand)] focus:ring-[var(--brand-ring)]"
              />
              <span>
                <span className="block text-sm font-medium text-slate-800">
                  {t("featured")}
                </span>
                <span className="block text-xs leading-5 text-slate-400">
                  {t("featuredHint")}
                </span>
              </span>
            </label>
          </Panel>

          <Panel title={t("classification")}>
            <div>
              <Label htmlFor={ids.category}>{t("categoryLabel")}</Label>
              <Select
                id={ids.category}
                name="category"
                defaultValue={post.category}
                onChange={() => setDirty(true)}
              >
                <option value="">{t("categoryNone")}</option>
                {BLOG_CATEGORIES.map((key) => (
                  <option key={key} value={key}>
                    {t(`categories.${key}`)}
                  </option>
                ))}
              </Select>
            </div>

            <div className="mt-4">
              <Label htmlFor={ids.locale}>{t("localeLabel")}</Label>
              <Select
                id={ids.locale}
                name="locale"
                defaultValue={post.locale}
                onChange={() => setDirty(true)}
              >
                {locales.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </Select>
              <p className="mt-1.5 text-xs leading-5 text-slate-400">{t("localeHint")}</p>
            </div>

            <div className="mt-4">
              <Label htmlFor={ids.slug}>{t("slugLabel")}</Label>
              <Input
                id={ids.slug}
                value={effectiveSlug}
                onChange={(event) => {
                  setSlugTouched(true);
                  setSlug(blogSlug(event.target.value));
                  setDirty(true);
                }}
                maxLength={120}
                spellCheck={false}
              />
              <p className="mt-1.5 break-all text-xs leading-5 text-slate-400">
                {blogUrl}/<span className="text-slate-600">{effectiveSlug || "…"}</span>
              </p>
            </div>

            <div className="mt-4">
              <div className="flex items-baseline justify-between gap-3">
                <Label htmlFor={ids.excerpt}>{t("excerptLabel")}</Label>
                <Count value={excerpt.length} max={MAX_EXCERPT_LENGTH} />
              </div>
              <Textarea
                id={ids.excerpt}
                name="excerpt"
                value={excerpt}
                onChange={(event) => setExcerpt(event.target.value)}
                maxLength={MAX_EXCERPT_LENGTH}
                rows={4}
                placeholder={t("excerptPlaceholder")}
              />
              <p className="mt-1.5 text-xs leading-5 text-slate-400">{t("excerptHint")}</p>
            </div>
          </Panel>

          <Panel title={t("seo")}>
            <div>
              <div className="flex items-baseline justify-between gap-3">
                <Label htmlFor={ids.seoTitle}>{t("seoTitleLabel")}</Label>
                <Count value={seoTitle.length} max={SEO_TITLE_MAX} />
              </div>
              <Input
                id={ids.seoTitle}
                name="seoTitle"
                value={seoTitle}
                onChange={(event) => setSeoTitle(event.target.value)}
                maxLength={SEO_TITLE_MAX}
                placeholder={title || t("seoTitlePlaceholder")}
              />
            </div>

            <div className="mt-4">
              <div className="flex items-baseline justify-between gap-3">
                <Label htmlFor={ids.seoDesc}>{t("seoDescLabel")}</Label>
                <Count value={seoDescription.length} max={SEO_DESC_MAX} />
              </div>
              <Textarea
                id={ids.seoDesc}
                name="seoDescription"
                value={seoDescription}
                onChange={(event) => setSeoDescription(event.target.value)}
                maxLength={SEO_DESC_MAX}
                rows={3}
                placeholder={excerpt || t("seoDescPlaceholder")}
              />
            </div>

            {/* Die Google-Zeile, wie sie mit den aktuellen Werten aussaehe. */}
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="truncate text-[11px] text-slate-500">
                {blogUrl}/{effectiveSlug}
              </p>
              <p className="mt-0.5 truncate text-sm leading-snug text-[#1a0dab]">
                {seoTitle.trim() || title || t("seoTitlePlaceholder")}
              </p>
              <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-slate-600">
                {seoDescription.trim() || excerpt || t("seoDescPlaceholder")}
              </p>
            </div>

            <label className="mt-4 flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                name="noindex"
                defaultChecked={post.noindex}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-[var(--brand)] focus:ring-[var(--brand-ring)]"
              />
              <span>
                <span className="block text-sm font-medium text-slate-800">{t("noindex")}</span>
                <span className="block text-xs leading-5 text-slate-400">{t("noindexHint")}</span>
              </span>
            </label>
          </Panel>

          {post.id && <DangerPanel id={post.id} title={post.title} t={t} />}
        </aside>
      </div>
    </form>
  );
}

/**
 * Speichern und Veroeffentlichen nebeneinander.
 *
 * Ein Entwurf hat zwei sinnvolle naechste Schritte: sichern, ohne dass jemand
 * es sieht — oder sichtbar machen.
 *
 * Der Status haengt am Knopf (`name`/`value`) und nicht an einem Zustand, den
 * ein Klick vorher noch setzen muesste. Das ist kein Stilfrage: React haette
 * den Zustand erst nach dem Absenden neu gezeichnet, das Formular also mit dem
 * ALTEN Status verschickt — „Veroeffentlichen" haette einen Entwurf gespeichert.
 * Der Browser schickt beim Absenden ohnehin den gedrueckten Knopf mit; genau
 * dafuer gibt es das.
 */
function SaveButton({
  pending,
  status,
  t,
}: {
  pending: boolean;
  status: "DRAFT" | "PUBLISHED";
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="submit"
        name="status"
        value={status}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
      >
        {pending && (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
        )}
        {t("save")}
      </button>
      {status === "DRAFT" && (
        <button
          type="submit"
          name="status"
          value="PUBLISHED"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--action)] px-3.5 py-2 text-sm font-semibold text-[var(--action-fg)] transition hover:bg-[var(--action-hover)] disabled:opacity-50"
        >
          {t("publish")}
        </button>
      )}
    </div>
  );
}

function StatusPill({
  status,
  scheduled,
  t,
}: {
  status: "DRAFT" | "PUBLISHED";
  scheduled: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const [label, tone] =
    status === "DRAFT"
      ? [t("statusDraft"), "bg-slate-200 text-slate-600"]
      : scheduled
        ? [t("statusScheduled"), "bg-amber-100 text-amber-700"]
        : [t("statusPublished"), "bg-emerald-100 text-emerald-700"];
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide",
        tone,
      )}
    >
      {label}
    </span>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-400">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Count({ value, max }: { value: number; max: number }) {
  return (
    <span
      className={cn(
        "text-xs tabular-nums",
        value > max * 0.9 ? "text-amber-600" : "text-slate-400",
      )}
    >
      {value}/{max}
    </span>
  );
}

/**
 * Duplizieren und Loeschen.
 *
 * Beides steht in eigenen Formularen und damit ausserhalb des grossen — sonst
 * wuerde ein Klick auf „Loeschen" den ganzen Beitrag mit abschicken. Das
 * Loeschen verlangt zusaetzlich, den Titel abzutippen: ein Beitrag ist Arbeit,
 * und ein Dialog mit „OK" wegzuklicken ist keine Entscheidung.
 */
function DangerPanel({
  id,
  title,
  t,
}: {
  id: string;
  title: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (confirming) inputRef.current?.focus();
  }, [confirming]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-400">
        {t("actions")}
      </h2>

      <button
        type="submit"
        form={`duplicate-${id}`}
        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
      >
        <Icon name="copy" size={16} className="text-slate-400" />
        {t("duplicate")}
      </button>

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-red-50 hover:text-red-700"
        >
          <Icon name="eraser" size={16} className="text-slate-400" />
          {t("delete")}
        </button>
      ) : (
        <div className="mt-2 rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="text-xs leading-5 text-red-800">
            {t("deleteConfirm", { title })}
          </p>
          <input
            ref={inputRef}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            aria-label={t("deleteConfirmLabel")}
            className="mt-2 w-full rounded-lg border border-red-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-200"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="submit"
              form={`delete-${id}`}
              disabled={typed.trim() !== title.trim()}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("deleteFinal")}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                setTyped("");
              }}
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-white"
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Die beiden Formulare fuer Duplizieren und Loeschen.
 *
 * Sie stehen ausserhalb des Editor-Formulars, weil HTML kein Formular im
 * Formular kennt — die Knoepfe oben verweisen ueber `form=` hierher.
 */
export function BlogEditorSideForms({ id }: { id: string }) {
  return (
    <>
      <form id={`duplicate-${id}`} action={duplicatePostAction} className="hidden">
        <input type="hidden" name="id" value={id} />
      </form>
      <form id={`delete-${id}`} action={deletePostAction} className="hidden">
        <input type="hidden" name="id" value={id} />
      </form>
    </>
  );
}

/**
 * ISO nach `datetime-local`.
 *
 * `<input type="datetime-local">` will Ortszeit ohne Zeitzone. Ein
 * `toISOString().slice(0,16)` waere die haeufigste Loesung und die falsche: sie
 * zeigt UTC an und verschiebt die Anzeige um den Zeitzonenversatz.
 */
function toLocalInput(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}
