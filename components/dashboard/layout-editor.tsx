"use client";

import Link from "next/link";
import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { saveLayoutAction, type LayoutState } from "@/app/actions/page-layout";
import { CoverUpload } from "./cover-upload";
import {
  SOCIAL_PLATFORMS,
  SOCIAL_BY_KEY,
  buildSocialUrl,
  socialHandle,
  SocialGlyph,
} from "./social-icons";
import { Icon, type IconName } from "./icons";
import { useNameAvailability, NameStatusHint, type NameCheck } from "./use-name-availability";
import { cn } from "@/lib/utils";
import { uploadMediaFile } from "@/lib/client-upload";
import { useModalAccessibility } from "@/components/ui/use-modal-accessibility";
import {
  SECTION_CATALOG,
  SECTION_META,
  NAV_TYPE_ICON,
  AUDIENCES,
  type Audience,
  type SectionsByAudience,
  type LayoutSection,
  type NavItemConfig,
  type NavType,
  type SectionType,
  type SocialLink,
  type HeaderMode,
} from "@/lib/layout";

const COLOR_PRESETS = ["#6d28d9", "#2563eb", "#db2777", "#dc2626", "#ea580c", "#059669", "#0891b2", "#111827"];

// Space type → icon (matches the Spaces dashboard).
const SPACE_TYPE_ICON: Record<string, IconName> = {
  FEED: "feed",
  FORUM: "forum",
  COURSE: "courses",
  SHOP: "products",
  NEWSLETTER: "newsletter",
  EVENTS: "events",
  BLOG: "blog",
  KNOWLEDGE: "knowledge",
  GALLERY: "gallery",
  VIDEOS: "videos",
  CHAT: "chat",
  PODCAST: "podcast",
  LINKS: "link",
  ADS: "megaphone",
  LIVE: "videos",
  REQUESTS: "messages",
  BOOKING: "clock",
  STORIES: "sparkles",
  TIPS: "heart",
  CALENDAR: "events",
};

type View = "hub" | "header" | "sections" | "nav";

export interface LayoutEditorInitial {
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  description: string | null;
  coverUrl: string | null;
  sectionsByAudience: SectionsByAudience;
  nav: NavItemConfig[];
  header: { mode: HeaderMode; socials: SocialLink[] };
}

const initialState: LayoutState = {};
const uid = () => Math.random().toString(36).slice(2, 10);

export function LayoutEditor({
  slug,
  spaces,
  initial,
}: {
  slug: string;
  spaces: { slug: string; name: string; visibility: string; type: string }[];
  initial: LayoutEditorInitial;
}) {
  const [view, setView] = useState<View>("hub");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [audience, setAudience] = useState<Audience>("FREE");
  const t = useTranslations("dashboard.layout");

  const [name, setName] = useState(initial.name);
  const nameCheck = useNameAvailability(name, slug);
  const nameBlocks = nameCheck === "taken" || nameCheck === "long";
  const [logoUrl, setLogoUrl] = useState<string | null>(initial.logoUrl);
  const [primaryColor, setPrimaryColor] = useState(initial.primaryColor);
  const [description, setDescription] = useState(initial.description ?? "");
  const [mode, setMode] = useState<HeaderMode>(initial.header.mode);
  const [socials, setSocials] = useState<SocialLink[]>(initial.header.socials);
  const [sectionsByAudience, setSectionsByAudience] = useState<SectionsByAudience>(
    initial.sectionsByAudience,
  );
  const sections = sectionsByAudience[audience];
  // Standard: Änderungen gelten für ALLE Zielgruppen — das entspricht der
  // Erwartung "meine Seite anpassen". Wer pro Zielgruppe unterschiedliche
  // Layouts will, schaltet den Haken im Seitenlayout-Panel aus.
  const [applyAllAudiences, setApplyAllAudiences] = useState(true);
  const setSections = (next: LayoutSection[]) =>
    setSectionsByAudience((prev) =>
      applyAllAudiences
        ? { PUBLIC: next, FREE: next, PAID: next }
        : { ...prev, [audience]: next },
    );
  const [nav, setNav] = useState<NavItemConfig[]>(
    initial.nav.length > 0 ? initial.nav : [{ id: uid(), label: t("navTypes.HOME"), type: "HOME" }],
  );

  const [state, formAction, pending] = useActionState(saveLayoutAction, initialState);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (state.ok) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 2500);
      return () => clearTimeout(t);
    }
  }, [state.ok, state]);

  const payload = useMemo(
    () =>
      JSON.stringify({
        name,
        logoUrl,
        primaryColor,
        description,
        header: { mode, socials },
        sectionsByAudience,
        nav,
      }),
    [name, logoUrl, primaryColor, description, mode, socials, sectionsByAudience, nav],
  );

  // Live preview: mirror the current (unsaved) config into a short-lived cookie
  // that the real community page reads, then reload the iframe on changes.
  const previewPayload = useMemo(
    () =>
      JSON.stringify({
        name,
        logoUrl,
        primaryColor,
        header: { mode, socials },
        sectionsByAudience,
        nav,
        audience,
      }),
    [name, logoUrl, primaryColor, mode, socials, sectionsByAudience, nav, audience],
  );

  const [previewNonce, setPreviewNonce] = useState(0);
  const [previewReady, setPreviewReady] = useState(false);

  const writeCookie = useCallback(() => {
    document.cookie = `aera_preview_${slug}=${encodeURIComponent(previewPayload)}; path=/; max-age=900; samesite=lax`;
  }, [slug, previewPayload]);

  useEffect(() => {
    writeCookie();
    setPreviewReady(true);
    return () => {
      document.cookie = `aera_preview_${slug}=; path=/; max-age=0`;
    };
    // Mount/unmount only — writeCookie captures the latest payload via ref below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!previewReady) return;
    const t = setTimeout(() => {
      writeCookie();
      setPreviewNonce((n) => n + 1);
    }, 500);
    return () => clearTimeout(t);
  }, [previewPayload, previewReady, writeCookie]);

  const titles: Record<View, string> = {
    hub: t("titleHub"),
    header: t("titleHeader"),
    sections: t("titleSections"),
    nav: t("titleNav"),
  };

  return (
    <form
      action={formAction}
      className="fixed inset-0 z-50 flex flex-col bg-white"
      style={{ ["--brand" as string]: primaryColor }}
    >
      <input type="hidden" name="tenant" value={slug} />
      <input type="hidden" name="payload" value={payload} />

      {/* Top bar */}
      <header className="flex items-center gap-4 border-b border-slate-200 px-5 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {view !== "hub" && (
            <button
              type="button"
              onClick={() => setView("hub")}
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100"
              aria-label={t("back")}
            >
              <Icon name="chevron" size={18} className="rotate-90" />
            </button>
          )}
          <h1 className="truncate text-lg font-bold text-slate-900">{titles[view]}</h1>
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <AudienceSelect value={audience} onChange={setAudience} />
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 p-0.5">
            {(["desktop", "mobile"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDevice(d)}
                className={cn(
                  "flex h-8 w-9 items-center justify-center rounded-md transition",
                  device === d ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100",
                )}
                aria-label={d === "desktop" ? t("desktopPreview") : t("mobilePreview")}
              >
                <Icon name={d === "desktop" ? "monitor" : "smartphone"} size={16} />
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {flash && (
            <span className="hidden items-center gap-1.5 text-sm font-medium text-emerald-600 sm:inline-flex">
              <Icon name="check" size={16} /> {t("saved")}
            </span>
          )}
          {state.error && <span className="text-sm text-red-600">{state.error}</span>}
          <Link
            href={`/dashboard/${slug}`}
            className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
          >
            {t("cancel")}
          </Link>
          <button
            type="submit"
            disabled={pending || nameBlocks}
            title={nameBlocks ? t("nameTaken") : undefined}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {pending ? t("saving") : t("save")}
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        <aside className="w-full shrink-0 overflow-y-auto border-r border-slate-200 md:w-[380px]">
          {view === "hub" && <Hub onOpen={setView} />}
          {view === "header" && (
            <HeaderPanel
              slug={slug}
              name={name}
              setName={setName}
              nameCheck={nameCheck}
              logoUrl={logoUrl}
              setLogoUrl={setLogoUrl}
              primaryColor={primaryColor}
              setPrimaryColor={setPrimaryColor}
              description={description}
              setDescription={setDescription}
              mode={mode}
              setMode={setMode}
              socials={socials}
              setSocials={setSocials}
              coverUrl={initial.coverUrl}
            />
          )}
          {view === "sections" && (
            <SectionsPanel
              sections={sections}
              setSections={setSections}
              audience={audience}
              spaces={spaces}
              applyAll={applyAllAudiences}
              setApplyAll={setApplyAllAudiences}
            />
          )}
          {view === "nav" && <NavPanel nav={nav} setNav={setNav} spaces={spaces} />}
        </aside>

        <main className="hidden min-h-0 flex-1 overflow-hidden bg-slate-100 p-6 md:block">
          <div
            className={cn(
              "mx-auto h-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all",
              device === "mobile" ? "max-w-[430px]" : "max-w-none",
            )}
          >
            {previewReady && (
              <iframe
                key={previewNonce}
                src={`/c/${slug}?preview=1&n=${previewNonce}`}
                title={t("livePreview")}
                className="h-full w-full border-0"
              />
            )}
          </div>
        </main>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- Audience
function AudienceSelect({
  value,
  onChange,
}: {
  value: Audience;
  onChange: (a: Audience) => void;
}) {
  const [open, setOpen] = useState(false);
  const tAud = useTranslations("dashboard.layout.audiences");
  const current = AUDIENCES.find((a) => a.key === value) ?? AUDIENCES[0];
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 160)}
        className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
      >
        <span className="max-w-[230px] truncate">{tAud(current.key)}</span>
        <Icon name="chevron" size={14} className={cn("text-slate-400 transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute left-0 top-11 z-30 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1.5 shadow-xl">
          {AUDIENCES.map((a) => (
            <button
              key={a.key}
              type="button"
              onMouseDown={() => {
                onChange(a.key);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm font-medium text-slate-800 transition hover:bg-slate-50"
            >
              <span className="truncate">{tAud(a.key)}</span>
              {a.key === value && <Icon name="check" size={16} className="shrink-0 text-slate-900" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Hub
function Hub({ onOpen }: { onOpen: (v: View) => void }) {
  const t = useTranslations("dashboard.layout");
  const rows: { view: View; label: string; icon: IconName }[] = [
    { view: "header", label: t("hubHeader"), icon: "branding" },
    { view: "sections", label: t("hubSections"), icon: "layout" },
    { view: "nav", label: t("hubNav"), icon: "menu" },
  ];
  return (
    <div className="py-2">
      {rows.map((r) => (
        <button
          key={r.view}
          type="button"
          onClick={() => onOpen(r.view)}
          className="flex w-full items-center gap-3 border-b border-slate-100 px-6 py-5 text-left transition hover:bg-slate-50"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            <Icon name={r.icon} size={18} />
          </span>
          <span className="flex-1 text-base font-semibold text-slate-900">{r.label}</span>
          <Icon name="chevron" size={18} className="-rotate-90 text-slate-400" />
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Header panel
function HeaderPanel({
  slug,
  name,
  setName,
  nameCheck,
  logoUrl,
  setLogoUrl,
  primaryColor,
  setPrimaryColor,
  description,
  setDescription,
  mode,
  setMode,
  socials,
  setSocials,
  coverUrl,
}: {
  slug: string;
  name: string;
  setName: (v: string) => void;
  nameCheck: NameCheck;
  logoUrl: string | null;
  setLogoUrl: (v: string | null) => void;
  primaryColor: string;
  setPrimaryColor: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  mode: HeaderMode;
  setMode: (v: HeaderMode) => void;
  socials: SocialLink[];
  setSocials: (v: SocialLink[]) => void;
  coverUrl: string | null;
}) {
  const t = useTranslations("dashboard.layout");
  return (
    <div className="space-y-8 px-6 py-6">
      <div>
        <label className="block text-sm font-bold text-slate-900">{t("pageName")}</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none transition focus:border-[var(--brand)] focus:bg-white focus:ring-2 focus:ring-[var(--brand-ring)]"
        />
        <NameStatusHint status={nameCheck} />
        <p className="mt-1.5 text-xs text-slate-400">
          {t("nameUpdateHint")}
        </p>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-slate-900">{t("profilePhoto")}</p>
          <p className="mt-1 text-xs text-slate-400">{t("profilePhotoHint")}</p>
        </div>
        <LogoUploader slug={slug} url={logoUrl} name={name} color={primaryColor} onChange={setLogoUrl} />
      </div>

      <div>
        <p className="mb-2 text-sm font-bold text-slate-900">{t("headerOptions")}</p>
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <button
            type="button"
            onClick={() => setMode("PHOTO")}
            className={cn(
              "flex w-full items-center justify-between px-4 py-3.5 text-left text-sm font-medium transition",
              mode === "PHOTO" ? "bg-slate-50" : "hover:bg-slate-50",
            )}
          >
            {t("usePhoto")}
            <Radio checked={mode === "PHOTO"} />
          </button>

          {mode === "PHOTO" && (
            <div className="border-t border-slate-100 px-4 py-4">
              <p className="text-sm font-semibold text-slate-800">{t("colorScheme")}</p>
              <p className="mt-0.5 text-xs text-slate-400">{t("colorSchemeHint")}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setPrimaryColor(c)}
                    className={cn(
                      "h-8 w-8 rounded-lg ring-offset-2 transition",
                      primaryColor.toLowerCase() === c ? "ring-2 ring-slate-900" : "hover:scale-105",
                    )}
                    style={{ background: c }}
                    aria-label={c}
                  />
                ))}
                <label className="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-slate-300 text-slate-400">
                  <Icon name="plus" size={16} />
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="absolute inset-0 cursor-pointer opacity-0"
                  />
                </label>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setMode("COVER")}
            className={cn(
              "flex w-full items-center justify-between border-t border-slate-100 px-4 py-3.5 text-left text-sm font-medium transition",
              mode === "COVER" ? "bg-slate-50" : "hover:bg-slate-50",
            )}
          >
            {t("uploadCover")}
            <Radio checked={mode === "COVER"} />
          </button>
          {mode === "COVER" && (
            <div className="border-t border-slate-100 px-4 py-4">
              <CoverUpload tenant={slug} defaultUrl={coverUrl} />
              <p className="mt-2 text-xs text-slate-400">
                {t("coverApplied")}
              </p>
            </div>
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-bold text-slate-900">{t("about")}</label>
        <p className="mt-1 text-xs text-slate-400">{t("aboutHint")}</p>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          maxLength={2000}
          className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none transition focus:border-[var(--brand)] focus:bg-white focus:ring-2 focus:ring-[var(--brand-ring)]"
        />
      </div>

      <SocialLinksEditor socials={socials} setSocials={setSocials} />
    </div>
  );
}

function SocialLinksEditor({
  socials,
  setSocials,
}: {
  socials: SocialLink[];
  setSocials: (s: SocialLink[]) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const t = useTranslations("dashboard.layout");
  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="block text-sm font-bold text-slate-900">{t("socialLinks")}</label>
        <div className="relative">
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            onBlur={() => setTimeout(() => setPickerOpen(false), 160)}
            className="inline-flex items-center gap-1 text-sm font-medium text-[color:var(--brand)]"
          >
            <Icon name="plus" size={15} /> {t("add")}
          </button>
          {pickerOpen && (
            <div className="absolute right-0 top-8 z-40 max-h-80 w-60 overflow-y-auto rounded-2xl border border-slate-200 bg-white py-1.5 shadow-xl">
              {SOCIAL_PLATFORMS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onMouseDown={() => {
                    setSocials([...socials, { platform: p.key, url: "" }]);
                    setPickerOpen(false);
                  }}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-slate-50"
                >
                  <SocialGlyph platform={p.key} size={24} />
                  <span className="text-sm font-medium text-slate-800">{p.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {socials.length === 0 && (
          <p className="text-xs text-slate-400">{t("noSocials")}</p>
        )}
        {socials.map((s, i) => {
          const p = SOCIAL_BY_KEY[s.platform] ?? SOCIAL_BY_KEY.website;
          const isWebsite = !p.base;
          const value = isWebsite ? s.url : socialHandle(s.platform, s.url);
          return (
            <div key={i} className="flex items-center gap-2">
              <SocialGlyph platform={s.platform} size={36} />
              <div className="flex min-w-0 flex-1 items-center rounded-lg border border-slate-200 bg-slate-50 transition focus-within:border-[var(--brand)] focus-within:bg-white">
                {p.prefix && <span className="shrink-0 pl-3 text-xs text-slate-400">{p.prefix}</span>}
                <input
                  value={value}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const url = isWebsite ? raw : buildSocialUrl(s.platform, raw);
                    const copy = [...socials];
                    copy[i] = { platform: s.platform, url };
                    setSocials(copy);
                  }}
                  placeholder={p.placeholder}
                  className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => setSocials(socials.filter((_, idx) => idx !== i))}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                aria-label={t("removeAria")}
              >
                <Icon name="trash" size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Radio({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition",
        checked ? "border-slate-900" : "border-slate-300",
      )}
    >
      {checked && <span className="h-2.5 w-2.5 rounded-full bg-slate-900" />}
    </span>
  );
}

function LogoUploader({
  slug,
  url,
  name,
  color,
  onChange,
}: {
  slug: string;
  url: string | null;
  name: string;
  color: string;
  onChange: (u: string | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const t = useTranslations("dashboard.layout");

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const uploadedUrl = await uploadMediaFile({
        file,
        tenant: slug,
        purpose: "logo",
      });
      onChange(uploadedUrl);
    } catch {
      // Keep this compact logo control non-disruptive, as before.
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => ref.current?.click()}
      className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl ring-1 ring-black/5"
      style={{ background: url ? undefined : color }}
      aria-label={t("changePhotoAria")}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-2xl font-bold text-white">
          {name.charAt(0).toUpperCase() || "A"}
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 bg-slate-900/60 py-0.5 text-center text-[10px] font-medium text-white">
        {busy ? "…" : t("change")}
      </span>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={pick} />
    </button>
  );
}

// ---------------------------------------------------------------- Sections panel
function SectionsPanel({
  sections,
  setSections,
  audience,
  spaces,
  applyAll,
  setApplyAll,
}: {
  sections: LayoutSection[];
  setSections: (s: LayoutSection[]) => void;
  audience: Audience;
  spaces: { slug: string; name: string; visibility: string; type: string }[];
  applyAll: boolean;
  setApplyAll: (v: boolean) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const dragIndex = useRef<number | null>(null);
  const t = useTranslations("dashboard.layout");
  const tSections = useTranslations("dashboard.layout.sections");
  const tAud = useTranslations("dashboard.layout.audiences");
  const audienceLabel = tAud(audience);
  const spaceBySlug = new Map(spaces.map((s) => [s.slug, s]));

  // Stable identity: fixed sections are unique by type, SPACE sections by slug.
  const keyOf = (s: LayoutSection) => (s.type === "SPACE" ? `SPACE:${s.value}` : s.type);
  const visible = sections.filter((s) => s.enabled);

  function commitVisible(next: LayoutSection[]) {
    setSections([...next, ...sections.filter((s) => !s.enabled)]);
  }

  function onDrop(target: number) {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from === null || from === target) return;
    const next = [...visible];
    const [moved] = next.splice(from, 1);
    next.splice(target, 0, moved);
    commitVisible(next);
  }

  // Enable → end of the visible block; disable → disabled block (always trailing).
  function setEnabledByKey(key: string, enabled: boolean) {
    const target = sections.find((s) => keyOf(s) === key);
    if (!target) return;
    const others = sections.filter((s) => keyOf(s) !== key);
    const visibleOthers = others.filter((s) => s.enabled);
    const disabledOthers = others.filter((s) => !s.enabled);
    setSections([...visibleOthers, { ...target, enabled }, ...disabledOthers]);
  }

  function addSpace(slug: string) {
    if (sections.some((s) => s.type === "SPACE" && s.value === slug)) {
      setEnabledByKey(`SPACE:${slug}`, true);
      return;
    }
    const vis = sections.filter((s) => s.enabled);
    const dis = sections.filter((s) => !s.enabled);
    setSections([...vis, { type: "SPACE", value: slug, id: uid(), enabled: true }, ...dis]);
  }

  // Fixed sections keep a hidden copy so they can be re-added; SPACE sections
  // (user-picked) are removed outright.
  function removeSection(s: LayoutSection) {
    if (s.type === "SPACE") setSections(sections.filter((x) => keyOf(x) !== keyOf(s)));
    else setEnabledByKey(s.type, false);
  }

  function labelFor(s: LayoutSection): string {
    if (s.type === "SPACE") return spaceBySlug.get(s.value ?? "")?.name ?? t("spaceRemoved");
    return tSections(s.type);
  }
  function iconFor(s: LayoutSection): IconName {
    if (s.type === "SPACE") return SPACE_TYPE_ICON[spaceBySlug.get(s.value ?? "")?.type ?? ""] ?? "spaces";
    return SECTION_META[s.type].icon;
  }

  return (
    <div className="px-6 py-6">
      <div className="mb-3 flex items-center gap-2 rounded-xl bg-[var(--brand-soft)] px-3 py-2 text-xs font-medium text-[color:var(--brand)]">
        <Icon name="eye" size={14} />
        {t("viewFor", { audience: audienceLabel })}
      </div>
      <p className="text-sm text-slate-500">
        {t("sectionsHint")}
      </p>

      <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
        <input
          type="checkbox"
          checked={applyAll}
          onChange={(e) => setApplyAll(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-slate-900"
        />
        <span>
          <span className="block text-sm font-medium text-slate-800">{t("applyAll")}</span>
          <span className="block text-xs text-slate-400">{t("applyAllHint")}</span>
        </span>
      </label>

      <div className="mt-4 space-y-2">
        {visible.map((s, i) => (
          <div
            key={keyOf(s)}
            draggable
            onDragStart={() => (dragIndex.current = i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(i)}
            className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 transition hover:border-slate-300"
          >
            <span className="cursor-grab text-slate-300 active:cursor-grabbing">
              <Icon name="grip" size={18} />
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Icon name={iconFor(s)} size={17} />
            </span>
            <span className="flex-1 truncate text-sm font-semibold text-slate-900">{labelFor(s)}</span>
            <button
              type="button"
              onClick={() => setEnabledByKey(keyOf(s), false)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label={t("hideAria")}
            >
              <Icon name="eye" size={16} />
            </button>
            <button
              type="button"
              onClick={() => removeSection(s)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
              aria-label={t("removeAria")}
            >
              <Icon name="trash" size={16} />
            </button>
          </div>
        ))}
        {visible.length === 0 && (
          <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
            {t("noSections")}
          </p>
        )}
      </div>

      <div className="relative mt-4">
        <button
          type="button"
          onClick={() => setAddOpen((v) => !v)}
          onBlur={() => setTimeout(() => setAddOpen(false), 180)}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
        >
          <Icon name="plus" size={16} /> {t("add")}
        </button>
        {addOpen && (
          <AddSectionDropdown
            sections={sections}
            spaces={spaces}
            onAdd={(type) => {
              setEnabledByKey(type, true);
              setAddOpen(false);
            }}
            onAddSpace={(slug) => {
              addSpace(slug);
              setAddOpen(false);
            }}
          />
        )}
      </div>
    </div>
  );
}

function AddSectionDropdown({
  sections,
  spaces,
  onAdd,
  onAddSpace,
}: {
  sections: LayoutSection[];
  spaces: { slug: string; name: string; visibility: string; type: string }[];
  onAdd: (t: SectionType) => void;
  onAddSpace: (slug: string) => void;
}) {
  const enabled = new Set(
    sections.filter((s) => s.enabled && s.type !== "SPACE").map((s) => s.type),
  );
  const enabledSpaces = new Set(
    sections.filter((s) => s.type === "SPACE" && s.enabled).map((s) => s.value),
  );
  const groups = Array.from(new Set(SECTION_CATALOG.map((s) => s.group)));
  const t = useTranslations("dashboard.layout");
  const tSections = useTranslations("dashboard.layout.sections");
  const tGroups = useTranslations("dashboard.layout.sectionGroups");
  return (
    <div className="absolute left-0 top-12 z-30 max-h-96 w-80 overflow-y-auto rounded-2xl border border-slate-200 bg-white py-2 shadow-xl">
      {groups.map((g) => (
        <div key={g}>
          <p className="px-4 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{tGroups(g)}</p>
          {SECTION_CATALOG.filter((s) => s.group === g).map((s) => {
            const added = enabled.has(s.type);
            return (
              <button
                key={s.type}
                type="button"
                disabled={added}
                onMouseDown={() => !added && onAdd(s.type)}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-2.5 text-left transition",
                  added ? "cursor-default" : "hover:bg-slate-50",
                )}
              >
                <Icon name={s.icon} size={18} className="text-slate-500" />
                <span className="flex-1 text-sm font-medium text-slate-800">{tSections(s.type)}</span>
                {added && <span className="text-xs font-medium text-slate-400">{t("added")}</span>}
              </button>
            );
          })}
        </div>
      ))}
      {spaces.length > 0 && (
        <div>
          <p className="px-4 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {tGroups("spaces")}
          </p>
          {spaces.map((sp) => {
            const added = enabledSpaces.has(sp.slug);
            return (
              <button
                key={sp.slug}
                type="button"
                disabled={added}
                onMouseDown={() => !added && onAddSpace(sp.slug)}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-2.5 text-left transition",
                  added ? "cursor-default" : "hover:bg-slate-50",
                )}
              >
                <Icon name={SPACE_TYPE_ICON[sp.type] ?? "spaces"} size={18} className="text-slate-500" />
                <span className="flex-1 truncate text-sm font-medium text-slate-800">{sp.name}</span>
                {added && <span className="shrink-0 text-xs font-medium text-slate-400">{t("added")}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Nav panel
function NavPanel({
  nav,
  setNav,
  spaces,
}: {
  nav: NavItemConfig[];
  setNav: (n: NavItemConfig[]) => void;
  spaces: { slug: string; name: string; visibility: string; type: string }[];
}) {
  const [addOpen, setAddOpen] = useState(false);
  const dragIndex = useRef<number | null>(null);
  const t = useTranslations("dashboard.layout");
  const tNav = useTranslations("dashboard.layout.navTypes");
  const spaceType = new Map(spaces.map((s) => [s.slug, s.type]));

  // SPACE items show the linked space's real type icon; others use the nav-type icon.
  function iconFor(item: NavItemConfig): IconName {
    if (item.type === "SPACE" && item.value) {
      return SPACE_TYPE_ICON[spaceType.get(item.value) ?? ""] ?? "spaces";
    }
    return NAV_TYPE_ICON[item.type];
  }

  function onDrop(target: number) {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from === null || from === target) return;
    const next = [...nav];
    const [moved] = next.splice(from, 1);
    next.splice(target, 0, moved);
    setNav(next);
  }

  return (
    <div className="px-6 py-6">
      <p className="text-sm text-slate-500">
        {t("navHint")}
      </p>

      <div className="mt-4 space-y-2">
        {nav.map((item, i) => (
          <div
            key={item.id}
            draggable
            onDragStart={() => (dragIndex.current = i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(i)}
            className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3"
          >
            <span className="cursor-grab text-slate-300 active:cursor-grabbing">
              <Icon name="grip" size={18} />
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Icon name={iconFor(item)} size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">{item.label}</p>
              <p className="truncate text-xs text-slate-400">
                {tNav(item.type)}
                {item.value ? ` · ${item.value}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setNav(nav.filter((n) => n.id !== item.id))}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
              aria-label={t("removeAria")}
            >
              <Icon name="trash" size={16} />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setAddOpen(true)}
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
      >
        <Icon name="plus" size={16} /> {t("add")}
      </button>

      {addOpen && (
        <AddNavModal
          spaces={spaces}
          onClose={() => setAddOpen(false)}
          onAdd={(item) => {
            setNav([...nav, item]);
            setAddOpen(false);
          }}
        />
      )}
    </div>
  );
}

// Custom, fully-styled select (no native browser dropdown).
function Dropdown<T extends string>({
  value,
  onChange,
  options,
  placeholder,
  ariaLabel,
}: {
  value: T | "";
  onChange: (v: T) => void;
  options: { value: T; label: string; hint?: string; icon?: IconName }[];
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("dashboard.layout");
  const current = options.find((o) => o.value === value);
  return (
    <div className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 160)}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-left text-sm outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-ring)]"
      >
        <span className={cn("flex min-w-0 items-center gap-2 truncate", !current && "text-slate-400")}>
          {current?.icon && <Icon name={current.icon} size={16} className="shrink-0 text-slate-500" />}
          <span className="truncate">{current ? current.label : placeholder ?? t("selectPlaceholder")}</span>
        </span>
        <Icon
          name="chevron"
          size={14}
          className={cn("shrink-0 text-slate-400 transition", open && "rotate-180")}
        />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 max-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white py-1.5 shadow-xl"
        >
          {options.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-400">{t("noOptions")}</p>
          ) : (
            options.map((o) => (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={o.value === value}
                onMouseDown={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition hover:bg-slate-50"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  {o.icon && <Icon name={o.icon} size={16} className="shrink-0 text-slate-500" />}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-800">{o.label}</span>
                    {o.hint && <span className="block truncate text-xs text-slate-400">{o.hint}</span>}
                  </span>
                </span>
                {o.value === value && <Icon name="check" size={16} className="shrink-0 text-slate-900" />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function AddNavModal({
  spaces,
  onClose,
  onAdd,
}: {
  spaces: { slug: string; name: string; visibility: string; type: string }[];
  onClose: () => void;
  onAdd: (item: NavItemConfig) => void;
}) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<NavType>("EXTERNAL");
  const [value, setValue] = useState("");
  const t = useTranslations("dashboard.layout");
  const tNav = useTranslations("dashboard.layout.navTypes");
  const tVis = useTranslations("dashboard.visibility");
  const dialogRef = useModalAccessibility<HTMLDivElement>({ open: true, onClose });

  const needsUrl = type === "EXTERNAL";
  const needsSpace = type === "SPACE";
  const canSave = title.trim().length > 0 && (!needsUrl || value.trim()) && (!needsSpace || value);

  function save() {
    if (!canSave) return;
    onAdd({
      id: uid(),
      label: title.trim().slice(0, 20),
      type,
      value: needsUrl ? value.trim() : needsSpace ? value : undefined,
    });
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-navigation-item-title"
      tabIndex={-1}
      className="fixed inset-0 z-[60] flex flex-col bg-white"
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <h2 id="add-navigation-item-title" className="text-xl font-bold text-slate-900">
          {t("addMenuItem")}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100"
          aria-label={t("close")}
        >
          <Icon name="close" size={20} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-6 py-8">
          <div className="flex items-center justify-between">
            <label className="text-sm font-bold text-slate-900">{t("titleLabel")}</label>
            <span className="text-xs text-slate-400">{title.length} / 20</span>
          </div>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 20))}
            placeholder={t("titlePlaceholder")}
            className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-ring)]"
          />

          <label className="mt-6 block text-sm font-bold text-slate-900">{t("linkType")}</label>
          <div className="mt-2">
            <Dropdown
              value={type}
              ariaLabel={t("linkTypeAria")}
              onChange={(v) => {
                setType(v);
                setValue("");
              }}
              options={(
                ["EXTERNAL", "SPACE", "HOME", "MEMBERS", "LIBRARY", "JOIN", "RECENTLY_VISITED"] as NavType[]
              ).map((nt) => ({ value: nt, label: tNav(nt), icon: NAV_TYPE_ICON[nt] }))}
            />
          </div>

          {needsUrl && (
            <>
              <label className="mt-6 block text-sm font-bold text-slate-900">{t("linkTo")}</label>
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={t("urlPlaceholder")}
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-ring)]"
              />
            </>
          )}
          {needsSpace && (
            <>
              <label className="mt-6 block text-sm font-bold text-slate-900">{t("chooseSpace")}</label>
              <p className="mt-0.5 text-xs text-slate-400">
                {t("chooseSpaceHint")}
              </p>
              <div className="mt-2">
                <Dropdown
                  value={value}
                  ariaLabel={t("spaceAria")}
                  placeholder={t("spacePlaceholder")}
                  onChange={(v) => setValue(v)}
                  options={spaces.map((s) => ({
                    value: s.slug,
                    label: s.name,
                    hint: tVis(`${s.visibility}.label`),
                    icon: SPACE_TYPE_ICON[s.type] ?? ("spaces" as IconName),
                  }))}
                />
              </div>
            </>
          )}
          {type === "RECENTLY_VISITED" && (
            <div className="mt-6 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-slate-500 ring-1 ring-slate-200">
                <Icon name="clock" size={18} />
              </span>
              <p className="text-xs leading-relaxed text-slate-500">
                {t("recentlyVisitedInfo")}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
        >
          {t("cancel")}
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-40"
        >
          {t("save")}
        </button>
      </div>
    </div>
  );
}
