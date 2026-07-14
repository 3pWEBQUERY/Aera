"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Avatar } from "@/components/ui/misc";
import { Icon } from "@/components/dashboard/icons";
import { cn } from "@/lib/utils";
import { startDirectAction, createChatGroupAction } from "@/app/actions/chat";
import { useLocale, useTranslations } from "next-intl";

export interface HubThreadView {
  kind: "GROUP" | "DIRECT";
  id: string; // group slug · dm conversation id
  title: string;
  avatarColor: string | null;
  otherAvatar: string | null;
  lastBody: string | null;
  lastAt: string | null;
  unread: boolean;
}

export interface PickableMember {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface LevelOption {
  key: string;
  name: string;
}

type Filter = "all" | "direct" | "group";

function relTime(iso: string | null, locale: string, t: ReturnType<typeof useTranslations>): string {
  if (!iso) return "";
  const d = new Date(iso);
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 1) return t("time.now");
  if (min < 60) return t("time.minutes", { count: min });
  const h = Math.floor(min / 60);
  if (h < 24) return t("time.hours", { count: h });
  const days = Math.floor(h / 24);
  if (days < 7) return t("time.days", { count: days });
  return d.toLocaleDateString(locale, { day: "numeric", month: "short" });
}

function ThreadAvatar({ t }: { t: HubThreadView }) {
  if (t.kind === "GROUP") {
    return (
      <span
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-lg font-bold text-white ring-1 ring-black/5"
        style={{ background: t.avatarColor ?? "#475569" }}
      >
        {(t.title.trim()[0] ?? "#").toUpperCase()}
      </span>
    );
  }
  return <Avatar name={t.title} src={t.otherAvatar} size={48} />;
}

export function ChatHub({
  slug,
  currentSpaceSlug,
  activeKind,
  activeId,
  threads,
  members,
  levels,
  isStaff,
}: {
  slug: string;
  currentSpaceSlug: string;
  activeKind: "GROUP" | "DIRECT";
  activeId: string;
  threads: HubThreadView[];
  members: PickableMember[];
  levels: LevelOption[];
  isStaff: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dmOpen, setDmOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const t = useTranslations("uiMigration.frontend.chatHub");
  const locale = useLocale();

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return threads.filter((t) => {
      if (filter === "direct" && t.kind !== "DIRECT") return false;
      if (filter === "group" && t.kind !== "GROUP") return false;
      if (q && !t.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [threads, filter, query]);

  const chips: { key: Filter; label: string }[] = [
    { key: "all", label: t("filters.all") },
    { key: "direct", label: t("filters.direct") },
    { key: "group", label: t("filters.group") },
  ];

  const emptyText =
    filter === "direct"
      ? { title: t("empty.directTitle"), hint: t("empty.directHint") }
      : filter === "group"
        ? { title: t("empty.groupTitle"), hint: t("empty.groupHint") }
        : { title: t("empty.allTitle"), hint: t("empty.allHint") };

  function hrefFor(t: HubThreadView): string {
    return t.kind === "GROUP"
      ? `/c/${slug}/s/${t.id}`
      : `/c/${slug}/s/${currentSpaceSlug}?dm=${t.id}`;
  }
  function isActive(t: HubThreadView): boolean {
    return t.kind === activeKind && t.id === activeId;
  }

  return (
    <aside className="hidden w-[360px] shrink-0 flex-col border-r border-[#161613]/10 bg-white md:flex">
      {/* Header */}
      <div className="px-5 pt-5">
        <div className="flex items-center justify-between">
          <h1 className="display-serif text-3xl text-[#161613]">{t("title")}</h1>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSearchOpen((v) => !v)}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-[#161613]/5",
                searchOpen ? "text-[color:var(--brand)]" : "text-[#161613]/80",
              )}
              aria-label={t("search")}
            >
              <Icon name="search" size={19} />
            </button>
            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                onBlur={() => setTimeout(() => setMenuOpen(false), 160)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-[#161613]/80 transition hover:bg-[#161613]/5"
                aria-label={t("newChat")}
              >
                <Icon name="newMessage" size={20} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-11 z-20 w-60 overflow-hidden rounded-2xl border border-[#161613]/10 bg-white py-1.5 shadow-lg">
                  <button
                    onMouseDown={() => {
                      setDmOpen(true);
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-medium text-[#161613] transition hover:bg-[#161613]/[0.03]"
                  >
                    <Icon name="chat" size={18} className="text-[#161613]/60" />
                    {t("newDirect")}
                  </button>
                  {isStaff && (
                    <button
                      onMouseDown={() => {
                        setGroupOpen(true);
                        setMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-medium text-[#161613] transition hover:bg-[#161613]/[0.03]"
                    >
                      <Icon name="messages" size={18} className="text-[#161613]/60" />
                      {t("newGroup")}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {searchOpen && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-[#161613]/5 px-3 py-2">
            <Icon name="search" size={16} className="text-[#161613]/50" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("search")}
              className="w-full bg-transparent text-sm text-[#161613] outline-none placeholder:text-[#161613]/50"
            />
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2 pb-3">
          {chips.map((c) => (
            <button
              key={c.key}
              onClick={() => setFilter(c.key)}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium transition",
                filter === c.key
                  ? "bg-[#161613] text-white"
                  : "bg-[#161613]/5 text-[#161613]/70 hover:bg-[#161613]/10",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Threads */}
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-[#161613]/10">
        {shown.length === 0 ? (
          <div className="flex flex-col items-center px-8 py-16 text-center">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#161613]/5 text-[#161613]/80">
              <Icon name="messages" size={26} />
            </span>
            <p className="text-lg font-bold text-[#161613]">{emptyText.title}</p>
            <p className="mt-2 text-sm leading-relaxed text-[#161613]/60">{emptyText.hint}</p>
          </div>
        ) : (
          <ul>
            {shown.map((thread) => (
              <li key={`${thread.kind}-${thread.id}`}>
                <Link
                  href={hrefFor(thread)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 transition",
                    isActive(thread) ? "bg-[#161613]/5" : "hover:bg-[#161613]/[0.03]",
                  )}
                >
                  <ThreadAvatar t={thread} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p
                        className={cn(
                          "truncate text-sm",
                          thread.unread ? "font-bold text-[#161613]" : "font-semibold text-[#161613]",
                        )}
                      >
                        {thread.title}
                      </p>
                      <span className="shrink-0 text-[11px] text-[#161613]/50">{relTime(thread.lastAt, locale, t)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <p
                        className={cn(
                          "mt-0.5 flex-1 truncate text-xs",
                          thread.unread ? "font-medium text-[#161613]/80" : "text-[#161613]/50",
                        )}
                      >
                        {thread.lastBody ?? (thread.kind === "GROUP" ? t("fallback.group") : t("fallback.direct"))}
                      </p>
                      {thread.unread && <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-[var(--brand)]" />}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {dmOpen && (
        <DirectModal
          slug={slug}
          from={currentSpaceSlug}
          members={members}
          onClose={() => setDmOpen(false)}
        />
      )}
      {groupOpen && isStaff && (
        <GroupModal
          slug={slug}
          from={currentSpaceSlug}
          levels={levels}
          onClose={() => setGroupOpen(false)}
        />
      )}
    </aside>
  );
}

// ---------------------------------------------------------------- Modals
function ModalShell({
  title,
  onClose,
  fullscreen = false,
  children,
}: {
  title: string;
  onClose: () => void;
  fullscreen?: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations("uiMigration.frontend.chatHub");
  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex",
        fullscreen ? "" : "items-center justify-center p-4",
      )}
    >
      <div className="absolute inset-0 bg-[#161613]/40" onClick={onClose} />
      <div
        className={cn(
          "relative z-10 flex flex-col overflow-hidden bg-white",
          fullscreen
            ? "h-full w-full"
            : "max-h-[85vh] w-full max-w-md rounded-3xl shadow-xl",
        )}
      >
        <div className="flex items-center justify-between border-b border-[#161613]/10 px-5 py-4">
          <h2 className="display-serif text-xl text-[#161613]">{title}</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[#161613]/60 transition hover:bg-[#161613]/5"
            aria-label={t("close")}
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function DirectModal({
  slug,
  from,
  members,
  onClose,
}: {
  slug: string;
  from: string;
  members: PickableMember[];
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const t = useTranslations("uiMigration.frontend.chatHub");
  const filtered = members.filter((m) => m.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <ModalShell title={t("newDirect")} onClose={onClose} fullscreen>
      <div className="border-b border-[#161613]/10 px-5 py-3">
        <div className="mx-auto flex w-full max-w-xl items-center gap-2 rounded-xl bg-[#161613]/5 px-3 py-2">
          <Icon name="search" size={16} className="text-[#161613]/50" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("memberSearch")}
            className="w-full bg-transparent text-sm outline-none placeholder:text-[#161613]/50"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        <div className="mx-auto w-full max-w-xl">
          {filtered.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-[#161613]/50">{t("noMembers")}</p>
          ) : (
            filtered.map((m) => (
              <form key={m.id} action={startDirectAction}>
                <input type="hidden" name="tenant" value={slug} />
                <input type="hidden" name="from" value={from} />
                <input type="hidden" name="userId" value={m.id} />
                <button
                  type="submit"
                  className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-left transition hover:bg-[#161613]/[0.03]"
                >
                  <Avatar name={m.name} src={m.avatarUrl} size={38} />
                  <span className="truncate text-sm font-medium text-[#161613]">{m.name}</span>
                </button>
              </form>
            ))
          )}
        </div>
      </div>
    </ModalShell>
  );
}

function GroupModal({
  slug,
  from,
  levels,
  onClose,
}: {
  slug: string;
  from: string;
  levels: LevelOption[];
  onClose: () => void;
}) {
  const [access, setAccess] = useState<"all" | "paid" | "level">("all");
  const t = useTranslations("uiMigration.frontend.chatHub");
  const [levelKey, setLevelKey] = useState(levels[0]?.key ?? "");
  const options: { key: "all" | "paid" | "level"; label: string }[] = [
    { key: "all", label: t("access.all") },
    { key: "paid", label: t("access.paid") },
    { key: "level", label: t("access.level") },
  ];
  return (
    <ModalShell title={t("newGroup")} onClose={onClose} fullscreen>
      <form action={createChatGroupAction} className="flex min-h-0 flex-1 flex-col">
        <input type="hidden" name="tenant" value={slug} />
        <input type="hidden" name="from" value={from} />
        <input type="hidden" name="levelKey" value={access === "level" ? levelKey : ""} />
        <div className="mx-auto min-h-0 w-full max-w-xl flex-1 overflow-y-auto px-6 py-8">
          <label className="block text-sm font-semibold text-[#161613]">{t("name")}</label>
          <input
            name="title"
            autoFocus
            required
            minLength={2}
            maxLength={60}
            placeholder={t("namePlaceholder")}
            className="mt-2 w-full rounded-xl border border-[#161613]/10 bg-[#161613]/[0.03] px-3.5 py-2.5 text-sm outline-none transition focus:border-[var(--brand)] focus:bg-white focus:ring-2 focus:ring-[var(--brand-ring)]"
          />

          <p className="mt-6 text-sm font-semibold text-[#161613]">{t("accessQuestion")}</p>
          <div className="mt-2 space-y-1">
            {options.map((o) => (
              <label
                key={o.key}
                className="flex cursor-pointer items-center justify-between rounded-xl px-1 py-2.5"
              >
                <span className="text-sm text-[#161613]">{o.label}</span>
                <input
                  type="radio"
                  name="access"
                  value={o.key}
                  checked={access === o.key}
                  onChange={() => setAccess(o.key)}
                  className="h-5 w-5 accent-[var(--brand)]"
                />
              </label>
            ))}
          </div>

          {access === "level" && (
            <div className="mt-2 rounded-xl border border-[#161613]/10 p-3">
              {levels.length === 0 ? (
                <p className="text-sm text-[#161613]/50">{t("noLevels")}</p>
              ) : (
                <select
                  value={levelKey}
                  onChange={(e) => setLevelKey(e.target.value)}
                  className="w-full rounded-lg border border-[#161613]/10 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
                >
                  {levels.map((l) => (
                    <option key={l.key} value={l.key}>
                      {l.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-[#161613]/10 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2.5 text-sm font-medium text-[#161613]/70 transition hover:bg-[#161613]/5"
          >
            {t("cancel")}
          </button>
          <button
            type="submit"
            className="rounded-xl bg-[#161613] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#33332e]"
          >
            {t("create")}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
