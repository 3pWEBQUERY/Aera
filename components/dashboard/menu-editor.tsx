"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { saveHeroMenuAction, type LayoutState } from "@/app/actions/page-layout";
import {
  HERO_MENU_DEFAULT_AUDIENCE,
  HERO_MENU_ICON,
  HERO_MENU_MAX,
  type HeroMenuAudience,
  type HeroMenuConfig,
  type HeroMenuItem,
  type HeroMenuSlot,
  type HeroMenuStyle,
  type HeroMenuType,
} from "@/lib/layout";
import { spaceTypeIcon } from "@/lib/dashboard-nav-items";
import { HeroActions } from "@/components/community/hero-actions";
import { Sheet } from "./sheet";
import { Icon, type IconName } from "./icons";
import { Input, Label } from "@/components/ui/field";
import { FormError, Pill } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

interface SpaceOption {
  slug: string;
  name: string;
  type: string;
  visibility: string;
}

/** Betrachter der Vorschau. Entspricht den drei Sichtbarkeiten der Punkte. */
type Viewer = "GUEST" | "MEMBER" | "STAFF";

const AUDIENCES: HeroMenuAudience[] = ["ALL", "GUESTS", "MEMBERS", "STAFF"];
const STYLES: HeroMenuStyle[] = ["SOLID", "OUTLINE", "PLAIN"];

/** Eingebaute Ziele, gruppiert wie im Auswahlblatt. */
const PAGE_TYPES: HeroMenuType[] = [
  "HOME",
  "MEMBERS",
  "LEADERBOARD",
  "LIBRARY",
  "LIVE",
  "SEARCH",
  "JOIN",
  "TIPS",
  "DASHBOARD",
];

const initialState: LayoutState = {};

function uid(): string {
  return `m${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Das Menü der Kopfzeile zusammenstellen.
 *
 * Zwei Listen, weil es zwei Orte gibt: die Zeile und das „…"-Menü. Punkte
 * wandern per Zug oder Knopf zwischen ihnen — das ist die eigentliche
 * Gestaltungsentscheidung ("was ist wichtig genug für die Zeile?"), und sie
 * soll sich wie eine anfühlen.
 *
 * Rechts steht die Vorschau, und zwar nicht als Nachbau: dort läuft genau die
 * Komponente, die später auf der Startseite steht. Sie kann also nicht
 * auseinanderdriften. Nur Links sind stillgelegt, damit ein Klick nicht aus
 * dem Editor führt — der „…"-Knopf lässt sich weiter aufklappen.
 */
export function MenuEditor({
  slug,
  spaces,
  tipsSlug,
  community,
  initial,
}: {
  slug: string;
  spaces: SpaceOption[];
  tipsSlug: string | null;
  community: { name: string; logoUrl: string | null; primaryColor: string; tagline: string | null };
  initial: HeroMenuConfig;
}) {
  const t = useTranslations("dashboard.heroMenu");
  const [bar, setBar] = useState<HeroMenuItem[]>(
    initial.items.filter((i) => i.slot === "BAR"),
  );
  const [more, setMore] = useState<HeroMenuItem[]>(
    initial.items.filter((i) => i.slot === "MORE"),
  );
  const [moreCfg, setMoreCfg] = useState(initial.more);
  const [viewer, setViewer] = useState<Viewer>("GUEST");
  const [addFor, setAddFor] = useState<HeroMenuSlot | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [state, action, pending] = useActionState(saveHeroMenuAction, initialState);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!state.ok) return;
    setSaved(true);
    const timer = setTimeout(() => setSaved(false), 2500);
    return () => clearTimeout(timer);
  }, [state.ok]);

  const items = useMemo(
    () => [
      ...bar.map((i) => ({ ...i, slot: "BAR" as const })),
      ...more.map((i) => ({ ...i, slot: "MORE" as const })),
    ],
    [bar, more],
  );
  const payload = JSON.stringify({ items, more: moreCfg });
  const total = items.length;

  const setFor = (slot: HeroMenuSlot) => (slot === "BAR" ? setBar : setMore);
  const listFor = (slot: HeroMenuSlot) => (slot === "BAR" ? bar : more);

  function patch(slot: HeroMenuSlot, id: string, change: Partial<HeroMenuItem>) {
    setFor(slot)(listFor(slot).map((i) => (i.id === id ? { ...i, ...change } : i)));
  }
  function remove(slot: HeroMenuSlot, id: string) {
    setFor(slot)(listFor(slot).filter((i) => i.id !== id));
  }
  /** In die andere Liste verschieben — hinten anstellen. */
  function moveSlot(from: HeroMenuSlot, id: string) {
    const item = listFor(from).find((i) => i.id === id);
    if (!item) return;
    const to: HeroMenuSlot = from === "BAR" ? "MORE" : "BAR";
    setFor(from)(listFor(from).filter((i) => i.id !== id));
    setFor(to)([...listFor(to), { ...item, slot: to }]);
  }
  function add(slot: HeroMenuSlot, type: HeroMenuType, value?: string) {
    if (total >= HERO_MENU_MAX) return;
    const item: HeroMenuItem = {
      id: uid(),
      label: "",
      type,
      value,
      slot,
      audience: HERO_MENU_DEFAULT_AUDIENCE[type] ?? "ALL",
      // In der Zeile ist schlicht die richtige Vorgabe: eine zweite gefüllte
      // Pille nimmt der ersten die Wirkung.
      style: "PLAIN",
    };
    setFor(slot)([...listFor(slot), item]);
    setAddFor(null);
    setOpenId(item.id);
  }

  // ---- Ziehen, auch über die Listengrenze hinweg -------------------------
  const drag = useRef<{ slot: HeroMenuSlot; index: number } | null>(null);

  function onDrop(slot: HeroMenuSlot, index: number) {
    const from = drag.current;
    drag.current = null;
    if (!from) return;
    if (from.slot === slot) {
      if (from.index === index) return;
      const next = [...listFor(slot)];
      const [moved] = next.splice(from.index, 1);
      next.splice(index, 0, moved);
      setFor(slot)(next);
      return;
    }
    const source = [...listFor(from.slot)];
    const [moved] = source.splice(from.index, 1);
    if (!moved) return;
    const target = [...listFor(slot)];
    target.splice(index, 0, { ...moved, slot });
    setFor(from.slot)(source);
    setFor(slot)(target);
  }

  const labelOf = (item: HeroMenuItem) =>
    item.label.trim() || t(`types.${item.type}`);

  const iconOf = (item: HeroMenuItem): IconName => {
    if (item.icon) return item.icon;
    if (item.type === "SPACE") {
      const sp = spaces.find((s) => s.slug === item.value);
      return sp ? spaceTypeIcon(sp.type) : HERO_MENU_ICON.SPACE;
    }
    return HERO_MENU_ICON[item.type];
  };

  /**
   * Die zweite Zeile einer Reihe: wohin der Punkt fuehrt.
   *
   * Bei eingebauten Seiten steht dort der Hinweis, nicht der Name — sonst
   * wiederholt die Zeile nur die Beschriftung darueber und sagt nichts.
   */
  const targetOf = (item: HeroMenuItem) => {
    if (item.type === "SPACE") {
      return spaces.find((s) => s.slug === item.value)?.name ?? `/${item.value}`;
    }
    if (item.type === "LINK") return item.value?.trim() || t("urlMissing");
    if (item.type === "TIPS" && !tipsSlug) return t("tipsMissing");
    return t(`typeHints.${item.type}`);
  };

  const row = (item: HeroMenuItem, slot: HeroMenuSlot, index: number) => {
    const open = openId === item.id;
    return (
      <li
        key={item.id}
        draggable
        onDragStart={() => (drag.current = { slot, index })}
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => onDrop(slot, index)}
        className={cn(
          "rounded-2xl border bg-white transition",
          open ? "border-[var(--action-strong)]" : "border-slate-200",
        )}
      >
        <div className="flex items-center gap-3 p-3">
          <span className="cursor-grab text-slate-300 active:cursor-grabbing">
            <Icon name="grip" size={18} />
          </span>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
            <Icon name={iconOf(item)} size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{labelOf(item)}</p>
            <p className="truncate text-xs text-slate-400">{targetOf(item)}</p>
          </div>

          {item.audience !== "ALL" && (
            <Pill className="hidden shrink-0 bg-slate-100 text-slate-500 sm:inline-flex">
              {t(`audiences.${item.audience}`)}
            </Pill>
          )}
          {slot === "BAR" && item.style !== "PLAIN" && (
            <Pill className="hidden shrink-0 bg-[var(--action-soft)] text-[#4a3d70] sm:inline-flex">
              {t(`styles.${item.style}`)}
            </Pill>
          )}

          <button
            type="button"
            onClick={() => moveSlot(slot, item.id)}
            title={slot === "BAR" ? t("toMore") : t("toBar")}
            aria-label={slot === "BAR" ? t("toMore") : t("toBar")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <Icon name={slot === "BAR" ? "more" : "menu"} size={16} />
          </button>
          <button
            type="button"
            onClick={() => setOpenId(open ? null : item.id)}
            aria-expanded={open}
            aria-label={t("editAria")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <Icon name="chevron" size={16} className={cn("transition", open && "rotate-180")} />
          </button>
        </div>

        {open && (
          <div className="space-y-4 border-t border-slate-100 px-3 pb-4 pt-3">
            <div>
              <Label htmlFor={`lb-${item.id}`}>{t("labelLabel")}</Label>
              <Input
                id={`lb-${item.id}`}
                value={item.label}
                maxLength={40}
                placeholder={t(`types.${item.type}`)}
                onChange={(e) => patch(slot, item.id, { label: e.target.value })}
              />
            </div>

            {item.type === "LINK" && (
              <div>
                <Label htmlFor={`ur-${item.id}`}>{t("urlLabel")}</Label>
                <Input
                  id={`ur-${item.id}`}
                  value={item.value ?? ""}
                  type="url"
                  placeholder="https://…"
                  onChange={(e) => patch(slot, item.id, { value: e.target.value })}
                />
              </div>
            )}

            {item.type === "SPACE" && (
              <div>
                <Label htmlFor={`sp-${item.id}`}>{t("spaceLabel")}</Label>
                <select
                  id={`sp-${item.id}`}
                  value={item.value ?? ""}
                  onChange={(e) => patch(slot, item.id, { value: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
                >
                  {spaces.map((sp) => (
                    <option key={sp.slug} value={sp.slug}>
                      {sp.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <Label>{t("audienceLabel")}</Label>
              <div className="flex flex-wrap gap-1.5">
                {AUDIENCES.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => patch(slot, item.id, { audience: a })}
                    aria-pressed={item.audience === a}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
                      item.audience === a
                        ? "border-[var(--action-strong)] bg-[var(--action)] text-[var(--action-fg)]"
                        : "border-slate-200 text-slate-600 hover:border-slate-400",
                    )}
                  >
                    {t(`audiences.${a}`)}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-slate-400">{t("audienceHint")}</p>
            </div>

            {slot === "BAR" && (
              <div>
                <Label>{t("styleLabel")}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {STYLES.map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => patch(slot, item.id, { style: st })}
                      aria-pressed={item.style === st}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
                        item.style === st
                          ? "border-[var(--action-strong)] bg-[var(--action)] text-[var(--action-fg)]"
                          : "border-slate-200 text-slate-600 hover:border-slate-400",
                      )}
                    >
                      {t(`styles.${st}`)}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-slate-400">{t("styleHint")}</p>
              </div>
            )}

            <button
              type="button"
              onClick={() => remove(slot, item.id)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50"
            >
              <Icon name="trash" size={14} /> {t("remove")}
            </button>
          </div>
        )}
      </li>
    );
  };

  const zone = (slot: HeroMenuSlot, title: string, hint: string) => {
    const list = listFor(slot);
    return (
      <section>
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Icon name={slot === "BAR" ? "menu" : "more"} size={16} className="text-slate-400" />
              {title}
              <Pill className="bg-slate-100 text-slate-500">{list.length}</Pill>
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">{hint}</p>
          </div>
          <button
            type="button"
            onClick={() => setAddFor(slot)}
            disabled={total >= HERO_MENU_MAX}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <Icon name="plus" size={15} /> {t("add")}
          </button>
        </div>

        {list.length === 0 ? (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(slot, 0)}
            className="mt-3 rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-xs text-slate-400"
          >
            {t("emptyZone")}
          </div>
        ) : (
          <ul className="mt-3 space-y-2">{list.map((item, i) => row(item, slot, i))}</ul>
        )}
      </section>
    );
  };

  return (
    <form action={action}>
      <input type="hidden" name="tenant" value={slug} />
      <input type="hidden" name="payload" value={payload} />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{t("title")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700">
              <Icon name="check" size={16} /> {t("saved")}
            </span>
          )}
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--action)] px-5 py-2.5 text-sm font-semibold text-[var(--action-fg)] transition hover:bg-[var(--action-hover)] active:scale-[0.98] disabled:opacity-50"
          >
            {pending ? t("saving") : t("save")}
          </button>
        </div>
      </div>

      <FormError message={state.error} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-8">
          {zone("BAR", t("barTitle"), t("barHint"))}
          {zone("MORE", t("moreTitle"), t("moreHint"))}

          {/* Der Drei-Punkte-Knopf selbst. */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">{t("moreButtonTitle")}</h2>
            <p className="mt-0.5 text-xs text-slate-400">{t("moreButtonHint")}</p>
            <label className="mt-3 flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={moreCfg.enabled}
                onClick={() => setMoreCfg({ ...moreCfg, enabled: !moreCfg.enabled })}
                className={cn(
                  "relative h-6 w-11 shrink-0 rounded-full transition",
                  moreCfg.enabled ? "bg-[var(--action-strong)]" : "bg-slate-200",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
                    moreCfg.enabled ? "left-[1.375rem]" : "left-0.5",
                  )}
                />
              </button>
              <span className="text-sm text-slate-700">{t("moreEnabled")}</span>
            </label>
            {moreCfg.enabled && (
              <div className="mt-4">
                <Label htmlFor="more-label">{t("moreLabelLabel")}</Label>
                <Input
                  id="more-label"
                  value={moreCfg.label}
                  maxLength={40}
                  placeholder={t("moreLabelPlaceholder")}
                  onChange={(e) => setMoreCfg({ ...moreCfg, label: e.target.value })}
                />
                <p className="mt-1 text-xs text-slate-400">{t("moreLabelHint")}</p>
              </div>
            )}
          </section>
        </div>

        {/* ---- Vorschau ---------------------------------------------------- */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">{t("previewTitle")}</p>
            </div>

            <div className="flex gap-1 px-4 pt-3">
              {(["GUEST", "MEMBER", "STAFF"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setViewer(v)}
                  aria-pressed={viewer === v}
                  className={cn(
                    "flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition",
                    viewer === v
                      ? "bg-[var(--action)] text-[var(--action-fg)]"
                      : "text-slate-500 hover:bg-slate-100",
                  )}
                >
                  {t(`viewers.${v}`)}
                </button>
              ))}
            </div>

            {/* Papierton und Markenfarbe der Community, damit die gefüllte
                Pille hier so aussieht wie dort. */}
            <div
              className="mt-3 px-4 pb-5"
              style={
                {
                  "--brand": community.primaryColor,
                  "--brand-hover": community.primaryColor,
                  "--brand-ring": `color-mix(in srgb, ${community.primaryColor} 28%, transparent)`,
                } as React.CSSProperties
              }
            >
              <div className="rounded-xl bg-[#f4f1ea] px-4 py-6 text-center">
                <span
                  className="mx-auto flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl"
                  style={{ backgroundColor: community.primaryColor }}
                >
                  {community.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={community.logoUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-lg font-bold text-white">
                      {community.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </span>
                <p className="display-serif mt-3 text-xl text-[#161613]">{community.name}</p>
                {community.tagline && (
                  <p className="mt-1 line-clamp-2 text-xs text-[#161613]/60">{community.tagline}</p>
                )}

                <div
                  className="mt-4"
                  // Im Editor darf ein Klick nicht wegführen. Nur Links werden
                  // stillgelegt — der "…"-Knopf bleibt bedienbar, sonst könnte
                  // man das Menü nicht ansehen.
                  onClickCapture={(e) => {
                    if ((e.target as HTMLElement).closest("a")) e.preventDefault();
                  }}
                >
                  <HeroActions
                    slug={slug}
                    isMember={viewer !== "GUEST"}
                    isStaff={viewer === "STAFF"}
                    tipsHref={tipsSlug ? `/c/${slug}/s/${tipsSlug}` : null}
                    menu={{ items, more: moreCfg }}
                  />
                </div>
              </div>

              <p className="mt-3 text-xs leading-relaxed text-slate-400">{t("previewHint")}</p>
              {!tipsSlug && items.some((i) => i.type === "TIPS") && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-600">
                  <Icon name="alert" size={13} className="mt-0.5 shrink-0" />
                  {t("tipsMissingHint")}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ---- Punkt hinzufügen -------------------------------------------- */}
      <Sheet
        open={addFor !== null}
        onClose={() => setAddFor(null)}
        title={t("addTitle")}
        subtitle={addFor === "MORE" ? t("moreTitle") : t("barTitle")}
        icon="menu"
      >
        {addFor && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 overflow-y-auto">
              {/* Drei Spalten statt einer Kolonne: die Gruppen sind
                  gleichrangige Antworten auf dieselbe Frage ("was soll da
                  hin?") und lassen sich nebeneinander vergleichen, statt
                  aneinander vorbeizuscrollen. Unter md bleibt es gestapelt —
                  drei Spalten auf einem Telefon waeren Spalten von nichts. */}
              <div className="mx-auto grid max-w-6xl items-start gap-5 px-6 py-10 md:grid-cols-3">
                <Group title={t("groupSpaces")} hint={t("groupSpacesHint")}>
                  {spaces.length === 0 ? (
                    <p className="text-sm text-slate-400">{t("noSpaces")}</p>
                  ) : (
                    spaces.map((sp) => (
                      <Choice
                        key={sp.slug}
                        icon={spaceTypeIcon(sp.type)}
                        label={sp.name}
                        hint={`/${sp.slug}`}
                        onClick={() => add(addFor, "SPACE", sp.slug)}
                      />
                    ))
                  )}
                </Group>

                <Group title={t("groupPages")} hint={t("groupPagesHint")}>
                  {PAGE_TYPES.map((type) => (
                    <Choice
                      key={type}
                      icon={HERO_MENU_ICON[type]}
                      label={t(`types.${type}`)}
                      hint={t(`typeHints.${type}`)}
                      onClick={() => add(addFor, type)}
                    />
                  ))}
                </Group>

                <Group title={t("groupOther")} hint={t("groupOtherHint")}>
                  <Choice
                    icon={HERO_MENU_ICON.SHARE}
                    label={t("types.SHARE")}
                    hint={t("typeHints.SHARE")}
                    onClick={() => add(addFor, "SHARE")}
                  />
                  <Choice
                    icon={HERO_MENU_ICON.LINK}
                    label={t("types.LINK")}
                    hint={t("typeHints.LINK")}
                    onClick={() => add(addFor, "LINK", "https://")}
                  />
                </Group>
              </div>
            </div>
          </div>
        )}
      </Sheet>
    </form>
  );
}

/**
 * Eine Spalte des Auswahlblatts.
 *
 * Die Ueberschrift bleibt stehen, die Liste scrollt darunter: eine Community
 * mit zwanzig Spaces soll die beiden anderen Spalten nicht aus dem Bild
 * schieben, und man will beim Suchen sehen, wonach man sucht.
 */
function Group({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        {title}
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">{hint}</p>
      <div className="mt-3 max-h-[46vh] space-y-2 overflow-y-auto pr-0.5">{children}</div>
    </section>
  );
}

function Choice({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: IconName;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-slate-400 hover:shadow-[var(--shadow-card)]"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
        <Icon name={icon} size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-slate-900">{label}</span>
        <span className="block truncate text-xs text-slate-400">{hint}</span>
      </span>
      <Icon name="plus" size={16} className="shrink-0 text-slate-400" />
    </button>
  );
}
