"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Sheet } from "./sheet";
import { Icon } from "./icons";
import { Pill } from "@/components/ui/misc";
import { formatDateTime } from "@/lib/utils";
import { EventForm, type EventRowData } from "./events-manager";

export interface AggregatedEntry {
  id: string;
  title: string;
  when: string | Date;
  kind: "event" | "live" | "post";
}

const KIND_CLS: Record<AggregatedEntry["kind"], string> = {
  event: "bg-blue-100 text-blue-700",
  live: "bg-red-100 text-red-700",
  post: "bg-slate-100 text-slate-600",
};

/**
 * Calendar space manager: own entries (events that live on the calendar
 * space, created/edited via the full-screen Sheet popover) plus a read-only
 * aggregation of everything scheduled elsewhere in the community.
 */
export function CalendarManager({
  slug,
  spaceId,
  spaceName,
  description,
  own,
  aggregated,
}: {
  slug: string;
  spaceId: string;
  spaceName: string;
  description: string | null;
  own: EventRowData[];
  aggregated: AggregatedEntry[];
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<EventRowData | null>(null);
  const t = useTranslations("dashboard.calendar");
  const locale = useLocale();

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:mb-7 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{spaceName}</h1>
          <p className="mt-1 text-sm text-slate-500">{description || t("subtitle")}</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-2 self-start rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] sm:self-auto"
        >
          <Icon name="plus" size={18} />
          {t("create")}
        </button>
      </div>

      {own.length === 0 && aggregated.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-16 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <Icon name="events" size={24} />
          </span>
          <p className="mt-4 font-semibold text-slate-800">{t("emptyTitle")}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{t("emptyHint")}</p>
          <button
            onClick={() => setCreateOpen(true)}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <Icon name="plus" size={18} /> {t("create")}
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {own.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
                {t("own")}
              </h2>
              <div className="space-y-2">
                {own.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => setEditing(e)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-slate-300 hover:shadow-sm"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-900">{e.title}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {formatDateTime(e.startsAt, locale)}
                        {e.location ? ` · ${e.location}` : ""}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-slate-400">
                      {t("rsvps", { count: e.rsvpCount })}
                      <Icon name="chevron" size={14} className="-rotate-90" />
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {aggregated.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
                {t("auto")}
              </h2>
              <div className="space-y-2">
                {aggregated.map((x) => (
                  <div
                    key={x.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-900">{x.title}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">{formatDateTime(x.when, locale)}</span>
                    </span>
                    <Pill className={KIND_CLS[x.kind]}>{t(`kind.${x.kind}`)}</Pill>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-400">{t("autoHint")}</p>
            </section>
          )}
        </div>
      )}

      <Sheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t("sheetCreateTitle")}
        subtitle={spaceName}
        icon="events"
      >
        <EventForm slug={slug} spaceId={spaceId} onDone={() => setCreateOpen(false)} />
      </Sheet>
      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={t("sheetEditTitle")}
        subtitle={editing?.title}
        icon="events"
      >
        {editing && (
          <EventForm key={editing.id} slug={slug} event={editing} onDone={() => setEditing(null)} />
        )}
      </Sheet>
    </div>
  );
}
