"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  createCampaignAction,
  updateCampaignAction,
  deleteCampaignAction,
  sendCampaignAction,
  sendCampaignTestAction,
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
  description: string | null;
  rules: { tierSlug?: string | null; minPoints?: number | null; activeSinceDays?: number | null };
  count: number;
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
  tenantName,
  campaigns,
  segments,
  tiers,
  allCount,
  initialTab,
}: {
  slug: string;
  tenantName: string;
  campaigns: CampaignRowData[];
  segments: SegmentData[];
  tiers: TierOption[];
  allCount: number;
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
      <div className="mt-5 max-w-3xl">
        <SegmentsPanel slug={slug} segments={segments} tiers={tiers} allCount={allCount} />
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
        <CampaignForm slug={slug} tenantName={tenantName} segments={segments} allCount={allCount} onDone={() => setCreateOpen(false)} />
      </Sheet>
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={t("sheetEdit")} subtitle={editing?.subject} icon="newsletter">
        {editing && <CampaignForm key={editing.id} slug={slug} tenantName={tenantName} segments={segments} allCount={allCount} campaign={editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="border-b border-slate-100 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
      {children}
    </h3>
  );
}

function CampaignForm({
  slug,
  tenantName,
  segments,
  allCount,
  campaign,
  onDone,
}: {
  slug: string;
  tenantName: string;
  segments: SegmentData[];
  allCount: number;
  campaign?: CampaignRowData;
  onDone: () => void;
}) {
  const isEdit = !!campaign;
  const [state, action, pending] = useActionState(isEdit ? updateCampaignAction : createCampaignAction, initial);
  const [deleting, setDeleting] = useState(false);
  const [timezoneOffset, setTimezoneOffset] = useState(0);
  const [scheduledAt, setScheduledAt] = useState("");
  const [subject, setSubject] = useState(campaign?.subject ?? "");
  const [body, setBody] = useState(campaign?.body ?? "");
  const [segmentId, setSegmentId] = useState(campaign?.segmentId ?? "");
  const [showPreview, setShowPreview] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const t = useTranslations("dashboard.newsletter");
  const tStatus = useTranslations("dashboard.newsletter.status");

  const recipientCount = segmentId
    ? segments.find((sg) => sg.id === segmentId)?.count ?? 0
    : allCount;

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

  async function onSendTest() {
    if (!subject.trim() || !body.trim() || testStatus === "sending") return;
    setTestStatus("sending");
    const fd = new FormData();
    fd.set("tenant", slug);
    fd.set("subject", subject);
    fd.set("body", body);
    const result = await sendCampaignTestAction(initial, fd);
    setTestStatus(result.ok ? "sent" : "error");
    setTimeout(() => setTestStatus("idle"), 4000);
  }

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="tenant" value={slug} />
      <input type="hidden" name="timezoneOffset" value={timezoneOffset} />
      {isEdit && <input type="hidden" name="campaignId" value={campaign!.id} />}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl space-y-8 px-6 py-10">
          <FormError message={state.error} />

          {/* ---- Inhalt ---- */}
          <section className="space-y-4">
            <SectionHeading>{t("sectionContent")}</SectionHeading>
            <div>
              <Label htmlFor="nf-subject">{t("subjectLabel")}</Label>
              <Input
                id="nf-subject"
                name="subject"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="text-base"
              />
              <p className={`mt-1 text-xs ${subject.length > 60 ? "text-amber-600" : "text-slate-400"}`}>
                {t("subjectCount", { count: subject.length })}
              </p>
            </div>
            <div>
              <Label htmlFor="nf-body">{t("contentLabel")}</Label>
              <Textarea
                id="nf-body"
                name="body"
                rows={10}
                required
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t("contentPlaceholder")}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowPreview((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
              >
                <Icon name={showPreview ? "eyeOff" : "eye"} size={13} />
                {showPreview ? t("previewHide") : t("previewShow")}
              </button>
              <button
                type="button"
                onClick={onSendTest}
                disabled={!subject.trim() || !body.trim() || testStatus === "sending"}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-900 disabled:opacity-40"
              >
                <Icon name="send" size={13} />
                {testStatus === "sending"
                  ? t("testSending")
                  : testStatus === "sent"
                    ? t("testSent")
                    : testStatus === "error"
                      ? t("testFailed")
                      : t("testSend")}
              </button>
            </div>
            {showPreview && (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="mx-auto max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div
                    className="px-5 py-3.5 text-sm font-bold text-white"
                    style={{ backgroundColor: "var(--brand)" }}
                  >
                    {tenantName}
                  </div>
                  <div className="px-5 py-4">
                    <p className="mb-3 text-sm font-semibold text-slate-900">{subject || "…"}</p>
                    {body.split(/\n{2,}/).map((par, i) => (
                      <p key={i} className="mb-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                        {par}
                      </p>
                    ))}
                  </div>
                  <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">Aera</div>
                </div>
              </div>
            )}
          </section>

          {/* ---- Empfänger ---- */}
          <section className="space-y-3">
            <SectionHeading>{t("sectionRecipients")}</SectionHeading>
            <div>
              <Label htmlFor="nf-seg">{t("segmentLabel")}</Label>
              <Select
                id="nf-seg"
                name="segmentId"
                value={segmentId}
                onChange={(e) => setSegmentId(e.target.value)}
              >
                <option value="">{t("allActiveMembers")}</option>
                {segments.map((sg) => (
                  <option key={sg.id} value={sg.id}>{sg.name}</option>
                ))}
              </Select>
            </div>
            <p className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--brand-soft)] px-2.5 py-1.5 text-xs font-semibold text-[color:var(--brand)]">
              <Icon name="members" size={13} />
              {t("recipientsEstimate", { count: recipientCount })}
            </p>
            <p className="text-xs text-slate-400">{t("recipientsInfo")}</p>
          </section>

          {/* ---- Zeitplan ---- */}
          <section className="space-y-3">
            <SectionHeading>{t("sectionSchedule")}</SectionHeading>
            <div>
              <Label htmlFor="nf-scheduled">{tStatus("SCHEDULED")}</Label>
              <Input
                id="nf-scheduled"
                name="scheduledAt"
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => onScheduleChange(event.target.value)}
              />
              <p className="mt-1 text-xs text-slate-400">{t("scheduleHint")}</p>
            </div>
          </section>

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
  allCount,
}: {
  slug: string;
  segments: SegmentData[];
  tiers: TierOption[];
  allCount: number;
}) {
  const [state, action, pending] = useActionState(createSegmentAction, initial);
  const ref = useRef<HTMLFormElement>(null);
  const t = useTranslations("dashboard.newsletter");
  const tierName = (slugKey: string | null | undefined) =>
    tiers.find((tier) => tier.slug === slugKey)?.name ?? slugKey ?? "";
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

  function ruleChips(sg: SegmentData) {
    const chips: string[] = [];
    if (sg.rules.tierSlug) chips.push(t("ruleTier", { name: tierName(sg.rules.tierSlug) }));
    if (sg.rules.minPoints) chips.push(t("ruleMinPoints", { count: sg.rules.minPoints }));
    if (sg.rules.activeSinceDays) chips.push(t("ruleActiveSince", { days: sg.rules.activeSinceDays }));
    if (chips.length === 0) chips.push(t("ruleAll"));
    return chips;
  }

  return (
    <div className="space-y-5">
      {/* Basislinie: alle erreichbaren Mitglieder */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
            <Icon name="members" size={16} />
          </span>
          <span className="truncate text-sm font-medium text-slate-800">{t("allActiveMembers")}</span>
        </div>
        <Pill className="bg-[var(--brand-soft)] text-[color:var(--brand)]">
          {t("memberCountBadge", { count: allCount })}
        </Pill>
      </div>

      <div className="space-y-2">
        {segments.map((sg) => (
          <div key={sg.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                  <Icon name="members" size={16} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">{sg.name}</p>
                  {sg.description && (
                    <p className="truncate text-xs text-slate-400">{sg.description}</p>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Pill className="bg-[var(--brand-soft)] text-[color:var(--brand)]">
                  {t("memberCountBadge", { count: sg.count })}
                </Pill>
                <button
                  type="button"
                  onClick={() => onDelete(sg.id)}
                  className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
                >
                  {t("deleteSegment")}
                </button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5 pl-12">
              {ruleChips(sg).map((chip) => (
                <span
                  key={chip}
                  className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
                >
                  {chip}
                </span>
              ))}
            </div>
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
        <Input name="description" placeholder={t("descriptionLabel")} maxLength={300} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
          <div>
            <Label htmlFor="sg-days">{t("activeSinceLabel")}</Label>
            <Input id="sg-days" name="activeSinceDays" type="number" min={0} defaultValue={0} />
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
