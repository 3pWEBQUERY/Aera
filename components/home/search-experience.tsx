"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/dashboard/icons";
import type { DiscoverResult, DiscoverResultType } from "@/lib/discover-search";

const MIN_QUERY = 2;
const DEBOUNCE_MS = 220;

/** Filter order = the order groups appear in the result list. */
const TYPES: DiscoverResultType[] = [
  "community",
  "blog",
  "post",
  "course",
  "event",
  "product",
  "knowledge",
];

const TYPE_ICON: Record<DiscoverResultType, IconName> = {
  community: "members",
  blog: "blog",
  post: "feed",
  course: "courses",
  event: "events",
  product: "products",
  knowledge: "knowledge",
};

type Status = "idle" | "loading" | "ready" | "error";

/**
 * Live platform search.
 *
 * Types straight into results: debounced, with every in-flight request
 * aborted when the next keystroke arrives, so a slow early response can never
 * overwrite a newer one. The query lives in the URL (replaced, not pushed) so
 * a search stays shareable without burying the back button.
 */
export function SearchExperience({ initialQuery }: { initialQuery: string }) {
  const t = useTranslations("discover.search");
  const locale = useLocale();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<DiscoverResult[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [activeType, setActiveType] = useState<DiscoverResultType | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const listId = useId();

  const trimmed = query.trim();

  const run = useCallback(
    async (value: string) => {
      abortRef.current?.abort();
      if (value.trim().length < MIN_QUERY) {
        setResults([]);
        setStatus("idle");
        return;
      }
      const controller = new AbortController();
      abortRef.current = controller;
      setStatus("loading");
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(value.trim())}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { results: DiscoverResult[] };
        setResults(data.results);
        setStatus("ready");
      } catch (error) {
        // An aborted request is the expected outcome of typing on, not a failure.
        if ((error as Error).name === "AbortError") return;
        setResults([]);
        setStatus("error");
      }
    },
    [],
  );

  // Debounce the keystrokes; the request itself is cancelled inside run().
  useEffect(() => {
    const timer = setTimeout(() => void run(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, run]);

  // Keep the address bar in sync without stacking a history entry per letter.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (trimmed) url.searchParams.set("q", trimmed);
    else url.searchParams.delete("q");
    window.history.replaceState(null, "", url.toString());
  }, [trimmed]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const counts = useMemo(() => {
    const map = new Map<DiscoverResultType, number>();
    for (const r of results) map.set(r.type, (map.get(r.type) ?? 0) + 1);
    return map;
  }, [results]);

  const visible = useMemo(
    () => (activeType ? results.filter((r) => r.type === activeType) : results),
    [results, activeType],
  );

  const grouped = useMemo(() => {
    return TYPES.map((type) => ({
      type,
      items: visible.filter((r) => r.type === type),
    })).filter((g) => g.items.length > 0);
  }, [visible]);

  const availableTypes = TYPES.filter((type) => (counts.get(type) ?? 0) > 0);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-8">
      <h1 className="display-serif text-3xl text-[#161613] sm:text-4xl">
        {t("title")}
      </h1>
      <p className="mt-2 max-w-xl text-sm leading-6 text-[#161613]/55">
        {t("subtitle")}
      </p>

      {/* ------------------------------------------------------------ input */}
      <div className="sticky top-0 z-10 -mx-4 mt-6 bg-[#f4f1ea]/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8">
        <div className="relative">
          <Icon
            name="search"
            size={19}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#161613]/35"
          />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setQuery("");
            }}
            role="combobox"
            aria-expanded={grouped.length > 0}
            aria-controls={listId}
            aria-label={t("inputLabel")}
            placeholder={t("placeholder")}
            autoComplete="off"
            className="w-full rounded-full border border-[#161613]/12 bg-white py-3.5 pl-12 pr-24 text-base text-[#161613] outline-none transition placeholder:text-[#161613]/35 focus:border-[#161613]/35 focus:ring-4 focus:ring-[#161613]/5"
          />
          <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
            {status === "loading" && (
              <span
                aria-hidden="true"
                className="h-4 w-4 animate-spin rounded-full border-2 border-[#161613]/15 border-t-[#161613]/50"
              />
            )}
            {query.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
                aria-label={t("clear")}
                className="flex h-7 w-7 items-center justify-center rounded-full text-[#161613]/40 transition hover:bg-[#161613]/5 hover:text-[#161613] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#161613]/25"
              >
                <Icon name="close" size={15} />
              </button>
            )}
          </div>
        </div>

        {/* Filters only appear once they would actually do something. */}
        {availableTypes.length > 1 && (
          <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
            <Chip
              label={t("all")}
              count={results.length}
              active={activeType === null}
              onClick={() => setActiveType(null)}
            />
            {availableTypes.map((type) => (
              <Chip
                key={type}
                label={t(`types.${type}`)}
                count={counts.get(type) ?? 0}
                active={activeType === type}
                onClick={() => setActiveType(activeType === type ? null : type)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ---------------------------------------------------------- results */}
      <div id={listId} aria-live="polite" aria-busy={status === "loading"} className="mt-6">
        {status === "idle" && trimmed.length < MIN_QUERY && (
          <EmptyHint icon="search" title={t("idleTitle")} text={t("idleText")} />
        )}

        {status === "loading" && results.length === 0 && <ResultSkeleton />}

        {status === "error" && (
          <EmptyHint icon="alert" title={t("errorTitle")} text={t("errorText")} />
        )}

        {status === "ready" && results.length === 0 && (
          <EmptyHint
            icon="search"
            title={t("emptyTitle", { query: trimmed })}
            text={t("emptyText")}
          />
        )}

        {grouped.map((group) => (
          <section key={group.type} className="mb-8">
            <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#161613]/45">
              <Icon name={TYPE_ICON[group.type]} size={14} />
              {t(`types.${group.type}`)}
              <span className="text-[#161613]/30">{group.items.length}</span>
            </h2>
            <div className="space-y-2">
              {group.items.map((item) => (
                <ResultRow key={`${item.type}-${item.id}`} item={item} query={trimmed} locale={locale} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function Chip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#161613]/25",
        active
          ? "bg-[var(--action)] text-[var(--action-fg)]"
          : "bg-white text-[#161613]/70 ring-1 ring-[#161613]/10 hover:bg-[var(--action-soft)]",
      )}
    >
      {label}
      <span className={cn("text-xs tabular-nums", active ? "text-[#f4f1ea]/60" : "text-[#161613]/35")}>
        {count}
      </span>
    </button>
  );
}

/** Highlights the matched substring without trusting it as markup. */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-[#f0e6a8] px-0.5 text-[#161613]">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function ResultRow({
  item,
  query,
  locale,
}: {
  item: DiscoverResult;
  query: string;
  locale: string;
}) {
  const dateLabel = item.date
    ? new Date(item.date).toLocaleDateString(locale, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <Link
      href={item.href}
      className="group flex items-start gap-4 rounded-2xl border border-[#161613]/10 bg-white p-4 transition duration-300 hover:border-[#161613]/25 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#161613]/25"
    >
      <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span
            className="flex h-full w-full items-center justify-center text-white"
            style={{ backgroundColor: item.color ?? "#161613" }}
          >
            <Icon name={TYPE_ICON[item.type]} size={20} />
          </span>
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-[#161613]">
          <Highlight text={item.title} query={query} />
        </span>
        {/* Ohne `block`: line-clamp setzt display:-webkit-box, ein zusaetzliches
            block wuerde das wieder aushebeln und der Auszug liefe ungekuerzt. */}
        {item.excerpt && (
          <span className="mt-1 line-clamp-2 text-sm leading-6 text-[#161613]/55">
            <Highlight text={item.excerpt} query={query} />
          </span>
        )}
        <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#161613]/40">
          {item.community && item.type !== "community" && (
            <span className="truncate font-medium text-[#161613]/55">{item.community.name}</span>
          )}
          {item.spaceName && <span className="truncate">· {item.spaceName}</span>}
          {dateLabel && <span>· {dateLabel}</span>}
        </span>
      </span>

      <Icon
        name="chevron"
        size={16}
        className="mt-1 shrink-0 -rotate-90 text-[#161613]/20 transition group-hover:text-[#161613]/50"
      />
    </Link>
  );
}

function ResultSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="flex items-start gap-4 rounded-2xl border border-[#161613]/10 bg-white p-4"
        >
          <div className="h-12 w-12 shrink-0 animate-pulse rounded-xl bg-[#161613]/8" />
          <div className="flex-1 space-y-2 py-1">
            <div className="h-3.5 w-1/3 animate-pulse rounded bg-[#161613]/8" />
            <div className="h-3 w-3/4 animate-pulse rounded bg-[#161613]/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyHint({
  icon,
  title,
  text,
}: {
  icon: IconName;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[#161613]/15 px-6 py-14 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#161613]/5 text-[#161613]/35">
        <Icon name={icon} size={22} />
      </span>
      <p className="display-serif mt-4 text-xl text-[#161613]">{title}</p>
      <p className="mx-auto mt-1.5 max-w-sm text-sm leading-6 text-[#161613]/50">{text}</p>
    </div>
  );
}
