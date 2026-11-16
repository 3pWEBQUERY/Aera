"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  updateBrandingAction,
  updateLogoAction,
  updateSubdomainAction,
  updateCustomDomainAction,
  verifyCustomDomainAction,
  deleteTenantAction,
  type ActionState,
} from "@/app/actions/dashboard";
import { AvatarUpload } from "./avatar-upload";
import { CoverUpload } from "./cover-upload";
import { Icon } from "./icons";
import { PlanSwitchSheet } from "./plan-switch-sheet";
import { PLAN_LABEL } from "./plan-badge";
import { useSettingsTabDirty } from "./settings-tabs";
import { CATEGORIES } from "@/lib/categories";
import { contrastWithWhite, normalizeHexColor } from "@/lib/color";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { FormError } from "@/components/ui/misc";
import { UploadFieldError } from "@/components/ui/upload-error";
import { cn } from "@/lib/utils";

const initial: ActionState = {};

function useTimeFormat() {
  const locale = useLocale();
  return (iso: string) =>
    new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

// ---------------------------------------------------------------- Branding

interface BrandingDraft {
  name: string;
  tagline: string;
  description: string;
  category: string;
  primary: string;
}

export function BrandingPanel({
  slug,
  tenant,
  coverUrl,
}: {
  slug: string;
  tenant: {
    name: string;
    tagline: string | null;
    description: string | null;
    logoUrl: string | null;
    primaryColor: string;
    category: string | null;
  };
  coverUrl: string | null;
}) {
  const [state, action, pending] = useActionState(updateBrandingAction, initial);
  const t = useTranslations("dashboard.branding");
  const tCat = useTranslations("categories");
  const formatTime = useTimeFormat();

  const [draft, setDraft] = useState<BrandingDraft>(() => ({
    name: tenant.name,
    tagline: tenant.tagline ?? "",
    description: tenant.description ?? "",
    category: tenant.category ?? "",
    primary: tenant.primaryColor.toUpperCase(),
  }));
  // Stand des letzten Speicherns — daran misst sich „ungespeichert“.
  const [saved, setSaved] = useState<BrandingDraft>(draft);
  const [colorError, setColorError] = useState(false);
  const colorInputRef = useRef<HTMLInputElement>(null);

  // Logo und Titelbild gelten sofort; sie sind deshalb nicht Teil des Entwurfs.
  const [logo, setLogo] = useState(tenant.logoUrl ?? "");
  const [cover, setCover] = useState(coverUrl ?? "");
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoSaving, startLogo] = useTransition();

  const parsedPrimary = normalizeHexColor(draft.primary);
  const previewColor = parsedPrimary ?? normalizeHexColor(saved.primary) ?? tenant.primaryColor;
  const dirty = (Object.keys(draft) as (keyof BrandingDraft)[]).some((k) => draft[k] !== saved[k]);
  useSettingsTabDirty(dirty);

  // Erfolgreich gespeichert: der aktuelle Entwurf ist der neue Stand.
  const lastSavedAt = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (state.savedAt && state.savedAt !== lastSavedAt.current) {
      lastSavedAt.current = state.savedAt;
      setSaved(draft);
    }
    // Nur auf eine neue Speicherung reagieren, nicht auf jede Eingabe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.savedAt]);

  const set = <K extends keyof BrandingDraft>(key: K, value: BrandingDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (pending) {
      e.preventDefault();
      return;
    }
    if (!parsedPrimary) {
      e.preventDefault();
      setColorError(true);
      colorInputRef.current?.focus();
    }
  }

  function onLogoChange(url: string) {
    setLogo(url);
    setLogoError(null);
    const fd = new FormData();
    fd.set("tenant", slug);
    fd.set("logoUrl", url);
    startLogo(async () => {
      const result = await updateLogoAction(fd);
      if (result.error) setLogoError(result.error);
    });
  }

  const showSaved = !!state.savedAt && !dirty && !state.error;

  return (
    <section className="min-w-0">
      <h2 className="text-lg font-semibold text-slate-900">{t("heading")}</h2>
      <p className="mt-0.5 text-sm text-slate-500">{t("desc")}</p>

      <div className="mt-6 grid min-w-0 gap-8 lg:grid-cols-5">
        <div className="min-w-0 space-y-6 lg:col-span-3">
          {/* Sofort wirksam: Titelbild und Logo. */}
          <div className="min-w-0 space-y-5 rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-900">{t("imagesHeading")}</p>
            <div className="min-w-0">
              <Label>{t("coverLabel")}</Label>
              <CoverUpload tenant={slug} defaultUrl={coverUrl} onChange={setCover} />
            </div>
            <div className="min-w-0">
              <Label>{t("logoLabel")}</Label>
              <AvatarUpload
                tenant={slug}
                name="_logo"
                purpose="logo"
                defaultUrl={tenant.logoUrl}
                fallbackName={tenant.name}
                onChange={onLogoChange}
              />
              {logoSaving && <p className="mt-1 text-xs text-slate-500">{t("logoSaving")}</p>}
              <UploadFieldError message={logoError} />
            </div>
            <p className="text-xs text-slate-500">{t("imagesApplied")}</p>
          </div>

          <form action={action} onSubmit={onSubmit} noValidate className="min-w-0 space-y-5">
            <input type="hidden" name="tenant" value={slug} />
            <div className="grid min-w-0 gap-5 sm:grid-cols-2">
              <div className="min-w-0">
                <Label htmlFor="br-name">{t("nameLabel")}</Label>
                <Input
                  id="br-name"
                  name="name"
                  value={draft.name}
                  onChange={(e) => set("name", e.target.value)}
                  maxLength={60}
                  required
                />
              </div>
              <div className="min-w-0">
                <Label htmlFor="br-tag">{t("taglineLabel")}</Label>
                <Input
                  id="br-tag"
                  name="tagline"
                  value={draft.tagline}
                  onChange={(e) => set("tagline", e.target.value)}
                  maxLength={160}
                  placeholder={t("taglinePlaceholder")}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="br-desc">{t("descriptionLabel")}</Label>
              <Textarea
                id="br-desc"
                name="description"
                rows={3}
                maxLength={2000}
                value={draft.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="br-cat">{t("categoryLabel")}</Label>
              <Select
                id="br-cat"
                name="category"
                value={draft.category}
                onChange={(v) => set("category", v)}
              >
                <option value="">{t("noCategory")}</option>
                {CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>{tCat(c.key)}</option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-slate-500">{t("categoryHint")}</p>
            </div>

            <ColorField
              id="br-primary"
              label={t("primaryColor")}
              name="primaryColor"
              value={draft.primary}
              onChange={(v) => {
                set("primary", v);
                if (normalizeHexColor(v)) setColorError(false);
              }}
              showError={colorError}
              inputRef={colorInputRef}
            />

            {/* Aktion und Rückmeldung stehen zusammen — die Meldung ist da, wo
                man gerade hinschaut, und wird vorgelesen. */}
            <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-end">
              <div className="min-w-0 sm:mr-auto">
                <FormError message={state.error} />
                <p role="status" aria-live="polite" className="text-sm">
                  {showSaved ? (
                    <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                      <Icon name="check" size={15} />
                      {t("savedAt", { time: formatTime(state.savedAt!) })}
                    </span>
                  ) : dirty ? (
                    <span className="text-amber-700">{t("unsaved")}</span>
                  ) : null}
                </p>
              </div>
              <button
                type="submit"
                aria-disabled={pending}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-[var(--primary-fg)] transition hover:bg-[var(--primary-hover)] active:scale-[0.98] aria-disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)] focus-visible:ring-offset-2"
              >
                {pending ? t("saving") : t("saveBranding")}
              </button>
            </div>
          </form>
        </div>

        {/* Vorschau: so wie der Kopf der Community wirklich aussieht. */}
        <div className="min-w-0 lg:col-span-2">
          <div className="lg:sticky lg:top-6">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">{t("preview")}</p>
            <BrandingPreview
              name={draft.name || t("previewName")}
              tagline={draft.tagline}
              logo={logo}
              cover={cover}
              color={previewColor}
              joinLabel={t("join")}
            />
            <p className="mt-2 text-xs text-slate-500">{t("previewHint")}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Kopfzeile + Kopfbereich („Editorial“) der Community-Seite, verkleinert. */
function BrandingPreview({
  name,
  tagline,
  logo,
  cover,
  color,
  joinLabel,
}: {
  name: string;
  tagline: string;
  logo: string;
  cover: string;
  color: string;
  joinLabel: string;
}) {
  return (
    <div aria-hidden="true" className="overflow-hidden rounded-2xl border border-slate-200 bg-[#f4f1ea]">
      <div className="flex items-center gap-2 border-b border-[#161613]/10 px-3 py-2.5">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="h-7 w-7 shrink-0 rounded-lg object-cover" />
        ) : (
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
            style={{ background: color }}
          >
            {name.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="display-serif min-w-0 flex-1 truncate text-base text-[#161613]">{name}</span>
        <span
          className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold text-white"
          style={{ backgroundColor: color }}
        >
          {joinLabel}
        </span>
      </div>
      <div className="p-3">
        <div className="relative aspect-[5/2] w-full overflow-hidden rounded-2xl">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: color }}>
              <span className="display-serif text-6xl leading-none text-white/25">
                {name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </div>
        <p className="display-serif mt-3 truncate text-2xl leading-tight text-[#161613]">{name}</p>
        {tagline && <p className="mt-1 line-clamp-2 text-sm text-[#161613]/65">{tagline}</p>}
      </div>
    </div>
  );
}

function ColorField({
  id,
  label,
  name,
  value,
  onChange,
  showError,
  inputRef,
}: {
  id: string;
  label: string;
  name: string;
  /** Rohtext, wie er getippt wurde. */
  value: string;
  onChange: (v: string) => void;
  /** Fehler auch ohne Tippen zeigen (nach dem Versuch zu speichern). */
  showError: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  // Der Rohtext bleibt stehen, wie er getippt wurde: aus Unsinn bleibt Unsinn
  // stehen, damit man sieht, was man geschrieben hat. Gespeichert wird genau
  // dieser Text — der Server lehnt ab, was keine Farbe ist.
  const parsed = normalizeHexColor(value);
  const t = useTranslations("dashboard.branding");
  const lowContrast = parsed !== null && contrastWithWhite(parsed) < 3;
  const invalid = !parsed && (showError || value.trim() !== "");
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div
        className={cn(
          "flex max-w-sm items-center gap-2 rounded-lg border p-1.5 transition focus-within:ring-2",
          invalid
            ? "border-red-400 focus-within:ring-red-100"
            : "border-slate-300 focus-within:border-[var(--brand)] focus-within:ring-[var(--brand-ring)]",
        )}
      >
        <input
          type="color"
          value={parsed ?? "#000000"}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          aria-label={t("pickAria", { label })}
          className="h-9 w-12 shrink-0 cursor-pointer rounded-md border-0 bg-transparent p-0"
        />
        <input
          ref={inputRef}
          id={id}
          type="text"
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          // Beim Verlassen nur aufraeumen, nicht verwerfen: aus "6d28d9" wird "#6D28D9".
          onBlur={() => parsed && parsed.toUpperCase() !== value && onChange(parsed.toUpperCase())}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          maxLength={32}
          aria-invalid={invalid}
          aria-describedby={invalid ? errorId : hintId}
          className="w-full min-w-0 bg-transparent font-mono text-sm text-slate-700 outline-none placeholder:text-slate-400"
          placeholder="#6D28D9"
        />
      </div>
      {invalid ? (
        <p id={errorId} role="alert" className="mt-1 text-xs text-red-700">{t("hexError")}</p>
      ) : (
        <p id={hintId} className="mt-1 text-xs text-slate-500">{t("hexHint")}</p>
      )}
      {lowContrast && (
        <p className="mt-1 text-xs text-amber-700">{t("contrastWarning")}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Domain

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const t = useTranslations("dashboard.domain");
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Zwischenablage nicht verfügbar (z. B. unsicherer Kontext) — der Wert
      // steht daneben und lässt sich markieren.
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? t("copiedAria") : t("copyAria", { label })}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]",
        copied
          ? "bg-green-100 text-green-700"
          : "bg-[var(--action)] text-[var(--action-fg)] hover:bg-[var(--action-hover)]",
      )}
    >
      <Icon name={copied ? "check" : "copy"} size={14} />
      <span aria-hidden="true">{copied ? t("copied") : t("copy")}</span>
    </button>
  );
}

function CopyableAddress({
  label,
  value,
  copyValue,
}: {
  label: string;
  value: string;
  /** Copied to the clipboard instead of the displayed value (e.g. full URL). */
  copyValue?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="truncate font-mono text-sm text-slate-700">{value}</p>
      </div>
      <CopyButton value={copyValue ?? value} label={label} />
    </div>
  );
}

/**
 * Teilt eine Domain in Vorsilbe und Zone, damit die Anleitung den „Namen“ so
 * nennt, wie ihn DNS-Anbieter erwarten (ohne die Zone). Zweistufige Endungen
 * wie .co.uk werden als Zone erkannt; im Zweifel steht der volle Name daneben.
 */
export function splitDomain(domain: string): { host: string; zone: string } {
  const parts = domain.split(".");
  const secondLevel = new Set(["co", "com", "org", "net", "ac", "gov", "edu"]);
  const zoneLen =
    parts.length >= 3 && parts[parts.length - 1].length === 2 && secondLevel.has(parts[parts.length - 2])
      ? 3
      : 2;
  return {
    host: parts.slice(0, Math.max(0, parts.length - zoneLen)).join("."),
    zone: parts.slice(-zoneLen).join("."),
  };
}

function DnsRecord({
  type,
  name,
  fullName,
  value,
  note,
}: {
  type: string;
  name: string;
  fullName: string;
  value: string;
  note?: React.ReactNode;
}) {
  const t = useTranslations("dashboard.domain");
  return (
    <li className="min-w-0 rounded-xl border border-slate-200 bg-white p-3.5">
      <dl className="grid min-w-0 gap-2.5 text-sm">
        <div className="flex min-w-0 items-center gap-3">
          <dt className="w-20 shrink-0 text-xs font-medium text-slate-500">{t("recordType")}</dt>
          <dd className="min-w-0 flex-1 font-mono font-semibold text-slate-900">{type}</dd>
        </div>
        <div className="flex min-w-0 items-center gap-3">
          <dt className="w-20 shrink-0 text-xs font-medium text-slate-500">{t("recordName")}</dt>
          <dd className="min-w-0 flex-1">
            <span className="block break-all font-mono text-slate-900">{name}</span>
            {fullName !== name && (
              <span className="block break-all text-xs text-slate-500">{t("recordFullName", { name: fullName })}</span>
            )}
          </dd>
          <CopyButton value={name} label={`${type} ${t("recordName")}`} />
        </div>
        <div className="flex min-w-0 items-center gap-3">
          <dt className="w-20 shrink-0 text-xs font-medium text-slate-500">{t("recordValue")}</dt>
          <dd className="min-w-0 flex-1 break-all font-mono text-slate-900">{value}</dd>
          <CopyButton value={value} label={`${type} ${t("recordValue")}`} />
        </div>
      </dl>
      {note && <p className="mt-2.5 text-xs leading-relaxed text-slate-600">{note}</p>}
    </li>
  );
}

function CustomDomainSection({
  slug,
  rootDomain,
  tenantId,
  customDomain,
  verified,
  allowed,
}: {
  slug: string;
  rootDomain: string;
  tenantId: string;
  customDomain: string | null;
  verified: boolean;
  allowed: boolean;
}) {
  const t = useTranslations("dashboard.domain");
  const [saveState, saveAction, saving] = useActionState(updateCustomDomainAction, initial);
  const [verifyState, verifyAction, verifying] = useActionState(verifyCustomDomainAction, initial);
  const [value, setValue] = useState(customDomain ?? "");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [plansOpen, setPlansOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();

  if (!allowed) {
    return (
      <div className="mt-8 border-t border-slate-100 pt-6">
        <h3 className="text-base font-semibold text-slate-900">{t("customHeading")}</h3>
        <div className="mt-3 flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-600">{t("customLocked", { plan: PLAN_LABEL.PRO })}</p>
          <button
            type="button"
            onClick={() => setPlansOpen(true)}
            className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-fg)] transition hover:bg-[var(--primary-hover)] sm:self-auto"
          >
            {t("customUpgrade", { plan: PLAN_LABEL.PRO })}
            <Icon name="arrowRight" size={15} />
          </button>
        </div>
        <PlanSwitchSheet open={plansOpen} onClose={() => setPlansOpen(false)} slug={slug} />
      </div>
    );
  }

  const status: "none" | "pending" | "verified" = !customDomain
    ? "none"
    : verified || verifyState.ok
      ? "verified"
      : "pending";

  function validate(raw: string): string | null {
    const v = raw.trim().toLowerCase();
    if (!v) return null;
    if (/^[a-z]+:\/\//.test(v) || v.includes("/") || v.includes(" ") || v.includes("@")) {
      return t("customErrorUrl");
    }
    if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(v)) return t("customErrorFormat");
    if (v === rootDomain || v.endsWith(`.${rootDomain}`)) return t("customErrorRoot", { root: rootDomain });
    return null;
  }

  function onSave(e: React.FormEvent<HTMLFormElement>) {
    const err = validate(value);
    setFieldError(err);
    if (err) {
      e.preventDefault();
      inputRef.current?.focus();
    }
  }

  const { host } = splitDomain(customDomain ?? "");
  const routeRecord = customDomain
    ? host
      ? { type: "CNAME", name: host, fullName: customDomain }
      : { type: "ALIAS / ANAME", name: "@", fullName: customDomain }
    : null;
  const txtName = host ? `_aera.${host}` : "_aera";
  const txtValue = `aera-verify=${tenantId}`;
  const statusCls = {
    none: "bg-slate-100 text-slate-600",
    pending: "bg-amber-100 text-amber-800",
    verified: "bg-green-100 text-green-800",
  }[status];
  const shownError = fieldError ?? saveState.error ?? null;

  return (
    <div className="mt-8 border-t border-slate-100 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-slate-900">{t("customHeading")}</h3>
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", statusCls)}>
          {t(`customStatus.${status}`)}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-500">{t("customDesc")}</p>

      <form action={saveAction} onSubmit={onSave} noValidate className="mt-4 space-y-2">
        <input type="hidden" name="tenant" value={slug} />
        <Label htmlFor="custom-domain">{t("customLabel")}</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            ref={inputRef}
            id="custom-domain"
            name="customDomain"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (fieldError) setFieldError(validate(e.target.value));
            }}
            placeholder={t("customDomainPlaceholder")}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={!!shownError}
            aria-describedby={shownError ? errorId : `${errorId}-hint`}
            className="py-2.5 sm:flex-1"
          />
          <button
            type="submit"
            aria-disabled={saving}
            className="rounded-xl bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-[var(--primary-fg)] transition hover:bg-[var(--primary-hover)] aria-disabled:opacity-60"
          >
            {saving ? t("saving") : t("customSave")}
          </button>
        </div>
        {shownError ? (
          <p id={errorId} role="alert" className="text-sm text-red-700">{shownError}</p>
        ) : (
          <p id={`${errorId}-hint`} className="text-xs text-slate-500">{t("customHint")}</p>
        )}
        <p role="status" aria-live="polite" className="text-sm text-emerald-700">
          {saveState.ok && !shownError ? t("savedDomain") : null}
        </p>
      </form>

      {customDomain && routeRecord && status !== "verified" && (
        <div className="mt-6 space-y-4">
          <h4 className="text-sm font-semibold text-slate-900">{t("guideHeading", { domain: customDomain })}</h4>
          <ol className="space-y-4 text-sm text-slate-700">
            <li>
              <span className="font-semibold">1.</span> {t("guideStep1")}
            </li>
            <li>
              <span className="font-semibold">2.</span> {t("guideStep2")}
            </li>
            <li className="space-y-3">
              <p>
                <span className="font-semibold">3.</span> {t("guideStep3")}
              </p>
              <ul className="space-y-3">
                <DnsRecord
                  type={routeRecord.type}
                  name={routeRecord.name}
                  fullName={routeRecord.fullName}
                  value={rootDomain}
                  note={host ? t("routeNoteCname") : t("routeNoteApex")}
                />
                <DnsRecord
                  type="TXT"
                  name={txtName}
                  fullName={`_aera.${customDomain}`}
                  value={txtValue}
                  note={t("txtNote")}
                />
              </ul>
            </li>
            <li>
              <span className="font-semibold">4.</span> {t("guideStep4")}
            </li>
          </ol>
        </div>
      )}

      {customDomain && (
        <form action={verifyAction} className="mt-5 space-y-2">
          <input type="hidden" name="tenant" value={slug} />
          <button
            type="submit"
            aria-disabled={verifying}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 aria-disabled:opacity-60"
          >
            <Icon name="globe" size={16} />
            {verifying ? t("checkingDns") : t("checkNow")}
          </button>
          <FormError message={verifyState.error} />
          <p role="status" aria-live="polite" className="text-sm text-emerald-700">
            {verifyState.ok ? t("verifiedNow", { domain: customDomain }) : null}
          </p>
          {status === "verified" && !verifyState.ok && (
            <p className="text-sm text-slate-600">{t("verifiedHint", { domain: customDomain })}</p>
          )}
        </form>
      )}
    </div>
  );
}

export function DomainPanel({
  slug,
  rootDomain,
  subdomain,
  tenantId,
  customDomain,
  customDomainVerified,
  customDomainAllowed,
}: {
  slug: string;
  rootDomain: string;
  /** Vom Creator gewählte Wunsch-Subdomain; null = Standard (= Slug). */
  subdomain: string | null;
  tenantId: string;
  customDomain: string | null;
  customDomainVerified: boolean;
  customDomainAllowed: boolean;
}) {
  const [state, action, pending] = useActionState(updateSubdomainAction, initial);
  const t = useTranslations("dashboard.domain");
  const current = subdomain ?? slug;
  const [draft, setDraft] = useState(current);
  const draftSub = draft.trim().toLowerCase() || slug;
  // Die Standardadresse (Kürzel) bleibt immer erreichbar; verloren geht nur
  // eine eigene Wunsch-Subdomain, wenn sie ersetzt wird.
  const losesOldAddress = subdomain !== null && draftSub !== subdomain;
  useSettingsTabDirty(draft !== current && !state.ok);

  return (
    <section className="min-w-0">
      <h2 className="text-lg font-semibold text-slate-900">{t("heading")}</h2>
      <p className="mt-0.5 text-sm text-slate-500">{t("desc")}</p>

      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        <CopyableAddress
          label={t("pathLabel")}
          value={`${rootDomain}/c/${slug}`}
          copyValue={`https://${rootDomain}/c/${slug}`}
        />
        <CopyableAddress
          label={t("subdomainLabel")}
          value={`${current}.${rootDomain}`}
          copyValue={`https://${current}.${rootDomain}`}
        />
      </div>

      <form action={action} className="mt-6 space-y-2 border-t border-slate-100 pt-6">
        <input type="hidden" name="tenant" value={slug} />
        <Label htmlFor="sub">{t("subEditLabel")}</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex min-w-0 items-stretch overflow-hidden rounded-xl border border-slate-300 focus-within:border-slate-500 focus-within:ring-2 focus-within:ring-slate-200 sm:flex-1">
            <input
              id="sub"
              name="subdomain"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t("subPlaceholder")}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={!!state.error}
              aria-describedby="sub-hint"
              className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm outline-none"
            />
            <span className="flex min-w-0 items-center truncate bg-slate-50 px-3 text-sm text-slate-500">
              .{rootDomain}
            </span>
          </div>
          <button
            type="submit"
            aria-disabled={pending}
            className="rounded-xl bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-[var(--primary-fg)] transition hover:bg-[var(--primary-hover)] aria-disabled:opacity-60"
          >
            {pending ? t("saving") : t("save")}
          </button>
        </div>
        <FormError message={state.error} />
        {losesOldAddress && (
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
            {t("subWarning", { old: `${subdomain}.${rootDomain}` })}
          </p>
        )}
        <p role="status" aria-live="polite" className="text-sm text-emerald-700">
          {state.ok ? t("subSaved") : null}
        </p>
        <p id="sub-hint" className="text-xs text-slate-500">
          {t("subHint", { fallback: `${slug}.${rootDomain}` })}
        </p>
      </form>

      <CustomDomainSection
        slug={slug}
        rootDomain={rootDomain}
        tenantId={tenantId}
        customDomain={customDomain}
        verified={customDomainVerified}
        allowed={customDomainAllowed}
      />
    </section>
  );
}

// ---------------------------------------------------------------- Danger zone

export function DangerZone({
  slug,
  name,
  exportAvailable,
}: {
  slug: string;
  name: string;
  /** Datenexport im Paket: dann vor dem Löschen darauf hinweisen. */
  exportAvailable: boolean;
}) {
  const router = useRouter();
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string>();
  const t = useTranslations("dashboard.danger");
  const matches = confirmText.trim() === slug;

  // Das Eintippen des Kürzels ist die Rückfrage — ein zusätzlicher Dialog
  // danach fragte dasselbe ein zweites Mal.
  async function onDelete() {
    if (!matches || busy) return;
    setBusy(true);
    setDeleteError(undefined);
    const fd = new FormData();
    fd.set("tenant", slug);
    fd.set("confirm", confirmText.trim());
    const result = await deleteTenantAction(fd);
    if (result.error) {
      setDeleteError(result.error);
      setBusy(false);
      return;
    }
    router.push(`/dashboard?deleted=${encodeURIComponent(slug)}`);
  }

  return (
    <section className="min-w-0">
      <h2 className="text-lg font-semibold text-slate-900">{t("heading")}</h2>
      <p className="mt-0.5 text-sm text-slate-500">{t("desc")}</p>
      <div className="mt-6 rounded-xl border border-red-200 bg-red-50/40 p-4 sm:p-5">
        <p className="font-medium text-red-700">{t("deleteCommunity")}</p>
        <p className="mt-1 text-sm text-slate-600">{t("deleteDesc")}</p>
        {exportAvailable && (
          <p className="mt-2 text-sm text-slate-600">
            {t.rich("exportFirst", {
              link: (chunks) => (
                <Link
                  href={`/dashboard/${slug}/export`}
                  className="font-semibold text-slate-900 underline underline-offset-2"
                >
                  {chunks}
                </Link>
              ),
            })}
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void onDelete();
          }}
          className="mt-4"
        >
          <Label htmlFor="danger-confirm">{t("confirmLabel", { slug })}</Label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              id="danger-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              aria-describedby={deleteError ? "danger-error" : undefined}
              className="sm:max-w-xs"
            />
            <button
              type="submit"
              disabled={!matches || busy}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-40"
            >
              <Icon name="archive" size={16} />
              {busy ? t("deleting") : t("deleteCommunity")}
            </button>
          </div>
          <FormError id="danger-error" message={deleteError} />
        </form>
      </div>
    </section>
  );
}
