"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "./icons";
import { Select } from "@/components/ui/select";
import {
  BANNER_FREQUENCIES,
  BANNER_TARGETS,
  BANNER_TARGET_ICON,
  BANNER_MAX,
  BANNER_PLACEMENTS,
  BANNER_TONES,
  BANNER_TRIGGERS,
  emptyBanner,
  type BannerConfig,
  type BannerPlacement,
  type HeroMenuAudience,
} from "@/lib/layout";

/**
 * Der Bereich "Banner" des Layout-Editors.
 *
 * Er gehoert zum grossen Formular des Editors — Banner sind Layout und werden
 * mit ihm zusammen gespeichert. Deshalb kein eigener Speichern-Knopf: es gibt
 * nur einen, und er steht oben.
 *
 * Die Vorschau rechts zeigt die Einblendung sofort, weil die Konfiguration
 * ohnehin ueber das Vorschau-Cookie an den Server geht. Genau dafuer liegen
 * Banner in der Layout-Konfiguration und nicht in einer eigenen Tabelle.
 */

const PLACEMENT_ICON: Record<BannerPlacement, IconName> = {
  BOTTOM: "layout",
  TOP: "layout",
  CENTER: "monitor",
  CORNER: "smartphone",
};

const INPUT =
  "w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-ring)]";

const AUDIENCES: HeroMenuAudience[] = ["ALL", "GUESTS", "MEMBERS", "STAFF"];

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-slate-800">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { key: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-xl border border-slate-200 p-0.5">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={cn(
            "flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition",
            value === o.key
              ? "bg-[var(--action)] text-[var(--action-fg)]"
              : "text-slate-500 hover:bg-slate-100",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Zeichnung der vier Platzierungen.
 *
 * Ein Bildchen aus drei Rechtecken sagt hier mehr als das Wort "unten" — der
 * Unterschied zwischen einer Leiste am Rand und einem Fenster in der Mitte
 * ist eine raeumliche Entscheidung und wird raeumlich getroffen.
 */
function PlacementSketch({ placement }: { placement: BannerPlacement }) {
  const bar = "absolute rounded-[2px] bg-[var(--brand)]";
  return (
    <span className="relative block h-10 w-full overflow-hidden rounded-md border border-slate-200 bg-slate-50">
      {placement === "BOTTOM" && <span className={cn(bar, "inset-x-1 bottom-1 h-2.5")} />}
      {placement === "TOP" && <span className={cn(bar, "inset-x-1 top-1 h-2.5")} />}
      {placement === "CENTER" && (
        <span className={cn(bar, "left-1/2 top-1/2 h-5 w-1/2 -translate-x-1/2 -translate-y-1/2")} />
      )}
      {placement === "CORNER" && <span className={cn(bar, "bottom-1 right-1 h-4 w-1/3")} />}
    </span>
  );
}

export interface BannerLinkTarget {
  slug: string;
  name: string;
}

/**
 * Wohin der Knopf fuehrt.
 *
 * Die Seiten der Plattform stehen als feste Punkte zur Wahl, weil ihre
 * Adressen aus dem Community-Slug folgen — wer sie abtippt, vertippt sich
 * irgendwann, und der Fehler faellt erst dem Besucher auf. Das Adressfeld
 * erscheint nur, wenn es auch gebraucht wird.
 */
function TargetPicker({
  banner,
  patch,
  spaces,
  pages,
}: {
  banner: BannerConfig;
  patch: (fields: Partial<BannerConfig>) => void;
  spaces: BannerLinkTarget[];
  pages: BannerLinkTarget[];
}) {
  const t = useTranslations("dashboard.banners");
  const [open, setOpen] = useState(false);

  // Ein Ziel, fuer das es nichts auszuwaehlen gibt, waere eine Sackgasse.
  const targets = BANNER_TARGETS.filter(
    (k) => (k !== "SPACE" || spaces.length > 0) && (k !== "PAGE" || pages.length > 0),
  );
  const options = banner.targetType === "SPACE" ? spaces : pages;

  return (
    <div className="space-y-3">
      <div>
        <span className="mb-1.5 block text-sm font-semibold text-slate-800">
          {t("fieldTarget")}
        </span>
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            onBlur={() => setTimeout(() => setOpen(false), 160)}
            className="flex w-full items-center gap-2.5 rounded-xl border border-slate-300 px-3 py-2 text-left text-sm text-slate-800 transition hover:bg-slate-50"
          >
            <Icon
              name={BANNER_TARGET_ICON[banner.targetType]}
              size={16}
              className="shrink-0 text-slate-400"
            />
            <span className="min-w-0 flex-1 truncate font-medium">
              {t(`target.${banner.targetType}`)}
            </span>
            <Icon
              name="chevron"
              size={14}
              className={cn("shrink-0 text-slate-400 transition", open && "rotate-180")}
            />
          </button>
          {open && (
            <div className="absolute left-0 right-0 top-11 z-30 max-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white py-1.5 shadow-xl">
              {targets.map((key) => (
                <button
                  key={key}
                  type="button"
                  onMouseDown={() => {
                    // Beim Wechsel den Wert der alten Art wegwerfen: ein
                    // Space-Slug im Seitenfeld zeigt ins Leere.
                    patch({ targetType: key, targetValue: "", href: "" });
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-slate-800 transition hover:bg-slate-50"
                >
                  <Icon name={BANNER_TARGET_ICON[key]} size={16} className="shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1 truncate font-medium">{t(`target.${key}`)}</span>
                  {key === banner.targetType && (
                    <Icon name="check" size={15} className="shrink-0 text-slate-900" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {(banner.targetType === "SPACE" || banner.targetType === "PAGE") && (
        <Field label={banner.targetType === "SPACE" ? t("fieldSpace") : t("fieldPage")}>
          <Select
            value={banner.targetValue}
            onChange={(targetValue) => patch({ targetValue })}
          >
            <option value="">{t("choose")}</option>
            {options.map((o) => (
              <option key={o.slug} value={o.slug}>
                {o.name}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {banner.targetType === "LINK" && (
        <Field label={t("fieldHref")} hint={t("fieldHrefHint")}>
          <input
            className={INPUT}
            value={banner.href}
            onChange={(e) => patch({ href: e.target.value })}
            placeholder="https://…"
          />
        </Field>
      )}

      {banner.targetType === "NONE" && (
        <p className="text-xs leading-5 text-slate-400">{t("targetNoneHint")}</p>
      )}
    </div>
  );
}

function BannerCard({
  banner,
  index,
  open,
  onToggle,
  onChange,
  onRemove,
  dragProps,
  spaces,
  pages,
}: {
  banner: BannerConfig;
  index: number;
  open: boolean;
  onToggle: () => void;
  onChange: (next: BannerConfig) => void;
  onRemove: () => void;
  dragProps: React.HTMLAttributes<HTMLDivElement>;
  spaces: BannerLinkTarget[];
  pages: BannerLinkTarget[];
}) {
  const t = useTranslations("dashboard.banners");
  const patch = (fields: Partial<BannerConfig>) => onChange({ ...banner, ...fields });
  const title = banner.title.trim() || banner.text.trim() || t("untitled", { n: index + 1 });

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white" {...dragProps}>
      <div className="flex items-center gap-2 p-2.5">
        <Icon
          name="grip"
          size={16}
          className="shrink-0 cursor-grab text-slate-300 active:cursor-grabbing"
        />
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
              banner.enabled ? "bg-[var(--brand-soft)] text-[color:var(--brand)]" : "bg-slate-100 text-slate-400",
            )}
          >
            <Icon name={PLACEMENT_ICON[banner.placement]} size={15} />
          </span>
          <span className="min-w-0 flex-1">
            <span className={cn("block truncate text-sm font-semibold", banner.enabled ? "text-slate-800" : "text-slate-400")}>
              {title}
            </span>
            <span className="block truncate text-xs text-slate-400">
              {t(`placement.${banner.placement}`)} · {t(`trigger.${banner.trigger}`)}
            </span>
          </span>
          <Icon
            name="chevron"
            size={16}
            className={cn("shrink-0 text-slate-400 transition-transform", open && "rotate-180")}
          />
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={t("remove")}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
        >
          <Icon name="trash" size={15} />
        </button>
      </div>

      {open && (
        <div className="space-y-5 border-t border-slate-100 p-3.5">
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
            <span className="text-sm font-semibold text-slate-800">{t("enabled")}</span>
            <input
              type="checkbox"
              checked={banner.enabled}
              onChange={(e) => patch({ enabled: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 accent-[var(--brand)]"
            />
          </label>

          {/* ------------------------------------------------------ Inhalt */}
          <Field label={t("fieldTitle")}>
            <input
              className={INPUT}
              value={banner.title}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder={t("titlePlaceholder")}
            />
          </Field>
          <Field label={t("fieldText")}>
            <textarea
              className={cn(INPUT, "min-h-20 resize-y")}
              value={banner.text}
              onChange={(e) => patch({ text: e.target.value })}
              placeholder={t("textPlaceholder")}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("fieldLabel")}>
              <input
                className={INPUT}
                value={banner.label}
                onChange={(e) => patch({ label: e.target.value })}
                placeholder={t("labelPlaceholder")}
              />
            </Field>
            <Field label={t("fieldSecondary")}>
              <input
                className={INPUT}
                value={banner.secondaryLabel}
                onChange={(e) => patch({ secondaryLabel: e.target.value })}
                placeholder={t("secondaryPlaceholder")}
              />
            </Field>
          </div>
          <TargetPicker banner={banner} patch={patch} spaces={spaces} pages={pages} />

          {/* --------------------------------------------------- Auftritt */}
          <div>
            <span className="mb-1.5 block text-sm font-semibold text-slate-800">
              {t("fieldPlacement")}
            </span>
            <div className="grid grid-cols-4 gap-2">
              {BANNER_PLACEMENTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => patch({ placement: p })}
                  className={cn(
                    "rounded-xl border p-1.5 transition",
                    banner.placement === p
                      ? "border-[var(--brand)] ring-2 ring-[var(--brand-ring)]"
                      : "border-slate-200 hover:border-slate-300",
                  )}
                  title={t(`placement.${p}`)}
                >
                  <PlacementSketch placement={p} />
                  <span className="mt-1 block truncate text-[10px] font-semibold text-slate-500">
                    {t(`placement.${p}`)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <Field label={t("fieldTone")}>
            <Segmented
              value={banner.tone}
              onChange={(tone) => patch({ tone })}
              options={BANNER_TONES.map((k) => ({ key: k, label: t(`tone.${k}`) }))}
            />
          </Field>

          <Field label={t("fieldAudience")}>
            <Segmented
              value={banner.audience}
              onChange={(audience) => patch({ audience })}
              options={AUDIENCES.map((k) => ({ key: k, label: t(`audience.${k}`) }))}
            />
          </Field>

          {/* ---------------------------------------------------- Zeitpunkt */}
          <Field label={t("fieldTrigger")}>
            <Segmented
              value={banner.trigger}
              onChange={(trigger) =>
                // Sekunden und Prozent teilen sich ein Feld; beim Wechsel waere
                // der alte Wert im neuen Mass sonst Unsinn (8 % statt 8 s).
                patch({ trigger, triggerValue: trigger === "SCROLL" ? 40 : 8 })
              }
              options={BANNER_TRIGGERS.map((k) => ({ key: k, label: t(`trigger.${k}`) }))}
            />
          </Field>

          {(banner.trigger === "DELAY" || banner.trigger === "SCROLL") && (
            <Field
              label={banner.trigger === "DELAY" ? t("fieldSeconds") : t("fieldPercent")}
              hint={banner.trigger === "DELAY" ? t("fieldSecondsHint") : t("fieldPercentHint")}
            >
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={banner.trigger === "DELAY" ? 0 : 5}
                  max={banner.trigger === "DELAY" ? 60 : 100}
                  step={banner.trigger === "DELAY" ? 1 : 5}
                  value={banner.triggerValue}
                  onChange={(e) => patch({ triggerValue: Number(e.target.value) })}
                  className="h-1.5 flex-1 accent-[var(--brand)]"
                />
                <span className="w-14 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-700">
                  {banner.trigger === "DELAY" ? `${banner.triggerValue} s` : `${banner.triggerValue} %`}
                </span>
              </div>
            </Field>
          )}

          <Field label={t("fieldFrequency")} hint={t(`frequencyHint.${banner.frequency}`)}>
            <Segmented
              value={banner.frequency}
              onChange={(frequency) => patch({ frequency })}
              options={BANNER_FREQUENCIES.map((k) => ({ key: k, label: t(`frequency.${k}`) }))}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t("fieldStart")}>
              <input
                type="date"
                className={INPUT}
                value={banner.startAt}
                onChange={(e) => patch({ startAt: e.target.value })}
              />
            </Field>
            <Field label={t("fieldEnd")}>
              <input
                type="date"
                className={INPUT}
                value={banner.endAt}
                onChange={(e) => patch({ endAt: e.target.value })}
              />
            </Field>
          </div>

          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={banner.dismissible}
              onChange={(e) => patch({ dismissible: e.target.checked })}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-[var(--brand)]"
            />
            <span>
              <span className="block text-sm font-semibold text-slate-800">
                {t("fieldDismissible")}
              </span>
              <span className="block text-xs text-slate-400">{t("fieldDismissibleHint")}</span>
            </span>
          </label>
        </div>
      )}
    </div>
  );
}

export function BannerPanel({
  banners,
  setBanners,
  spaces,
  pages,
}: {
  banners: BannerConfig[];
  setBanners: (next: BannerConfig[]) => void;
  spaces: BannerLinkTarget[];
  pages: BannerLinkTarget[];
}) {
  const t = useTranslations("dashboard.banners");
  const [openId, setOpenId] = useState<string | null>(null);
  const dragFrom = useRef<number | null>(null);
  const full = banners.length >= BANNER_MAX;

  function add() {
    const banner = emptyBanner(`b-${Date.now().toString(36)}`);
    setBanners([...banners, banner]);
    setOpenId(banner.id);
  }

  return (
    <div className="px-6 py-6">
      <p className="mb-5 text-sm leading-6 text-slate-500">{t("intro")}</p>

      <div className="space-y-2">
        {banners.map((banner, index) => (
          <BannerCard
            key={banner.id}
            banner={banner}
            index={index}
            open={openId === banner.id}
            onToggle={() => setOpenId((id) => (id === banner.id ? null : banner.id))}
            onChange={(next) => {
              const copy = [...banners];
              copy[index] = next;
              setBanners(copy);
            }}
            onRemove={() => setBanners(banners.filter((b) => b.id !== banner.id))}
            spaces={spaces}
            pages={pages}
            dragProps={{
              draggable: true,
              onDragStart: () => {
                dragFrom.current = index;
              },
              onDragOver: (e) => e.preventDefault(),
              onDrop: () => {
                const from = dragFrom.current;
                dragFrom.current = null;
                if (from === null || from === index) return;
                const copy = [...banners];
                const [moved] = copy.splice(from, 1);
                copy.splice(index, 0, moved);
                setBanners(copy);
              },
            }}
          />
        ))}
      </div>

      {banners.length === 0 && (
        <p className="rounded-2xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">
          {t("empty")}
        </p>
      )}

      {banners.length > 1 && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-500">
          <Icon name="info" size={14} className="mt-0.5 shrink-0 text-slate-400" />
          {t("orderHint")}
        </p>
      )}

      <button
        type="button"
        disabled={full}
        onClick={add}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-40"
      >
        <Icon name="plus" size={16} />
        {full ? t("full") : t("add")}
      </button>
    </div>
  );
}
