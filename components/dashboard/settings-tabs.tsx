"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Icon, type IconName } from "./icons";

export interface SettingsSection {
  id: string;
  label: string;
  /** Optional icon shown next to the label. */
  icon?: IconName;
  /** Renders the tab (and its active state) in red — for destructive areas. */
  danger?: boolean;
  content: React.ReactNode;
}

/**
 * Ungespeicherte Änderungen des aktiven Tabs.
 *
 * Nur der aktive Tab ist gerendert — ein Tab-Wechsel verwirft also, was im
 * Formular steht. Panels melden ihren Zustand mit `useSettingsTabDirty`; die
 * Tabs zeigen dann einen Punkt am Tab und fragen vor dem Wechsel, vor dem
 * Verlassen der Seite (Link im Dashboard) und vor dem Schließen des Fensters.
 */
const DirtyContext = createContext<((dirty: boolean) => void) | null>(null);

export function useSettingsTabDirty(dirty: boolean) {
  const setDirty = useContext(DirtyContext);
  useEffect(() => {
    setDirty?.(dirty);
  }, [setDirty, dirty]);
  // Beim Unmount (gespeichert, Tab gewechselt) nichts Ungespeichertes behaupten.
  useEffect(() => () => setDirty?.(false), [setDirty]);
}

/**
 * Notion-style settings shell: page title on the left, pill tabs on the right
 * (they wrap onto a second line on narrow screens instead of being cut off),
 * content of the active tab below.
 *
 * - Active tab is mirrored into `?tab=` (deep-linkable, survives reloads)
 *   without triggering a server navigation.
 * - Arrow keys move between tabs (WAI-ARIA tabs pattern).
 * - Panels fade in softly on switch.
 */
export function SettingsTabs({
  title,
  subtitle,
  sections,
  initialTab,
  intro,
}: {
  title: string;
  subtitle?: string;
  sections: SettingsSection[];
  initialTab?: string;
  /** Rendered between the header and the tab panel — stays visible across tabs. */
  intro?: React.ReactNode;
}) {
  const validIds = sections.map((s) => s.id);
  const [tab, setTab] = useState(
    initialTab && validIds.includes(initialTab) ? initialTab : validIds[0],
  );
  const active = sections.find((s) => s.id === tab) ?? sections[0];
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [dirty, setDirtyState] = useState(false);
  const dirtyRef = useRef(false);
  const setDirty = useCallback((d: boolean) => {
    dirtyRef.current = d;
    setDirtyState(d);
  }, []);
  const [confirm, confirmDialog] = useConfirm();
  const router = useRouter();
  const t = useTranslations("dashboard.settings");

  const askDiscard = useCallback(
    () =>
      confirm({
        title: t("discardTitle"),
        body: t("discardBody"),
        confirmLabel: t("discardConfirm"),
        cancelLabel: t("discardCancel"),
        tone: "danger",
      }),
    [confirm, t],
  );

  async function select(id: string, focus = false) {
    if (id === tab) return;
    if (dirtyRef.current && !(await askDiscard())) {
      tabRefs.current.get(tab)?.focus();
      return;
    }
    setDirty(false);
    setTab(id);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    window.history.replaceState(null, "", url);
    if (focus) tabRefs.current.get(id)?.focus();
  }

  // Fenster schließen / neu laden: der Browser fragt selbst.
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // Links innerhalb der App (Navigation, Kopfzeile): vor dem Router abfangen.
  useEffect(() => {
    if (!dirty) return;
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      void askDiscard().then((ok) => {
        if (!ok) return;
        setDirty(false);
        router.push(url.pathname + url.search + url.hash);
      });
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dirty, askDiscard, router, setDirty]);

  function onKeyDown(e: React.KeyboardEvent) {
    const idx = validIds.indexOf(tab);
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      void select(validIds[(idx + 1) % validIds.length], true);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      void select(validIds[(idx - 1 + validIds.length) % validIds.length], true);
    } else if (e.key === "Home") {
      e.preventDefault();
      void select(validIds[0], true);
    } else if (e.key === "End") {
      e.preventDefault();
      void select(validIds[validIds.length - 1], true);
    }
  }

  const ctx = useMemo(() => setDirty, [setDirty]);

  return (
    <div className="min-w-0">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
        <div
          role="tablist"
          aria-label={title}
          onKeyDown={onKeyDown}
          // Umbrechen statt seitlich abschneiden: auf 375 px fiel sonst der
          // letzte Tab („Gefahrenzone“) unsichtbar aus dem Bild.
          className="flex min-w-0 flex-wrap gap-1"
        >
          {sections.map((s) => {
            const sel = s.id === tab;
            const showDirty = sel && dirty;
            return (
              <button
                key={s.id}
                ref={(el) => {
                  if (el) tabRefs.current.set(s.id, el);
                }}
                type="button"
                role="tab"
                id={`settings-tab-${s.id}`}
                aria-selected={sel}
                aria-controls={`settings-panel-${s.id}`}
                tabIndex={sel ? 0 : -1}
                onClick={() => void select(s.id)}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]",
                  sel
                    ? s.danger
                      ? "bg-red-50 text-red-700"
                      : "bg-[var(--action)] text-[var(--action-fg)]"
                    : s.danger
                      ? "text-slate-500 hover:bg-red-50 hover:text-red-700"
                      : "text-slate-500 hover:bg-[var(--action-soft)] hover:text-slate-900",
                )}
              >
                {s.icon && (
                  <Icon
                    name={s.icon}
                    size={16}
                    className={cn(
                      "shrink-0",
                      sel
                        ? s.danger
                          ? "text-red-500"
                          : "text-[var(--action-fg)]/60"
                        : "text-slate-500",
                    )}
                  />
                )}
                {s.label}
                {showDirty && (
                  <>
                    <span aria-hidden="true" className="h-2 w-2 rounded-full bg-amber-500" />
                    <span className="sr-only">{t("unsavedMarker")}</span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {intro && <div className="pt-6">{intro}</div>}

      <div
        key={active.id}
        id={`settings-panel-${active.id}`}
        role="tabpanel"
        aria-labelledby={`settings-tab-${active.id}`}
        className="tab-panel min-w-0 pt-6"
      >
        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-8">
          <DirtyContext.Provider value={ctx}>{active.content}</DirtyContext.Provider>
        </div>
      </div>
      {confirmDialog}
    </div>
  );
}
