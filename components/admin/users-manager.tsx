"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  adminUpdateUserAction,
  adminResetLinkAction,
  adminDeleteUserAction,
  type AdminState,
} from "@/app/actions/admin";
import { Sheet } from "@/components/dashboard/sheet";
import { Icon } from "@/components/dashboard/icons";
import { Avatar, Pill, FormError, EmptyState } from "@/components/ui/misc";
import { Input, Label } from "@/components/ui/field";
import { formatDate } from "@/lib/utils";

export interface UserRow {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  createdAt: string;
  memberships: number;
  orders: number;
  ownedTenants: number;
}

const initial: AdminState = {};

export function UsersManager({
  rows,
  total,
  q,
}: {
  rows: UserRow[];
  total: number;
  q: string;
}) {
  const [editing, setEditing] = useState<UserRow | null>(null);
  const t = useTranslations("admin.users");
  const tc = useTranslations("admin");
  const locale = useLocale();
  const nf = new Intl.NumberFormat(locale);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
          {t("title")}
          <Pill className="bg-slate-100 text-slate-500">{nf.format(total)}</Pill>
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {t("subtitle")}
        </p>
      </div>

      <form method="GET" action="/admin/users" className="max-w-md">
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
            icon="members"
            title={q ? tc("noResults") : t("emptyTitle")}
            hint={q ? t("noResultsHint", { q }) : t("emptyHint")}
          />
        ) : (
          rows.map((u) => (
            <div
              key={u.id}
              onClick={() => setEditing(u)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setEditing(u);
                }
              }}
              className="group flex cursor-pointer flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)] sm:flex-nowrap sm:gap-4"
            >
              <Avatar name={u.name} src={u.avatarUrl} size={42} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-slate-900">{u.name}</p>
                  {u.ownedTenants > 0 && (
                    <Pill className="bg-violet-100 text-violet-700">
                      {t("ownerBadge", { count: nf.format(u.ownedTenants) })}
                    </Pill>
                  )}
                  <Pill className="bg-slate-100 text-slate-500">
                    {t("membershipsShort", { count: nf.format(u.memberships) })}
                  </Pill>
                  <Pill className="bg-slate-100 text-slate-500">
                    {t("ordersShort", { count: nf.format(u.orders) })}
                  </Pill>
                </div>
                <p className="mt-0.5 truncate text-sm text-slate-400">
                  {t("registeredLine", { email: u.email, date: formatDate(u.createdAt, locale) })}
                </p>
              </div>
              <span className="flex w-full items-center justify-end gap-1.5 border-t border-slate-100 pt-2.5 text-sm font-medium text-slate-500 sm:w-auto sm:rounded-lg sm:border-0 sm:px-3 sm:py-1.5 sm:pt-0 sm:opacity-0 sm:transition sm:group-hover:opacity-100">
                <Icon name="settings" size={16} />
                {tc("edit")}
              </span>
            </div>
          ))
        )}
      </div>

      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={t("editTitle")}
        subtitle={editing?.email}
        icon="members"
      >
        {editing && (
          <EditForm key={editing.id} user={editing} onDone={() => setEditing(null)} />
        )}
      </Sheet>
    </div>
  );
}

function EditForm({ user, onDone }: { user: UserRow; onDone: () => void }) {
  const [state, action, pending] = useActionState(adminUpdateUserAction, initial);
  const t = useTranslations("admin.users");
  const tc = useTranslations("admin");
  const locale = useLocale();
  const nf = new Intl.NumberFormat(locale);
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  const formId = "admin-user-edit";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl space-y-6 px-6 py-10">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <Avatar name={user.name} src={user.avatarUrl} size={44} />
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-900">{user.name}</p>
              <p className="truncate text-sm text-slate-400">
                {t("editSummary", {
                  date: formatDate(user.createdAt, locale),
                  memberships: nf.format(user.memberships),
                  orders: nf.format(user.orders),
                })}
              </p>
            </div>
          </div>

          <FormError message={state.error} />

          <form id={formId} action={action} className="space-y-5">
            <input type="hidden" name="userId" value={user.id} />
            <div>
              <Label htmlFor="au-name">{t("name")}</Label>
              <Input id="au-name" name="name" required defaultValue={user.name} className="text-base" />
            </div>
            <div>
              <Label htmlFor="au-email">{t("email")}</Label>
              <Input
                id="au-email"
                name="email"
                type="email"
                required
                defaultValue={user.email}
              />
            </div>
          </form>

          <ResetLinkSection userId={user.id} />

          <DangerZone user={user} onDone={onDone} />
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

function ResetLinkSection({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState(adminResetLinkAction, initial);
  const [copied, setCopied] = useState(false);
  const t = useTranslations("admin.users");

  async function copy() {
    if (!state.link) return;
    try {
      await navigator.clipboard.writeText(state.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — the link stays selectable below
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <p className="text-sm font-semibold text-slate-900">{t("resetTitle")}</p>
      <p className="mt-1 text-xs text-slate-400">
        {t("resetHint")}
      </p>
      <div className="mt-3">
        <FormError message={state.error} />
      </div>
      {state.link ? (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
          <p className="min-w-0 flex-1 truncate font-mono text-sm text-slate-700">
            {state.link}
          </p>
          <button
            type="button"
            onClick={copy}
            className={`flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)] ${
              copied
                ? "bg-green-100 text-green-700"
                : "bg-slate-900 text-white hover:bg-slate-800"
            }`}
          >
            <Icon name={copied ? "check" : "copy"} size={15} />
            {copied ? t("copied") : t("copy")}
          </button>
        </div>
      ) : (
        <form action={action} className="mt-3">
          <input type="hidden" name="userId" value={userId} />
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <Icon name="lock" size={15} />
            {pending ? t("generating") : t("generateResetLink")}
          </button>
        </form>
      )}
    </div>
  );
}

function DangerZone({ user, onDone }: { user: UserRow; onDone: () => void }) {
  const [state, action, pending] = useActionState(adminDeleteUserAction, initial);
  const t = useTranslations("admin.users");
  const tc = useTranslations("admin");
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50/40 p-4">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-red-700">
        <Icon name="alert" size={15} />
        {tc("dangerZone")}
      </p>
      <p className="mt-1 text-xs text-red-600/90">
        {t("dangerDesc")}
      </p>
      <div className="mt-3">
        <FormError message={state.error} />
      </div>
      <form
        action={action}
        onSubmit={(e) => {
          if (!window.confirm(t("deleteConfirm", { name: user.name }))) {
            e.preventDefault();
          }
        }}
        className="mt-3"
      >
        <input type="hidden" name="userId" value={user.id} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
        >
          {pending ? t("deleting") : t("deleteBtn")}
        </button>
      </form>
    </div>
  );
}
