"use client";

import Link from "next/link";
import Image from "next/image";
import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/icons";
import { Input, Label, Textarea } from "@/components/ui/field";
import { Avatar, FormError } from "@/components/ui/misc";
import { useNameAvailability, NameStatusHint } from "@/components/dashboard/use-name-availability";
import logoBlack from "@/public/logo_black.svg";
import {
  SPACE_BLUEPRINTS,
  DEFAULT_SPACE_TYPES,
  type SpaceCatalogType,
} from "@/lib/space-catalog";
import {
  createCommunityAction,
  type CommunityState,
} from "@/app/actions/community";
import { PLANS, type PlanKey } from "@/lib/credit-plans";

const initial: CommunityState = {};

const STEP_KEYS = ["basics", "brand", "spaces", "access", "review"] as const;

const PRIMARY_PRESETS = ["#6d28d9", "#7c3aed", "#2563eb", "#0891b2", "#059669", "#ca8a04", "#dc2626", "#db2777", "#0f172a"];
const ACCENT_PRESETS = ["#ec4899", "#f43f5e", "#f59e0b", "#22c55e", "#06b6d4", "#8b5cf6", "#3b82f6", "#f97316", "#111827"];

function slugify(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

export function OnboardingWizard({
  rootDomain,
  appUrl,
  user,
  selectedPlan,
}: {
  rootDomain: string;
  appUrl: string;
  user: { name: string; avatarUrl: string | null };
  selectedPlan: PlanKey;
}) {
  const [state, action, pending] = useActionState(createCommunityAction, initial);
  const t = useTranslations("onboarding");
  const tSpaces = useTranslations("onboarding.spaces");

  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [tagline, setTagline] = useState("");
  const [description, setDescription] = useState("");
  const [primary, setPrimary] = useState(PRIMARY_PRESETS[0]);
  const [accent, setAccent] = useState(ACCENT_PRESETS[0]);
  const [selected, setSelected] = useState<Set<SpaceCatalogType>>(new Set(DEFAULT_SPACE_TYPES));
  const [membershipName, setMembershipName] = useState(t("defaultMembership"));
  const [access, setAccess] = useState<"PUBLIC" | "MEMBERS">("PUBLIC");

  const effectiveSlug = slugTouched ? slug : slugify(name);
  const nameCheck = useNameAvailability(name);

  const canProceed =
    step === 1
      ? name.trim().length >= 2 && effectiveSlug.length >= 1 && nameCheck !== "taken" && nameCheck !== "long"
      : step === 3
        ? selected.size >= 1
        : true;

  function toggleSpace(t: SpaceCatalogType) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  const stepKey = STEP_KEYS[step - 1];
  const total = STEP_KEYS.length;

  return (
    <form
      action={action}
      aria-describedby={state.error ? "onboarding-error" : undefined}
      onKeyDown={(e) => {
        if (e.key === "Enter" && step < total && (e.target as HTMLElement).tagName !== "TEXTAREA") {
          e.preventDefault();
        }
      }}
      className="flex min-h-screen w-full flex-col bg-[#f4f1ea] text-[#161613]"
    >
      {/* hidden payload */}
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="slug" value={effectiveSlug} />
      <input type="hidden" name="tagline" value={tagline} />
      <input type="hidden" name="description" value={description} />
      <input type="hidden" name="primaryColor" value={primary} />
      <input type="hidden" name="accentColor" value={accent} />
      <input type="hidden" name="visibility" value={access} />
      <input type="hidden" name="membershipName" value={membershipName} />
      <input type="hidden" name="spaces" value={JSON.stringify([...selected])} />
      <input type="hidden" name="creatorPlan" value={selectedPlan} />

      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-[#161613]/10 bg-[#f4f1ea]/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-5">
          <Link href="/dashboard" className="flex items-center">
            <Image src={logoBlack} alt="Aera" priority className="h-7 w-auto" />
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden rounded-full border border-[#161613]/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#161613]/60 sm:inline-block">
              Aera {PLANS[selectedPlan].name}
            </span>
            <span className="hidden rounded-full border border-[#161613]/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#161613]/60 sm:inline-block">
              {t("stepShort", { step, total })}
            </span>
            <div className="flex items-center gap-2">
              <Avatar name={user.name} src={user.avatarUrl} size={32} />
              <span className="hidden text-sm font-medium text-[#161613]/80 md:inline">{user.name}</span>
            </div>
          </div>
        </div>
        {/* Mobile progress line */}
        <div className="h-[3px] w-full bg-[#161613]/10 md:hidden">
          <div
            className="h-full transition-all duration-300"
            style={{ width: `${(step / total) * 100}%`, backgroundColor: primary }}
          />
        </div>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-row">
        {/* Stepper (desktop) */}
        <aside className="hidden w-64 shrink-0 border-r border-[#161613]/10 p-8 md:block">
          <ol className="relative block">
            <span
              aria-hidden
              className="absolute left-0 top-1 block h-[calc(100%-0.5rem)] w-[3px] rounded-full bg-[#161613]/10"
            />
            <span
              aria-hidden
              className="absolute left-0 top-1 block w-[3px] rounded-full transition-all duration-300"
              style={{ height: `${(step / total) * 100}%`, backgroundColor: primary }}
            />
            {STEP_KEYS.map((key, i) => {
              const n = i + 1;
              const done = step > n;
              const active = step === n;
              return (
                <li key={key} className="relative flex items-baseline gap-3 py-3 pl-6">
                  <span
                    aria-current={active ? "step" : undefined}
                    className={cn(
                      "display-serif text-lg leading-none transition",
                      active ? "text-[#161613]" : "text-[#161613]/30",
                    )}
                  >
                    {String(n).padStart(2, "0")}
                  </span>
                  <span
                    className={cn(
                      "text-sm font-medium transition",
                      active ? "text-[#161613]" : done ? "text-[#161613]/70" : "text-[#161613]/40",
                    )}
                  >
                    {t(`steps.${key}.label`)}
                  </span>
                  {done && (
                    <Icon name="check" size={13} className="inline-block align-[-1px]" style={{ color: primary }} />
                  )}
                </li>
              );
            })}
          </ol>
        </aside>

        {/* Content */}
        <div className="flex w-full min-w-0 flex-1 flex-col overflow-y-auto px-5 py-8 sm:px-10 sm:py-12 lg:px-14">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#161613]/45">
            {t("eyebrow", { label: t(`steps.${stepKey}.label`), step, total })}
          </p>
          <h2 className="display-serif mt-2 max-w-xl text-3xl leading-[1.1] sm:text-4xl">{t(`steps.${stepKey}.title`)}</h2>
          <p className="mt-2.5 max-w-lg text-sm leading-6 text-[#161613]/60">{t(`steps.${stepKey}.subtitle`)}</p>

          <div className="mt-8 flex-1">
            {step === 1 && (
              <div className="max-w-lg space-y-5">
                <div>
                  <Label htmlFor="ob-name">{t("nameLabel")}</Label>
                  <Input
                    id="ob-name"
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("namePlaceholder")}
                    className="rounded-xl bg-white py-3 text-base"
                  />
                  <NameStatusHint status={nameCheck} />
                </div>
                <div>
                  <Label htmlFor="ob-slug">{t("addressLabel")}</Label>
                  <div className="flex items-center overflow-hidden rounded-xl border border-[#161613]/20 bg-white transition focus-within:border-[#161613]/50 focus-within:ring-2 focus-within:ring-[#161613]/10">
                    <input
                      id="ob-slug"
                      value={effectiveSlug}
                      onChange={(e) => {
                        setSlugTouched(true);
                        setSlug(slugify(e.target.value));
                      }}
                      className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm outline-none"
                      placeholder="maker-studio"
                    />
                    <span className="shrink-0 border-l border-[#161613]/10 bg-[#161613]/[0.03] px-3 py-2.5 text-sm text-[#161613]/55">
                      .{rootDomain}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#161613]/50">
                    {t("alsoReachable", {
                      url: `${appUrl}/c/${effectiveSlug || t("slugFallback")}`,
                    })}
                  </p>
                </div>
                <div>
                  <Label htmlFor="ob-tag">{t("taglineLabel")}</Label>
                  <Textarea id="ob-tag" value={tagline} onChange={(e) => setTagline(e.target.value)} rows={2} maxLength={140} placeholder={t("taglinePlaceholder")} />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="max-w-lg space-y-6">
                <div>
                  <Label htmlFor="ob-desc">{t("descLabel")}</Label>
                  <Textarea id="ob-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder={t("descPlaceholder")} />
                </div>
                <ColorRow label={t("primaryColor")} presets={PRIMARY_PRESETS} value={primary} onChange={setPrimary} customLabel={t("customColor")} />
                <ColorRow label={t("accentColor")} presets={ACCENT_PRESETS} value={accent} onChange={setAccent} customLabel={t("customColor")} />
                {/* Live preview — flat brand tile, editorial type */}
                <div className="rounded-2xl border border-[#161613]/10 bg-white p-5">
                  <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.15em] text-[#161613]/45">
                    {t("preview")}
                  </p>
                  <div className="flex items-center gap-3.5">
                    <span
                      className="display-serif flex h-12 w-12 items-center justify-center rounded-xl text-xl text-white"
                      style={{ backgroundColor: primary }}
                    >
                      {(name || "A").charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="display-serif truncate text-lg leading-tight">{name || t("previewNameFallback")}</p>
                      <p className="mt-0.5 truncate text-xs text-[#161613]/50">
                        {tagline || `aera.so/${effectiveSlug || "…"}`}
                      </p>
                    </div>
                    <span
                      className="ml-auto hidden rounded-full px-3 py-1 text-xs font-semibold text-white sm:inline-block"
                      style={{ backgroundColor: accent }}
                    >
                      {t("accentBadge")}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                {SPACE_BLUEPRINTS.map((b) => {
                  const on = selected.has(b.type);
                  return (
                    <button
                      key={b.type}
                      type="button"
                      onClick={() => toggleSpace(b.type)}
                      aria-pressed={on}
                      className={cn(
                        "group relative flex flex-col items-start rounded-2xl border bg-white p-5 text-left transition duration-200",
                        on
                          ? ""
                          : "border-[#161613]/10 hover:-translate-y-0.5 hover:border-[#161613]/30",
                      )}
                      style={on ? { borderColor: primary, boxShadow: `0 0 0 1px ${primary}` } : undefined}
                    >
                      <span className="absolute right-3.5 top-3.5">
                        {on ? (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full text-white" style={{ backgroundColor: primary }}>
                            <Icon name="check" size={13} />
                          </span>
                        ) : (
                          <span className="block h-5 w-5 rounded-full border border-[#161613]/25" />
                        )}
                      </span>
                      <span
                        className={cn(
                          "flex h-11 w-11 items-center justify-center rounded-xl transition",
                          on ? "text-white" : "bg-[#161613]/5 text-[#161613]/60",
                        )}
                        style={on ? { backgroundColor: primary } : undefined}
                      >
                        <Icon name={b.icon} size={20} />
                      </span>
                      <p className="display-serif mt-4 text-base leading-tight">{tSpaces(`${b.type}.name`)}</p>
                      <p className="mt-1 text-xs leading-relaxed text-[#161613]/50">{tSpaces(`${b.type}.tagline`)}</p>
                    </button>
                  );
                })}
              </div>
            )}

            {step === 4 && (
              <div className="max-w-lg space-y-6">
                <div>
                  <Label htmlFor="ob-tier">{t("tierNameLabel")}</Label>
                  <Input id="ob-tier" value={membershipName} onChange={(e) => setMembershipName(e.target.value)} placeholder={t("defaultMembership")} />
                  <p className="mt-1 text-xs text-[#161613]/50">{t("tierHint")}</p>
                </div>
                <div>
                  <Label>{t("whoCanSee")}</Label>
                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                    <AccessCard
                      active={access === "PUBLIC"}
                      onClick={() => setAccess("PUBLIC")}
                      color={primary}
                      icon="members"
                      title={t("publicTitle")}
                      desc={t("publicDesc")}
                    />
                    <AccessCard
                      active={access === "MEMBERS"}
                      onClick={() => setAccess("MEMBERS")}
                      color={primary}
                      icon="lock"
                      title={t("membersTitle")}
                      desc={t("membersDesc")}
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="max-w-lg space-y-3">
                <SummaryRow label={t("summaryCommunity")}>
                  <p className="display-serif text-lg leading-tight">{name || "—"}</p>
                  <p className="mt-0.5 text-xs text-[#161613]/50">
                    {rootDomain ? `${effectiveSlug}.${rootDomain} · ` : ""}/c/{effectiveSlug}
                  </p>
                </SummaryRow>
                <SummaryRow label={t("summaryLook")}>
                  <div className="flex items-center gap-2">
                    <span className="h-6 w-6 rounded-md" style={{ backgroundColor: primary }} />
                    <span className="h-6 w-6 rounded-md" style={{ backgroundColor: accent }} />
                    <span className="ml-1 text-xs text-[#161613]/55">
                      {primary} · {accent}
                    </span>
                  </div>
                </SummaryRow>
                <SummaryRow label={t("summarySpaces", { count: selected.size })}>
                  <div className="flex flex-wrap gap-1.5">
                    {SPACE_BLUEPRINTS.filter((b) => selected.has(b.type)).map((b) => (
                      <span
                        key={b.type}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[#161613]/15 px-2.5 py-1 text-xs font-semibold text-[#161613]/75"
                      >
                        <Icon name={b.icon} size={12} /> {tSpaces(`${b.type}.name`)}
                      </span>
                    ))}
                  </div>
                </SummaryRow>
                <SummaryRow label={t("summaryMembership")}>
                  <p className="font-semibold">{membershipName || t("defaultMembership")}</p>
                  <p className="mt-0.5 text-xs text-[#161613]/50">
                    {access === "MEMBERS" ? t("membersOnlyVisible") : t("publicFindable")}
                  </p>
                </SummaryRow>
                <FormError id="onboarding-error" message={state.error} />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-10 flex items-center justify-between border-t border-[#161613]/10 pt-5">
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              disabled={step === 1}
              className="rounded-full px-5 py-2.5 text-sm font-semibold text-[#161613]/70 transition hover:bg-[#161613]/5 hover:text-[#161613] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("back")}
            </button>
            {step < total ? (
              <button
                type="button"
                onClick={() => canProceed && setStep((s) => s + 1)}
                disabled={!canProceed}
                className="inline-flex min-h-12 items-center gap-2 rounded-full px-7 text-sm font-semibold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                style={{ backgroundColor: primary }}
              >
                {t("next")} <Icon name="chevron" size={16} className="-rotate-90" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={pending}
                className="inline-flex min-h-12 items-center gap-2 rounded-full px-7 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
                style={{ backgroundColor: primary }}
              >
                {pending ? t("creating") : t("create")}
              </button>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}

function ColorRow({
  label,
  presets,
  value,
  onChange,
  customLabel,
}: {
  label: string;
  presets: string[];
  value: string;
  onChange: (v: string) => void;
  customLabel: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex flex-wrap items-center gap-2">
        {presets.map((c) => {
          const on = c.toLowerCase() === value.toLowerCase();
          return (
            <button
              key={c}
              type="button"
              onClick={() => onChange(c)}
              aria-label={c}
              aria-pressed={on}
              className={cn(
                "h-8 w-8 rounded-full ring-offset-2 ring-offset-[#f4f1ea] transition",
                on ? "ring-2 ring-[#161613]" : "ring-1 ring-[#161613]/10 hover:scale-105",
              )}
              style={{ backgroundColor: c }}
            />
          );
        })}
        <label
          className="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-dashed border-[#161613]/25 text-[#161613]/40 transition hover:border-[#161613]/50 hover:text-[#161613]/70"
          title={customLabel}
        >
          <Icon name="plus" size={14} />
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={customLabel} className="absolute inset-0 cursor-pointer opacity-0" />
        </label>
      </div>
    </div>
  );
}

function AccessCard({
  active,
  onClick,
  color,
  icon,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  color: string;
  icon: "members" | "lock";
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex flex-col items-start rounded-2xl border bg-white p-5 text-left transition duration-200",
        active ? "" : "border-[#161613]/10 hover:-translate-y-0.5 hover:border-[#161613]/30",
      )}
      style={active ? { borderColor: color, boxShadow: `0 0 0 1px ${color}` } : undefined}
    >
      <span
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-xl",
          active ? "text-white" : "bg-[#161613]/5 text-[#161613]/60",
        )}
        style={active ? { backgroundColor: color } : undefined}
      >
        <Icon name={icon} size={18} />
      </span>
      <p className="display-serif mt-3.5 text-base leading-tight">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-[#161613]/50">{desc}</p>
    </button>
  );
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-[#161613]/10 bg-white px-4 py-3.5">
      <span className="shrink-0 pt-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#161613]/45">
        {label}
      </span>
      <div className="min-w-0 flex-1 text-right sm:text-left">{children}</div>
    </div>
  );
}
