"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { createSpaceAction, type ActionState } from "@/app/actions/dashboard";
import { Icon, type IconName } from "./icons";
import { Sheet } from "./sheet";
import { Input, Label, Textarea } from "@/components/ui/field";
import { FormError } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { SpaceTypePicker } from "./space-type-picker";
import { CreditsSheet } from "./credits-sheet";
import type { PlanKey } from "@/lib/plan-features";

const VIS: { value: string; icon: IconName }[] = [
  { value: "PUBLIC", icon: "feed" },
  { value: "MEMBERS", icon: "members" },
  { value: "PAID", icon: "lock" },
];

const initial: ActionState = {};

export function SpaceCreateOverlay({
  slug,
  plan,
}: {
  slug: string;
  plan: PlanKey;
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
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98]"
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

              <div className="mt-8">
                <p className="mb-3 text-sm font-medium text-slate-700">{t("spaces.visibilityLabel")}</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {VIS.map((v) => {
                    const sel = v.value === visibility;
                    return (
                      <button
                        key={v.value}
                        type="button"
                        onClick={() => setVisibility(v.value)}
                        className={cn(
                          "flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors duration-200",
                          sel
                            ? "border-black bg-slate-50"
                            : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
                        )}
                      >
                        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition", sel ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600")}>
                          <Icon name={v.icon} size={18} />
                        </span>
                        <span>
                          <span className="block text-sm font-semibold text-slate-900">{t(`visibility.${v.value}.label`)}</span>
                          <span className="block text-xs text-slate-400">{t(`visibility.${v.value}.desc`)}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {visibility === "PAID" && (
                <div className="mt-6">
                  <Label htmlFor="ov-key">{t("spaces.entitlementLabel")}</Label>
                  <Input id="ov-key" name="requiredEntitlementKey" placeholder="tier:premium" />
                  <p className="mt-1 text-xs text-slate-400">{t("spaces.entitlementHint")}</p>
                </div>
              )}

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
            <button type="submit" disabled={pending} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50">
              {pending ? t("spaces.creating") : t("spaces.createSpace")}
            </button>
          </div>
        </form>
      </Sheet>

      <CreditsSheet
        open={plansOpen}
        onClose={() => setPlansOpen(false)}
        slug={slug}
        focusPlans
      />
    </>
  );
}
