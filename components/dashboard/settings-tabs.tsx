"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
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
 * Notion-style settings shell: page title on the left, pill tabs on the right
 * (horizontally scrollable on mobile), content of the active tab below.
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

  function select(id: string, focus = false) {
    setTab(id);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    window.history.replaceState(null, "", url);
    if (focus) tabRefs.current.get(id)?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const idx = validIds.indexOf(tab);
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      select(validIds[(idx + 1) % validIds.length], true);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      select(validIds[(idx - 1 + validIds.length) % validIds.length], true);
    } else if (e.key === "Home") {
      e.preventDefault();
      select(validIds[0], true);
    } else if (e.key === "End") {
      e.preventDefault();
      select(validIds[validIds.length - 1], true);
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
        <div
          role="tablist"
          aria-label={title}
          onKeyDown={onKeyDown}
          className="-mx-1 flex gap-1 overflow-x-auto px-1 lg:mx-0 lg:px-0"
        >
          {sections.map((s) => {
            const sel = s.id === tab;
            return (
              <button
                key={s.id}
                ref={(el) => {
                  if (el) tabRefs.current.set(s.id, el);
                }}
                type="button"
                role="tab"
                aria-selected={sel}
                aria-controls={`settings-panel-${s.id}`}
                tabIndex={sel ? 0 : -1}
                onClick={() => select(s.id)}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]",
                  sel
                    ? s.danger
                      ? "bg-red-50 text-red-700"
                      : "bg-slate-100 text-slate-900"
                    : s.danger
                      ? "text-slate-500 hover:bg-red-50 hover:text-red-700"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
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
                          : "text-[var(--brand)]"
                        : "text-slate-400",
                    )}
                  />
                )}
                {s.label}
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
        className="tab-panel pt-6"
      >
        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-8">
          {active.content}
        </div>
      </div>
    </div>
  );
}
