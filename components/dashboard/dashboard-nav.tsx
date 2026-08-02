"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { cn, isPathActive } from "@/lib/utils";
import {
  NAV_GROUPS_AFTER,
  NAV_GROUPS_BEFORE,
  spaceTypeIcon,
  type DashboardNavGroup,
} from "@/lib/dashboard-nav-items";
import { Icon } from "./icons";
import { PlanBadge, PLAN_LABEL } from "./plan-badge";
import {
  minPlanForFeature,
  planAllowsFeature,
  type PlanKey,
} from "@/lib/plan-features";

export interface NavSpace {
  slug: string;
  name: string;
  type: string;
}

/**
 * Zugeklappte Bereiche ueberleben den Reload. Gespeichert werden nur die
 * geschlossenen Schluessel: ein spaeter dazukommender Bereich ist damit
 * automatisch offen, statt in einer alten Liste zu fehlen und zu verschwinden.
 */
const COLLAPSED_STORAGE_KEY = "aera:dashboard-nav-collapsed";
/** Schluessel der dynamischen Space-Liste — sie steht in keiner NAV_GROUP. */
const SPACES_SECTION = "spaces";

export function DashboardNav({
  tenant,
  spaces,
  plan,
}: {
  tenant: { slug: string; name: string; logoUrl: string | null; primaryColor: string };
  spaces: NavSpace[];
  /** Active creator package — drives the lock badges. */
  plan: PlanKey;
}) {
  const pathname = usePathname();
  const t = useTranslations("dashboard");
  const base = `/dashboard/${tenant.slug}`;
  // Beide Instanzen (Seitenleiste und mobiles Sheet) stehen gleichzeitig im
  // DOM — ohne eigenen Praefix zeigten ihre aria-controls auf dieselbe id.
  const uid = useId();

  /**
   * Bereiche, in denen die aktuelle Seite liegt. Mehrere sind moeglich: die
   * Space-Liste und "Verwalten" ueberschneiden sich unter /spaces nicht, aber
   * die Regel soll nicht daran haengen.
   *
   * Als String und nicht als Array, damit der Effekt unten wirklich nur beim
   * Seitenwechsel feuert — ein neues Array bei jedem Elternrender wuerde einen
   * gerade zugeklappten Bereich wieder aufreissen.
   */
  const activeSectionKey = useMemo(() => {
    const keys: string[] = [];
    for (const g of [...NAV_GROUPS_BEFORE, ...NAV_GROUPS_AFTER]) {
      const hit = g.items.some((it) =>
        isPathActive(pathname, base + it.href, it.href === "" || it.exact),
      );
      if (hit) keys.push(g.labelKey);
    }
    if (spaces.some((s) => isPathActive(pathname, `${base}/spaces/${s.slug}`))) {
      keys.push(SPACES_SECTION);
    }
    return keys.join("|");
  }, [pathname, base, spaces]);

  const [collapsed, setCollapsed] = useState<string[]>([]);

  // Erst nach dem Mount lesen: der Server kennt den Speicher nicht, und ein
  // abweichender erster Client-Render waere ein Hydration-Fehler.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COLLAPSED_STORAGE_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setCollapsed(parsed.filter((k): k is string => typeof k === "string"));
      }
    } catch {
      // Privater Modus oder kaputter Eintrag — dann eben alles offen.
    }
  }, []);

  /**
   * Der Bereich der aktuellen Seite klappt auf. Bewusst an `activeSectionKey`
   * gehaengt und nicht bei jedem Render erzwungen: sonst liesse sich der
   * Bereich, in dem man gerade steht, nie wieder zuklappen.
   */
  useEffect(() => {
    if (!activeSectionKey) return;
    const active = activeSectionKey.split("|");
    setCollapsed((prev) =>
      prev.some((k) => active.includes(k)) ? prev.filter((k) => !active.includes(k)) : prev,
    );
  }, [activeSectionKey]);

  const toggleSection = useCallback(
    (key: string) => {
      const next = collapsed.includes(key)
        ? collapsed.filter((k) => k !== key)
        : [...collapsed, key];
      setCollapsed(next);
      try {
        window.localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Nicht speichern zu koennen darf das Zuklappen nicht verhindern.
      }
    },
    [collapsed],
  );

  /** Kopfzeile eines Bereichs: klickbar, mit Pfeil und optionaler Aktion. */
  function Section({
    sectionKey,
    label,
    action,
    children,
  }: {
    sectionKey: string;
    label: string;
    /** Steht neben der Kopfzeile, ausserhalb des Schalters (z. B. das Plus). */
    action?: ReactNode;
    children: ReactNode;
  }) {
    const open = !collapsed.includes(sectionKey);
    const panelId = `${uid}-${sectionKey}`;
    return (
      <div>
        <div className="mb-1.5 flex items-center gap-1 px-3">
          <button
            type="button"
            onClick={() => toggleSection(sectionKey)}
            aria-expanded={open}
            aria-controls={panelId}
            className="-mx-1 flex min-w-0 flex-1 items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 transition-colors hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
          >
            <Icon
              name="chevron"
              size={12}
              className={cn(
                "shrink-0 transition-transform duration-150",
                open ? "" : "-rotate-90",
              )}
            />
            <span className="truncate">{label}</span>
          </button>
          {action}
        </div>
        <div id={panelId} hidden={!open}>
          {children}
        </div>
      </div>
    );
  }

  function Group({ group }: { group: DashboardNavGroup }) {
    return (
      <Section sectionKey={group.labelKey} label={t(`nav.${group.labelKey}`)}>
        <nav className="space-y-0.5">
          {group.items.map((it) => {
            const href = base + it.href;
            // Sub-pages (e.g. /media/studio) keep their section highlighted —
            // ausser der Eintrag ist als `exact` markiert, weil seine
            // Unterseiten eigene Eintraege haben.
            const active = isPathActive(pathname, href, it.href === "" || it.exact);
            // Locked entries stay visible on purpose: seeing what the next
            // package adds is what makes a creator click it.
            const locked = it.feature ? !planAllowsFeature(plan, it.feature) : false;
            return (
              <Link
                key={it.href}
                href={href}
                aria-label={
                  locked && it.feature
                    ? `${t(`nav.${it.labelKey}`)} — ${t("nav.lockedSuffix", { plan: PLAN_LABEL[minPlanForFeature(it.feature)] })}`
                    : undefined
                }
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active ? "bg-[var(--action)] text-[var(--action-fg)]" : "text-slate-600 hover:bg-[var(--action-soft)] hover:text-slate-900",
                )}
              >
                <Icon
                  name={it.icon}
                  size={18}
                  className={cn(
                    "shrink-0",
                    active ? "text-[var(--action-fg)]" : "text-slate-400 group-hover:text-slate-600",
                    locked && !active && "text-slate-300",
                  )}
                />
                <span className={cn("min-w-0 flex-1 truncate", locked && !active && "text-slate-400")}>
                  {t(`nav.${it.labelKey}`)}
                </span>
                {locked && it.feature && !active && (
                  <PlanBadge plan={minPlanForFeature(it.feature)} locked className="shrink-0" />
                )}
                {locked && active && (
                  <Icon name="lock" size={13} className="shrink-0 text-white/70" />
                )}
              </Link>
            );
          })}
        </nav>
      </Section>
    );
  }

  return (
    <div className="flex h-full w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {NAV_GROUPS_BEFORE.map((g) => (
          <Group key={g.labelKey} group={g} />
        ))}

        {/* Dynamic spaces section */}
        <Section
          sectionKey={SPACES_SECTION}
          label={t("nav.spaces")}
          action={
            <Link
              href={`${base}/spaces`}
              className="shrink-0 text-slate-400 transition hover:text-slate-700"
              aria-label={t("nav.manageSpacesAria")}
            >
              <Icon name="plus" size={14} />
            </Link>
          }
        >
          <nav className="space-y-0.5">
            {spaces.length === 0 ? (
              <p className="px-3 py-1.5 text-xs text-slate-400">{t("nav.noSpaces")}</p>
            ) : (
              spaces.map((s) => {
                const href = `${base}/spaces/${s.slug}`;
                const active = isPathActive(pathname, href);
                return (
                  <Link
                    key={s.slug}
                    href={href}
                    className={cn(
                      "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active ? "bg-[var(--action)] text-[var(--action-fg)]" : "text-slate-600 hover:bg-[var(--action-soft)] hover:text-slate-900",
                    )}
                  >
                    <Icon name={spaceTypeIcon(s.type)} size={18} className={active ? "text-[var(--action-fg)]" : "text-slate-400 group-hover:text-slate-600"} />
                    <span className="truncate">{s.name}</span>
                  </Link>
                );
              })
            )}
          </nav>
        </Section>

        {NAV_GROUPS_AFTER.map((g) => (
          <Group key={g.labelKey} group={g} />
        ))}
      </div>

      <div className="space-y-3 border-t border-slate-200 p-3">
        <Link
          href={`${base}/assistant`}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--action)] px-4 py-2.5 text-sm font-semibold text-[var(--action-fg)] transition hover:bg-[var(--action-hover)]"
        >
          <Icon name="sparkles" size={18} />
          {t("nav.aiAssistant")}
        </Link>
        <Link
          href={`${base}/settings`}
          className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-slate-100"
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg text-sm font-bold text-white"
            style={{ backgroundColor: tenant.primaryColor }}
          >
            {tenant.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tenant.logoUrl} alt={tenant.name} className="h-full w-full object-cover" />
            ) : (
              tenant.name.charAt(0).toUpperCase()
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-slate-900">{tenant.name}</span>
            <span className="block text-xs text-slate-400">{t("nav.yourCommunity")}</span>
          </span>
          <Icon name="settings" size={16} className="text-slate-400" />
        </Link>
      </div>
    </div>
  );
}
