"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import {
  createAutomationStepAction,
  toggleAutomationStepAction,
  deleteAutomationStepAction,
  type AutomationState,
} from "@/app/actions/automations";
import { Input, Label, Textarea } from "@/components/ui/field";
import { Card, CardBody } from "@/components/ui/card";
import { Pill, FormError, EmptyState } from "@/components/ui/misc";
import { Icon } from "./icons";

export interface StepRow {
  id: string;
  dayOffset: number;
  subject: string;
  body: string;
  isActive: boolean;
  deliveryCount: number;
}

const initial: AutomationState = {};

export function AutomationsManager({
  slug,
  steps,
}: {
  slug: string;
  steps: StepRow[];
}) {
  const [state, action, pending] = useActionState(createAutomationStepAction, initial);
  const ref = useRef<HTMLFormElement>(null);
  const t = useTranslations("dashboard.automations");
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state.ok]);

  return (
    <div className="space-y-6">
      <Card>
        <CardBody>
          <h2 className="mb-1 text-sm font-bold text-slate-900">{t("addStep")}</h2>
          <p className="mb-4 text-sm text-slate-500">
            {t.rich("placeholderIntro", {
              nameVar: "{{name}}",
              communityVar: "{{community}}",
              code: (chunks) => (
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{chunks}</code>
              ),
            })}
          </p>
          <form ref={ref} action={action} className="space-y-3">
            <input type="hidden" name="tenant" value={slug} />
            <FormError message={state.error} />
            <div className="flex flex-wrap gap-3">
              <div>
                <Label htmlFor="au-day">{t("dayLabel")}</Label>
                <Input
                  id="au-day"
                  name="dayOffset"
                  type="number"
                  min={0}
                  max={365}
                  defaultValue={0}
                  required
                  className="w-28"
                />
              </div>
              <div className="min-w-56 flex-1">
                <Label htmlFor="au-subject">{t("subjectLabel")}</Label>
                <Input
                  id="au-subject"
                  name="subject"
                  placeholder={t("subjectPlaceholder", { communityVar: "{{community}}" })}
                  required
                />
              </div>
            </div>
            <div>
              <Label htmlFor="au-body">{t("bodyLabel")}</Label>
              <Textarea
                id="au-body"
                name="body"
                rows={4}
                placeholder={t("bodyPlaceholder", { nameVar: "{{name}}" })}
                required
              />
            </div>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50"
            >
              {pending ? t("saving") : t("saveStep")}
            </button>
          </form>
        </CardBody>
      </Card>

      {steps.length === 0 ? (
        <EmptyState
          title={t("emptyTitle")}
          hint={t("emptyHint")}
          icon="send"
        />
      ) : (
        <div className="space-y-3">
          {steps.map((s) => (
            <Card key={s.id}>
              <CardBody>
                <div className="flex flex-wrap items-center gap-2">
                  <Pill className="bg-[var(--brand-soft,#f1f5f9)] text-[color:var(--brand,#334155)]">
                    {t("dayBadge", { day: s.dayOffset })}
                  </Pill>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">
                    {s.subject}
                  </span>
                  {s.isActive ? (
                    <Pill className="bg-emerald-50 text-emerald-700">{t("active")}</Pill>
                  ) : (
                    <Pill className="bg-slate-100 text-slate-500">{t("paused")}</Pill>
                  )}
                  <span className="text-xs text-slate-400">
                    {t("sentCount", { count: s.deliveryCount })}
                  </span>
                  <form action={toggleAutomationStepAction}>
                    <input type="hidden" name="tenant" value={slug} />
                    <input type="hidden" name="id" value={s.id} />
                    <button
                      type="submit"
                      className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
                    >
                      {s.isActive ? t("pause") : t("activate")}
                    </button>
                  </form>
                  <form action={deleteAutomationStepAction}>
                    <input type="hidden" name="tenant" value={slug} />
                    <input type="hidden" name="id" value={s.id} />
                    <button
                      type="submit"
                      aria-label={t("deleteAria")}
                      className="rounded-lg px-2 py-1 text-red-600 transition hover:bg-red-50"
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </form>
                </div>
                <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm text-slate-500">
                  {s.body}
                </p>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
