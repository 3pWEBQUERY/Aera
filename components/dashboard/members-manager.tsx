"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import {
  createMemberAction,
  updateMemberAction,
  updateOwnProfileAction,
  deleteMemberAction,
  awardBadgeAction,
  revokeBadgeAction,
  type ActionState,
} from "@/app/actions/dashboard";
import { BadgeMedal } from "@/components/community/badge-medal";
import type { BadgeCriteriaType, BadgeShape, BadgeTier } from "@/lib/badges";
import type { IconName } from "./icons";
import { Sheet } from "./sheet";
import { Icon } from "./icons";
import { SettingsTabs, type SettingsSection } from "./settings-tabs";
import { AvatarUpload } from "./avatar-upload";
import { Avatar, Pill, FormError } from "@/components/ui/misc";
import { Input, Label, Select } from "@/components/ui/field";
import { cn, formatDate } from "@/lib/utils";

export interface MemberRow {
  id: string;
  userId: string;
  role: string;
  status: string;
  joinedAt: string | Date;
  tierId: string | null;
  user: { name: string; email: string; avatarUrl: string | null };
  /** Bereits vergebene Auszeichnungen dieses Mitglieds. */
  badges: MemberAward[];
}
export interface MemberAward {
  badgeId: string;
  awardedAt: string | Date;
}
/** Eine Auszeichnung der Community, so wie sie zur Vergabe angeboten wird. */
export interface BadgeOption {
  id: string;
  name: string;
  description: string | null;
  shape: BadgeShape;
  tier: BadgeTier;
  icon: IconName;
  type: BadgeCriteriaType;
  threshold: number;
}
interface Tier {
  id: string;
  name: string;
}

const initial: ActionState = {};

const roleCls: Record<string, string> = {
  OWNER: "bg-violet-100 text-violet-700",
  ADMIN: "bg-blue-100 text-blue-700",
  MODERATOR: "bg-teal-100 text-teal-700",
  MEMBER: "bg-slate-100 text-slate-600",
};
const statusCls: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  PENDING: "bg-amber-100 text-amber-700",
  BANNED: "bg-red-100 text-red-700",
};

export function MembersManager({
  slug,
  members,
  tiers,
  badges,
  currentUserId,
  initialTab,
}: {
  slug: string;
  members: MemberRow[];
  tiers: Tier[];
  badges: BadgeOption[];
  currentUserId: string;
  initialTab?: string;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<MemberRow | null>(null);
  const [awarding, setAwarding] = useState<MemberRow | null>(null);
  const editingSelf = !!editing && editing.userId === currentUserId;
  const t = useTranslations("dashboard.members");
  const tRoles = useTranslations("dashboard.roles");
  const tStatus = useTranslations("dashboard.memberStatus");
  const locale = useLocale();

  // Vergaben liegen im Zustand, damit eine Aenderung sofort in der Liste
  // steht. Der Server bleibt die Wahrheit: nach jedem Schritt laedt
  // router.refresh() die Seite nach und setzt diesen Zustand neu.
  const [awards, setAwards] = useState<Record<string, MemberAward[]>>(() =>
    Object.fromEntries(members.map((m) => [m.userId, m.badges])),
  );
  useEffect(() => {
    setAwards(Object.fromEntries(members.map((m) => [m.userId, m.badges])));
  }, [members]);

  const byId = new Map(badges.map((b) => [b.id, b]));
  const badgesOf = (userId: string) =>
    (awards[userId] ?? [])
      .map((a) => ({ badge: byId.get(a.badgeId), awardedAt: a.awardedAt }))
      .filter((x): x is { badge: BadgeOption; awardedAt: string | Date } => !!x.badge);

  const team = members.filter((m) => m.role !== "MEMBER");
  const banned = members.filter((m) => m.status === "BANNED");

  const renderRow = (m: MemberRow) => {
    const isSelf = m.userId === currentUserId;
    const editable = m.role !== "OWNER" || isSelf;
    const own = badgesOf(m.userId);
    return (
      <div
        key={m.id}
        onClick={() => editable && setEditing(m)}
        role={editable ? "button" : undefined}
        tabIndex={editable ? 0 : undefined}
        onKeyDown={(e) => {
          if (editable && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setEditing(m);
          }
        }}
        className={cn(
          "group flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition sm:flex-nowrap sm:gap-4",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]",
          editable ? "cursor-pointer hover:border-slate-300 hover:shadow-sm" : "",
        )}
      >
        <Avatar name={m.user.name} src={m.user.avatarUrl} size={42} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-slate-900">{m.user.name}</p>
            <Pill className={roleCls[m.role] ?? roleCls.MEMBER}>{tRoles(m.role)}</Pill>
            {isSelf && <Pill className="bg-[var(--action)] text-[var(--action-fg)]">{t("you")}</Pill>}
            {m.status !== "ACTIVE" && <Pill className={statusCls[m.status] ?? statusCls.ACTIVE}>{tStatus(m.status)}</Pill>}
          </div>
          <p className="mt-0.5 truncate text-sm text-slate-400">
            {m.user.email} · {t("joined", { date: formatDate(m.joinedAt, locale) })}
          </p>
        </div>
        {/* Die ersten drei Auszeichnungen stehen in der Zeile — mehr wuerde
            den Namen verdraengen, deshalb zaehlt der Rest nur noch. */}
        {own.length > 0 && (
          <span className="flex shrink-0 items-center gap-1" title={own.map((x) => x.badge.name).join(", ")}>
            {own.slice(0, 3).map((x) => (
              <BadgeMedal
                key={x.badge.id}
                look={{ shape: x.badge.shape, tier: x.badge.tier, icon: x.badge.icon }}
                size={22}
                title={x.badge.name}
              />
            ))}
            {own.length > 3 && (
              <span className="text-xs font-semibold text-slate-400">+{own.length - 3}</span>
            )}
          </span>
        )}
        <span className="flex w-full items-center justify-end gap-1 border-t border-slate-100 pt-2.5 sm:w-auto sm:border-0 sm:pt-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setAwarding(m);
            }}
            // Sonst faengt die Zeile die Taste ab und oeffnet zusaetzlich die
            // Bearbeitung.
            onKeyDown={(e) => e.stopPropagation()}
            title={t("badgesAction")}
            aria-label={t("badgesFor", { name: m.user.name })}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)] sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
          >
            <Icon name="gamification" size={16} />
            <span className="sm:hidden">{t("badgesAction")}</span>
          </button>
          {editable && (
            <span className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-500 sm:opacity-0 sm:transition sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
              <Icon name="settings" size={16} />
              {isSelf ? t("editProfile") : t("edit")}
            </span>
          )}
        </span>
      </div>
    );
  };

  const listSection = (opts: {
    heading: string;
    description: string;
    list: MemberRow[];
    emptyTitle: string;
    emptyHint: string;
    showAdd?: boolean;
  }) => (
    <section>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            {opts.heading}
            <Pill className="bg-slate-100 text-slate-500">{opts.list.length}</Pill>
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">{opts.description}</p>
        </div>
        {opts.showAdd && (
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 self-start rounded-xl bg-[var(--action)] px-4 py-2.5 text-sm font-semibold text-[var(--action-fg)] transition hover:bg-[var(--action-hover)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)] focus-visible:ring-offset-2"
          >
            <Icon name="plus" size={18} />
            {t("addMember")}
          </button>
        )}
      </div>
      <div className="mt-5 space-y-2.5">
        {opts.list.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 px-6 py-10 text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
              <Icon name="members" size={22} />
            </div>
            <p className="mt-3 text-sm font-medium text-slate-700">{opts.emptyTitle}</p>
            <p className="mt-0.5 text-xs text-slate-400">{opts.emptyHint}</p>
          </div>
        ) : (
          opts.list.map(renderRow)
        )}
      </div>
    </section>
  );

  const sections: SettingsSection[] = [
    {
      id: "all",
      label: t("tabAll"),
      icon: "members",
      content: listSection({
        heading: t("allHeading"),
        description: t("allDesc"),
        list: members,
        emptyTitle: t("allEmptyTitle"),
        emptyHint: t("allEmptyHint"),
        showAdd: true,
      }),
    },
    {
      id: "team",
      label: t("tabTeam"),
      icon: "settings",
      content: listSection({
        heading: t("teamHeading"),
        description: t("teamDesc"),
        list: team,
        emptyTitle: t("teamEmptyTitle"),
        emptyHint: t("teamEmptyHint"),
        showAdd: true,
      }),
    },
    {
      id: "banned",
      label: t("tabBanned"),
      icon: "lock",
      content: listSection({
        heading: t("bannedHeading"),
        description: t("bannedDesc"),
        list: banned,
        emptyTitle: t("bannedEmptyTitle"),
        emptyHint: t("bannedEmptyHint"),
      }),
    },
  ];

  return (
    <div>
      <SettingsTabs
        title={t("title")}
        subtitle={t("subtitle", { count: members.length })}
        sections={sections}
        initialTab={initialTab}
      />

      {/* Add member */}
      <Sheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t("addTitle")}
        subtitle={t("addSubtitle")}
        icon="members"
      >
        <CreateForm slug={slug} tiers={tiers} onDone={() => setCreateOpen(false)} />
      </Sheet>

      {/* Edit member / own profile */}
      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editingSelf ? t("editSelfTitle") : t("editTitle")}
        subtitle={editing?.user.email}
        icon="members"
      >
        {editing &&
          (editingSelf ? (
            <ProfileEditForm
              key={editing.id}
              slug={slug}
              member={editing}
              onDone={() => setEditing(null)}
            />
          ) : (
            <EditForm
              key={editing.id}
              slug={slug}
              tiers={tiers}
              member={editing}
              onDone={() => setEditing(null)}
            />
          ))}
      </Sheet>

      {/* Auszeichnungen vergeben */}
      <Sheet
        open={!!awarding}
        onClose={() => setAwarding(null)}
        title={t("badgesTitle")}
        subtitle={awarding?.user.name}
        icon="gamification"
      >
        {awarding && (
          <BadgeAwardPanel
            key={awarding.id}
            slug={slug}
            member={awarding}
            badges={badges}
            owned={awards[awarding.userId] ?? []}
            onChange={(next) =>
              setAwards((prev) => ({ ...prev, [awarding.userId]: next }))
            }
            onDone={() => setAwarding(null)}
          />
        )}
      </Sheet>
    </div>
  );
}

/**
 * Auszeichnungen eines Mitglieds vergeben und zuruecknehmen.
 *
 * Oben steht, was das Mitglied schon hat, darunter der Rest — die Trennung
 * beantwortet die eigentliche Frage ("fehlt noch etwas?") ohne Suchen.
 * Auszeichnungen mit einer zaehlbaren Bedingung erhaelt man normalerweise
 * automatisch; sie stehen trotzdem hier, weil ein Creator jemanden auch
 * vorzeitig auszeichnen darf. Der Hinweis an der Zeile sagt, welcher Fall
 * vorliegt.
 */
function BadgeAwardPanel({
  slug,
  member,
  badges,
  owned,
  onChange,
  onDone,
}: {
  slug: string;
  member: MemberRow;
  badges: BadgeOption[];
  owned: MemberAward[];
  onChange: (next: MemberAward[]) => void;
  onDone: () => void;
}) {
  const t = useTranslations("dashboard.members");
  const tGam = useTranslations("dashboard.gamification");
  const tCrit = useTranslations("dashboard.gamification.criteria");
  const locale = useLocale();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  const ownedIds = new Set(owned.map((a) => a.badgeId));
  const has = badges.filter((b) => ownedIds.has(b.id));
  const open = badges.filter((b) => !ownedIds.has(b.id));

  async function run(badgeId: string, mode: "award" | "revoke") {
    setBusy(badgeId);
    setError(undefined);
    const fd = new FormData();
    fd.set("tenant", slug);
    fd.set("userId", member.userId);
    fd.set("badgeId", badgeId);
    const result =
      mode === "award" ? await awardBadgeAction(fd) : await revokeBadgeAction(fd);
    setBusy(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    onChange(
      mode === "award"
        ? [...owned, { badgeId, awardedAt: new Date() }]
        : owned.filter((a) => a.badgeId !== badgeId),
    );
    // Der Serverzustand kommt nach — Punkte, Zaehler und die Community-Seite
    // haengen an denselben Daten.
    startTransition(() => router.refresh());
  }

  const hint = (b: BadgeOption) =>
    b.type === "manual"
      ? tGam("manualBadge")
      : tGam("badgeThreshold", { threshold: b.threshold, criterion: tCrit(b.type) });

  const row = (b: BadgeOption, awardedAt?: string | Date) => (
    <li
      key={b.id}
      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3"
    >
      <span className="flex w-11 shrink-0 items-center justify-center">
        <BadgeMedal look={{ shape: b.shape, tier: b.tier, icon: b.icon }} size={38} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-900">{b.name}</p>
        <p className="truncate text-xs text-slate-400">
          {awardedAt ? t("awardedOn", { date: formatDate(awardedAt, locale) }) : hint(b)}
        </p>
      </div>
      {awardedAt ? (
        <button
          type="button"
          onClick={() => run(b.id, "revoke")}
          disabled={busy === b.id}
          className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
        >
          {busy === b.id ? t("revoking") : t("revoke")}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => run(b.id, "award")}
          disabled={busy === b.id}
          className="shrink-0 rounded-lg bg-[var(--action)] px-3 py-1.5 text-sm font-semibold text-[var(--action-fg)] transition hover:bg-[var(--action-hover)] disabled:opacity-50"
        >
          {busy === b.id ? t("awarding") : t("award")}
        </button>
      )}
    </li>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl space-y-6 px-6 py-10">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <Avatar name={member.user.name} src={member.user.avatarUrl} size={44} />
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-900">{member.user.name}</p>
              <p className="truncate text-sm text-slate-400">
                {t("badgeCount", { count: has.length })}
              </p>
            </div>
          </div>

          <FormError message={error} />

          {badges.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 px-6 py-10 text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                <Icon name="gamification" size={22} />
              </div>
              <p className="mt-3 text-sm font-medium text-slate-700">{t("badgesEmptyTitle")}</p>
              <p className="mt-0.5 text-xs text-slate-400">{t("badgesEmptyHint")}</p>
            </div>
          ) : (
            <>
              {has.length > 0 && (
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    {t("badgesOwned")}
                    <Pill className="bg-slate-100 text-slate-500">{has.length}</Pill>
                  </h3>
                  <ul className="mt-2.5 space-y-2">
                    {has.map((b) =>
                      row(b, owned.find((a) => a.badgeId === b.id)?.awardedAt),
                    )}
                  </ul>
                </div>
              )}

              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  {t("badgesAvailable")}
                  <Pill className="bg-slate-100 text-slate-500">{open.length}</Pill>
                </h3>
                {open.length === 0 ? (
                  <p className="mt-2.5 rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
                    {t("badgesAllGiven")}
                  </p>
                ) : (
                  <ul className="mt-2.5 space-y-2">{open.map((b) => row(b))}</ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-end border-t border-slate-200 bg-white px-6 py-4">
        <button
          type="button"
          onClick={onDone}
          className="rounded-xl bg-[var(--action)] px-5 py-2.5 text-sm font-semibold text-[var(--action-fg)] transition hover:bg-[var(--action-hover)]"
        >
          {t("done")}
        </button>
      </div>
    </div>
  );
}

function InviteLinkPanel({ url, onDone }: { url: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const t = useTranslations("dashboard.members");
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — the link stays selectable below
    }
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl space-y-5 px-6 py-10">
          <div className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">
            {t("inviteCreated")}
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
            <p className="min-w-0 flex-1 truncate font-mono text-sm text-slate-700">{url}</p>
            <button
              type="button"
              onClick={copy}
              className={`flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)] ${
                copied
                  ? "bg-green-100 text-green-700"
                  : "bg-[var(--action)] text-[var(--action-fg)] hover:bg-[var(--action-hover)]"
              }`}
            >
              <Icon name={copied ? "check" : "copy"} size={15} />
              {copied ? t("copied") : t("copy")}
            </button>
          </div>
          <p className="text-xs text-slate-400">
            {t("inviteEmailNote")}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end border-t border-slate-200 bg-white px-6 py-4">
        <button
          type="button"
          onClick={onDone}
          className="rounded-xl bg-[var(--action)] px-5 py-2.5 text-sm font-semibold text-[var(--action-fg)] transition hover:bg-[var(--action-hover)]"
        >
          {t("done")}
        </button>
      </div>
    </div>
  );
}

function CreateForm({
  slug,
  tiers,
  onDone,
}: {
  slug: string;
  tiers: Tier[];
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(createMemberAction, initial);
  const t = useTranslations("dashboard.members");
  const tRoles = useTranslations("dashboard.roles");
  useEffect(() => {
    // Existing accounts close immediately; new accounts show the invite link.
    if (state.ok && !state.inviteUrl) onDone();
  }, [state.ok, state.inviteUrl, onDone]);

  if (state.ok && state.inviteUrl) {
    return <InviteLinkPanel url={state.inviteUrl} onDone={onDone} />;
  }

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="tenant" value={slug} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl space-y-5 px-6 py-10">
          <FormError message={state.error} />
          <div>
            <Label>{t("profilePhoto")}</Label>
            <AvatarUpload tenant={slug} />
          </div>
          <div>
            <Label htmlFor="cm-email">{t("emailLabel")}</Label>
            <Input id="cm-email" name="email" type="email" required autoFocus placeholder={t("emailPlaceholder")} className="text-base" />
            <p className="mt-1 text-xs text-slate-400">
              {t("emailHint")}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="cm-role">{t("roleLabel")}</Label>
              <Select id="cm-role" name="role" defaultValue="MEMBER">
                <option value="MEMBER">{tRoles("MEMBER")}</option>
                <option value="MODERATOR">{tRoles("MODERATOR")}</option>
                <option value="ADMIN">{tRoles("ADMIN")}</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="cm-tier">{t("tierLabel")}</Label>
              <Select id="cm-tier" name="tierId" defaultValue="">
                <option value="">{t("noTier")}</option>
                {tiers.map((tier) => (
                  <option key={tier.id} value={tier.id}>{tier.name}</option>
                ))}
              </Select>
            </div>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
        <button type="button" onClick={onDone} className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100">
          {t("cancel")}
        </button>
        <button type="submit" disabled={pending} className="inline-flex items-center gap-2 rounded-xl bg-[var(--action)] px-5 py-2.5 text-sm font-semibold text-[var(--action-fg)] transition hover:bg-[var(--action-hover)] active:scale-[0.98] disabled:opacity-50">
          {pending ? t("adding") : t("addMember")}
        </button>
      </div>
    </form>
  );
}

function EditForm({
  slug,
  tiers,
  member,
  onDone,
}: {
  slug: string;
  tiers: Tier[];
  member: MemberRow;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(updateMemberAction, initial);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>();
  const t = useTranslations("dashboard.members");
  const tRoles = useTranslations("dashboard.roles");
  const tStatus = useTranslations("dashboard.memberStatus");
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  async function onDelete() {
    if (!confirm(t("confirmRemove", { name: member.user.name }))) return;
    setDeleting(true);
    setDeleteError(undefined);
    const fd = new FormData();
    fd.set("tenant", slug);
    fd.set("membershipId", member.id);
    const result = await deleteMemberAction(fd);
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
      <input type="hidden" name="membershipId" value={member.id} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl space-y-6 px-6 py-10">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <Avatar name={member.user.name} src={member.user.avatarUrl} size={44} />
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-900">{member.user.name}</p>
              <p className="truncate text-sm text-slate-400">{member.user.email}</p>
            </div>
          </div>

          <FormError message={deleteError ?? state.error} />

          <div>
            <Label>{t("profilePhoto")}</Label>
            <AvatarUpload
              tenant={slug}
              defaultUrl={member.user.avatarUrl}
              fallbackName={member.user.name}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="em-role">{t("roleLabel")}</Label>
              <Select id="em-role" name="role" defaultValue={member.role}>
                <option value="MEMBER">{tRoles("MEMBER")}</option>
                <option value="MODERATOR">{tRoles("MODERATOR")}</option>
                <option value="ADMIN">{tRoles("ADMIN")}</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="em-status">{t("statusLabel")}</Label>
              <Select id="em-status" name="status" defaultValue={member.status}>
                <option value="ACTIVE">{tStatus("ACTIVE")}</option>
                <option value="PENDING">{tStatus("PENDING")}</option>
                <option value="BANNED">{tStatus("BANNED")}</option>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="em-tier">{t("tierLabel")}</Label>
            <Select id="em-tier" name="tierId" defaultValue={member.tierId ?? ""}>
              <option value="">{t("noTier")}</option>
              {tiers.map((tier) => (
                <option key={tier.id} value={tier.id}>{tier.name}</option>
              ))}
            </Select>
          </div>

          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
          >
            <Icon name="archive" size={16} />
            {deleting ? t("removing") : t("removeMember")}
          </button>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
        <button type="button" onClick={onDone} className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100">
          {t("cancel")}
        </button>
        <button type="submit" disabled={pending} className="inline-flex items-center gap-2 rounded-xl bg-[var(--action)] px-5 py-2.5 text-sm font-semibold text-[var(--action-fg)] transition hover:bg-[var(--action-hover)] active:scale-[0.98] disabled:opacity-50">
          {pending ? t("saving") : t("saveChanges")}
        </button>
      </div>
    </form>
  );
}

function ProfileEditForm({
  slug,
  member,
  onDone,
}: {
  slug: string;
  member: MemberRow;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(updateOwnProfileAction, initial);
  const t = useTranslations("dashboard.members");
  const tRoles = useTranslations("dashboard.roles");
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="tenant" value={slug} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl space-y-6 px-6 py-10">
          <FormError message={state.error} />

          <div>
            <Label>{t("profilePhoto")}</Label>
            <AvatarUpload
              tenant={slug}
              defaultUrl={member.user.avatarUrl}
              fallbackName={member.user.name}
            />
          </div>

          <div>
            <Label htmlFor="pe-name">{t("nameLabel")}</Label>
            <Input id="pe-name" name="name" required defaultValue={member.user.name} className="text-base" />
          </div>

          <div>
            <Label htmlFor="pe-email">{t("emailShort")}</Label>
            <Input id="pe-email" defaultValue={member.user.email} disabled className="bg-slate-50 text-slate-500" />
            <p className="mt-1 text-xs text-slate-400">{t("emailDisabledHint")}</p>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <span className="text-sm text-slate-500">{t("roleLabel")}</span>
            <Pill className={roleCls[member.role] ?? roleCls.MEMBER}>{tRoles(member.role)}</Pill>
            <span className="ml-auto text-xs text-slate-400">{t("roleProtected")}</span>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
        <button type="button" onClick={onDone} className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100">
          {t("cancel")}
        </button>
        <button type="submit" disabled={pending} className="inline-flex items-center gap-2 rounded-xl bg-[var(--action)] px-5 py-2.5 text-sm font-semibold text-[var(--action-fg)] transition hover:bg-[var(--action-hover)] active:scale-[0.98] disabled:opacity-50">
          {pending ? t("saving") : t("saveProfile")}
        </button>
      </div>
    </form>
  );
}
