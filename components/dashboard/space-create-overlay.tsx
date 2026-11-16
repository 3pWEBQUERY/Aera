"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { createSpaceAction, type ActionState } from "@/app/actions/dashboard";
import { Icon } from "./icons";
import { Sheet } from "./sheet";
import { Input, Label, Textarea } from "@/components/ui/field";
import { FormError } from "@/components/ui/misc";
import { SpaceTypePicker } from "./space-type-picker";
import { PlanSwitchSheet } from "./plan-switch-sheet";
import { SpaceAccessPicker, type SpaceAccessTier } from "./space-access-picker";
import { SpaceVisibilityPicker } from "./spaces-manager";
import type { PlanKey } from "@/lib/plan-features";

const initial: ActionState = {};

export function SpaceCreateOverlay({
  slug,
  plan,
  tiers = [],
}: {
  slug: string;
  plan: PlanKey;
  /** Membership tiers of this community — the paid ones gate a PAID space. */
  tiers?: SpaceAccessTier[];
}) {
  const [open, setOpen] = useState(false);
  const [plansOpen, setPlansOpen] = useState(false);
  const [state, action, pending] = useActionState(createSpaceAction, initial);
  const [type, setType] = useState("FEED");
  const [visibility, setVisibility] = useState("MEMBERS");
  const t = useTranslations("dashboard");

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state.ok]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-[var(--primary-fg)] transition hover:bg-[var(--primary-hover)] active:scale-[0.98]"
      >
        <Icon name="plus" size={18} />
        {t("spaces.createSpace")}
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={t("spaces.createTitle")}
        subtitle={t("spaces.createSubtitle")}
        icon="spaces"
      >
        <form action={action} className="flex min-h-0 flex-1 flex-col">
          <input type="hidden" name="tenant" value={slug} />
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="visibility" value={visibility} />

          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl px-6 py-10">
              <FormError message={state.error} />

              <div className="mt-1">
                <Label htmlFor="ov-name">{t("spaces.nameLabel")}</Label>
                <Input id="ov-name" name="name" required placeholder={t("spaces.namePlaceholder")} className="text-base" />
              </div>

              <div className="mt-8">
                <p className="mb-3 text-sm font-medium text-slate-700">{t("spaces.typeLabel")}</p>
                <SpaceTypePicker
                  value={type}
                  onChange={setType}
                  plan={plan}
                  onLocked={() => setPlansOpen(true)}
                />
              </div>

              <SpaceVisibilityPicker value={visibility} onChange={setVisibility} />

              {visibility === "PAID" && <SpaceAccessPicker slug={slug} tiers={tiers} />}

              <div className="mt-6">
                <Label htmlFor="ov-desc">{t("spaces.descLabel")}</Label>
                <Textarea id="ov-desc" name="description" rows={3} placeholder={t("spaces.descPlaceholder")} />
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100">
              {t("spaces.cancel")}
            </button>
            <button type="submit" disabled={pending} className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-[var(--primary-fg)] transition hover:bg-[var(--primary-hover)] active:scale-[0.98] disabled:opacity-50">
              {pending ? t("spaces.creating") : t("spaces.createSpace")}
            </button>
          </div>
        </form>
      </Sheet>

      <PlanSwitchSheet
        open={plansOpen}
        onClose={() => setPlansOpen(false)}
        slug={slug}
      />
    </>
  );
}
