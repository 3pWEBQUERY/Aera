"use client";

import { useActionState, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  createLiveSessionAction,
  updateLiveSessionAction,
  deleteLiveSessionAction,
  liveIngestAction,
  setLiveStatusAction,
  fetchReplayAction,
  type ActionState,
  type IngestInfo,
} from "@/app/actions/live";
import {
  LIVE_PLATFORMS,
  detectLivePlatform,
  type LivePlatform,
} from "@/lib/live-embed";
import { PlatformIcon, PLATFORM_COLORS } from "./platform-icons";
import { BrowserBroadcaster } from "./browser-broadcaster";
import { Sheet } from "./sheet";
import { Icon } from "./icons";
import { Input, Label } from "@/components/ui/field";
import { Pill, FormError, EmptyState } from "@/components/ui/misc";
import { cn, formatDateTime } from "@/lib/utils";

export type LiveSourceKey = "AERA" | "EXTERNAL";
export type LiveIngestKey = "BROWSER" | "OBS";
/** Die drei Wege, wie ein Stream zustande kommt — so wie der Creator sie sieht. */
type Mode = "BROWSER" | "OBS" | "EXTERNAL";

export interface LiveSessionRow {
  id: string;
  title: string;
  status: "SCHEDULED" | "LIVE" | "ENDED";
  source: LiveSourceKey;
  ingest: LiveIngestKey;
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
  streamReady = false,
}: {
  slug: string;
  space: SpaceInfo;
  sessions: LiveSessionRow[];
  tiers?: TierOption[];
  /** Ist Cloudflare Stream auf der Plattform hinterlegt? */
  streamReady?: boolean;
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
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--action)] px-4 py-2.5 text-sm font-semibold text-[var(--action-fg)] transition hover:bg-[var(--action-hover)] active:scale-[0.98]"
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
            const own = s.source === "AERA";
            const platform = own || !s.streamUrl ? null : detectLivePlatform(s.streamUrl);
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
                    {own && (
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--action-soft)] px-2 py-0.5 text-xs font-medium text-[#4a3d70]">
                        <Icon name="broadcast" size={12} />
                        {t("sourceAeraShort")}
                      </span>
                    )}
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
                  {own && s.status !== "ENDED" && (
                    s.ingest === "BROWSER" ? (
                      // Aus dem Browser zu senden heisst: Kamera oeffnen. Der
                      // Knopf fuehrt deshalb dorthin, wo die Vorschau steht,
                      // statt die Session blind auf "live" zu schalten.
                      <button
                        type="button"
                        onClick={() => openEdit(s)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition",
                          s.status === "LIVE"
                            ? "bg-red-600 text-white hover:bg-red-700"
                            : "bg-[var(--action)] text-[var(--action-fg)] hover:bg-[var(--action-hover)]",
                        )}
                      >
                        {s.status === "LIVE" ? (
                          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                        ) : (
                          <Icon name="camera" size={15} />
                        )}
                        {s.status === "LIVE" ? t("browserOpen") : t("goLive")}
                      </button>
                    ) : (
                      <GoLiveButton slug={slug} session={s} />
                    )
                  )}
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
          streamReady={streamReady}
          onDone={() => setOpen(false)}
        />
      </Sheet>
    </div>
  );
}

/**
 * Live gehen bzw. beenden — direkt aus der Liste.
 *
 * Der Knopf schaltet nur den Zustand; gesendet wird in OBS. Das ist Absicht:
 * Der Creator startet die Uebertragung, wenn er bereit ist, und nicht in dem
 * Moment, in dem die Software sich verbindet.
 */
function GoLiveButton({ slug, session }: { slug: string; session: LiveSessionRow }) {
  const t = useTranslations("dashboard.live");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const live = session.status === "LIVE";

  async function toggle() {
    setBusy(true);
    const fd = new FormData();
    fd.set("tenant", slug);
    fd.set("sessionId", session.id);
    fd.set("status", live ? "ENDED" : "LIVE");
    const result = await setLiveStatusAction(fd);
    setBusy(false);
    if (result.error) {
      window.alert(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition disabled:opacity-50",
        live
          ? "bg-red-600 text-white hover:bg-red-700"
          : "bg-[var(--action)] text-[var(--action-fg)] hover:bg-[var(--action-hover)]",
      )}
    >
      {live ? (
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
      ) : (
        <Icon name="broadcast" size={15} />
      )}
      {busy ? t("switching") : live ? t("endLive") : t("goLive")}
    </button>
  );
}

/**
 * Sendedaten fuer OBS.
 *
 * Der Schluessel wird erst auf Klick geholt und bleibt danach verdeckt — er
 * steht oft auf einem geteilten Bildschirm, und wer ihn hat, sendet unter dem
 * Namen des Creators.
 */
function IngestPanel({ slug, sessionId }: { slug: string; sessionId: string }) {
  const t = useTranslations("dashboard.live");
  const [info, setInfo] = useState<IngestInfo | null>(null);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    const fd = new FormData();
    fd.set("tenant", slug);
    fd.set("sessionId", sessionId);
    const result = await liveIngestAction(fd);
    setLoading(false);
    if (result.error) setError(result.error);
    else setInfo(result.info ?? null);
  }, [slug, sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function copy(field: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(field);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // Ohne Zwischenablage bleibt der Wert markierbar — das genuegt.
    }
  }

  const field = (label: string, value: string, name: string, secret = false) => (
    <div>
      <Label>{label}</Label>
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <p className="min-w-0 flex-1 truncate font-mono text-xs text-slate-700">
          {secret && !revealed ? "•".repeat(28) : value}
        </p>
        {secret && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? t("hideKey") : t("showKey")}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-white hover:text-slate-700"
          >
            <Icon name={revealed ? "eyeOff" : "eye"} size={15} />
          </button>
        )}
        <button
          type="button"
          onClick={() => copy(name, value)}
          className={cn(
            "flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium transition",
            copied === name
              ? "bg-green-100 text-green-700"
              : "bg-white text-slate-600 hover:text-slate-900",
          )}
        >
          <Icon name={copied === name ? "check" : "copy"} size={13} />
          {copied === name ? t("copied") : t("copy")}
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">{t("ingestTitle")}</p>
        {info && (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium",
              info.connected ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500",
            )}
          >
            <span
              className={cn(
                "inline-block h-1.5 w-1.5 rounded-full",
                info.connected ? "animate-pulse bg-green-600" : "bg-slate-400",
              )}
            />
            {info.connected ? t("ingestConnected") : t("ingestWaiting")}
          </span>
        )}
      </div>

      {error ? (
        <FormError message={error} />
      ) : loading && !info ? (
        <p className="text-sm text-slate-400">{t("ingestLoading")}</p>
      ) : info ? (
        <>
          {field(t("ingestUrlLabel"), info.url, "url")}
          {field(t("ingestKeyLabel"), info.key, "key", true)}
          {info.srtUrl && field(t("ingestSrtLabel"), info.srtUrl, "srt")}
          <p className="text-xs leading-relaxed text-slate-400">{t("ingestHint")}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition hover:text-slate-800"
          >
            <Icon name="refresh" size={13} />
            {t("ingestRefresh")}
          </button>
        </>
      ) : null}
    </div>
  );
}

/**
 * Der bisherige Weg: ein Stream, der woanders laeuft und hier eingebettet
 * wird. Unveraendert uebernommen — nur aus dem Formular herausgeloest, damit
 * der Quellen-Schalter beide Faelle sauber trennen kann.
 */
function ExternalSource({
  platform,
  setPlatform,
  streamUrl,
  setStreamUrl,
  helpOpen,
  setHelpOpen,
}: {
  platform: LivePlatform;
  setPlatform: (p: LivePlatform) => void;
  streamUrl: string;
  setStreamUrl: (v: string) => void;
  helpOpen: boolean;
  setHelpOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const t = useTranslations("dashboard.live");
  const detected = useMemo(
    () => (streamUrl.trim() ? detectLivePlatform(streamUrl.trim()) : null),
    [streamUrl],
  );
  const selectedInfo = LIVE_PLATFORMS.find((p) => p.key === platform)!;
  const detectedInfo = detected ? LIVE_PLATFORMS.find((p) => p.key === detected) : null;
  const mismatch =
    detected !== null && platform !== "custom" && detected !== platform && detected !== "custom";

  return (
    <>
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
                          ? "border-[var(--action-strong)] bg-[var(--action)] text-[var(--action-fg)]"
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
            <div className="relative">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="lv-stream">{t("streamLabel")}</Label>
                <button
                  type="button"
                  onClick={() => setHelpOpen((v) => !v)}
                  aria-label={t("helpAria")}
                  aria-expanded={helpOpen}
                  className={cn(
                    "mb-1 flex h-5 w-5 items-center justify-center rounded-full transition",
                    helpOpen
                      ? "bg-[var(--action)] text-[var(--action-fg)]"
                      : "text-slate-400 hover:bg-[var(--action-soft)] hover:text-slate-700",
                  )}
                >
                  <Icon name="info" size={13} />
                </button>
              </div>
              {helpOpen && (
                <div className="absolute left-0 right-0 top-7 z-20 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
                  <div className="flex items-start gap-3">
                    <span
                      className="mt-0.5 flex shrink-0"
                      style={{ color: PLATFORM_COLORS[platform] }}
                    >
                      <PlatformIcon platform={platform} size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900">
                        {platform === "custom" ? t("platformOther") : selectedInfo.label}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        {t(`help.${platform}`)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setHelpOpen(false)}
                      aria-label={t("cancel")}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                    >
                      <Icon name="close" size={15} />
                    </button>
                  </div>
                </div>
              )}
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
    </>
  );
}

/**
 * Cloudflare braucht nach dem Sendeende einen Moment, bis die Aufzeichnung
 * bereitsteht. Statt im Hintergrund zu pollen gibt es einen Knopf — wer die
 * Wiederholung sucht, drueckt ihn, alle anderen kostet er nichts.
 */
function FetchReplayButton({ slug, sessionId }: { slug: string; sessionId: string }) {
  const t = useTranslations("dashboard.live");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string>();

  async function run() {
    setBusy(true);
    setNote(undefined);
    const fd = new FormData();
    fd.set("tenant", slug);
    fd.set("sessionId", sessionId);
    const result = await fetchReplayAction(fd);
    setBusy(false);
    if (result.error) setNote(result.error);
    else router.refresh();
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
      >
        <Icon name="refresh" size={13} />
        {busy ? t("replayFetching") : t("replayFetch")}
      </button>
      {note && <p className="mt-1.5 text-xs text-amber-600">{note}</p>}
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
  streamReady,
  onDone,
}: {
  slug: string;
  space: SpaceInfo;
  session: LiveSessionRow | null;
  tiers: TierOption[];
  streamReady: boolean;
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
  // Vorbelegung: aus dem Browser senden, sobald die Plattform es kann — das
  // ist der Weg ohne Zusatzsoftware. Bestehende Sessions behalten ihren.
  const [mode, setMode] = useState<Mode>(
    session
      ? session.source === "AERA"
        ? session.ingest
        : "EXTERNAL"
      : streamReady
        ? "BROWSER"
        : "EXTERNAL",
  );
  const source: LiveSourceKey = mode === "EXTERNAL" ? "EXTERNAL" : "AERA";
  const [restricted, setRestricted] = useState(!!session?.requiredEntitlementKey);
  const [helpOpen, setHelpOpen] = useState(false);

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
            <input type="hidden" name="source" value={source} />
            <input type="hidden" name="ingest" value={mode === "OBS" ? "OBS" : "BROWSER"} />

            {/* Der Schalter entscheidet ueber zwei grundverschiedene Wege:
                selbst senden oder einen fremden Stream einbetten. Deshalb
                zwei erklaerte Flaechen statt eines Auswahlfelds. */}
            {/* Untereinander statt nebeneinander: im Blatt bleiben gut 570 px,
                und in drei Spalten bricht schon der Titel um. */}
            <div className="space-y-2">
              {(
                [
                  {
                    key: "BROWSER" as const,
                    icon: "camera" as const,
                    label: t("sourceBrowser"),
                    desc: t("sourceBrowserDesc"),
                    disabled: !streamReady,
                  },
                  {
                    key: "OBS" as const,
                    icon: "broadcast" as const,
                    label: t("sourceObs"),
                    desc: t("sourceObsDesc"),
                    disabled: !streamReady,
                  },
                  {
                    key: "EXTERNAL" as const,
                    icon: "external" as const,
                    label: t("sourceExternal"),
                    desc: t("sourceExternalDesc"),
                    disabled: false,
                  },
                ]
              ).map((o) => {
                const sel = mode === o.key;
                return (
                  <button
                    key={o.key}
                    type="button"
                    onClick={() => !o.disabled && setMode(o.key)}
                    aria-pressed={sel}
                    disabled={o.disabled}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-colors duration-200",
                      o.disabled
                        ? "cursor-not-allowed border-slate-200 opacity-50"
                        : sel
                          ? "border-[var(--action-strong)] bg-slate-50"
                          : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                        sel ? "bg-[var(--action)] text-[var(--action-fg)]" : "bg-slate-100 text-slate-600",
                      )}
                    >
                      <Icon name={o.icon} size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-900">{o.label}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-slate-400">
                        {o.desc}
                      </span>
                    </span>
                    {sel && (
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--action-strong)] text-white">
                        <Icon name="check" size={12} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {!streamReady && (
              <p className="flex items-start gap-1.5 text-xs text-amber-600">
                <Icon name="alert" size={13} className="mt-0.5 shrink-0" />
                {t("sourceAeraUnavailable")}
              </p>
            )}

            {mode === "BROWSER" ? (
              isEdit ? (
                <BrowserBroadcaster
                  slug={slug}
                  sessionId={session!.id}
                  initiallyLive={session!.status === "LIVE"}
                />
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm leading-relaxed text-slate-600">{t("sourceBrowserSetup")}</p>
                </div>
              )
            ) : mode === "OBS" ? (
              isEdit ? (
                <IngestPanel slug={slug} sessionId={session!.id} />
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm leading-relaxed text-slate-600">{t("sourceAeraSetup")}</p>
                </div>
              )
            ) : (
              <ExternalSource
                platform={platform}
                setPlatform={setPlatform}
                streamUrl={streamUrl}
                setStreamUrl={setStreamUrl}
                helpOpen={helpOpen}
                setHelpOpen={setHelpOpen}
              />
            )}
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
                        ? "border-[var(--action-strong)] bg-slate-50"
                        : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                        sel ? "bg-[var(--action)] text-[var(--action-fg)]" : "bg-slate-100 text-slate-600",
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
                            : "border-[var(--action-strong)] bg-[var(--action)] text-[var(--action-fg)]"
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
                <p className="mt-1 text-xs text-slate-400">
                  {mode === "OBS" ? t("replayAeraHint") : mode === "BROWSER" ? t("replayBrowserHint") : t("replayHint")}
                </p>
                {mode === "OBS" && <FetchReplayButton slug={slug} sessionId={session!.id} />}
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
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--action)] px-5 py-2.5 text-sm font-semibold text-[var(--action-fg)] transition hover:bg-[var(--action-hover)] active:scale-[0.98] disabled:opacity-50"
        >
          {pending ? t("saving") : isEdit ? t("save") : t("create")}
        </button>
      </div>
    </form>
  );
}
