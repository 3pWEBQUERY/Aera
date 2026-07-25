"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Icon } from "./icons";
import type {
  DashboardSearchHit,
  DashboardSearchResult,
} from "@/lib/dashboard-search";

/**
 * Suche im Kopfbereich des Dashboards.
 *
 * Geschlossen ist sie ein Icon-Button — die Kopfzeile bleibt ruhig und der
 * Platz gehoert dem Inhalt. Beim Klick faehrt das Feld nach rechts auf und
 * sucht ab dem zweiten Zeichen live ueber alles, was im Dashboard steht.
 *
 * Die Breite animiert ueber `width` statt ueber `scaleX`, weil sich die
 * Schrift im Feld sonst mitverzerren wuerde.
 */

const MIN_QUERY = 2;
const DEBOUNCE_MS = 200;

export function SearchBox({ slug }: { slug: string }) {
  const router = useRouter();
  const t = useTranslations("dashboard.search");
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [data, setData] = useState<DashboardSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);

  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const flat: DashboardSearchHit[] = data?.groups.flatMap((g) => g.hits) ?? [];

  const close = useCallback(() => {
    setOpen(false);
    setQ("");
    setData(null);
    setCursor(0);
    abortRef.current?.abort();
  }, []);

  // Klick nach draussen und Escape schliessen das Feld wieder ein.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  // Live-Suche: pro Tastendruck ein neuer Versuch, der vorherige wird
  // abgebrochen — sonst koennte eine langsamere aeltere Antwort die neuere
  // ueberschreiben.
  useEffect(() => {
    const term = q.trim();
    if (term.length < MIN_QUERY) {
      abortRef.current?.abort();
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      fetch(
        `/api/dashboard/search?slug=${encodeURIComponent(slug)}&q=${encodeURIComponent(term)}`,
        { signal: ac.signal },
      )
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((json: DashboardSearchResult) => {
          setData(json);
          setCursor(0);
          setLoading(false);
        })
        .catch((err: unknown) => {
          if ((err as Error)?.name === "AbortError") return;
          setData({ query: term, total: 0, groups: [] });
          setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q, slug]);

  function go(hit: DashboardSearchHit) {
    close();
    router.push(hit.href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && flat.length) {
      e.preventDefault();
      setCursor((c) => (c + 1) % flat.length);
    } else if (e.key === "ArrowUp" && flat.length) {
      e.preventDefault();
      setCursor((c) => (c - 1 + flat.length) % flat.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = flat[cursor];
      if (hit) return go(hit);
      const term = q.trim();
      if (term) {
        close();
        router.push(`/dashboard/${slug}/search?q=${encodeURIComponent(term)}`);
      }
    }
  }

  const term = q.trim();
  const showPanel = open && term.length >= MIN_QUERY;

  return (
    <div ref={wrapRef} className="relative">
      <div
        className={cn(
          "flex items-center overflow-hidden rounded-xl border transition-[width,background-color,border-color] duration-300 ease-out",
          open
            ? "w-[min(28rem,calc(100vw-8rem))] border-slate-300 bg-white"
            : "w-10 border-transparent bg-slate-100 hover:bg-[var(--action-soft)]",
        )}
      >
        <button
          type="button"
          onClick={() => {
            if (open) return close();
            setOpen(true);
            // Nach dem Aufziehen fokussieren, sonst springt Safari beim
            // Fokus auf ein noch 40px breites Feld die Kopfzeile hoch.
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
          aria-expanded={open}
          aria-label={t("openAria")}
          className="flex h-10 w-10 shrink-0 items-center justify-center text-slate-500 transition hover:text-slate-800"
        >
          <Icon name="search" size={18} />
        </button>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t("placeholder")}
          tabIndex={open ? 0 : -1}
          aria-hidden={!open}
          role="combobox"
          aria-expanded={showPanel}
          aria-controls="dash-search-results"
          aria-autocomplete="list"
          className={cn(
            "h-10 min-w-0 flex-1 bg-transparent pr-3 text-sm text-slate-700 outline-none placeholder:text-slate-400",
            !open && "pointer-events-none",
          )}
        />
        {open && q && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              inputRef.current?.focus();
            }}
            aria-label={t("clear")}
            className="mr-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-[var(--action-soft)] hover:text-slate-700"
          >
            <Icon name="close" size={14} />
          </button>
        )}
      </div>

      {showPanel && (
        <div
          id="dash-search-results"
          role="listbox"
          className="popover-in absolute left-0 top-full z-50 mt-2 w-[min(30rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
        >
          {loading && !data && (
            <p className="px-4 py-6 text-center text-sm text-slate-400">{t("searching")}</p>
          )}

          {data && data.total === 0 && !loading && (
            <div className="px-4 py-8 text-center">
              <span className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                <Icon name="search" size={18} />
              </span>
              <p className="text-sm font-semibold text-slate-700">{t("noResults")}</p>
              <p className="mt-0.5 text-xs text-slate-400">{t("tryOther")}</p>
            </div>
          )}

          {data && data.total > 0 && (
            <div className="max-h-[min(28rem,70vh)] overflow-y-auto py-1.5">
              {data.groups.map((group) => (
                <div key={group.group}>
                  <p className="px-4 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    {t(`groups.${group.group}`)}
                  </p>
                  {group.hits.map((hit) => {
                    const index = flat.indexOf(hit);
                    return (
                      <button
                        key={`${hit.group}-${hit.id}`}
                        type="button"
                        role="option"
                        aria-selected={index === cursor}
                        onMouseEnter={() => setCursor(index)}
                        onClick={() => go(hit)}
                        className={cn(
                          "flex w-full items-center gap-3 px-4 py-2 text-left transition-colors",
                          index === cursor ? "bg-[var(--action-soft)]" : "hover:bg-slate-50",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                            index === cursor
                              ? "bg-[var(--action)] text-[var(--action-fg)]"
                              : "bg-slate-100 text-slate-500",
                          )}
                        >
                          <Icon name={hit.icon} size={15} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-slate-800">
                            {hit.title}
                          </span>
                          {hit.subtitle && (
                            <span className="block truncate text-xs text-slate-400">
                              {hit.subtitle}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {data && data.total > 0 && (
            <button
              type="button"
              onClick={() => {
                close();
                router.push(`/dashboard/${slug}/search?q=${encodeURIComponent(term)}`);
              }}
              className="flex w-full items-center justify-between gap-2 border-t border-slate-100 px-4 py-2.5 text-xs font-semibold text-slate-500 transition hover:bg-[var(--action-soft)] hover:text-slate-800"
            >
              {t("showAll", { count: data.total })}
              <Icon name="arrowRight" size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
