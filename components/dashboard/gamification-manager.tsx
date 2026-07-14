"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  createBadgeAction,
  updateBadgeAction,
  deleteBadgeAction,
  updateRulePointsAction,
  createRuleAction,
  deleteRuleAction,
  type ActionState,
} from "@/app/actions/dashboard";
import { Sheet } from "./sheet";
import { Icon, type IconName } from "./icons";
import { SettingsTabs, type SettingsSection } from "./settings-tabs";
import { Input, Label, Select } from "@/components/ui/field";
import { Avatar, FormError, Pill } from "@/components/ui/misc";

export interface RuleData {
  id: string;
  name: string;
  trigger: string;
  points: number;
  maxPerDay: number | null;
}
export interface BadgeData {
  id: string;
  name: string;
  description: string | null;
  type: string;
  threshold: number;
  awardCount: number;
}
export interface LeaderRow {
  userId: string;
  name: string;
  avatarUrl: string | null;
  points: number;
  levelName: string | null;
}

const initial: ActionState = {};
const triggerIcon: Record<string, IconName> = {
  POST_CREATED: "feed",
  COMMENT_CREATED: "forum",
  REACTION_GIVEN: "sparkles",
  DAILY_LOGIN: "bell",
  LESSON_COMPLETED: "courses",
  EVENT_RSVP: "events",
  PURCHASE: "products",
  REFERRAL: "megaphone",
};
const ALL_TRIGGERS = [
  "POST_CREATED",
  "COMMENT_CREATED",
  "REACTION_GIVEN",
  "LESSON_COMPLETED",
  "EVENT_RSVP",
  "DAILY_LOGIN",
  "PURCHASE",
  "REFERRAL",
];

function StatCard({ icon, label, value, tint }: { icon: IconName; label: string; value: number | string; tint: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tint}`}>
        <Icon name={icon} size={18} />
      </span>
      <p className="mt-3 text-2xl font-bold leading-none text-slate-900">{value}</p>
      <p className="mt-1 text-xs font-medium text-slate-400">{label}</p>
    </div>
  );
}

const rankStyles = ["bg-amber-400 text-amber-950", "bg-slate-300 text-slate-700", "bg-orange-300 text-orange-900"];

export function GamificationManager({
  slug,
  rules,
  badges,
  leaderboard,
  initialTab,
}: {
  slug: string;
  rules: RuleData[];
  badges: BadgeData[];
  leaderboard: LeaderRow[];
  initialTab?: string;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<BadgeData | null>(null);
  const [ruleOpen, setRuleOpen] = useState(false);
  const t = useTranslations("dashboard.gamification");
  const tTriggers = useTranslations("dashboard.gamification.triggers");
  const tCrit = useTranslations("dashboard.gamification.criteria");

  const totalAwarded = badges.reduce((s, b) => s + b.awardCount, 0);
  const topScore = leaderboard[0]?.points ?? 0;

  const statsIntro = (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard icon="sparkles" label={t("statRules")} value={rules.length} tint="bg-[var(--brand-soft)] text-[var(--brand)]" />
      <StatCard icon="gamification" label={t("statBadges")} value={badges.length} tint="bg-amber-100 text-amber-700" />
      <StatCard icon="check" label={t("statAwarded")} value={totalAwarded} tint="bg-emerald-100 text-emerald-700" />
      <StatCard icon="payouts" label={t("statTop")} value={topScore} tint="bg-blue-100 text-blue-700" />
    </div>
  );

  const rulesSection = (
    <section>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            {t("rulesHeading")}
            <Pill className="bg-slate-100 text-slate-500">{rules.length}</Pill>
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">{t("rulesDesc")}</p>
        </div>
        <button
          onClick={() => setRuleOpen(true)}
          className="inline-flex items-center gap-1.5 self-start rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
        >
          <Icon name="plus" size={16} /> {t("rule")}
        </button>
      </div>
      <div className="mt-5 space-y-2">
              {rules.map((r) => (
                <div
                  key={r.id}
                  className="group flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2.5 transition hover:border-slate-200"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-slate-500 ring-1 ring-slate-200">
                      <Icon name={triggerIcon[r.trigger] ?? "gamification"} size={16} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{r.name}</p>
                      <p className="truncate text-xs text-slate-400">
                        {tTriggers(r.trigger)}
                        {r.maxPerDay ? ` · ${t("maxPerDay", { count: r.maxPerDay })}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <form action={updateRulePointsAction} className="flex items-center gap-1.5">
                      <input type="hidden" name="tenant" value={slug} />
                      <input type="hidden" name="ruleId" value={r.id} />
                      <div className="flex items-center overflow-hidden rounded-lg border border-slate-300 bg-white focus-within:border-[var(--brand)] focus-within:ring-2 focus-within:ring-[var(--brand-ring)]">
                        <Input name="points" type="number" defaultValue={r.points} className="w-16 border-0 py-1.5 text-right focus:ring-0" />
                        <span className="pr-2 text-xs font-medium text-slate-400">{t("pts")}</span>
                      </div>
                      <button aria-label={t("savePointsAria")} className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white transition hover:bg-slate-800 active:scale-95">
                        <Icon name="check" size={16} />
                      </button>
                    </form>
                    <form action={deleteRuleAction}>
                      <input type="hidden" name="tenant" value={slug} />
                      <input type="hidden" name="ruleId" value={r.id} />
                      <button
                        aria-label={t("deleteRuleAria")}
                        onClick={(e) => {
                          if (!confirm(t("confirmDeleteRule", { name: r.name }))) e.preventDefault();
                        }}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 transition hover:bg-red-50 hover:text-red-600 group-hover:text-slate-400"
                      >
                        <Icon name="close" size={16} />
                      </button>
                    </form>
                  </div>
                </div>
              ))}
              {rules.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-200 px-6 py-10 text-center">
                  <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]">
                    <Icon name="sparkles" size={22} />
                  </div>
                  <p className="mt-3 text-sm font-medium text-slate-700">{t("rulesEmptyTitle")}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{t("rulesEmptyHint")}</p>
                  <button
                    onClick={() => setRuleOpen(true)}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    <Icon name="plus" size={16} /> {t("firstRule")}
                  </button>
                </div>
              )}
      </div>
    </section>
  );

  const badgesSection = (
    <section>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            {t("badgesHeading")}
            <Pill className="bg-slate-100 text-slate-500">{badges.length}</Pill>
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">{t("badgesDesc")}</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 self-start rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
        >
          <Icon name="plus" size={16} /> {t("badge")}
        </button>
      </div>
      <div className="mt-5">
            {badges.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 px-6 py-10 text-center">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                  <Icon name="gamification" size={22} />
                </div>
                <p className="mt-3 text-sm font-medium text-slate-700">{t("badgesEmptyTitle")}</p>
                <p className="mt-0.5 text-xs text-slate-400">{t("badgesDesc")}</p>
                <button
                  onClick={() => setCreateOpen(true)}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  <Icon name="plus" size={16} /> {t("firstBadge")}
                </button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {badges.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setEditing(b)}
                    className="group flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-left transition hover:border-slate-300 hover:shadow-sm"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-sm">
                      <Icon name="gamification" size={22} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{b.name}</p>
                      <p className="truncate text-xs text-slate-400">
                        {t("badgeThreshold", { threshold: b.threshold, criterion: tCrit(b.type) })}
                      </p>
                    </div>
                    <Pill className="shrink-0 bg-slate-100 text-slate-500">{b.awardCount}×</Pill>
                  </button>
                ))}
              </div>
            )}
      </div>
    </section>
  );

  const leaderboardSection = (
    <section>
      <h2 className="text-lg font-semibold text-slate-900">{t("leaderboardHeading")}</h2>
      <p className="mt-0.5 text-sm text-slate-500">{t("leaderboardDesc")}</p>
      <div className="mt-5 max-w-2xl">
          {leaderboard.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 px-6 py-10 text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                <Icon name="members" size={22} />
              </div>
              <p className="mt-3 text-sm font-medium text-slate-700">{t("lbEmptyTitle")}</p>
              <p className="mt-0.5 text-xs text-slate-400">{t("lbEmptyHint")}</p>
            </div>
          ) : (
            <ol className="space-y-1.5">
              {leaderboard.map((row, i) => (
                <li
                  key={row.userId}
                  className={
                    "flex items-center gap-3 rounded-xl px-2.5 py-2 " +
                    (i < 3 ? "bg-slate-50" : "")
                  }
                >
                  <span
                    className={
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold " +
                      (i < 3 ? rankStyles[i] : "text-slate-400")
                    }
                  >
                    {i + 1}
                  </span>
                  <Avatar name={row.name} src={row.avatarUrl} size={30} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{row.name}</p>
                    {row.levelName && <p className="truncate text-xs text-slate-400">{row.levelName}</p>}
                  </div>
                  <span className="shrink-0 text-sm font-bold text-slate-900">{row.points}</span>
                </li>
              ))}
            </ol>
          )}
      </div>
    </section>
  );

  const sections: SettingsSection[] = [
    { id: "rules", label: t("tabRules"), icon: "sparkles", content: rulesSection },
    { id: "badges", label: t("tabBadges"), icon: "gamification", content: badgesSection },
    { id: "leaderboard", label: t("tabLeaderboard"), icon: "members", content: leaderboardSection },
  ];

  return (
    <div>
      <SettingsTabs
        title={t("title")}
        subtitle={t("subtitle")}
        sections={sections}
        initialTab={initialTab}
        intro={statsIntro}
      />

      <Sheet open={ruleOpen} onClose={() => setRuleOpen(false)} title={t("ruleSheetTitle")} subtitle={t("ruleSheetSubtitle")} icon="sparkles">
        <RuleForm slug={slug} triggers={ALL_TRIGGERS} onDone={() => setRuleOpen(false)} />
      </Sheet>
      <Sheet open={createOpen} onClose={() => setCreateOpen(false)} title={t("badgeCreateTitle")} subtitle={t("badgeCreateSubtitle")} icon="gamification">
        <BadgeForm slug={slug} onDone={() => setCreateOpen(false)} />
      </Sheet>
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={t("badgeEditTitle")} subtitle={editing?.name} icon="gamification">
        {editing && <BadgeForm key={editing.id} slug={slug} badge={editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </div>
  );
}

function RuleForm({
  slug,
  triggers,
  onDone,
}: {
  slug: string;
  triggers: string[];
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(createRuleAction, initial);
  const [trigger, setTrigger] = useState(triggers[0] ?? "");
  const t = useTranslations("dashboard.gamification");
  const tTriggers = useTranslations("dashboard.gamification.triggers");
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="tenant" value={slug} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl space-y-5 px-6 py-10">
          <FormError message={state.error} />
          <div>
            <Label htmlFor="rf-trigger">{t("triggerLabel")}</Label>
            <Select id="rf-trigger" name="trigger" value={trigger} onChange={setTrigger}>
              {triggers.map((tr) => (
                <option key={tr} value={tr}>
                  {tTriggers(tr)}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-slate-400">{t("triggerHint")}</p>
          </div>
          <div>
            <Label htmlFor="rf-name">{t("nameLabel")}</Label>
            <Input key={trigger} id="rf-name" name="name" required defaultValue={trigger ? tTriggers(trigger) : ""} placeholder={t("ruleNamePlaceholder")} className="text-base" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="rf-points">{t("pointsLabel")}</Label>
              <Input id="rf-points" name="points" type="number" min={0} defaultValue={10} />
            </div>
            <div>
              <Label htmlFor="rf-max">{t("maxPerDayLabel")}</Label>
              <Input id="rf-max" name="maxPerDay" type="number" min={0} placeholder={t("unlimited")} />
            </div>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
        <button type="button" onClick={onDone} className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100">{t("cancel")}</button>
        <button type="submit" disabled={pending} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50">
          {pending ? t("ruleCreating") : t("addRule")}
        </button>
      </div>
    </form>
  );
}

function BadgeForm({
  slug,
  badge,
  onDone,
}: {
  slug: string;
  badge?: BadgeData;
  onDone: () => void;
}) {
  const isEdit = !!badge;
  const [state, action, pending] = useActionState(isEdit ? updateBadgeAction : createBadgeAction, initial);
  const [deleting, setDeleting] = useState(false);
  const t = useTranslations("dashboard.gamification");
  const tCrit = useTranslations("dashboard.gamification.criteria");
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  async function onDelete() {
    if (!badge) return;
    if (!confirm(t("confirmDeleteBadge", { name: badge.name }))) return;
    setDeleting(true);
    const fd = new FormData();
    fd.set("tenant", slug);
    fd.set("badgeId", badge.id);
    await deleteBadgeAction(fd);
    onDone();
  }

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="tenant" value={slug} />
      {isEdit && <input type="hidden" name="badgeId" value={badge!.id} />}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl space-y-5 px-6 py-10">
          <FormError message={state.error} />
          <div>
            <Label htmlFor="bf-name">{t("nameLabel")}</Label>
            <Input id="bf-name" name="name" required defaultValue={badge?.name} placeholder={t("badgeNamePlaceholder")} className="text-base" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="bf-type">{t("criterionLabel")}</Label>
              <Select id="bf-type" name="type" defaultValue={badge?.type ?? "points"}>
                <option value="points">{tCrit("points")}</option>
                <option value="posts">{tCrit("posts")}</option>
                <option value="comments">{tCrit("comments")}</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="bf-th">{t("thresholdLabel")}</Label>
              <Input id="bf-th" name="threshold" type="number" min={1} defaultValue={badge?.threshold ?? 10} />
            </div>
          </div>
          <div>
            <Label htmlFor="bf-desc">{t("descLabel")}</Label>
            <Input id="bf-desc" name="description" defaultValue={badge?.description ?? ""} />
          </div>
          {isEdit && (
            <div className="border-t border-slate-100 pt-5">
              <button type="button" onClick={onDelete} disabled={deleting} className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50">
                <Icon name="archive" size={16} />
                {deleting ? t("deleting") : t("deleteBadge")}
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
        <button type="button" onClick={onDone} className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100">{t("cancel")}</button>
        <button type="submit" disabled={pending} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50">
          {pending ? t("saving") : isEdit ? t("save") : t("createBadge")}
        </button>
      </div>
    </form>
  );
}
