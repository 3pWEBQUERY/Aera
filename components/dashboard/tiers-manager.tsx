"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import {
  createTierAction,
  updateTierAction,
  deleteTierAction,
  type ActionState,
} from "@/app/actions/dashboard";
import { Sheet } from "./sheet";
import { Icon } from "./icons";
import { ImageUpload } from "./image-upload";
import { Input, Label, Textarea } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Pill, FormError } from "@/components/ui/misc";
import { cn, formatPrice } from "@/lib/utils";
import { PricePointSelect } from "./price-point-select";
import { useConfirm } from "@/components/ui/confirm-dialog";

export interface TierRowData {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  coverUrl: string | null;
  isRecommended: boolean;
  priceCents: number;
  currency: string;
  interval: string;
  entitlementKey: string;
  isDefault: boolean;
  isPublic: boolean;
  memberCount: number;
}

const INTERVALS = ["FREE", "MONTH", "YEAR"];

const initial: ActionState = {};

export function TiersManager({
  slug,
  tiers,
  payoutsReady,
  stripeReady,
  showSetupHint = false,
}: {
  slug: string;
  tiers: TierRowData[];
  /** Die Community hat ein Stripe-Konto für Auszahlungen (`stripeAccountId`). */
  payoutsReady: boolean;
  stripeReady: boolean;
  /**
   * Plattform-Admins: Env-Setup-Hinweis (STRIPE_SECRET_KEY) und der technische
   * Schlüssel einer Mitgliedschaft. Creator brauchen beides nicht.
   */
  showSetupHint?: boolean;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<TierRowData | null>(null);
  const t = useTranslations("dashboard.tiers");
  const tIntervals = useTranslations("dashboard.tierIntervals");
  const locale = useLocale();
  const suffix = (interval: string) =>
    interval === "MONTH" ? t("suffixMonth") : interval === "YEAR" ? t("suffixYear") : "";

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:mb-7 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{t("title")}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {t("subtitle", { count: tiers.length })}
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-2 self-start rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-[var(--primary-fg)] transition hover:bg-[var(--primary-hover)] active:scale-[0.98] sm:self-auto"
        >
          <Icon name="plus" size={18} />
          {t("create")}
        </button>
      </div>

      {!payoutsReady && tiers.some((tier) => tier.priceCents > 0) && (
        <PayoutsHint slug={slug} className="mb-5" />
      )}

      {!stripeReady && showSetupHint && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {t.rich("stripeWarning", { code: (c) => <code>{c}</code> })}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiers.map((tier) => (
          <button
            key={tier.id}
            onClick={() => setEditing(tier)}
            className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-left transition hover:border-slate-300 hover:shadow-md"
          >
            {tier.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tier.coverUrl} alt="" className="aspect-[3/1] w-full object-cover" />
            ) : (
              <div className="bg-[var(--brand)] aspect-[3/1] w-full opacity-80" />
            )}
            <div className="flex flex-1 flex-col p-5 pt-4">
            <div className="flex items-start justify-between gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--action)] text-[var(--action-fg)]">
                <Icon name="tiers" size={20} />
              </span>
              <div className="flex flex-wrap justify-end gap-1.5">
                {tier.isRecommended && (
                  <Pill className="bg-[var(--brand-soft)] text-[var(--brand)]">{t("recommended")}</Pill>
                )}
                {tier.isDefault && <Pill className="bg-green-100 text-green-700">{t("default")}</Pill>}
                {!tier.isPublic && <Pill className="bg-slate-100 text-slate-600">{t("hidden")}</Pill>}
              </div>
            </div>
            <p className="mt-4 font-semibold text-slate-900">{tier.name}</p>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-2xl font-bold text-slate-900">{formatPrice(tier.priceCents, tier.currency, locale, tIntervals("FREE.label"))}</span>
              {tier.priceCents > 0 && (
                <span className="text-sm text-slate-500">{suffix(tier.interval)}</span>
              )}
            </div>
            {tier.description && (
              <p className="mt-2 line-clamp-2 text-sm text-slate-500">{tier.description}</p>
            )}
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
              <span className="text-sm text-slate-500">
                {t("memberCount", { count: tier.memberCount })}
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 sm:opacity-0 sm:transition sm:group-hover:opacity-100">
                <Icon name="settings" size={14} /> {t("edit")}
              </span>
            </div>
            </div>
          </button>
        ))}
      </div>

      <Sheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t("createTitle")}
        subtitle={t("createSubtitle")}
        icon="tiers"
      >
        <TierForm
          slug={slug}
          payoutsReady={payoutsReady}
          onDone={() => setCreateOpen(false)}
        />
      </Sheet>

      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={t("editTitle")}
        subtitle={editing?.name}
        icon="tiers"
      >
        {editing && (
          <TierForm
            key={editing.id}
            slug={slug}
            tier={editing}
            payoutsReady={payoutsReady}
            showTechnical={showSetupHint}
            onDone={() => setEditing(null)}
          />
        )}
      </Sheet>
    </div>
  );
}

/** Creator ohne Stripe-Konto: bezahlte Mitgliedschaften brächten kein Geld an. */
function PayoutsHint({ slug, className }: { slug: string; className?: string }) {
  const t = useTranslations("dashboard.tiers");
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between sm:gap-4",
        className,
      )}
    >
      <p>{t("payoutsMissing")}</p>
      <Link
        href={`/dashboard/${slug}/settings?tab=integrations`}
        className="shrink-0 font-semibold text-amber-900 underline underline-offset-2 hover:no-underline"
      >
        {t("payoutsSetup")}
      </Link>
    </div>
  );
}

function TierForm({
  slug,
  tier,
  payoutsReady,
  showTechnical = false,
  onDone,
}: {
  slug: string;
  tier?: TierRowData;
  payoutsReady: boolean;
  /** Technischer Schlüssel — nur für Plattform-Admins. */
  showTechnical?: boolean;
  onDone: () => void;
}) {
  const isEdit = !!tier;
  const t = useTranslations("dashboard.tiers");
  const tIntervals = useTranslations("dashboard.tierIntervals");
  const suffix = (iv: string) =>
    iv === "MONTH" ? t("suffixMonth") : iv === "YEAR" ? t("suffixYear") : "";
  const [state, action, pending] = useActionState(
    isEdit ? updateTierAction : createTierAction,
    initial,
  );
  const [interval, setInterval] = useState(tier?.interval ?? "FREE");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>();
  const [confirm, confirmDialog] = useConfirm();

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  async function onDelete() {
    if (!tier) return;
    // Bezahlte Mitgliedschaften blendet der Server nur aus (laufende Zahlungen).
    const paid = tier.priceCents > 0;
    const confirmed = await confirm({
      title: t(paid ? "confirmHide" : "confirmDelete", { name: tier.name }),
      body: paid
        ? t("confirmHideBody")
        : t("confirmDeleteBody", { count: tier.memberCount }),
      confirmLabel: paid ? t("hideTier") : t("deleteTier"),
      tone: "danger",
    });
    if (!confirmed) return;
    setDeleting(true);
    setDeleteError(undefined);
    const fd = new FormData();
    fd.set("tenant", slug);
    fd.set("tierId", tier.id);
    const result = await deleteTierAction(fd);
    if (result.error) {
      setDeleteError(result.error);
      setDeleting(false);
      return;
    }
    onDone();
  }

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="tenant" value={slug} />
      <input type="hidden" name="interval" value={interval} />
      {interval === "FREE" && <input type="hidden" name="priceCents" value={0} />}
      {isEdit && <input type="hidden" name="tierId" value={tier!.id} />}

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl space-y-7 px-6 py-10">
          <FormError message={deleteError ?? state.error} />

          <div>
            <Label htmlFor="tf-name">{t("nameLabel")}</Label>
            <Input id="tf-name" name="name" required defaultValue={tier?.name} placeholder={t("namePlaceholder")} className="text-base" />
          </div>

          <div>
            <Label>{t("coverLabel")}</Label>
            <ImageUpload tenant={slug} name="coverUrl" purpose="tier-cover" defaultUrl={tier?.coverUrl ?? null} />
            <p className="mt-1.5 text-xs text-slate-500">
              {t("coverHint")}
            </p>
          </div>

          <div>
            <p id="tf-billing" className="mb-3 text-sm font-medium text-slate-700">{t("billing")}</p>
            <div role="group" aria-labelledby="tf-billing" className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-3">
              {INTERVALS.map((iv) => {
                const sel = iv === interval;
                return (
                  <button
                    key={iv}
                    type="button"
                    aria-pressed={sel}
                    onClick={() => setInterval(iv)}
                    className={cn(
                      "rounded-2xl border p-4 text-left transition-colors duration-200",
                      sel
                        ? "border-[var(--action-strong)] bg-slate-50"
                        : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
                    )}
                  >
                    <span className="block text-sm font-semibold text-slate-900">{tIntervals(`${iv}.label`)}</span>
                    <span className="block text-xs text-slate-500">{tIntervals(`${iv}.desc`)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {interval !== "FREE" && (
            <div>
              <Label htmlFor="tf-price">{t("priceLabel")}</Label>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <PricePointSelect
                    id="tf-price"
                    name="priceCents"
                    kind="subscription"
                    required
                    defaultCents={tier && tier.priceCents > 0 ? tier.priceCents : undefined}
                  />
                </div>
                <span className="shrink-0 text-sm text-slate-500">{suffix(interval)}</span>
              </div>
              <p className="mt-1.5 text-xs text-slate-500">{t("priceHint")}</p>
              {!payoutsReady && <PayoutsHint slug={slug} className="mt-3" />}
            </div>
          )}

          <div>
            <Label htmlFor="tf-desc">{t("benefitsLabel")}</Label>
            <Textarea
              id="tf-desc"
              name="description"
              rows={5}
              defaultValue={tier?.description ?? undefined}
              placeholder={t("benefitsPlaceholder")}
            />
            <p className="mt-1 text-xs text-slate-500">
              {t("benefitsHint")}
            </p>
          </div>

          <div className="space-y-3">
            <Switch
              name="isPublic"
              defaultChecked={tier ? tier.isPublic : true}
              label={t("publicLabel")}
              hint={t("publicHint")}
            />
            <Switch
              name="isRecommended"
              defaultChecked={tier?.isRecommended ?? false}
              label={t("recommendedLabel")}
              hint={t("recommendedHint")}
            />
            {isEdit && (
              <Switch
                name="isDefault"
                defaultChecked={tier!.isDefault}
                disabled={tier!.isDefault}
                label={t("defaultLabel")}
                hint={tier!.isDefault ? t("defaultHintActive") : t("defaultHintInactive")}
              />
            )}
          </div>

          {isEdit && showTechnical && (
            <div className="rounded-xl bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-500">{t("entitlementKeyLabel")}</p>
              <p className="font-mono text-sm text-slate-600">{tier!.entitlementKey}</p>
            </div>
          )}

          {isEdit && !tier!.isDefault && (
            <div className="border-t border-slate-100 pt-6">
              <button
                type="button"
                onClick={onDelete}
                disabled={deleting}
                className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
              >
                <Icon name="archive" size={16} />
                {deleting ? t("deleting") : t("deleteTier")}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
        <button type="button" onClick={onDone} className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100">
          {t("cancel")}
        </button>
        <button type="submit" disabled={pending} className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-[var(--primary-fg)] transition hover:bg-[var(--primary-hover)] active:scale-[0.98] disabled:opacity-50">
          {pending ? t("saving") : isEdit ? t("saveChanges") : t("createTier")}
        </button>
      </div>
      {confirmDialog}
    </form>
  );
}
