"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  adminUpdateTenantAction,
  adminDeleteTenantAction,
  type AdminState,
} from "@/app/actions/admin";
import { Sheet } from "@/components/dashboard/sheet";
import { Icon } from "@/components/dashboard/icons";
import { Pill, FormError, EmptyState } from "@/components/ui/misc";
import { Input, Label, Select } from "@/components/ui/field";
import { CATEGORIES, categoryByKey } from "@/lib/categories";
import { formatDate } from "@/lib/utils";

export interface TenantRow {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  logoUrl: string | null;
  primaryColor: string;
  customDomain: string | null;
  platformFeePercent: number;
  status: "ACTIVE" | "SUSPENDED" | "DELETING";
  category: string | null;
  createdAt: string;
  ownerName: string;
  ownerEmail: string;
  members: number;
  posts: number;
  orders: number;
}

const initial: AdminState = {};

export function CommunitiesManager({
  rows,
  total,
  q,
}: {
  rows: TenantRow[];
  total: number;
  q: string;
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
            <Pill className="bg-slate-100 text-slate-500">{nf.format(total)}</Pill>
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {t("subtitle")}
          </p>
        </div>
      </div>

      <form method="GET" action="/admin/communities" className="max-w-md">
        <div className="flex items-center gap-2.5 rounded-full border border-slate-200 bg-white px-4 py-2.5 transition focus-within:border-[var(--brand)] focus-within:ring-2 focus-within:ring-[var(--brand-ring)]">
          <Icon name="search" size={17} className="shrink-0 text-slate-400" />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchAria")}
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
          <button
            type="submit"
            className="shrink-0 rounded-full bg-slate-900 px-3.5 py-1 text-xs font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
          >
            {tc("search")}
          </button>
        </div>
      </form>

      <div className="space-y-2.5">
        {rows.length === 0 ? (
          <EmptyState
            icon="spaces"
            title={q ? tc("noResults") : t("emptyTitle")}
            hint={q ? t("noResultsHint", { q }) : t("emptyHint")}
          />
        ) : (
          rows.map((tn) => {
            const cat = categoryByKey(tn.category);
            return (
              <div
                key={tn.id}
                onClick={() => setEditing(tn)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setEditing(tn);
                  }
                }}
                className="group flex cursor-pointer flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)] sm:flex-nowrap sm:gap-4"
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
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-base font-bold text-white"
                    style={{ backgroundColor: tn.primaryColor }}
                  >
                    {tn.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900">{tn.name}</p>
                    <Pill className="bg-slate-100 text-slate-500">
                      {t("membersShort", { count: nf.format(tn.members) })}
                    </Pill>
                    <Pill className="bg-slate-100 text-slate-500">
                      {t("postsShort", { count: nf.format(tn.posts) })}
                    </Pill>
                    {cat && (
                      <Pill className="bg-[var(--brand-soft)] text-[var(--brand)]">
                        {tCat(cat.key)}
                      </Pill>
                    )}
                    <Pill
                      className={
                        tn.status === "ACTIVE"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-amber-50 text-amber-700"
                      }
                    >
                      {tn.status === "ACTIVE" ? t("statusActive") : t("statusSuspended")}
                    </Pill>
                  </div>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 truncate text-sm text-slate-400">
                    <span className="truncate">
                      /c/{tn.slug} · {tn.ownerEmail} · {t("since", { date: formatDate(tn.createdAt, locale) })}
                    </span>
                    <a
                      href={`/c/${tn.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex shrink-0 items-center gap-1 font-medium text-[color:var(--brand)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
                    >
                      <Icon name="external" size={13} />
                      {tc("open")}
                    </a>
                  </p>
                </div>
                <span className="flex w-full items-center justify-end gap-1.5 border-t border-slate-100 pt-2.5 text-sm font-medium text-slate-500 sm:w-auto sm:rounded-lg sm:border-0 sm:px-3 sm:py-1.5 sm:pt-0 sm:opacity-0 sm:transition sm:group-hover:opacity-100">
                  <Icon name="settings" size={16} />
                  {tc("edit")}
                </span>
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
          <EditForm key={editing.id} tenant={editing} onDone={() => setEditing(null)} />
        )}
      </Sheet>
    </div>
  );
}

function EditForm({ tenant, onDone }: { tenant: TenantRow; onDone: () => void }) {
  const [state, action, pending] = useActionState(adminUpdateTenantAction, initial);
  const [confirmSlug, setConfirmSlug] = useState("");
  const [deleteError, setDeleteError] = useState<string>();
  const t = useTranslations("admin.communities");
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
              <p className="truncate text-sm text-slate-400">
                {t("owner", { name: tenant.ownerName, email: tenant.ownerEmail })}
              </p>
            </div>
          </div>

          <FormError message={deleteError ?? state.error} />

          <form id={formId} action={action} className="space-y-5">
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
              <Label htmlFor="at-status">{t("status")}</Label>
              <Select
                id="at-status"
                name="status"
                defaultValue={tenant.status === "DELETING" ? "SUSPENDED" : tenant.status}
              >
                <option value="ACTIVE">{t("statusActive")}</option>
                <option value="SUSPENDED">{t("statusSuspended")}</option>
              </Select>
              <p className="mt-1 text-xs text-slate-400">{t("statusHint")}</p>
            </div>
            <div>
              <Label htmlFor="at-domain">{t("customDomain")}</Label>
              <Input
                id="at-domain"
                name="customDomain"
                defaultValue={tenant.customDomain ?? ""}
                placeholder={t("customDomainPlaceholder")}
              />
              <p className="mt-1 text-xs text-slate-400">
                {t("customDomainHint")}
              </p>
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
              onSubmit={(e) => {
                if (!window.confirm(t("deleteConfirm", { name: tenant.name }))) {
                  e.preventDefault();
                }
              }}
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
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50"
        >
          {pending ? tc("saving") : tc("saveChanges")}
        </button>
      </div>
    </div>
  );
}
