"use client";

import { useActionState, useEffect, useState } from "react";
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
  stripeReady,
}: {
  slug: string;
  tiers: TierRowData[];
  stripeReady: boolean;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<TierRowData | null>(null);
  const t = useTranslations("dashboard.tiers");
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
          className="inline-flex items-center gap-2 self-start rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] sm:self-auto"
        >
          <Icon name="plus" size={18} />
          {t("create")}
        </button>
      </div>

      {!stripeReady && (
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
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
                <Icon name="tiers" size={20} />
              </span>
              <div className="flex flex-wrap justify-end gap-1.5">
                {tier.isRecommended && (
                  <Pill className="bg-[var(--brand-soft)] text-[var(--brand)]">{t("recommended")}</Pill>
                )}
                {tier.isDefault && <Pill className="bg-green-100 text-green-700">{t("default")}</Pill>}
                {!tier.isPublic && <Pill className="bg-slate-100 text-slate-500">{t("hidden")}</Pill>}
              </div>
            </div>
            <p className="mt-4 font-semibold text-slate-900">{tier.name}</p>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-2xl font-bold text-slate-900">{formatPrice(tier.priceCents, tier.currency, locale)}</span>
              {tier.priceCents > 0 && (
                <span className="text-sm text-slate-400">{suffix(tier.interval)}</span>
              )}
            </div>
            {tier.description && (
              <p className="mt-2 line-clamp-2 text-sm text-slate-500">{tier.description}</p>
            )}
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
              <span className="text-sm text-slate-500">
                {t("memberCount", { count: tier.memberCount })}
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 sm:opacity-0 sm:transition sm:group-hover:opacity-100">
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
        <TierForm slug={slug} onDone={() => setCreateOpen(false)} />
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
            onDone={() => setEditing(null)}
          />
        )}
      </Sheet>
    </div>
  );
}

function TierForm({
  slug,
  tier,
  onDone,
}: {
  slug: string;
  tier?: TierRowData;
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

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  async function onDelete() {
    if (!tier) return;
    if (!confirm(t("confirmDelete", { name: tier.name }))) return;
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
            <p className="mt-1.5 text-xs text-slate-400">
              {t("coverHint")}
            </p>
          </div>

          <div>
            <p className="mb-3 text-sm font-medium text-slate-700">{t("billing")}</p>
            <div className="grid grid-cols-3 gap-3">
              {INTERVALS.map((iv) => {
                const sel = iv === interval;
                return (
                  <button
                    key={iv}
                    type="button"
                    onClick={() => setInterval(iv)}
                    className={cn(
                      "rounded-2xl border p-4 text-left transition-colors duration-200",
                      sel
                        ? "border-black bg-slate-50"
                        : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
                    )}
                  >
                    <span className="block text-sm font-semibold text-slate-900">{tIntervals(`${iv}.label`)}</span>
                    <span className="block text-xs text-slate-400">{tIntervals(`${iv}.desc`)}</span>
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
                <span className="shrink-0 text-sm text-slate-400">{suffix(interval)}</span>
              </div>
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
            <p className="mt-1 text-xs text-slate-400">
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

          {isEdit && (
            <div className="rounded-xl bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-400">{t("entitlementKeyLabel")}</p>
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
        <button type="submit" disabled={pending} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50">
          {pending ? t("saving") : isEdit ? t("saveChanges") : t("createTier")}
        </button>
      </div>
    </form>
  );
}
