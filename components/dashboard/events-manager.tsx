"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  createEventAction,
  updateEventAction,
  deleteEventAction,
  type ActionState,
} from "@/app/actions/dashboard";
import { Sheet } from "./sheet";
import { Icon } from "./icons";
import { ImageUpload } from "./image-upload";
import { Input, Label, Textarea } from "@/components/ui/field";
import { Pill, FormError } from "@/components/ui/misc";
import { cn, formatDateTime } from "@/lib/utils";

export interface EventRowData {
  id: string;
  title: string;
  description: string | null;
  startsAt: string | Date;
  location: string | null;
  isOnline: boolean;
  meetingUrl: string | null;
  coverUrl: string | null;
  capacity: number | null;
  rsvpCount: number;
}

function toLocalInput(d: string | Date): string {
  const dt = new Date(d);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}T${p(dt.getHours())}:${p(dt.getMinutes())}`;
}

const initial: ActionState = {};

export function EventsManager({
  slug,
  events,
  spaceId,
}: {
  slug: string;
  events: EventRowData[];
  spaceId?: string;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<EventRowData | null>(null);
  const t = useTranslations("dashboard.events");
  const locale = useLocale();

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:mb-7 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{t("title")}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {t("subtitle", { count: events.length })}
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-2 self-start rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] sm:self-auto"
        >
          <Icon name="plus" size={18} />
          {t("create")}
        </button>
      </div>

      {events.length === 0 ? (
        <Empty onCreate={() => setCreateOpen(true)} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e) => (
            <button
              key={e.id}
              onClick={() => setEditing(e)}
              className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-left transition hover:border-slate-300 hover:shadow-md"
            >
              <div className="relative flex aspect-[16/9] items-center justify-center overflow-hidden bg-slate-100">
                {e.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={e.coverUrl} alt={e.title} className="h-full w-full object-cover" />
                ) : (
                  <Icon name="events" size={30} className="text-slate-300" />
                )}
                <span className="absolute left-2 top-2">
                  <Pill className={e.isOnline ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"}>
                    {e.isOnline ? t("online") : t("onsite")}
                  </Pill>
                </span>
              </div>
              <div className="flex flex-1 flex-col p-4">
                <p className="font-semibold text-slate-900">{e.title}</p>
                <p className="mt-1 text-sm text-slate-500">{formatDateTime(e.startsAt, locale)}</p>
                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-sm text-slate-400">
                  <span>{e.location || (e.isOnline ? t("online") : "—")}</span>
                  <span>{t("rsvps", { count: e.rsvpCount })}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <Sheet open={createOpen} onClose={() => setCreateOpen(false)} title={t("sheetCreateTitle")} subtitle={t("sheetCreateSubtitle")} icon="events">
        <EventForm slug={slug} spaceId={spaceId} onDone={() => setCreateOpen(false)} />
      </Sheet>
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={t("sheetEditTitle")} subtitle={editing?.title} icon="events">
        {editing && <EventForm key={editing.id} slug={slug} event={editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </div>
  );
}

function Empty({ onCreate }: { onCreate: () => void }) {
  const t = useTranslations("dashboard.events");
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-16 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <Icon name="events" size={24} />
      </span>
      <p className="mt-4 font-semibold text-slate-800">{t("emptyTitle")}</p>
      <p className="mt-1 text-sm text-slate-500">{t("emptyHint")}</p>
      <button onClick={onCreate} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800">
        <Icon name="plus" size={18} /> {t("create")}
      </button>
    </div>
  );
}

function EventForm({
  slug,
  event,
  spaceId,
  onDone,
}: {
  slug: string;
  event?: EventRowData;
  spaceId?: string;
  onDone: () => void;
}) {
  const isEdit = !!event;
  const [state, action, pending] = useActionState(isEdit ? updateEventAction : createEventAction, initial);
  const [online, setOnline] = useState(event ? event.isOnline : true);
  const [deleting, setDeleting] = useState(false);
  const t = useTranslations("dashboard.events");

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  async function onDelete() {
    if (!event) return;
    if (!confirm(t("confirmDelete", { title: event.title }))) return;
    setDeleting(true);
    const fd = new FormData();
    fd.set("tenant", slug);
    fd.set("eventId", event.id);
    await deleteEventAction(fd);
    onDone();
  }

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="tenant" value={slug} />
      {spaceId && !isEdit && <input type="hidden" name="spaceId" value={spaceId} />}
      <input type="hidden" name="isOnline" value={online ? "true" : ""} />
      {isEdit && <input type="hidden" name="eventId" value={event!.id} />}

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl space-y-6 px-6 py-10">
          <FormError message={state.error} />

          <div>
            <Label>{t("coverLabel")}</Label>
            <ImageUpload tenant={slug} purpose="event-cover" defaultUrl={event?.coverUrl} />
          </div>

          <div>
            <Label htmlFor="ef-title">{t("titleLabel")}</Label>
            <Input id="ef-title" name="title" required defaultValue={event?.title} className="text-base" />
          </div>

          <div>
            <Label htmlFor="ef-start">{t("startLabel")}</Label>
            <Input id="ef-start" name="startsAt" type="datetime-local" required defaultValue={event ? toLocalInput(event.startsAt) : undefined} />
          </div>

          <div>
            <p className="mb-3 text-sm font-medium text-slate-700">{t("format")}</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { v: true, label: t("online"), desc: t("onlineDesc"), icon: "feed" as const },
                { v: false, label: t("onsite"), desc: t("onsiteDesc"), icon: "events" as const },
              ].map((o) => {
                const sel = o.v === online;
                return (
                  <button
                    key={String(o.v)}
                    type="button"
                    onClick={() => setOnline(o.v)}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors duration-200",
                      sel ? "border-black bg-slate-50" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
                    )}
                  >
                    <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg", sel ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600")}>
                      <Icon name={o.icon} size={18} />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-slate-900">{o.label}</span>
                      <span className="block text-xs text-slate-400">{o.desc}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {online ? (
            <div>
              <Label htmlFor="ef-url">{t("meetingUrlLabel")}</Label>
              <Input id="ef-url" name="meetingUrl" type="url" defaultValue={event?.meetingUrl ?? ""} placeholder="https://…" />
            </div>
          ) : (
            <div>
              <Label htmlFor="ef-loc">{t("locationLabel")}</Label>
              <Input id="ef-loc" name="location" defaultValue={event?.location ?? ""} placeholder={t("locationPlaceholder")} />
            </div>
          )}

          <div>
            <Label htmlFor="ef-cap">{t("capacityLabel")}</Label>
            <Input id="ef-cap" name="capacity" type="number" min={0} defaultValue={event?.capacity ?? undefined} placeholder={t("capacityPlaceholder")} />
          </div>

          <div>
            <Label htmlFor="ef-desc">{t("descLabel")}</Label>
            <Textarea id="ef-desc" name="description" rows={3} defaultValue={event?.description ?? undefined} />
          </div>

          {isEdit && (
            <div className="border-t border-slate-100 pt-6">
              <button type="button" onClick={onDelete} disabled={deleting} className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50">
                <Icon name="archive" size={16} />
                {deleting ? t("deleting") : t("deleteEvent")}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
        <button type="button" onClick={onDone} className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100">{t("cancel")}</button>
        <button type="submit" disabled={pending} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50">
          {pending ? t("saving") : isEdit ? t("saveChanges") : t("create")}
        </button>
      </div>
    </form>
  );
}
