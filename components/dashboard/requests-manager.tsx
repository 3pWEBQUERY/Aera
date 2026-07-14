"use client";

import { useActionState, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  updateRequestAction,
  deleteRequestAction,
  type ActionState,
} from "@/app/actions/requests";
import { Sheet } from "./sheet";
import { Icon } from "./icons";
import { Input, Label, Textarea } from "@/components/ui/field";
import { Avatar, Pill, FormError, EmptyState } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export interface RequestRow {
  id: string;
  title: string;
  body: string;
  status: "OPEN" | "ACCEPTED" | "PRICED" | "FULFILLED" | "DECLINED";
  priceCents: number;
  staffNote: string | null;
  requesterName: string;
  requesterAvatar: string | null;
  score: number;
  createdAt: string;
}

interface SpaceInfo {
  id: string;
  slug: string;
  name: string;
}

const initial: ActionState = {};

const statusCls: Record<string, string> = {
  OPEN: "bg-slate-100 text-slate-600",
  ACCEPTED: "bg-blue-100 text-blue-700",
  PRICED: "bg-amber-100 text-amber-700",
  FULFILLED: "bg-emerald-100 text-emerald-700",
  DECLINED: "bg-red-100 text-red-600",
};

export function RequestsManager({
  slug,
  space,
  requests,
}: {
  slug: string;
  space: SpaceInfo;
  requests: RequestRow[];
}) {
  const [editing, setEditing] = useState<RequestRow | null>(null);
  const [nonce, setNonce] = useState(0);
  const t = useTranslations("dashboard.requests");
  const locale = useLocale();
  const dateFmt = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short" });

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-xl font-bold text-slate-900">{space.name}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("subtitle")}</p>
      </div>

      {requests.length === 0 ? (
        <EmptyState icon="messages" title={t("emptyTitle")} hint={t("emptyHint")} />
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <div key={r.id} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4">
              {/* score column */}
              <div className="flex w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-slate-50">
                <Icon name="chevron" size={13} className="rotate-180 text-slate-300" />
                <span
                  className={cn(
                    "text-base font-bold tabular-nums",
                    r.score > 0 ? "text-orange-600" : r.score < 0 ? "text-blue-600" : "text-slate-700",
                  )}
                >
                  {r.score}
                </span>
                <Icon name="chevron" size={13} className="text-slate-300" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Avatar name={r.requesterName} src={r.requesterAvatar} size={30} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{r.requesterName}</p>
                      <p className="text-xs text-slate-400">{dateFmt.format(new Date(r.createdAt))}</p>
                    </div>
                  </div>
                  <Pill className={statusCls[r.status]}>{t(`status.${r.status}`)}</Pill>
                </div>
                <p className="mt-2 font-semibold text-slate-900">{r.title}</p>
                {r.body && <p className="mt-1 text-sm text-slate-600">{r.body}</p>}
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => {
                      setEditing(r);
                      setNonce((n) => n + 1);
                    }}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    {t("manage")}
                  </button>
                  <form action={deleteRequestAction}>
                    <input type="hidden" name="tenant" value={slug} />
                    <input type="hidden" name="requestId" value={r.id} />
                    <input type="hidden" name="spaceSlug" value={space.slug} />
                    <button
                      type="submit"
                      aria-label={t("delete")}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </form>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={t("manageTitle")}
        subtitle={editing?.title}
        icon="messages"
      >
        {editing && (
          <RequestForm key={nonce} slug={slug} request={editing} onDone={() => setEditing(null)} />
        )}
      </Sheet>
    </div>
  );
}

function RequestForm({
  slug,
  request,
  onDone,
}: {
  slug: string;
  request: RequestRow;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(updateRequestAction, initial);
  const t = useTranslations("dashboard.requests");
  const [priceEur, setPriceEur] = useState(
    request.priceCents > 0 ? (request.priceCents / 100).toFixed(2) : "",
  );
  const priceCents = Math.max(0, Math.round(parseFloat(priceEur.replace(",", ".")) * 100) || 0);
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="tenant" value={slug} />
      <input type="hidden" name="requestId" value={request.id} />
      <input type="hidden" name="priceCents" value={priceCents} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl space-y-5 px-6 py-10">
          <FormError message={state.error} />
          <div>
            <Label htmlFor="rq-status">{t("statusLabel")}</Label>
            <select
              id="rq-status"
              name="status"
              defaultValue={request.status}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="OPEN">{t("status.OPEN")}</option>
              <option value="ACCEPTED">{t("status.ACCEPTED")}</option>
              <option value="PRICED">{t("status.PRICED")}</option>
              <option value="FULFILLED">{t("status.FULFILLED")}</option>
              <option value="DECLINED">{t("status.DECLINED")}</option>
            </select>
          </div>
          <div>
            <Label htmlFor="rq-price">{t("priceLabel")}</Label>
            <Input
              id="rq-price"
              inputMode="decimal"
              value={priceEur}
              onChange={(e) => setPriceEur(e.target.value)}
              placeholder="19,99"
            />
            <p className="mt-1 text-xs text-slate-400">{t("priceHint")}</p>
          </div>
          <div>
            <Label htmlFor="rq-note">{t("noteLabel")}</Label>
            <Textarea id="rq-note" name="staffNote" rows={3} defaultValue={request.staffNote ?? ""} placeholder={t("notePlaceholder")} />
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
