"use client";

import { useActionState, useEffect, useId, useState, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  adminUpdateTenantAction,
  adminDeleteTenantAction,
  adminVerifyTenantDomainAction,
  type AdminState,
  type AdminDomainState,
} from "@/app/actions/admin";
import { Sheet } from "@/components/dashboard/sheet";
import { Icon } from "@/components/dashboard/icons";
import { Pill, FormError, EmptyState } from "@/components/ui/misc";
import { Input, Label, Select } from "@/components/ui/field";
import { CATEGORIES, categoryByKey } from "@/lib/categories";
import { cn, formatDate } from "@/lib/utils";
import { PLAN_ORDER } from "@/lib/credit-plans";
import { PlanBadge, PLAN_LABEL } from "@/components/dashboard/plan-badge";
import type { PlanKey } from "@/lib/plan-features";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useConfirmedSubmit } from "@/components/ui/use-confirmed-submit";

export interface TenantRow {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  logoUrl: string | null;
  primaryColor: string;
  customDomain: string | null;
  /** ISO-Zeitpunkt des DNS-Nachweises; null = nicht verifiziert, wird nicht ausgeliefert. */
  customDomainVerifiedAt: string | null;
  platformFeePercent: number;
  status: "ACTIVE" | "SUSPENDED" | "DELETING";
  category: string | null;
  createdAt: string;
  ownerName: string;
  ownerEmail: string;
  members: number;
  posts: number;
  orders: number;
  creatorPlan: PlanKey;
  planSource: "DEFAULT" | "STRIPE" | "PROMO" | "MANUAL";
  /** Stripe besitzt die Wallet — das Paket darf hier nicht gesetzt werden. */
  billingLocked: boolean;
}

const initial: AdminState = {};
const initialDomain: AdminDomainState = {};

const STATUS_PILL: Record<TenantRow["status"], { cls: string; key: string }> = {
  ACTIVE: { cls: "bg-emerald-50 text-emerald-700", key: "statusActive" },
  SUSPENDED: { cls: "bg-amber-50 text-amber-700", key: "statusSuspended" },
  DELETING: { cls: "bg-red-50 text-red-700", key: "statusDeleting" },
};

export function CommunitiesManager({
  rows,
  total,
  q,
  status,
  plan,
  rootDomain,
}: {
  rows: TenantRow[];
  total: number;
  q: string;
  /** Aktiver Status-Filter ("" = alle). */
  status: string;
  /** Aktiver Paket-Filter ("" = alle). */
  plan: string;
  rootDomain: string;
}) {
  const [editing, setEditing] = useState<TenantRow | null>(null);
  const t = useTranslations("admin.communities");
  const tc = useTranslations("admin");
  const tCat = useTranslations("categories");
  const locale = useLocale();
  const nf = new Intl.NumberFormat(locale);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            {t("title")}
            <Pill className="bg-slate-100 text-slate-600">{nf.format(total)}</Pill>
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {t("subtitle")}
          </p>
        </div>
      </div>

      <form
        method="GET"
        action="/admin/communities"
        role="search"
        className="flex flex-col gap-3 lg:flex-row lg:items-end"
      >
        <div className="min-w-0 flex-1 lg:max-w-md">
          <label htmlFor="ac-q" className="mb-1.5 block text-sm font-medium text-slate-700">
            {t("searchAria")}
          </label>
          <div className="flex items-center gap-2.5 rounded-full border border-slate-200 bg-white px-4 py-2.5 transition focus-within:border-[var(--brand)] focus-within:ring-2 focus-within:ring-[var(--brand-ring)]">
            <Icon name="search" size={17} className="shrink-0 text-slate-500" />
            <input
              id="ac-q"
              type="search"
              name="q"
              defaultValue={q}
              placeholder={t("searchPlaceholder")}
              className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-slate-500"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:flex sm:items-end">
          <div className="min-w-0 sm:w-44">
            <Label htmlFor="ac-status">{t("filterStatus")}</Label>
            <Select id="ac-status" name="status" defaultValue={status}>
              <option value="">{t("filterAll")}</option>
              <option value="ACTIVE">{t("statusActive")}</option>
              <option value="SUSPENDED">{t("statusSuspended")}</option>
              <option value="DELETING">{t("statusDeleting")}</option>
            </Select>
          </div>
          <div className="min-w-0 sm:w-40">
            <Label htmlFor="ac-plan">{t("plan")}</Label>
            <Select id="ac-plan" name="plan" defaultValue={plan}>
              <option value="">{t("filterAll")}</option>
              {PLAN_ORDER.map((p) => (
                <option key={p} value={p}>
                  {PLAN_LABEL[p]}
                </option>
              ))}
            </Select>
          </div>
          <div className="col-span-2 flex items-center gap-3 sm:col-span-1">
            <button
              type="submit"
              className="inline-flex h-10 shrink-0 items-center rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-[var(--primary-fg)] transition hover:bg-[var(--primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
            >
              {t("applyFilters")}
            </button>
            {(q || status || plan) && (
              <a
                href="/admin/communities"
                className="inline-flex min-h-6 items-center text-sm font-medium text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline"
              >
                {t("resetFilters")}
              </a>
            )}
          </div>
        </div>
      </form>

      <div className="space-y-2.5">
        {rows.length === 0 ? (
          <EmptyState
            icon="spaces"
            title={q || status || plan ? tc("noResults") : t("emptyTitle")}
            hint={q ? t("noResultsHint", { q }) : status || plan ? t("noFilterResultsHint") : t("emptyHint")}
          />
        ) : (
          rows.map((tn) => {
            const cat = categoryByKey(tn.category);
            const pill = STATUS_PILL[tn.status] ?? STATUS_PILL.ACTIVE;
            // Waehrend der Loeschung ist die Community eingefroren.
            const editable = tn.status !== "DELETING";
            return (
              <div
                key={tn.id}
                // Die Karte ist fuer die Maus klickbar; Tastatur und Screenreader
                // nutzen den Button am Namen (eine role="button"-Karte darf
                // keine Links enthalten).
                onClick={editable ? () => setEditing(tn) : undefined}
                className={cn(
                  "group flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition sm:flex-nowrap sm:gap-4",
                  "focus-within:ring-2 focus-within:ring-[var(--brand-ring)]",
                  editable ? "cursor-pointer hover:border-slate-300 hover:shadow-sm" : "bg-slate-50",
                )}
              >
                {tn.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={tn.logoUrl}
                    alt=""
                    className="h-11 w-11 shrink-0 rounded-xl object-cover ring-1 ring-black/5"
                  />
                ) : (
                  <span
                    aria-hidden
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-base font-bold text-white"
                    style={{ backgroundColor: tn.primaryColor }}
                  >
                    {tn.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {editable ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing(tn);
                        }}
                        aria-label={t("editAria", { name: tn.name })}
                        className="min-h-6 text-left font-semibold text-slate-900 focus-visible:outline-none"
                      >
                        {tn.name}
                      </button>
                    ) : (
                      <p className="font-semibold text-slate-900">{tn.name}</p>
                    )}
                    {/* Paket auf einen Blick — die haeufigste Frage in dieser Liste. */}
                    <PlanBadge plan={tn.creatorPlan} />
                    <Pill className="bg-slate-100 text-slate-600">
                      {t("membersCount", { count: tn.members })}
                    </Pill>
                    <Pill className="bg-slate-100 text-slate-600">
                      {t("postsShort", { count: tn.posts })}
                    </Pill>
                    {cat && (
                      <Pill className="bg-[var(--brand-soft)] text-[var(--brand)]">
                        {tCat(cat.key)}
                      </Pill>
                    )}
                    <Pill className={pill.cls}>{t(pill.key)}</Pill>
                  </div>
                  <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 text-sm text-slate-500">
                    <span className="min-w-0 truncate">
                      /c/{tn.slug} · {tn.ownerEmail} · {t("since", { date: formatDate(tn.createdAt, locale) })}
                    </span>
                    {editable && (
                      <a
                        href={`/c/${tn.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        aria-label={t("openAria", { name: tn.name })}
                        className="inline-flex min-h-6 shrink-0 items-center gap-1 font-medium text-[color:var(--brand)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
                      >
                        <Icon name="external" size={13} />
                        {tc("open")}
                      </a>
                    )}
                  </p>
                  {!editable && (
                    <p className="mt-1 text-xs text-slate-600">{t("deletingHint")}</p>
                  )}
                </div>
                {editable && (
                  <span
                    aria-hidden
                    className="flex w-full items-center justify-end gap-1.5 border-t border-slate-100 pt-2.5 text-sm font-medium text-slate-500 sm:w-auto sm:rounded-lg sm:border-0 sm:px-3 sm:py-1.5 sm:pt-0 sm:opacity-0 sm:transition sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                  >
                    <Icon name="settings" size={16} />
                    {tc("edit")}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>

      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={t("editTitle")}
        subtitle={editing ? `/c/${editing.slug}` : undefined}
        icon="spaces"
      >
        {editing && (
          <EditForm
            key={editing.id}
            tenant={editing}
            rootDomain={rootDomain}
            onDone={() => setEditing(null)}
          />
        )}
      </Sheet>
    </div>
  );
}

function EditForm({
  tenant,
  rootDomain,
  onDone,
}: {
  tenant: TenantRow;
  rootDomain: string;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(adminUpdateTenantAction, initial);
  // Ohne <form action>: React setzte das Formular sonst nach jedem Absenden auf
  // die Ausgangswerte zurueck — bei einem Fehler am Feld waere die Eingabe weg.
  const [, startSave] = useTransition();
  const [domain, setDomain] = useState(tenant.customDomain ?? "");
  const [verifyState, verifyAction, verifying] = useActionState(
    adminVerifyTenantDomainAction,
    initialDomain,
  );
  const [, startVerify] = useTransition();
  const domainErrorId = useId();
  const domainStatusId = useId();
  const domainError = state.fieldErrors?.customDomain;
  const verifiedAt =
    verifyState.verifiedAt !== undefined ? verifyState.verifiedAt : tenant.customDomainVerifiedAt;
  const savedDomain = tenant.customDomain ?? "";
  const domainEdited = domain.trim().toLowerCase() !== savedDomain;
  const [confirmSlug, setConfirmSlug] = useState("");
  const [deleteError, setDeleteError] = useState<string>();
  const t = useTranslations("admin.communities");
  const [confirm, confirmDialog] = useConfirm();
  const confirmSubmit = useConfirmedSubmit(confirm);
  const tc = useTranslations("admin");
  const tCat = useTranslations("categories");
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  const formId = "admin-tenant-edit";

  async function handleDelete(fd: FormData) {
    setDeleteError(undefined);
    const result = await adminDeleteTenantAction(fd);
    if (result.error) {
      setDeleteError(result.error);
      return;
    }
    onDone();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl space-y-6 px-6 py-10">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            {tenant.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={tenant.logoUrl}
                alt=""
                className="h-11 w-11 rounded-xl object-cover ring-1 ring-black/5"
              />
            ) : (
              <span
                className="flex h-11 w-11 items-center justify-center rounded-xl text-base font-bold text-white"
                style={{ backgroundColor: tenant.primaryColor }}
              >
                {tenant.name.charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-900">{tenant.name}</p>
              <p className="truncate text-sm text-slate-500">
                {t("owner", { name: tenant.ownerName, email: tenant.ownerEmail })}
              </p>
            </div>
          </div>

          <FormError message={deleteError ?? state.error} />

          <form
            id={formId}
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              startSave(() => action(fd));
            }}
            noValidate
            className="space-y-5"
          >
            <input type="hidden" name="tenantId" value={tenant.id} />
            <div>
              <Label htmlFor="at-name">{t("name")}</Label>
              <Input id="at-name" name="name" required defaultValue={tenant.name} className="text-base" />
            </div>
            <div>
              <Label htmlFor="at-tagline">{t("tagline")}</Label>
              <Input
                id="at-tagline"
                name="tagline"
                defaultValue={tenant.tagline ?? ""}
                placeholder={t("taglinePlaceholder")}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="at-category">{t("category")}</Label>
                <Select id="at-category" name="category" defaultValue={tenant.category ?? ""}>
                  <option value="">{t("categoryNone")}</option>
                  {CATEGORIES.map((c) => (
                    <option key={c.key} value={c.key}>
                      {tCat(c.key)}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="at-fee">{t("fee")}</Label>
                <Input
                  id="at-fee"
                  name="platformFeePercent"
                  type="number"
                  min={0}
                  max={50}
                  step={0.5}
                  defaultValue={tenant.platformFeePercent}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="at-plan">{t("plan")}</Label>
              <Select
                id="at-plan"
                name="creatorPlan"
                defaultValue={tenant.creatorPlan}
                disabled={tenant.billingLocked}
              >
                {PLAN_ORDER.map((p) => (
                  <option key={p} value={p}>
                    {PLAN_LABEL[p]}
                  </option>
                ))}
              </Select>
              <p className="mt-1.5 text-xs text-slate-500">
                {tenant.billingLocked
                  ? t("planLockedHint")
                  : t(`planSourceHint.${tenant.planSource}`)}
              </p>
            </div>
            <div>
              <Label htmlFor="at-status">{t("status")}</Label>
              <Select
                id="at-status"
                name="status"
                defaultValue={tenant.status === "DELETING" ? "SUSPENDED" : tenant.status}
              >
                <option value="ACTIVE">{t("statusActive")}</option>
                <option value="SUSPENDED">{t("statusSuspended")}</option>
              </Select>
              <p className="mt-1 text-xs text-slate-500">{t("statusHint")}</p>
            </div>
            <div>
              <Label htmlFor="at-domain">{t("customDomain")}</Label>
              <Input
                id="at-domain"
                name="customDomain"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder={t("customDomainPlaceholder")}
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-invalid={domainError ? true : undefined}
                aria-describedby={cn(domainError && domainErrorId, savedDomain && domainStatusId) || undefined}
              />
              {domainError ? (
                <p id={domainErrorId} role="alert" className="mt-1.5 text-sm font-medium text-red-700">
                  {domainError}
                </p>
              ) : (
                <p className="mt-1 text-xs text-slate-500">{t("customDomainHint")}</p>
              )}

              {savedDomain && (
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 truncate font-mono text-sm text-slate-800">{savedDomain}</span>
                    <Pill
                      className={
                        verifiedAt ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                      }
                    >
                      {verifiedAt ? t("domainVerified") : t("domainUnverified")}
                    </Pill>
                  </div>
                  <p id={domainStatusId} className="mt-1.5 text-xs leading-5 text-slate-600">
                    {verifiedAt
                      ? t("domainVerifiedHint", { date: formatDate(verifiedAt, locale) })
                      : t("domainUnverifiedHint")}
                  </p>
                  {!verifiedAt && (
                    <ul className="mt-2 space-y-1 text-xs leading-5 text-slate-600">
                      <li>
                        {t.rich("domainTxt", {
                          domain: savedDomain,
                          value: `aera-verify=${tenant.id}`,
                          code: (chunks) => (
                            <code className="break-all rounded bg-white px-1 font-mono text-slate-800">{chunks}</code>
                          ),
                        })}
                      </li>
                      <li>
                        {t.rich("domainCname", {
                          domain: savedDomain,
                          root: rootDomain,
                          code: (chunks) => (
                            <code className="break-all rounded bg-white px-1 font-mono text-slate-800">{chunks}</code>
                          ),
                        })}
                      </li>
                    </ul>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      disabled={verifying || domainEdited}
                      onClick={() => {
                        const fd = new FormData();
                        fd.set("tenantId", tenant.id);
                        startVerify(() => verifyAction(fd));
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Icon name="refresh" size={14} />
                      {verifying ? t("domainChecking") : t("domainCheck")}
                    </button>
                    {domainEdited && (
                      <span className="text-xs text-slate-600">{t("domainSaveFirst")}</span>
                    )}
                  </div>
                  <div aria-live="polite">
                    {!verifying && verifyState.verified && (
                      <p className="mt-2 text-sm font-medium text-emerald-700">{t("domainCheckOk")}</p>
                    )}
                  </div>
                  {!verifying && verifyState.error && (
                    <p role="alert" className="mt-2 break-words text-sm text-red-700">
                      {verifyState.error}
                    </p>
                  )}
                </div>
              )}
            </div>
          </form>

          <div className="rounded-2xl border border-red-200 bg-red-50/40 p-4">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-red-700">
              <Icon name="alert" size={15} />
              {tc("dangerZone")}
            </p>
            <p className="mt-1 text-xs text-red-600/90">
              {t.rich("dangerDesc", {
                slug: tenant.slug,
                code: (chunks) => <span className="font-mono font-semibold">{chunks}</span>,
              })}
            </p>
            <form
              action={handleDelete}
              onSubmit={(e) =>
                confirmSubmit(e, {
                  title: t("deleteConfirm", { name: tenant.name }),
                  body: t("deleteConfirmBody"),
                  confirmLabel: t("deleteBtn"),
                  tone: "danger",
                })
              }
              className="mt-3 flex flex-col gap-2 sm:flex-row"
            >
              <input type="hidden" name="tenantId" value={tenant.id} />
              <Input
                name="confirm"
                value={confirmSlug}
                onChange={(e) => setConfirmSlug(e.target.value)}
                placeholder={tenant.slug}
                aria-label={t("confirmSlugAria")}
                autoComplete="off"
                className="bg-white"
              />
              <button
                type="submit"
                disabled={confirmSlug !== tenant.slug}
                className="shrink-0 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("deleteBtn")}
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
        <button
          type="button"
          onClick={onDone}
          className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
        >
          {tc("cancel")}
        </button>
        <button
          type="submit"
          form={formId}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-[var(--primary-fg)] transition hover:bg-[var(--primary-hover)] active:scale-[0.98] disabled:opacity-50"
        >
          {pending ? tc("saving") : tc("saveChanges")}
        </button>
      </div>
      {confirmDialog}
    </div>
  );
}
