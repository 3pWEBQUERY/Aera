"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  updateChatSettingsAction,
  deleteChatMessageAction,
  type ActionState,
} from "@/app/actions/dashboard";
import { type ChatSettings } from "@/lib/space-settings";
import { Sheet } from "./sheet";
import { Icon } from "./icons";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { Avatar, Pill, FormError } from "@/components/ui/misc";

type ChatT = ReturnType<typeof useTranslations>;

export interface ChatStatData {
  messageCount: number;
  participantCount: number;
  lastAt: string | null;
}

export interface ChatAdminMessage {
  id: string;
  body: string;
  createdAt: string;
  user: { id: string; name: string; avatarUrl: string | null };
}

const initial: ActionState = {};

function relTime(iso: string | null, t: ChatT, locale: string): string {
  if (!iso) return t("relNone");
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return t("relNow");
  if (min < 60) return t("relMin", { n: min });
  const h = Math.floor(min / 60);
  if (h < 24) return t("relHour", { n: h });
  const days = Math.floor(h / 24);
  if (days < 7) return t("relDay", { n: days });
  return d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
}

function msgTime(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function slowLabel(sec: number, t: ChatT): string {
  if (sec <= 0) return t("slowOff");
  if (sec < 60) return t("slowSec", { sec });
  return t("slowMin", { min: Math.round(sec / 60) });
}

export function ChatSpaceManager({
  slug,
  spaceId,
  spaceSlug,
  spaceName,
  visibilityLabel,
  settings,
  stats,
  messages,
}: {
  slug: string;
  spaceId: string;
  spaceSlug: string;
  spaceName: string;
  visibilityLabel: string;
  settings: ChatSettings;
  stats: ChatStatData;
  messages: ChatAdminMessage[];
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const t = useTranslations("dashboard.chat");
  const locale = useLocale();

  const statCards = [
    { icon: "chat" as const, label: t("statMessages"), value: stats.messageCount.toLocaleString(locale) },
    { icon: "members" as const, label: t("statParticipants"), value: stats.participantCount.toLocaleString(locale) },
    { icon: "clock" as const, label: t("statLastActivity"), value: relTime(stats.lastAt, t, locale) },
  ];

  const summary = [
    settings.postPolicy === "STAFF" ? t("policyStaff") : t("policyAll"),
    slowLabel(settings.slowModeSeconds, t),
    t("summaryChars", { count: settings.maxMessageLength }),
    settings.topic.trim() ? t("topicSet") : t("topicNone"),
  ];

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white">
            <Icon name="chat" size={20} />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">{spaceName}</h1>
              <Pill className="bg-slate-100 text-slate-500">{t("badge")}</Pill>
              <Pill className="bg-slate-100 text-slate-500">{visibilityLabel}</Pill>
            </div>
            <p className="text-sm text-slate-400">
              /{spaceSlug} · {t("messageCount", { count: stats.messageCount })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/c/${slug}/s/${spaceSlug}`}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <Icon name="external" size={16} className="text-slate-400" />
            {t("view")}
          </a>
          <button
            onClick={() => setSettingsOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <Icon name="settings" size={16} className="text-slate-400" />
            {t("settings")}
          </button>
        </div>
      </div>

      {/* Settings summary */}
      <div className="mb-6 flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
        <span className="mr-1 text-xs font-medium text-slate-400">{t("rulesLabel")}</span>
        {summary.map((s) => (
          <Pill key={s} className="bg-white text-slate-600 ring-1 ring-slate-200">
            {s}
          </Pill>
        ))}
        <button
          onClick={() => setSettingsOpen(true)}
          className="ml-auto text-xs font-medium text-violet-600 hover:text-violet-800"
        >
          {t("customize")}
        </button>
      </div>

      {/* Stats */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {statCards.map((s) => (
          <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2 text-slate-400">
              <Icon name={s.icon} size={16} />
              <span className="text-xs font-medium uppercase tracking-wide">{s.label}</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Moderation */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-bold text-slate-900">{t("messagesHeading")}</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          {t("messagesDesc")}
        </p>

        {messages.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-slate-200 px-6 py-10 text-center">
            <p className="text-sm text-slate-500">{t("emptyMessages")}</p>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {messages.map((m) => (
              <li key={m.id} className="group flex items-start gap-3 py-3">
                <Avatar name={m.user.name} src={m.user.avatarUrl} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-slate-800">{m.user.name}</span>
                    <span className="shrink-0 text-xs text-slate-400">{msgTime(m.createdAt, locale)}</span>
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-slate-600">{m.body}</p>
                </div>
                <form
                  action={deleteChatMessageAction}
                  onSubmit={(e) => {
                    if (!confirm(t("confirmDeleteMessage"))) e.preventDefault();
                  }}
                >
                  <input type="hidden" name="tenant" value={slug} />
                  <input type="hidden" name="spaceSlug" value={spaceSlug} />
                  <input type="hidden" name="messageId" value={m.id} />
                  <button
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
                    aria-label={t("deleteMessageAria")}
                  >
                    <Icon name="archive" size={16} />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Sheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title={t("sheetTitle")}
        subtitle={spaceName}
        icon="settings"
      >
        <ChatSettingsForm
          slug={slug}
          spaceId={spaceId}
          settings={settings}
          onDone={() => setSettingsOpen(false)}
        />
      </Sheet>
    </div>
  );
}

// ---------------------------------------------------------------- Settings form
function Segmented({
  name,
  value,
  options,
}: {
  name: string;
  value: string;
  options: { v: string; label: string }[];
}) {
  const [val, setVal] = useState(value);
  return (
    <div>
      <input type="hidden" name={name} value={val} />
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => setVal(o.v)}
            className={
              "rounded-xl border px-3 py-2.5 text-sm font-medium transition " +
              (val === o.v
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 text-slate-600 hover:bg-slate-50")
            }
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChatSettingsForm({
  slug,
  spaceId,
  settings,
  onDone,
}: {
  slug: string;
  spaceId: string;
  settings: ChatSettings;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(updateChatSettingsAction, initial);
  const t = useTranslations("dashboard.chat");
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="tenant" value={slug} />
      <input type="hidden" name="spaceId" value={spaceId} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl space-y-6 px-6 py-8">
          <FormError message={state.error} />

          <div>
            <Label htmlFor="cs-topic">{t("topicLabel")}</Label>
            <Textarea
              id="cs-topic"
              name="topic"
              rows={3}
              maxLength={280}
              defaultValue={settings.topic}
              placeholder={t("topicPlaceholder")}
            />
            <p className="mt-1.5 text-xs text-slate-400">
              {t("topicHint")}
            </p>
          </div>

          <div>
            <Label>{t("whoCanPost")}</Label>
            <Segmented
              name="postPolicy"
              value={settings.postPolicy}
              options={[
                { v: "ALL", label: t("policyAll") },
                { v: "STAFF", label: t("policyStaff") },
              ]}
            />
            <p className="mt-1.5 text-xs text-slate-400">
              {t("whoCanPostHint")}
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Label htmlFor="cs-slow">{t("slowModeLabel")}</Label>
              <Select id="cs-slow" name="slowModeSeconds" defaultValue={String(settings.slowModeSeconds)}>
                <option value="0">{t("slowOffOption")}</option>
                <option value="5">{t("slow5")}</option>
                <option value="10">{t("slow10")}</option>
                <option value="30">{t("slow30")}</option>
                <option value="60">{t("slow60")}</option>
                <option value="300">{t("slow300")}</option>
              </Select>
              <p className="mt-1.5 text-xs text-slate-400">{t("slowHint")}</p>
            </div>
            <div>
              <Label htmlFor="cs-max">{t("maxCharsLabel")}</Label>
              <Select id="cs-max" name="maxMessageLength" defaultValue={String(settings.maxMessageLength)}>
                <option value="280">280</option>
                <option value="500">500</option>
                <option value="1000">1000</option>
                <option value="2000">2000</option>
                <option value="4000">4000</option>
                <option value="10000">10000</option>
              </Select>
              <p className="mt-1.5 text-xs text-slate-400">{t("maxCharsHint")}</p>
            </div>
          </div>

          <div>
            <Label htmlFor="cs-history">{t("historyLabel")}</Label>
            <Select id="cs-history" name="historyLimit" defaultValue={String(settings.historyLimit)}>
              <option value="40">{t("historyMessages", { count: 40 })}</option>
              <option value="80">{t("historyMessages", { count: 80 })}</option>
              <option value="150">{t("historyMessages", { count: 150 })}</option>
              <option value="300">{t("historyMessages", { count: 300 })}</option>
            </Select>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
        <button
          type="button"
          onClick={onDone}
          className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
        >
          {t("cancel")}
        </button>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50"
        >
          {pending ? t("saving") : t("saveSettings")}
        </button>
      </div>
    </form>
  );
}
