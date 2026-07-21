"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  createLiveSessionAction,
  updateLiveSessionAction,
  deleteLiveSessionAction,
  type ActionState,
} from "@/app/actions/live";
import {
  LIVE_PLATFORMS,
  detectLivePlatform,
  type LivePlatform,
} from "@/lib/live-embed";
import { PlatformIcon, PLATFORM_COLORS } from "./platform-icons";
import { Sheet } from "./sheet";
import { Icon } from "./icons";
import { Input, Label } from "@/components/ui/field";
import { Pill, FormError, EmptyState } from "@/components/ui/misc";
import { cn, formatDateTime } from "@/lib/utils";

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

export interface TierOption {
  name: string;
  entitlementKey: string;
}

export function LiveManager({
  slug,
  space,
  sessions,
  tiers = [],
}: {
  slug: string;
  space: SpaceInfo;
  sessions: LiveSessionRow[];
  tiers?: TierOption[];
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LiveSessionRow | null>(null);
  const [nonce, setNonce] = useState(0);
  const t = useTranslations("dashboard.live");
  const locale = useLocale();

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
          {sessions.map((s) => {
            const platform = s.streamUrl ? detectLivePlatform(s.streamUrl) : null;
            const info = platform ? LIVE_PLATFORMS.find((p) => p.key === platform) : null;
            return (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill
                      className={
                        s.status === "LIVE"
                          ? "bg-red-100 text-red-700"
                          : s.status === "SCHEDULED"
                            ? "bg-slate-100 text-slate-600"
                            : "bg-slate-100 text-slate-500"
                      }
                    >
                      {s.status === "LIVE" && (
                        <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                      )}
                      {t(`status.${s.status}`)}
                    </Pill>
                    <p className="truncate font-semibold text-slate-900">{s.title}</p>
                    {info && platform && platform !== "custom" && (
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        <span style={{ color: PLATFORM_COLORS[platform] }} className="flex shrink-0">
                          <PlatformIcon platform={platform} size={12} />
                        </span>
                        {info.label}
                      </span>
                    )}
                    {s.requiredEntitlementKey && (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                        <Icon name="lock" size={11} /> {s.requiredEntitlementKey}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {s.startsAt ? formatDateTime(s.startsAt, locale) : t("noStart")}
                    {s.replayUrl ? ` · ${t("hasReplay")}` : ""}
                  </p>
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
            );
          })}
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
          tiers={tiers}
          onDone={() => setOpen(false)}
        />
      </Sheet>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="border-b border-slate-100 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
      {children}
    </h3>
  );
}

function LiveForm({
  slug,
  space,
  session,
  tiers,
  onDone,
}: {
  slug: string;
  space: SpaceInfo;
  session: LiveSessionRow | null;
  tiers: TierOption[];
  onDone: () => void;
}) {
  const isEdit = !!session;
  const [state, action, pending] = useActionState(
    isEdit ? updateLiveSessionAction : createLiveSessionAction,
    initial,
  );
  const t = useTranslations("dashboard.live");

  const [streamUrl, setStreamUrl] = useState(session?.streamUrl ?? "");
  const initialPlatform = session?.streamUrl ? detectLivePlatform(session.streamUrl) : null;
  const [platform, setPlatform] = useState<LivePlatform>(initialPlatform ?? "twitch");
  const [status, setStatus] = useState(session?.status ?? "SCHEDULED");
  const [restricted, setRestricted] = useState(!!session?.requiredEntitlementKey);

  const detected = useMemo(
    () => (streamUrl.trim() ? detectLivePlatform(streamUrl.trim()) : null),
    [streamUrl],
  );
  const selectedInfo = LIVE_PLATFORMS.find((p) => p.key === platform)!;
  const detectedInfo = detected ? LIVE_PLATFORMS.find((p) => p.key === detected) : null;
  const mismatch =
    detected !== null && platform !== "custom" && detected !== platform && detected !== "custom";

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="tenant" value={slug} />
      <input type="hidden" name="spaceId" value={space.id} />
      {isEdit && <input type="hidden" name="sessionId" value={session!.id} />}
      {!restricted && <input type="hidden" name="requiredEntitlementKey" value="" />}

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl space-y-8 px-6 py-10">
          <FormError message={state.error} />

          {/* ---- Grundlagen ---- */}
          <section className="space-y-4">
            <SectionHeading>{t("sectionBasics")}</SectionHeading>
            <div>
              <Label htmlFor="lv-title">{t("titleLabel")}</Label>
              <Input
                id="lv-title"
                name="title"
                required
                defaultValue={session?.title ?? ""}
                placeholder={t("titlePlaceholder")}
                className="text-base"
              />
            </div>
          </section>

          {/* ---- Stream-Quelle ---- */}
          <section className="space-y-4">
            <SectionHeading>{t("sectionSource")}</SectionHeading>
            <div>
              <Label>{t("platformLabel")}</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {LIVE_PLATFORMS.map((p) => {
                  const sel = platform === p.key;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setPlatform(p.key)}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition",
                        sel
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 text-slate-600 hover:border-slate-400",
                      )}
                    >
                      <span
                        className="flex shrink-0"
                        style={sel ? undefined : { color: PLATFORM_COLORS[p.key] }}
                      >
                        <PlatformIcon platform={p.key} size={16} />
                      </span>
                      {p.key === "custom" ? t("platformOther") : p.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <Label htmlFor="lv-stream">{t("streamLabel")}</Label>
              <Input
                id="lv-stream"
                name="streamUrl"
                type="url"
                value={streamUrl}
                onChange={(e) => setStreamUrl(e.target.value)}
                placeholder={selectedInfo.placeholder}
              />
              {streamUrl.trim() ? (
                mismatch ? (
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-600">
                    <Icon name="alert" size={13} />
                    {t("mismatch", {
                      platform: detectedInfo?.label || t("platformOther"),
                      selected: selectedInfo.label || t("platformOther"),
                    })}
                  </p>
                ) : detected && detected !== "custom" ? (
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-green-600">
                    <Icon name="check" size={13} />
                    {t("willEmbed", { platform: detectedInfo?.label ?? "" })}
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs text-slate-400">{t("customEmbedHint")}</p>
                )
              ) : (
                <p className="mt-1.5 text-xs text-slate-400">{t("streamHint")}</p>
              )}
            </div>
          </section>

          {/* ---- Zeitplan ---- */}
          <section className="space-y-4">
            <SectionHeading>{t("sectionSchedule")}</SectionHeading>
            <div>
              <Label htmlFor="lv-start">{t("startsAtLabel")}</Label>
              <Input
                id="lv-start"
                name="startsAt"
                type="datetime-local"
                defaultValue={session?.startsAt ? session.startsAt.slice(0, 16) : ""}
              />
              <p className="mt-1 text-xs text-slate-400">{t("startsAtHint")}</p>
            </div>
          </section>

          {/* ---- Zugriff ---- */}
          <section className="space-y-4">
            <SectionHeading>{t("sectionAccess")}</SectionHeading>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                { v: false, label: t("accessAll"), desc: t("accessAllDesc"), icon: "members" as const },
                { v: true, label: t("accessKey"), desc: t("accessKeyDesc"), icon: "lock" as const },
              ].map((o) => {
                const sel = o.v === restricted;
                return (
                  <button
                    key={String(o.v)}
                    type="button"
                    onClick={() => setRestricted(o.v)}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors duration-200",
                      sel
                        ? "border-slate-900 bg-slate-50"
                        : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                        sel ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600",
                      )}
                    >
                      <Icon name={o.icon} size={18} />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-slate-900">{o.label}</span>
                      <span className="block text-xs text-slate-400">{o.desc}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {restricted && (
              <div>
                <Label htmlFor="lv-key">{t("entitlementLabel")}</Label>
                {tiers.length > 0 ? (
                  <>
                    <select
                      id="lv-key"
                      name="requiredEntitlementKey"
                      defaultValue={session?.requiredEntitlementKey ?? tiers[0].entitlementKey}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
                    >
                      {tiers.map((tier) => (
                        <option key={tier.entitlementKey} value={tier.entitlementKey}>
                          {tier.name} ({tier.entitlementKey})
                        </option>
                      ))}
                      {/* Bestehenden, nicht mehr existierenden Schlüssel weiter anbieten */}
                      {session?.requiredEntitlementKey &&
                        !tiers.some((tier) => tier.entitlementKey === session.requiredEntitlementKey) && (
                          <option value={session.requiredEntitlementKey}>
                            {session.requiredEntitlementKey}
                          </option>
                        )}
                    </select>
                    <p className="mt-1 text-xs text-slate-400">{t("entitlementTierHint")}</p>
                  </>
                ) : (
                  <>
                    <Input
                      id="lv-key"
                      name="requiredEntitlementKey"
                      defaultValue={session?.requiredEntitlementKey ?? ""}
                      placeholder="tier:premium"
                    />
                    <p className="mt-1 text-xs text-slate-400">{t("entitlementHint")}</p>
                  </>
                )}
              </div>
            )}
          </section>

          {/* ---- Status & Aufzeichnung (nur Bearbeiten) ---- */}
          {isEdit && (
            <section className="space-y-4">
              <SectionHeading>{t("sectionStatus")}</SectionHeading>
              <input type="hidden" name="status" value={status} />
              <div className="grid grid-cols-3 gap-2">
                {(["SCHEDULED", "LIVE", "ENDED"] as const).map((s) => {
                  const sel = status === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatus(s)}
                      className={cn(
                        "rounded-xl border px-3 py-2.5 text-sm font-semibold transition",
                        sel
                          ? s === "LIVE"
                            ? "border-red-600 bg-red-600 text-white"
                            : "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 text-slate-600 hover:border-slate-400",
                      )}
                    >
                      {t(`status.${s}`)}
                    </button>
                  );
                })}
              </div>
              <div>
                <Label htmlFor="lv-replay">{t("replayLabel")}</Label>
                <Input
                  id="lv-replay"
                  name="replayUrl"
                  type="url"
                  defaultValue={session?.replayUrl ?? ""}
                  placeholder="https://…"
                />
                <p className="mt-1 text-xs text-slate-400">{t("replayHint")}</p>
              </div>
            </section>
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
          {pending ? t("saving") : isEdit ? t("save") : t("create")}
        </button>
      </div>
    </form>
  );
}
