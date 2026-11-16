"use client";

import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  createSpaceAction,
  updateSpaceAction,
  deleteSpaceAction,
  toggleSpaceArchiveAction,
  type ActionState,
} from "@/app/actions/dashboard";
import { Sheet } from "./sheet";
import { Icon, type IconName } from "./icons";
import { Input, Label, Textarea } from "@/components/ui/field";
import { Pill, FormError } from "@/components/ui/misc";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { SpaceTypePicker, SPACE_TYPE_ICON } from "./space-type-picker";
import { SpaceAccessPicker, type SpaceAccessTier } from "./space-access-picker";
import { PlanSwitchSheet } from "./plan-switch-sheet";
import { PLAN_LABEL } from "./plan-badge";
import { spaceTypeIcon } from "@/lib/dashboard-nav-items";
import { nextPlanAfter, type PlanKey } from "@/lib/plan-features";

export type { SpaceAccessTier } from "./space-access-picker";

export interface SpaceRowData {
  id: string;
  name: string;
  slug: string;
  type: string;
  visibility: string;
  description: string | null;
  requiredEntitlementKey: string | null;
  isArchived: boolean;
  postCount: number;
  /** Everything stored in the space (posts, courses, products …). */
  contentCount: number;
}

export const SPACE_VISIBILITY_OPTIONS: { value: string; icon: IconName }[] = [
  { value: "PUBLIC", icon: "feed" },
  { value: "MEMBERS", icon: "members" },
  { value: "PAID", icon: "lock" },
];

const typeIcon = SPACE_TYPE_ICON as Record<string, IconName>;
const visCls: Record<string, string> = {
  PUBLIC: "bg-green-100 text-green-700",
  MEMBERS: "bg-slate-100 text-slate-600",
  PAID: "bg-violet-100 text-violet-700",
};

const initial: ActionState = {};

interface ArchiveNotice {
  tone: "ok" | "error";
  text: string;
  /** Present when the change can be undone from the notice. */
  undo?: { space: SpaceRowData; archive: boolean };
}

export function SpacesManager({
  slug,
  spaces,
  tiers,
  plan,
  spaceLimit,
}: {
  slug: string;
  spaces: SpaceRowData[];
  /** Membership tiers of this community (paid ones are selectable). */
  tiers: SpaceAccessTier[];
  /** Active creator package — decides which space types may be created. */
  plan: PlanKey;
  /** Max. active spaces for this package; null = unlimited. */
  spaceLimit: number | null;
}) {
  const [view, setView] = useState<SpaceView>("grid");
  // Die Wahl bleibt erhalten, wird aber erst nach der Hydration gelesen —
  // sonst weicht der erste Aufbau im Browser vom Server ab.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(VIEW_KEY);
      if (stored === "grid" || stored === "list") setView(stored);
    } catch {
      /* storage blocked — the default view is fine */
    }
  }, []);
  function chooseView(next: SpaceView) {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* ignore */
    }
  }

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<SpaceRowData | null>(null);
  const [plansOpen, setPlansOpen] = useState(false);
  const [plansNotice, setPlansNotice] = useState<string | null>(null);
  const [notice, setNotice] = useState<ArchiveNotice | null>(null);
  const [archiving, startArchive] = useTransition();
  const undoRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const t = useTranslations("dashboard.spaces");
  const tp = useTranslations("dashboard.plans");
  const tSheet = useTranslations("dashboard.planSheet");

  const active = spaces.filter((s) => !s.isArchived);
  const archived = spaces.filter((s) => s.isArchived);
  const atLimit = spaceLimit !== null && active.length >= spaceLimit;
  const upgradePlan = nextPlanAfter(plan);

  function openPlans(reason?: string | null) {
    setPlansNotice(reason ?? null);
    setPlansOpen(true);
  }
  const limitNotice =
    spaceLimit !== null
      ? tSheet("spacesUsedNotice", { used: active.length, max: spaceLimit })
      : null;

  function setArchived(space: SpaceRowData, archive: boolean, isUndo = false) {
    // No `disabled` on the buttons while this runs: a disabled button drops
    // keyboard focus. A second click is simply ignored instead.
    if (archiving) return;
    const fd = new FormData();
    fd.set("tenant", slug);
    fd.set("spaceId", space.id);
    fd.set("archive", String(archive));
    startArchive(async () => {
      const res = await toggleSpaceArchiveAction(fd);
      if (res.error) {
        setNotice({ tone: "error", text: res.error });
        return;
      }
      setNotice({
        tone: "ok",
        text: archive
          ? t("archivedNotice", { name: space.name })
          : t("restoredNotice", { name: space.name }),
        // Undoing an undo would only flip back and forth — one step is enough.
        undo: isUndo ? undefined : { space, archive: !archive },
      });
    });
  }

  // The clicked button moves to the other section (and the undo button
  // vanishes after use), so keyboard focus would fall back to <body>. Hand it
  // to the notice instead: its undo, or after undoing its close button.
  useEffect(() => {
    if (!notice || notice.tone === "error") return;
    (notice.undo ? undoRef.current : closeRef.current)?.focus();
  }, [notice]);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:mb-7 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{t("title")}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {t("subtitle", { count: active.length })}
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <div className="flex items-center gap-2">
            <div
              role="group"
              aria-label={t("viewLabel")}
              className="flex items-center gap-0.5 rounded-xl border border-slate-200 bg-white p-0.5"
            >
              {(["grid", "list"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => chooseView(v)}
                  aria-pressed={view === v}
                  aria-label={t(v === "grid" ? "viewGrid" : "viewList")}
                  title={t(v === "grid" ? "viewGrid" : "viewList")}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg transition",
                    view === v
                      ? "bg-[var(--action)] text-[var(--action-fg)]"
                      : "text-slate-500 hover:bg-[var(--action-soft)] hover:text-slate-800",
                  )}
                >
                  <Icon name={v === "grid" ? "grid" : "list"} size={17} />
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => (atLimit ? openPlans(limitNotice) : setCreateOpen(true))}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-[var(--primary-fg)] transition hover:bg-[var(--primary-hover)] active:scale-[0.98]"
            >
              <Icon name={atLimit ? "lock" : "plus"} size={18} />
              {t("createSpace")}
            </button>
          </div>
          {spaceLimit !== null && (
            <p className="text-xs font-medium text-slate-500">
              {tp("limits.spacesUsed", { used: active.length, limit: spaceLimit })}
            </p>
          )}
        </div>
      </div>

      {atLimit && upgradePlan && (
        <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-amber-700 ring-1 ring-amber-200">
              <Icon name="lock" size={16} />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900">{tp("limits.spacesTitle")}</p>
              <p className="mt-0.5 text-sm text-slate-600">
                {tp("limits.spacesText", {
                  limit: spaceLimit ?? 0,
                  plan: PLAN_LABEL[plan],
                  next: PLAN_LABEL[upgradePlan],
                })}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => openPlans(limitNotice)}
            className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-[var(--primary-fg)] transition hover:bg-[var(--primary-hover)] sm:self-auto"
          >
            {tp("upgradeCta", { plan: PLAN_LABEL[upgradePlan] })}
          </button>
        </div>
      )}

      {/* Feedback for archive / restore. Always mounted so screen readers
          announce the change; the undo sits right next to the message. */}
      <div role="status" aria-live="polite" aria-atomic="true">
        {notice && (
          <div
            className={cn(
              "mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm",
              notice.tone === "error"
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-slate-200 bg-white text-slate-800",
            )}
          >
            <span>{notice.text}</span>
            <span className="flex items-center gap-1">
              {notice.undo && (
                <button
                  ref={undoRef}
                  type="button"
                  onClick={() => setArchived(notice.undo!.space, notice.undo!.archive, true)}
                  className="rounded-lg px-3 py-1.5 font-semibold text-slate-900 underline decoration-slate-400 underline-offset-4 transition hover:decoration-slate-900"
                >
                  {t("undo")}
                </button>
              )}
              <button
                ref={closeRef}
                type="button"
                onClick={() => setNotice(null)}
                aria-label={t("dismissNotice")}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              >
                <Icon name="close" size={16} />
              </button>
            </span>
          </div>
        )}
      </div>

      {spaces.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-16 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
            <Icon name="spaces" size={24} />
          </span>
          <p className="mt-4 font-semibold text-slate-800">{t("emptyTitle")}</p>
          <p className="mt-1 text-sm text-slate-500">
            {t("emptyText")}
          </p>
          <button
            type="button"
            onClick={() => (atLimit ? openPlans(limitNotice) : setCreateOpen(true))}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-[var(--primary-fg)] transition hover:bg-[var(--primary-hover)]"
          >
            <Icon name="plus" size={18} />
            {t("createSpace")}
          </button>
        </div>
      ) : (
        <div>
          <SpaceCollection
            spaces={active}
            view={view}
            tiers={tiers}
            busy={archiving}
            onEdit={(sp) => setEditing(sp)}
            onArchive={(sp) => setArchived(sp, !sp.isArchived)}
          />
          {archived.length > 0 && (
            <>
              <h2 className="px-1 pb-2 pt-6 text-xs font-semibold uppercase tracking-wider text-slate-500">
                {t("archived")}
              </h2>
              <SpaceCollection
                spaces={archived}
                view={view}
                tiers={tiers}
                busy={archiving}
                onEdit={(sp) => setEditing(sp)}
                onArchive={(sp) => setArchived(sp, !sp.isArchived)}
              />
            </>
          )}
        </div>
      )}

      <Sheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t("createTitle")}
        subtitle={t("createSubtitle")}
        icon="spaces"
      >
        <SpaceForm
          slug={slug}
          plan={plan}
          tiers={tiers}
          onLocked={() => openPlans(null)}
          onDone={() => setCreateOpen(false)}
        />
      </Sheet>

      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={t("editTitle")}
        subtitle={editing ? `/${editing.slug}` : undefined}
        icon="spaces"
      >
        {editing && (
          <SpaceForm
            key={editing.id}
            slug={slug}
            plan={plan}
            tiers={tiers}
            space={editing}
            onLocked={() => openPlans(null)}
            onDone={() => setEditing(null)}
          />
        )}
      </Sheet>

      <PlanSwitchSheet
        open={plansOpen}
        onClose={() => setPlansOpen(false)}
        slug={slug}
        notice={plansNotice}
      />
    </div>
  );
}

type SpaceView = "grid" | "list";
const VIEW_KEY = "aera:spaces-view";

/** Name of the membership a space is locked to — never the raw key. */
function useAccessLabel(tiers: SpaceAccessTier[]) {
  const t = useTranslations("dashboard.spaces.access");
  return (key: string | null): string | null => {
    if (!key) return null;
    return tiers.find((tier) => tier.key === key)?.name ?? t("specificTier");
  };
}

/**
 * Die Sammlung in der gewaehlten Ansicht.
 *
 * Raster und Liste zeigen dieselben Angaben, nur anders gewichtet: die Karte
 * stellt Typ und Sichtbarkeit nach vorn (man sucht darin), die Zeile den
 * Namen (man liest sie herunter). Beides fuehrt mit einem Klick in dieselbe
 * Bearbeitung.
 */
function SpaceCollection({
  spaces,
  view,
  tiers,
  busy,
  onEdit,
  onArchive,
}: {
  spaces: SpaceRowData[];
  view: SpaceView;
  tiers: SpaceAccessTier[];
  busy: boolean;
  onEdit: (space: SpaceRowData) => void;
  onArchive: (space: SpaceRowData) => void;
}) {
  const accessLabel = useAccessLabel(tiers);
  if (view === "list") {
    return (
      <div className="space-y-2.5">
        {spaces.map((s) => (
          <Row
            key={s.id}
            space={s}
            accessLabel={accessLabel(s.requiredEntitlementKey)}
            busy={busy}
            onEdit={() => onEdit(s)}
            onArchive={() => onArchive(s)}
          />
        ))}
      </div>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {spaces.map((s) => (
        <Card
          key={s.id}
          space={s}
          accessLabel={accessLabel(s.requiredEntitlementKey)}
          busy={busy}
          onEdit={() => onEdit(s)}
          onArchive={() => onArchive(s)}
        />
      ))}
    </div>
  );
}

function ArchiveButton({
  space,
  busy,
  onArchive,
  className,
}: {
  space: SpaceRowData;
  busy: boolean;
  onArchive: () => void;
  className?: string;
}) {
  const t = useTranslations("dashboard.spaces");
  return (
    <button
      type="button"
      aria-busy={busy || undefined}
      onClick={(e) => {
        e.stopPropagation();
        onArchive();
      }}
      aria-label={
        space.isArchived
          ? t("restoreNamed", { name: space.name })
          : t("archiveNamed", { name: space.name })
      }
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]",
        className,
      )}
    >
      <Icon name="archive" size={16} />
      {space.isArchived ? t("restore") : t("archive")}
    </button>
  );
}

/**
 * Space als Karte.
 *
 * Der Kopf traegt das Typ-Zeichen auf einer Flaeche aus der Aktionsfarbe und
 * rechts die Sichtbarkeit — die beiden Angaben, nach denen man in einem
 * Raster sucht. Die Zahl der Beitraege steht unten und haelt die Karten auf
 * gleicher Hoehe, auch wenn ein Name zweizeilig wird.
 */
function Card({
  space,
  accessLabel,
  busy,
  onEdit,
  onArchive,
}: {
  space: SpaceRowData;
  accessLabel: string | null;
  busy: boolean;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const t = useTranslations("dashboard");
  return (
    <div
      // Whole card clickable for the mouse; keyboard and screen readers use
      // the real button on the name — a role="button" container must not
      // contain the archive button (axe: nested-interactive).
      onClick={onEdit}
      className={cn(
        "group flex h-full cursor-pointer flex-col rounded-2xl border border-slate-200 bg-white p-4 transition",
        "hover:border-slate-300 hover:shadow-[var(--shadow-card)]",
        "focus-within:ring-2 focus-within:ring-[var(--brand-ring)]",
        space.isArchived && "bg-slate-50",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--action)] text-[var(--action-fg)]">
          <Icon name={spaceTypeIcon(space.type)} size={20} />
        </span>
        <Pill className={visCls[space.visibility] ?? visCls.MEMBERS}>
          {t(`visibility.${space.visibility}.label`)}
        </Pill>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        className="mt-3 line-clamp-2 text-left font-semibold leading-snug text-slate-900 focus-visible:outline-none"
      >
        {space.name}
      </button>
      <p className="mt-0.5 truncate text-sm text-slate-500">/{space.slug}</p>

      {/* Die Beschreibung fuellt die Karte mit dem, was den Space
          unterscheidet — zwei Zeilen reichen, danach wird gekuerzt. */}
      {space.description && (
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-500">
          {space.description}
        </p>
      )}

      {accessLabel && (
        <span className="mt-2 inline-flex max-w-full items-center gap-1 self-start truncate rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
          <Icon name="lock" size={12} className="shrink-0" />
          <span className="truncate">{accessLabel}</span>
        </span>
      )}

      {/* `mt-auto` haelt die Fusszeile unten — dadurch stehen Typ und Zahl
          ueber alle Karten einer Reihe auf einer Linie. */}
      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
        <div className="flex min-w-0 items-center gap-2">
          <Pill className="bg-slate-100 text-slate-600">
            {t(`spaceTypes.${space.type}.label`)}
          </Pill>
          <span className="truncate text-xs text-slate-500">
            {t("spaces.postCount", { count: space.postCount })}
          </span>
        </div>
        <ArchiveButton space={space} busy={busy} onArchive={onArchive} className="-mr-1.5" />
      </div>
    </div>
  );
}

function Row({
  space,
  accessLabel,
  busy,
  onEdit,
  onArchive,
}: {
  space: SpaceRowData;
  accessLabel: string | null;
  busy: boolean;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const t = useTranslations("dashboard");
  return (
    <div
      // Whole card clickable for the mouse; keyboard and screen readers use
      // the real button on the name — a role="button" container must not
      // contain the archive button (axe: nested-interactive).
      onClick={onEdit}
      className={cn(
        "group flex cursor-pointer flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm sm:flex-nowrap sm:gap-4",
        "focus-within:ring-2 focus-within:ring-[var(--brand-ring)]",
        space.isArchived && "bg-slate-50",
      )}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--action)] text-[var(--action-fg)]">
        <Icon name={typeIcon[space.type] ?? "spaces"} size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="text-left font-semibold text-slate-900 focus-visible:outline-none"
          >
            {space.name}
          </button>
          <Pill className="bg-slate-100 text-slate-600">{t(`spaceTypes.${space.type}.label`)}</Pill>
          <Pill className={visCls[space.visibility] ?? visCls.MEMBERS}>{t(`visibility.${space.visibility}.label`)}</Pill>
          {accessLabel && (
            <span className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
              <Icon name="lock" size={12} className="shrink-0" />
              <span className="truncate">{accessLabel}</span>
            </span>
          )}
        </div>
        <p className="mt-0.5 text-sm text-slate-500">
          /{space.slug} · {t("spaces.postCount", { count: space.postCount })}
        </p>
      </div>
      {/* Actions: always visible on touch (own row). */}
      <div className="flex w-full items-center justify-end gap-1 border-t border-slate-100 pt-2.5 sm:w-auto sm:border-0 sm:pt-0">
        <span className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500">
          <Icon name="settings" size={16} />
          {t("spaces.edit")}
        </span>
        <ArchiveButton space={space} busy={busy} onArchive={onArchive} />
      </div>
    </div>
  );
}

export function SpaceVisibilityPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("dashboard");
  const labelId = useId();
  return (
    <div className="mt-8">
      <p id={labelId} className="mb-3 text-sm font-medium text-slate-700">
        {t("spaces.visibilityLabel")}
      </p>
      <div role="group" aria-labelledby={labelId} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {SPACE_VISIBILITY_OPTIONS.map((v) => {
          const sel = v.value === value;
          return (
            <button
              key={v.value}
              type="button"
              onClick={() => onChange(v.value)}
              aria-pressed={sel}
              className={cn(
                "flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors duration-200",
                sel
                  ? "border-[var(--action-strong)] bg-slate-50"
                  : "border-slate-200 hover:border-slate-300 hover:bg-[var(--action-soft)]",
              )}
            >
              <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition", sel ? "bg-[var(--action)] text-[var(--action-fg)]" : "bg-slate-100 text-slate-600")}>
                <Icon name={v.icon} size={18} />
              </span>
              <span>
                <span className="block text-sm font-semibold text-slate-900">{t(`visibility.${v.value}.label`)}</span>
                <span className="block text-xs text-slate-500">{t(`visibility.${v.value}.desc`)}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SpaceForm({
  slug,
  plan,
  tiers,
  space,
  onLocked,
  onDone,
}: {
  slug: string;
  plan: PlanKey;
  tiers: SpaceAccessTier[];
  space?: SpaceRowData;
  onLocked: () => void;
  onDone: () => void;
}) {
  const isEdit = !!space;
  const t = useTranslations("dashboard");
  const [state, action, pending] = useActionState(
    isEdit ? updateSpaceAction : createSpaceAction,
    initial,
  );
  const [type, setType] = useState(space?.type ?? "FEED");
  const [visibility, setVisibility] = useState(space?.visibility ?? "MEMBERS");
  const [deleting, setDeleting] = useState(false);
  const [confirm, confirmDialog] = useConfirm();
  // A different type reads different tables — existing content would vanish
  // from the community. So the type is fixed once there is any content.
  const typeLocked = isEdit && (space?.contentCount ?? 0) > 0;

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  async function performDelete() {
    if (!space) return;
    const ok = await confirm({
      title: t("spaces.deleteConfirmTitle"),
      body: t("spaces.deleteConfirmText", { name: space.name }),
      confirmLabel: t("spaces.delete"),
      tone: "danger",
    });
    if (!ok) return;
    setDeleting(true);
    const fd = new FormData();
    fd.set("tenant", slug);
    fd.set("spaceId", space.id);
    await deleteSpaceAction(fd);
    onDone();
  }

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="tenant" value={slug} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="visibility" value={visibility} />
      {isEdit && <input type="hidden" name="spaceId" value={space!.id} />}

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
          <FormError message={state.error} />

          <div className="mt-1">
            <Label htmlFor="sf-name">{t("spaces.nameLabel")}</Label>
            <Input
              id="sf-name"
              name="name"
              required
              defaultValue={space?.name}
              placeholder={t("spaces.namePlaceholder")}
              className="text-base"
            />
          </div>

          <div className="mt-8">
            <p className="mb-3 text-sm font-medium text-slate-700">{t("spaces.typeLabel")}</p>
            {typeLocked && space ? (
              <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--action)] text-[var(--action-fg)]">
                  <Icon name={spaceTypeIcon(space.type)} size={18} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    {t(`spaceTypes.${space.type}.label`)}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-600">
                    {t("spaces.typeLockedHint", { count: space.contentCount })}
                  </p>
                </div>
              </div>
            ) : (
              <SpaceTypePicker
                value={type}
                onChange={setType}
                plan={plan}
                onLocked={onLocked}
              />
            )}
          </div>

          <SpaceVisibilityPicker value={visibility} onChange={setVisibility} />

          {visibility === "PAID" && (
            <SpaceAccessPicker
              slug={slug}
              tiers={tiers}
              currentKey={space?.visibility === "PAID" ? space.requiredEntitlementKey : null}
            />
          )}

          <div className="mt-6">
            <Label htmlFor="sf-desc">{t("spaces.descLabel")}</Label>
            <Textarea
              id="sf-desc"
              name="description"
              rows={3}
              defaultValue={space?.description ?? undefined}
              placeholder={t("spaces.descPlaceholder")}
            />
          </div>

          {isEdit && (
            <div className="mt-8 border-t border-slate-100 pt-6">
              <button
                type="button"
                onClick={performDelete}
                disabled={deleting}
                className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50"
              >
                <Icon name="trash" size={16} />
                {deleting ? t("spaces.deleting") : t("spaces.deleteSpace")}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white px-4 py-4 sm:px-6">
        <button type="button" onClick={onDone} className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100">
          {t("spaces.cancel")}
        </button>
        <button type="submit" disabled={pending} className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-[var(--primary-fg)] transition hover:bg-[var(--primary-hover)] active:scale-[0.98] disabled:opacity-50">
          {pending ? t("spaces.saving") : isEdit ? t("spaces.saveChanges") : t("spaces.createSpace")}
        </button>
      </div>

      {confirmDialog}
    </form>
  );
}
