"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  createCampaignAction,
  updateCampaignAction,
  deleteCampaignAction,
  sendCampaignAction,
  createSegmentAction,
  deleteSegmentAction,
  type ActionState,
} from "@/app/actions/dashboard";
import { Sheet } from "./sheet";
import { Icon } from "./icons";
import { SettingsTabs, type SettingsSection } from "./settings-tabs";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { Pill, FormError } from "@/components/ui/misc";
import { formatDateTime } from "@/lib/utils";

export interface CampaignRowData {
  id: string;
  subject: string;
  body: string;
  status: string;
  segmentId: string | null;
  segmentName: string | null;
  recipientCount: number;
  sentAt: string | Date | null;
  scheduledAt: string | Date | null;
}
export interface SegmentData {
  id: string;
  name: string;
}
interface TierOption {
  slug: string;
  name: string;
}

const initial: ActionState = {};
const statusCls: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  SCHEDULED: "bg-blue-100 text-blue-700",
  SENDING: "bg-amber-100 text-amber-700",
  SENT: "bg-green-100 text-green-700",
};

function toDatetimeLocal(value: string | Date | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

export function NewsletterManager({
  slug,
  campaigns,
  segments,
  tiers,
  initialTab,
}: {
  slug: string;
  campaigns: CampaignRowData[];
  segments: SegmentData[];
  tiers: TierOption[];
  initialTab?: string;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<CampaignRowData | null>(null);
  const t = useTranslations("dashboard.newsletter");
  const tStatus = useTranslations("dashboard.newsletter.status");
  const locale = useLocale();

  const campaignsSection = (
    <section>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            {t("campaignsHeading")}
            <Pill className="bg-slate-100 text-slate-500">{campaigns.length}</Pill>
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">{t("campaignsDesc")}</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-2 self-start rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)] focus-visible:ring-offset-2"
        >
          <Icon name="plus" size={18} /> {t("createCampaign")}
        </button>
      </div>

      <div className="mt-5">
      {campaigns.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 px-6 py-14 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]">
            <Icon name="newsletter" size={24} />
          </span>
          <p className="mt-4 font-semibold text-slate-800">{t("emptyCampaignsTitle")}</p>
          <p className="mt-1 text-sm text-slate-500">{t("emptyCampaignsHint")}</p>
          <button
            onClick={() => setCreateOpen(true)}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <Icon name="plus" size={18} /> {t("createCampaign")}
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {campaigns.map((c) => {
            const sent = c.status === "SENT";
            const sending = c.status === "SENDING";
            const editable = c.status === "DRAFT" || c.status === "SCHEDULED";
            return (
              <div
                key={c.id}
                onClick={() => editable && setEditing(c)}
                className={`group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 transition ${editable ? "cursor-pointer hover:border-slate-300 hover:shadow-sm" : ""}`}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
                  <Icon name="newsletter" size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-semibold text-slate-900">{c.subject}</p>
                    <Pill className={statusCls[c.status] ?? statusCls.DRAFT}>{tStatus(c.status)}</Pill>
                  </div>
                  <p className="mt-0.5 text-sm text-slate-400">
                    {c.segmentName ?? t("allActiveMembers")}
                    {c.status === "SCHEDULED" && c.scheduledAt
                      ? ` · ${formatDateTime(c.scheduledAt, locale)}`
                      : ""}
                    {sent || sending ? ` · ${t("recipientsCount", { count: c.recipientCount })}${c.sentAt ? ` · ${formatDateTime(c.sentAt, locale)}` : ""}` : ""}
                  </p>
                </div>
                {editable && (
                  <form action={sendCampaignAction} onClick={(e) => e.stopPropagation()}>
                    <input type="hidden" name="tenant" value={slug} />
                    <input type="hidden" name="campaignId" value={c.id} />
                    <button className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-slate-800">
                      <Icon name="newsletter" size={14} /> {t("send")}
                    </button>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}
      </div>
    </section>
  );

  const segmentsSection = (
    <section>
      <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
        {t("segmentsHeading")}
        <Pill className="bg-slate-100 text-slate-500">{segments.length}</Pill>
      </h2>
      <p className="mt-0.5 text-sm text-slate-500">
        {t("segmentsDesc")}
      </p>
      <div className="mt-5 max-w-2xl">
        <SegmentsPanel slug={slug} segments={segments} tiers={tiers} />
      </div>
    </section>
  );

  const sections: SettingsSection[] = [
    { id: "campaigns", label: t("tabCampaigns"), icon: "newsletter", content: campaignsSection },
    { id: "segments", label: t("tabSegments"), icon: "members", content: segmentsSection },
  ];

  return (
    <div>
      <SettingsTabs
        title={t("title")}
        subtitle={t("subtitle")}
        sections={sections}
        initialTab={initialTab}
      />

      <Sheet open={createOpen} onClose={() => setCreateOpen(false)} title={t("sheetCreate")} subtitle={t("sheetCreateSubtitle")} icon="newsletter">
        <CampaignForm slug={slug} segments={segments} onDone={() => setCreateOpen(false)} />
      </Sheet>
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={t("sheetEdit")} subtitle={editing?.subject} icon="newsletter">
        {editing && <CampaignForm key={editing.id} slug={slug} segments={segments} campaign={editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </div>
  );
}

function CampaignForm({
  slug,
  segments,
  campaign,
  onDone,
}: {
  slug: string;
  segments: SegmentData[];
  campaign?: CampaignRowData;
  onDone: () => void;
}) {
  const isEdit = !!campaign;
  const [state, action, pending] = useActionState(isEdit ? updateCampaignAction : createCampaignAction, initial);
  const [deleting, setDeleting] = useState(false);
  const [timezoneOffset, setTimezoneOffset] = useState(0);
  const [scheduledAt, setScheduledAt] = useState("");
  const t = useTranslations("dashboard.newsletter");
  const tStatus = useTranslations("dashboard.newsletter.status");
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const initialDate = campaign?.scheduledAt ? new Date(campaign.scheduledAt) : new Date();
      setTimezoneOffset(initialDate.getTimezoneOffset());
      setScheduledAt(toDatetimeLocal(campaign?.scheduledAt ?? null));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [campaign?.scheduledAt]);

  function onScheduleChange(value: string) {
    setScheduledAt(value);
    const selected = value ? new Date(value) : new Date();
    if (!Number.isNaN(selected.getTime())) {
      setTimezoneOffset(selected.getTimezoneOffset());
    }
  }
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  async function onDelete() {
    if (!campaign) return;
    if (!confirm(t("confirmDeleteCampaign"))) return;
    setDeleting(true);
    const fd = new FormData();
    fd.set("tenant", slug);
    fd.set("campaignId", campaign.id);
    await deleteCampaignAction(fd);
    onDone();
  }

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="tenant" value={slug} />
      <input type="hidden" name="timezoneOffset" value={timezoneOffset} />
      {isEdit && <input type="hidden" name="campaignId" value={campaign!.id} />}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl space-y-5 px-6 py-10">
          <FormError message={state.error} />
          <div>
            <Label htmlFor="nf-subject">{t("subjectLabel")}</Label>
            <Input id="nf-subject" name="subject" required defaultValue={campaign?.subject} className="text-base" />
          </div>
          <div>
            <Label htmlFor="nf-seg">{t("segmentLabel")}</Label>
            <Select id="nf-seg" name="segmentId" defaultValue={campaign?.segmentId ?? ""}>
              <option value="">{t("allActiveMembers")}</option>
              {segments.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="nf-body">{t("contentLabel")}</Label>
            <Textarea id="nf-body" name="body" rows={8} required defaultValue={campaign?.body} placeholder={t("contentPlaceholder")} />
          </div>
          <div>
            <Label htmlFor="nf-scheduled">{tStatus("SCHEDULED")}</Label>
            <Input
              id="nf-scheduled"
              name="scheduledAt"
              type="datetime-local"
              value={scheduledAt}
              onChange={(event) => onScheduleChange(event.target.value)}
            />
          </div>
          {isEdit && (
            <div className="border-t border-slate-100 pt-5">
              <button type="button" onClick={onDelete} disabled={deleting} className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50">
                <Icon name="archive" size={16} />
                {deleting ? t("deletingCampaign") : t("deleteCampaign")}
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
        <button type="button" onClick={onDone} className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100">{t("cancel")}</button>
        <button type="submit" disabled={pending} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50">
          {pending ? t("saving") : isEdit ? t("save") : t("saveDraft")}
        </button>
      </div>
    </form>
  );
}

function SegmentsPanel({
  slug,
  segments,
  tiers,
}: {
  slug: string;
  segments: SegmentData[];
  tiers: TierOption[];
}) {
  const [state, action, pending] = useActionState(createSegmentAction, initial);
  const ref = useRef<HTMLFormElement>(null);
  const t = useTranslations("dashboard.newsletter");
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state.ok]);

  async function onDelete(id: string) {
    if (!confirm(t("confirmDeleteSegment"))) return;
    const fd = new FormData();
    fd.set("tenant", slug);
    fd.set("segmentId", id);
    await deleteSegmentAction(fd);
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        {segments.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                <Icon name="members" size={16} />
              </span>
              <span className="truncate text-sm font-medium text-slate-800">{s.name}</span>
            </div>
            <button
              type="button"
              onClick={() => onDelete(s.id)}
              className="shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
            >
              {t("deleteSegment")}
            </button>
          </div>
        ))}
        {segments.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-200 px-6 py-8 text-center">
            <p className="text-sm font-medium text-slate-700">{t("emptySegmentsTitle")}</p>
            <p className="mt-0.5 text-xs text-slate-400">
              {t("emptySegmentsHint")}
            </p>
          </div>
        )}
      </div>

      <form ref={ref} action={action} className="space-y-3 rounded-xl border border-dashed border-slate-300 p-4">
            <p className="text-sm font-medium text-slate-700">{t("createSegmentHeading")}</p>
            <FormError message={state.error} />
            <input type="hidden" name="tenant" value={slug} />
            <Input name="name" required placeholder={t("segmentNamePlaceholder")} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="sg-tier">{t("tierLabel")}</Label>
                <Select id="sg-tier" name="tierSlug" defaultValue="">
                  <option value="">{t("allTiers")}</option>
                  {tiers.map((tier) => (
                    <option key={tier.slug} value={tier.slug}>{tier.name}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="sg-pts">{t("minPointsLabel")}</Label>
                <Input id="sg-pts" name="minPoints" type="number" min={0} defaultValue={0} />
              </div>
            </div>
        <div className="flex justify-end">
          <button type="submit" disabled={pending} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)] focus-visible:ring-offset-2">
            {pending ? t("creatingSegment") : t("createSegmentBtn")}
          </button>
        </div>
      </form>
    </div>
  );
}
