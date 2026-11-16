"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { useResilientActionState } from "@/components/forms/use-resilient-action-state";
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
import { useConfirm, type ConfirmOptions } from "@/components/ui/confirm-dialog";
import { formatWhen } from "@/lib/local-datetime";
import { ClientWhen, LocalDateTimeField } from "./local-datetime-field";

export interface CampaignRowData {
  id: string;
  subject: string;
  body: string;
  bodyFormat: string;
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

type NewsletterT = ReturnType<typeof useTranslations<"dashboard.newsletter">>;

/**
 * Rückfrage vor dem endgültigen Versand. Bei einer geplanten Kampagne steht
 * der geplante Zeitpunkt im Titel, damit niemand versehentlich vorzieht.
 */
function sendConfirmOptions(
  t: NewsletterT,
  locale: string,
  subject: string,
  count: number,
  scheduledAt: string | Date | null,
): ConfirmOptions {
  const scheduled = scheduledAt ? new Date(scheduledAt) : null;
  const isScheduled = !!scheduled && !Number.isNaN(scheduled.getTime()) && scheduled.getTime() > Date.now();
  return isScheduled
    ? {
        title: t("confirmSendScheduledTitle", { date: formatWhen(scheduled!, locale) }),
        body: t("confirmSendScheduledBody", { subject, count }),
        confirmLabel: t("confirmSendLabel", { count }),
      }
    : {
        title: t("confirmSendTitle", { subject, count }),
        body: t("confirmSendBody"),
        confirmLabel: t("confirmSendLabel", { count }),
      };
}

function audienceCount(segments: SegmentData[], allCount: number, segmentId: string | null): number {
  return segmentId ? segments.find((sg) => sg.id === segmentId)?.count ?? 0 : allCount;
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
  const [confirm, confirmDialog] = useConfirm();
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [listStatus, setListStatus] = useState<string | null>(null);
  const t = useTranslations("dashboard.newsletter");
  const tStatus = useTranslations("dashboard.newsletter.status");
  const locale = useLocale();

  async function onSend(c: CampaignRowData) {
    const count = audienceCount(segments, allCount, c.segmentId);
    if (count === 0) return;
    const confirmed = await confirm(
      sendConfirmOptions(t, locale, c.subject, count, c.status === "SCHEDULED" ? c.scheduledAt : null),
    );
    if (!confirmed) return;
    setSendingId(c.id);
    setListError(null);
    setListStatus(null);
    const fd = new FormData();
    fd.set("tenant", slug);
    fd.set("campaignId", c.id);
    const result = await sendCampaignAction(fd);
    setSendingId(null);
    if (result.error) setListError(result.error);
    else setListStatus(t("sendQueued", { subject: c.subject }));
  }

  const campaignsSection = (
    <section>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            {t("campaignsHeading")}
            <Pill className="bg-slate-100 text-slate-600">{campaigns.length}</Pill>
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">{t("campaignsDesc")}</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-2 self-start rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-[var(--primary-fg)] transition hover:bg-[var(--primary-hover)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)] focus-visible:ring-offset-2"
        >
          <Icon name="plus" size={18} /> {t("createCampaign")}
        </button>
      </div>

      <div className="mt-5 space-y-3">
      {allCount === 0 && (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          {t("noSubscribersHint")}
        </p>
      )}
      <FormError message={listError} />
      <p role="status" className={listStatus ? "text-sm text-emerald-700" : "sr-only"}>
        {listStatus}
      </p>
      {campaigns.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 px-6 py-14 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]">
            <Icon name="newsletter" size={24} />
          </span>
          <p className="mt-4 font-semibold text-slate-800">{t("emptyCampaignsTitle")}</p>
          <p className="mt-1 text-sm text-slate-500">{t("emptyCampaignsHint")}</p>
          <button
            onClick={() => setCreateOpen(true)}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-[var(--primary-fg)] transition hover:bg-[var(--primary-hover)]"
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
            const count = audienceCount(segments, allCount, c.segmentId);
            return (
              <div
                key={c.id}
                className={`group relative flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 transition ${editable ? "hover:border-slate-300 hover:shadow-sm" : ""}`}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--action)] text-[var(--action-fg)]">
                  <Icon name="newsletter" size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {editable ? (
                      // Der Betreff ist der Button; ::after spannt die Klickfläche über die ganze Zeile.
                      <button
                        type="button"
                        onClick={() => setEditing(c)}
                        className="block min-w-0 max-w-full truncate rounded text-left font-semibold text-slate-900 after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-[var(--brand-ring)]"
                      >
                        {c.subject}
                      </button>
                    ) : (
                      <p className="truncate font-semibold text-slate-900">{c.subject}</p>
                    )}
                    <Pill className={statusCls[c.status] ?? statusCls.DRAFT}>{tStatus(c.status)}</Pill>
                  </div>
                  <p className="mt-0.5 text-sm text-slate-500">
                    {c.segmentName ?? t("allActiveMembers")}
                    {c.status === "SCHEDULED" && c.scheduledAt ? (
                      <> · <ClientWhen value={c.scheduledAt} /></>
                    ) : null}
                    {sent || sending ? ` · ${t("recipientsCount", { count: c.recipientCount })}` : ""}
                    {(sent || sending) && c.sentAt ? (
                      <> · <ClientWhen value={c.sentAt} /></>
                    ) : null}
                  </p>
                </div>
                {editable && count > 0 && (
                  <button
                    type="button"
                    onClick={() => onSend(c)}
                    disabled={sendingId === c.id}
                    className="relative z-10 inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-semibold text-[var(--primary-fg)] transition hover:bg-[var(--primary-hover)] disabled:opacity-50"
                  >
                    <Icon name="newsletter" size={14} /> {sendingId === c.id ? t("sendingNow") : t("send")}
                  </button>
                )}
                {editable && count === 0 && (
                  <span className="relative z-10 shrink-0 text-xs text-slate-500">{t("noRecipientsShort")}</span>
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
        <Pill className="bg-slate-100 text-slate-600">{segments.length}</Pill>
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
      {confirmDialog}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="border-b border-slate-100 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
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
  const [state, action, pending] = useResilientActionState(isEdit ? updateCampaignAction : createCampaignAction, initial);
  const [deleting, setDeleting] = useState(false);
  const [scheduledAt, setScheduledAt] = useState<string | Date | null>(campaign?.scheduledAt ?? null);
  const [subject, setSubject] = useState(campaign?.subject ?? "");
  const [body, setBody] = useState(campaign?.body ?? "");
  const [bodyFormat, setBodyFormat] = useState<"TEXT" | "HTML">(
    campaign?.bodyFormat === "HTML" ? "HTML" : "TEXT",
  );
  const [segmentId, setSegmentId] = useState(campaign?.segmentId ?? "");
  const [showPreview, setShowPreview] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [testError, setTestError] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();
  const formRef = useRef<HTMLFormElement>(null);
  const t = useTranslations("dashboard.newsletter");
  const tStatus = useTranslations("dashboard.newsletter.status");
  const locale = useLocale();

  const recipientCount = audienceCount(segments, allCount, segmentId || null);

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  async function onDelete() {
    if (!campaign) return;
    const confirmed = await confirm({
      title: t("confirmDeleteCampaign"),
      body: t("confirmDeleteCampaignBody", { subject: campaign.subject }),
      confirmLabel: t("deleteCampaign"),
      tone: "danger",
    });
    if (!confirmed) return;
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
    fd.set("bodyFormat", bodyFormat);
    setTestError(null);
    const result = await sendCampaignTestAction(initial, fd);
    if (result.ok) {
      setTestStatus("sent");
      // Erfolg darf verschwinden; ein Fehler bleibt stehen, bis neu getestet wird.
      setTimeout(() => setTestStatus((s) => (s === "sent" ? "idle" : s)), 6000);
    } else {
      setTestStatus("error");
      setTestError(result.error ?? null);
    }
  }

  /** „Jetzt senden…“: Rückfrage, dann speichern und sofort versenden. */
  async function onSendNow() {
    const form = formRef.current;
    if (!form || pending || recipientCount === 0) return;
    if (!form.reportValidity()) return;
    const confirmed = await confirm(
      sendConfirmOptions(t, locale, subject, recipientCount, scheduledAt),
    );
    if (!confirmed) return;
    const fd = new FormData(form);
    fd.set("sendNow", "1");
    startTransition(() => action(fd));
  }

  return (
    <form ref={formRef} action={action} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="tenant" value={slug} />
      <input type="hidden" name="bodyFormat" value={bodyFormat} />
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
              <p className={`mt-1 text-xs ${subject.length > 60 ? "text-amber-600" : "text-slate-500"}`}>
                {t("subjectCount", { count: subject.length })}
              </p>
            </div>
            <div>
              <div className="mb-1 flex items-end justify-between gap-3">
                <Label htmlFor="nf-body">{t("contentLabel")}</Label>
                <div className="inline-flex rounded-xl bg-slate-100 p-0.5" role="tablist" aria-label={t("contentLabel")}>
                  {(["TEXT", "HTML"] as const).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      role="tab"
                      aria-selected={bodyFormat === fmt}
                      onClick={() => setBodyFormat(fmt)}
                      className={`rounded-[10px] px-3 py-1 text-xs font-semibold transition ${
                        bodyFormat === fmt
                          ? "bg-[var(--action)] text-[var(--action-fg)] shadow-sm"
                          : "text-slate-600 hover:bg-[var(--action-soft)] hover:text-slate-900"
                      }`}
                    >
                      {fmt === "TEXT" ? t("formatText") : t("formatHtml")}
                    </button>
                  ))}
                </div>
              </div>
              <Textarea
                id="nf-body"
                name="body"
                rows={bodyFormat === "HTML" ? 14 : 10}
                required
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={bodyFormat === "HTML" ? t("htmlPlaceholder") : t("contentPlaceholder")}
                className={bodyFormat === "HTML" ? "font-mono text-xs leading-5" : undefined}
              />
              {bodyFormat === "HTML" && (
                <p className="mt-1 text-xs text-slate-500">{t("htmlHint")}</p>
              )}
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
                {testStatus === "sending" ? t("testSending") : t("testSend")}
              </button>
            </div>
            {testStatus === "error" ? (
              <p role="alert" className="text-xs font-medium text-red-700">
                {t("testFailedReason", { reason: testError ?? t("testFailedUnknown") })}
              </p>
            ) : (
              <p role="status" className={testStatus === "sent" ? "text-xs font-medium text-emerald-700" : "sr-only"}>
                {testStatus === "sent" ? t("testSent") : ""}
              </p>
            )}
            {showPreview && bodyFormat === "HTML" && (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-4">
                <iframe
                  title={t("formatHtml")}
                  sandbox=""
                  srcDoc={body}
                  className="h-96 w-full rounded-xl border border-slate-200 bg-white"
                />
              </div>
            )}
            {showPreview && bodyFormat !== "HTML" && (
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
                  <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">Aera</div>
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
                onChange={(v) => setSegmentId(v)}
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
            <p className="text-xs text-slate-500">{t("recipientsInfo")}</p>
            {recipientCount === 0 && (
              <p className="text-xs font-medium text-amber-700">
                {allCount === 0 ? t("noSubscribersHint") : t("segmentEmptyHint")}
              </p>
            )}
          </section>

          {/* ---- Zeitplan ---- */}
          <section className="space-y-3">
            <SectionHeading>{t("sectionSchedule")}</SectionHeading>
            <LocalDateTimeField
              id="nf-scheduled"
              name="scheduledAt"
              label={tStatus("SCHEDULED")}
              defaultValue={campaign?.scheduledAt}
              hint={t("scheduleHint")}
              pastWarning={t("schedulePastWarning")}
              onValueChange={(v) => setScheduledAt(v || null)}
            />
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
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
        <button type="button" onClick={onDone} className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100">{t("cancel")}</button>
        {recipientCount > 0 && (
          <button
            type="button"
            onClick={onSendNow}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-[var(--action-strong)] hover:bg-[var(--action-soft)] disabled:opacity-50"
          >
            <Icon name="send" size={15} />
            {t("sendNowEllipsis")}
          </button>
        )}
        <button type="submit" disabled={pending} className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-[var(--primary-fg)] transition hover:bg-[var(--primary-hover)] active:scale-[0.98] disabled:opacity-50">
          {pending ? t("saving") : isEdit ? t("save") : t("saveDraft")}
        </button>
      </div>
      {confirmDialog}
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
  const [state, action, pending] = useResilientActionState(createSegmentAction, initial);
  const ref = useRef<HTMLFormElement>(null);
  const t = useTranslations("dashboard.newsletter");
  const tierName = (slugKey: string | null | undefined) =>
    tiers.find((tier) => tier.slug === slugKey)?.name ?? slugKey ?? "";
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state.ok]);

  const [confirm, confirmDialog] = useConfirm();

  async function onDelete(id: string) {
    const confirmed = await confirm({
      title: t("confirmDeleteSegment"),
      body: t("confirmDeleteSegmentBody"),
      confirmLabel: t("deleteSegmentConfirm"),
      tone: "danger",
    });
    if (!confirmed) return;
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
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--action)] text-[var(--action-fg)]">
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
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                  <Icon name="members" size={16} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">{sg.name}</p>
                  {sg.description && (
                    <p className="truncate text-xs text-slate-500">{sg.description}</p>
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
            <p className="mt-0.5 text-xs text-slate-500">
              {t("emptySegmentsHint")}
            </p>
          </div>
        )}
      </div>

      <form ref={ref} action={action} className="space-y-3 rounded-xl border border-dashed border-slate-300 p-4">
        <p className="text-sm font-medium text-slate-700">{t("createSegmentHeading")}</p>
        <FormError message={state.error} />
        <input type="hidden" name="tenant" value={slug} />
        <div>
          <Label htmlFor="sg-name">{t("segmentNameLabel")}</Label>
          <Input id="sg-name" name="name" required minLength={2} placeholder={t("segmentNamePlaceholder")} />
        </div>
        <div>
          <Label htmlFor="sg-desc">{t("descriptionLabel")}</Label>
          <Input id="sg-desc" name="description" maxLength={300} />
        </div>
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
          <button type="submit" disabled={pending} className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-fg)] transition hover:bg-[var(--primary-hover)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)] focus-visible:ring-offset-2">
            {pending ? t("creatingSegment") : t("createSegmentBtn")}
          </button>
        </div>
      </form>
      {confirmDialog}
    </div>
  );
}
