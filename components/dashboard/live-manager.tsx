"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  createLiveSessionAction,
  updateLiveSessionAction,
  deleteLiveSessionAction,
  type ActionState,
} from "@/app/actions/live";
import { Sheet } from "./sheet";
import { Icon } from "./icons";
import { Input, Label } from "@/components/ui/field";
import { Pill, FormError, EmptyState } from "@/components/ui/misc";

export interface LiveSessionRow {
  id: string;
  title: string;
  status: "SCHEDULED" | "LIVE" | "ENDED";
  streamUrl: string | null;
  replayUrl: string | null;
  requiredEntitlementKey: string | null;
  startsAt: string | null;
}

interface SpaceInfo {
  id: string;
  slug: string;
  name: string;
}

const initial: ActionState = {};

export function LiveManager({
  slug,
  space,
  sessions,
}: {
  slug: string;
  space: SpaceInfo;
  sessions: LiveSessionRow[];
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LiveSessionRow | null>(null);
  const [nonce, setNonce] = useState(0);
  const t = useTranslations("dashboard.live");

  function openCreate() {
    setEditing(null);
    setNonce((n) => n + 1);
    setOpen(true);
  }
  function openEdit(s: LiveSessionRow) {
    setEditing(s);
    setNonce((n) => n + 1);
    setOpen(true);
  }

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{space.name}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("subtitle")}</p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98]"
        >
          <Icon name="plus" size={18} />
          {t("create")}
        </button>
      </div>

      {sessions.length === 0 ? (
        <EmptyState icon="videos" title={t("emptyTitle")} hint={t("emptyHint")} />
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => (
            <div
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Pill
                    className={
                      s.status === "LIVE"
                        ? "bg-red-100 text-red-700"
                        : s.status === "SCHEDULED"
                          ? "bg-slate-100 text-slate-600"
                          : "bg-slate-100 text-slate-500"
                    }
                  >
                    {t(`status.${s.status}`)}
                  </Pill>
                  <p className="truncate font-semibold text-slate-900">{s.title}</p>
                </div>
                {s.startsAt && (
                  <p className="mt-1 text-xs text-slate-400">
                    {new Date(s.startsAt).toLocaleString()}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openEdit(s)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  {t("manage")}
                </button>
                <form action={deleteLiveSessionAction}>
                  <input type="hidden" name="tenant" value={slug} />
                  <input type="hidden" name="sessionId" value={s.id} />
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
          ))}
        </div>
      )}

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? t("editTitle") : t("createTitle")}
        subtitle={space.name}
        icon="videos"
      >
        <LiveForm
          key={nonce}
          slug={slug}
          space={space}
          session={editing}
          onDone={() => setOpen(false)}
        />
      </Sheet>
    </div>
  );
}

function LiveForm({
  slug,
  space,
  session,
  onDone,
}: {
  slug: string;
  space: SpaceInfo;
  session: LiveSessionRow | null;
  onDone: () => void;
}) {
  const isEdit = !!session;
  const [state, action, pending] = useActionState(
    isEdit ? updateLiveSessionAction : createLiveSessionAction,
    initial,
  );
  const t = useTranslations("dashboard.live");
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="tenant" value={slug} />
      <input type="hidden" name="spaceId" value={space.id} />
      {isEdit && <input type="hidden" name="sessionId" value={session!.id} />}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl space-y-5 px-6 py-10">
          <FormError message={state.error} />
          <div>
            <Label htmlFor="lv-title">{t("titleLabel")}</Label>
            <Input id="lv-title" name="title" required defaultValue={session?.title ?? ""} placeholder={t("titlePlaceholder")} className="text-base" />
          </div>
          <div>
            <Label htmlFor="lv-stream">{t("streamLabel")}</Label>
            <Input id="lv-stream" name="streamUrl" defaultValue={session?.streamUrl ?? ""} placeholder="https://…" />
            <p className="mt-1 text-xs text-slate-400">{t("streamHint")}</p>
          </div>
          <div>
            <Label htmlFor="lv-start">{t("startsAtLabel")}</Label>
            <Input
              id="lv-start"
              name="startsAt"
              type="datetime-local"
              defaultValue={session?.startsAt ? session.startsAt.slice(0, 16) : ""}
            />
          </div>
          {isEdit && (
            <>
              <div>
                <Label htmlFor="lv-status">{t("statusLabel")}</Label>
                <select
                  id="lv-status"
                  name="status"
                  defaultValue={session!.status}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="SCHEDULED">{t("status.SCHEDULED")}</option>
                  <option value="LIVE">{t("status.LIVE")}</option>
                  <option value="ENDED">{t("status.ENDED")}</option>
                </select>
              </div>
              <div>
                <Label htmlFor="lv-replay">{t("replayLabel")}</Label>
                <Input id="lv-replay" name="replayUrl" defaultValue={session?.replayUrl ?? ""} placeholder="https://…" />
              </div>
            </>
          )}
          <div>
            <Label htmlFor="lv-key">{t("entitlementLabel")}</Label>
            <Input id="lv-key" name="requiredEntitlementKey" defaultValue={session?.requiredEntitlementKey ?? ""} placeholder="tier:premium" />
            <p className="mt-1 text-xs text-slate-400">{t("entitlementHint")}</p>
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
