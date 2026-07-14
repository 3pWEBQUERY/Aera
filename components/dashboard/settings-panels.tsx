"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  updateBrandingAction,
  updateCustomDomainAction,
  verifyCustomDomainAction,
  deleteTenantAction,
  type ActionState,
} from "@/app/actions/dashboard";
import { AvatarUpload } from "./avatar-upload";
import { CoverUpload } from "./cover-upload";
import { Icon } from "./icons";
import { CATEGORIES } from "@/lib/categories";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { FormError } from "@/components/ui/misc";

const initial: ActionState = {};

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
    accentColor: string;
    category: string | null;
  };
  coverUrl: string | null;
}) {
  const [state, action, pending] = useActionState(updateBrandingAction, initial);
  const [name, setName] = useState(tenant.name);
  const [tagline, setTagline] = useState(tenant.tagline ?? "");
  const [primary, setPrimary] = useState(tenant.primaryColor);
  const [accent, setAccent] = useState(tenant.accentColor);
  const [logo, setLogo] = useState(tenant.logoUrl ?? "");
  const t = useTranslations("dashboard.branding");
  const tCat = useTranslations("categories");

  return (
    <section>
      <h2 className="text-lg font-semibold text-slate-900">{t("heading")}</h2>
      <p className="mt-0.5 text-sm text-slate-500">{t("desc")}</p>

      <form action={action} className="mt-6 grid gap-8 lg:grid-cols-5">
        <input type="hidden" name="tenant" value={slug} />
        <div className="space-y-5 lg:col-span-3">
          {state.ok && (
            <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{t("saved")}</p>
          )}
          <FormError message={state.error} />

          <div>
            <Label>{t("coverLabel")}</Label>
            <CoverUpload tenant={slug} defaultUrl={coverUrl} />
          </div>

          <div>
            <Label>{t("logoLabel")}</Label>
            <AvatarUpload tenant={slug} name="logoUrl" purpose="logo" defaultUrl={tenant.logoUrl} fallbackName={tenant.name} onChange={setLogo} />
            <p className="mt-1.5 text-xs text-slate-400">
              {t("logoHint")}
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Label htmlFor="br-name">{t("nameLabel")}</Label>
              <Input id="br-name" name="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="br-tag">{t("taglineLabel")}</Label>
              <Input id="br-tag" name="tagline" value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder={t("taglinePlaceholder")} />
            </div>
          </div>

          <div>
            <Label htmlFor="br-desc">{t("descriptionLabel")}</Label>
            <Textarea id="br-desc" name="description" rows={3} defaultValue={tenant.description ?? ""} />
          </div>

          <div>
            <Label htmlFor="br-cat">{t("categoryLabel")}</Label>
            <Select id="br-cat" name="category" defaultValue={tenant.category ?? ""}>
              <option value="">{t("noCategory")}</option>
              {CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>{tCat(c.key)}</option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-slate-400">
              {t("categoryHint")}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <ColorField label={t("primaryColor")} name="primaryColor" value={primary} onChange={setPrimary} />
            <ColorField label={t("accentColor")} name="accentColor" value={accent} onChange={setAccent} />
          </div>
        </div>

        {/* Live preview */}
        <div className="lg:col-span-2">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">{t("preview")}</p>
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <div
              className="flex items-center gap-3 p-5 text-white"
              style={{ backgroundImage: `linear-gradient(135deg, ${primary}, ${accent})` }}
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/20 text-lg font-bold ring-1 ring-white/30">
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logo} alt="" className="h-full w-full object-cover" />
                ) : (
                  (name || "A").charAt(0).toUpperCase()
                )}
              </span>
              <div className="min-w-0">
                <p className="truncate text-lg font-bold leading-tight">{name || t("previewName")}</p>
                {tagline && <p className="truncate text-sm text-white/85">{tagline}</p>}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 bg-white p-4">
              <span className="text-sm text-slate-500">{t("joinButtonLabel")}</span>
              <span className="rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: primary }}>
                {t("join")}
              </span>
            </div>
          </div>
        </div>

        {/* Footer: spans both columns, action right-aligned. */}
        <div className="flex items-center justify-end border-t border-slate-100 pt-5 lg:col-span-5">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)] focus-visible:ring-offset-2"
          >
            {pending ? t("saving") : t("saveBranding")}
          </button>
        </div>
      </form>
    </section>
  );
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function ColorField({
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
  // Local draft so the hex field is freely editable; only valid hex values
  // propagate to the picker, preview and submitted form value.
  const [draft, setDraft] = useState(value);
  const valid = HEX_RE.test(draft);
  const t = useTranslations("dashboard.branding");

  function commit(v: string) {
    setDraft(v);
    if (HEX_RE.test(v)) onChange(v);
  }

  return (
    <div>
      <Label>{label}</Label>
      <div
        className={`flex items-center gap-2 rounded-lg border p-1.5 transition focus-within:ring-2 ${
          valid
            ? "border-slate-300 focus-within:border-[var(--brand)] focus-within:ring-[var(--brand-ring)]"
            : "border-red-300 focus-within:ring-red-100"
        }`}
      >
        <input
          type="color"
          value={valid ? draft : value}
          onChange={(e) => commit(e.target.value)}
          aria-label={t("pickAria", { label })}
          className="h-9 w-12 shrink-0 cursor-pointer rounded-md border-0 bg-transparent p-0"
        />
        <input
          type="text"
          value={draft}
          onChange={(e) => {
            const v = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
            commit(v.slice(0, 7));
          }}
          onBlur={() => {
            if (!valid) setDraft(value); // revert invalid input
          }}
          spellCheck={false}
          aria-label={t("hexAria", { label })}
          className="w-full min-w-0 bg-transparent font-mono text-sm uppercase text-slate-600 outline-none placeholder:text-slate-300"
          placeholder="#6D28D9"
        />
        <input type="hidden" name={name} value={value} />
      </div>
      {!valid && (
        <p className="mt-1 text-xs text-red-600">{t("hexError")}</p>
      )}
    </div>
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
  const [copied, setCopied] = useState(false);
  const t = useTranslations("dashboard.domain");

  async function copy() {
    try {
      await navigator.clipboard.writeText(copyValue ?? value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — ignore silently.
    }
  }

  return (
    <div className="group flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate-400">{label}</p>
        <p className="truncate font-mono text-sm text-slate-700">{value}</p>
      </div>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? t("copiedAria") : t("copyAria", { label })}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)] ${
          copied
            ? "bg-green-100 text-green-700"
            : "text-slate-400 hover:bg-white hover:text-slate-700 hover:shadow-sm"
        }`}
      >
        <Icon name={copied ? "check" : "copy"} size={15} />
      </button>
    </div>
  );
}

export function DomainPanel({
  slug,
  rootDomain,
  customDomain,
  domainVerified = false,
  tenantId,
}: {
  slug: string;
  rootDomain: string;
  customDomain: string | null;
  /** True, sobald der DNS-Nachweis erbracht wurde. */
  domainVerified?: boolean;
  /** Für den TXT-Verifizierungswert (aera-verify=<tenantId>). */
  tenantId?: string;
}) {
  const [state, action, pending] = useActionState(updateCustomDomainAction, initial);
  const [verifyState, verifyAction, verifying] = useActionState(
    verifyCustomDomainAction,
    initial,
  );
  const t = useTranslations("dashboard.domain");
  return (
    <section>
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
          value={`${slug}.${rootDomain}`}
          copyValue={`https://${slug}.${rootDomain}`}
        />
      </div>

      <form action={action} className="mt-6 space-y-2 border-t border-slate-100 pt-6">
        <input type="hidden" name="tenant" value={slug} />
        <Label htmlFor="dom">{t("customDomainLabel")}</Label>
        {state.ok && <p className="text-sm text-green-700">{t("savedDomain")}</p>}
        <FormError message={state.error} />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input id="dom" name="customDomain" defaultValue={customDomain ?? ""} placeholder={t("customDomainPlaceholder")} className="sm:flex-1" />
          <button type="submit" disabled={pending} className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50">
            {pending ? t("saving") : t("save")}
          </button>
        </div>
        <p className="text-xs text-slate-400">{t("cnameHint", { rootDomain })}</p>
      </form>

      {/* Verifizierungs-Status + DNS-Anleitung */}
      {customDomain && (
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                domainVerified
                  ? "bg-green-100 text-green-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              <Icon name={domainVerified ? "check" : "clock"} size={13} />
              {domainVerified ? t("verifiedActive") : t("verifyPending")}
            </span>
            <span className="min-w-0 truncate text-sm font-medium text-slate-700">
              {customDomain}
            </span>
            {!domainVerified && (
              <form action={verifyAction} className="ml-auto">
                <input type="hidden" name="tenant" value={slug} />
                <button
                  type="submit"
                  disabled={verifying}
                  className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                >
                  {verifying ? t("checkingDns") : t("checkNow")}
                </button>
              </form>
            )}
          </div>
          {verifyState.error && (
            <p className="mt-2 text-xs text-amber-700">{verifyState.error}</p>
          )}
          {!domainVerified && (
            <div className="mt-3 space-y-1.5 text-xs leading-relaxed text-slate-500">
              <p className="font-semibold text-slate-600">
                {t("dnsIntro")}
              </p>
              <p>
                {t.rich("optionA", {
                  domain: customDomain,
                  root: rootDomain,
                  b: (c) => <span className="font-medium">{c}</span>,
                  code: (c) => <code className="rounded bg-white px-1.5 py-0.5 ring-1 ring-slate-200">{c}</code>,
                })}
              </p>
              {tenantId && (
                <p>
                  {t.rich("optionB", {
                    domain: customDomain,
                    tenantId,
                    b: (c) => <span className="font-medium">{c}</span>,
                    code: (c) => <code className="rounded bg-white px-1.5 py-0.5 ring-1 ring-slate-200">{c}</code>,
                  })}
                </p>
              )}
              <p>{t("dnsWait")}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function DangerZone({ slug, name }: { slug: string; name: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const t = useTranslations("dashboard.danger");

  async function onDelete() {
    if (confirm !== slug) return;
    if (!window.confirm(t("confirmDelete", { name }))) return;
    setBusy(true);
    const fd = new FormData();
    fd.set("tenant", slug);
    fd.set("confirm", confirm);
    await deleteTenantAction(fd);
    router.push("/dashboard");
  }

  return (
    <section>
      <h2 className="text-lg font-semibold text-slate-900">{t("heading")}</h2>
      <p className="mt-0.5 text-sm text-slate-500">
        {t("desc")}
      </p>
      <div className="mt-6 rounded-xl border border-red-200 bg-red-50/40 p-5">
        <p className="font-medium text-red-700">{t("deleteCommunity")}</p>
        <p className="mt-1 text-sm text-slate-600">
          {t("deleteDesc")}
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={t("confirmPlaceholder", { slug })}
          className="sm:max-w-xs"
        />
        <button
          type="button"
          onClick={onDelete}
          disabled={confirm !== slug || busy}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-40"
        >
          <Icon name="archive" size={16} />
          {busy ? t("deleting") : t("deleteCommunity")}
        </button>
        </div>
      </div>
    </section>
  );
}
