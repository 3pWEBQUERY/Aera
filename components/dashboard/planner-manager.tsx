"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  createContentPlanAction,
  updateContentPlanAction,
  deleteContentPlanAction,
  setPlanStatusAction,
  type ActionState,
} from "@/app/actions/planner";
import { Sheet } from "./sheet";
import { Icon, type IconName } from "./icons";
import { ImageUpload } from "./image-upload";
import { Input, Label, Textarea } from "@/components/ui/field";
import { Pill, FormError, EmptyState } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export type PlanType =
  | "POST" | "VIDEO" | "STREAM" | "STORY" | "NEWSLETTER" | "EVENT" | "PRODUCT_DROP" | "OTHER";
export type PlanStatus = "DRAFT" | "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export interface PlanChecklistItem {
  id: string;
  text: string;
  done: boolean;
}
export interface PlanMedia {
  id?: string;
  url: string;
  storageObjectId: string | null;
  contentType: string | null;
}
export interface PlanRow {
  id: string;
  title: string;
  description: string | null;
  type: PlanType;
  status: PlanStatus;
  scheduledAt: string | null;
  spaceId: string | null;
  checklist: PlanChecklistItem[];
  aiNotes: string | null;
  media: PlanMedia[];
  createdAt: string;
}

const TYPES: PlanType[] = ["POST", "VIDEO", "STREAM", "STORY", "NEWSLETTER", "EVENT", "PRODUCT_DROP", "OTHER"];
const STATUSES: PlanStatus[] = ["DRAFT", "PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];

const TYPE_ICON: Record<PlanType, IconName> = {
  POST: "feed",
  VIDEO: "videos",
  STREAM: "videos",
  STORY: "sparkles",
  NEWSLETTER: "newsletter",
  EVENT: "events",
  PRODUCT_DROP: "products",
  OTHER: "events",
};
const STATUS_CLS: Record<PlanStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  PLANNED: "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-red-100 text-red-600",
};

const initial: ActionState = {};
const uid = () => Math.random().toString(36).slice(2, 10);

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function PlannerManager({
  slug,
  plans,
  spaces,
  aiEnabled,
}: {
  slug: string;
  plans: PlanRow[];
  spaces: { id: string; name: string }[];
  aiEnabled: boolean;
}) {
  const t = useTranslations("dashboard.planner");
  const locale = useLocale();
  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
    [locale],
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<PlanRow | null>(null);
  const [nonce, setNonce] = useState(0);
  const [fType, setFType] = useState<PlanType | "">("");
  const [fStatus, setFStatus] = useState<PlanStatus | "">("");

  const shown = plans.filter(
    (p) => (!fType || p.type === fType) && (!fStatus || p.status === fStatus),
  );

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{t("title")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("subtitle")}</p>
        </div>
        <button
          onClick={() => {
            setNonce((n) => n + 1);
            setCreateOpen(true);
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98]"
        >
          <Icon name="plus" size={18} />
          {t("newPlan")}
        </button>
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <PillSelect
          value={fType}
          onChange={(v) => setFType(v as PlanType | "")}
          allLabel={t("filterAllTypes")}
          options={TYPES.map((x) => ({ value: x, label: t(`type.${x}`) }))}
        />
        <PillSelect
          value={fStatus}
          onChange={(v) => setFStatus(v as PlanStatus | "")}
          allLabel={t("filterAllStatus")}
          options={STATUSES.map((x) => ({ value: x, label: t(`status.${x}`) }))}
        />
      </div>

      {shown.length === 0 ? (
        <EmptyState icon="events" title={t("emptyTitle")} hint={t("emptyHint")} />
      ) : (
        <div className="space-y-3">
          {shown.map((p) => {
            const done = p.checklist.filter((c) => c.done).length;
            return (
              <div key={p.id} className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                  <Icon name={TYPE_ICON[p.type]} size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill className="bg-slate-100 text-slate-500">{t(`type.${p.type}`)}</Pill>
                    <Pill className={STATUS_CLS[p.status]}>{t(`status.${p.status}`)}</Pill>
                    {p.scheduledAt && (
                      <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                        <Icon name="clock" size={12} />
                        {dateFmt.format(new Date(p.scheduledAt))}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 font-semibold text-slate-900">{p.title}</p>
                  {p.description && <p className="mt-0.5 line-clamp-2 text-sm text-slate-500">{p.description}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    {p.checklist.length > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                        <Icon name="check" size={13} />
                        {t("checklistProgress", { done, total: p.checklist.length })}
                      </span>
                    )}
                    {p.media.length > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                        <Icon name="gallery" size={13} />
                        {p.media.length}
                      </span>
                    )}
                  </div>
                  {p.media.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {p.media.slice(0, 6).map((m, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={m.id ?? i}
                          src={m.url}
                          alt=""
                          className="h-12 w-12 rounded-lg border border-slate-200 object-cover"
                        />
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditing(p);
                        setNonce((n) => n + 1);
                      }}
                      aria-label={t("edit")}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
                    >
                      <Icon name="edit" size={16} />
                    </button>
                    <form action={deleteContentPlanAction}>
                      <input type="hidden" name="tenant" value={slug} />
                      <input type="hidden" name="planId" value={p.id} />
                      <button
                        type="submit"
                        aria-label={t("delete")}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </form>
                  </div>
                  <form action={setPlanStatusAction}>
                    <input type="hidden" name="tenant" value={slug} />
                    <input type="hidden" name="planId" value={p.id} />
                    <input
                      type="hidden"
                      name="status"
                      value={p.status === "COMPLETED" ? "PLANNED" : "COMPLETED"}
                    />
                    <button
                      type="submit"
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition",
                        p.status === "COMPLETED"
                          ? "text-slate-500 hover:bg-slate-100"
                          : "text-emerald-700 hover:bg-emerald-50",
                      )}
                    >
                      <Icon name="check" size={14} />
                      {p.status === "COMPLETED" ? t("reopen") : t("markComplete")}
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Sheet open={createOpen} onClose={() => setCreateOpen(false)} title={t("createTitle")} icon="events">
        <PlanForm
          key={`create-${nonce}`}
          slug={slug}
          spaces={spaces}
          aiEnabled={aiEnabled}
          onDone={() => setCreateOpen(false)}
        />
      </Sheet>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={t("editTitle")} subtitle={editing?.title} icon="edit">
        {editing && (
          <PlanForm
            key={`edit-${editing.id}-${nonce}`}
            slug={slug}
            spaces={spaces}
            aiEnabled={aiEnabled}
            plan={editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Sheet>
    </div>
  );
}

function PillSelect({
  value,
  onChange,
  allLabel,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  allLabel: string;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600 outline-none transition hover:bg-slate-50 focus:border-slate-900"
    >
      <option value="">{allLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function PlanForm({
  slug,
  spaces,
  plan,
  aiEnabled,
  onDone,
}: {
  slug: string;
  spaces: { id: string; name: string }[];
  plan?: PlanRow;
  aiEnabled: boolean;
  onDone: () => void;
}) {
  const t = useTranslations("dashboard.planner");
  const isEdit = !!plan;
  const [state, action, pending] = useActionState(
    isEdit ? updateContentPlanAction : createContentPlanAction,
    initial,
  );

  const [title, setTitle] = useState(plan?.title ?? "");
  const [description, setDescription] = useState(plan?.description ?? "");
  const [type, setType] = useState<PlanType>(plan?.type ?? "POST");
  const [status, setStatus] = useState<PlanStatus>(plan?.status ?? "PLANNED");
  const [checklist, setChecklist] = useState<PlanChecklistItem[]>(plan?.checklist ?? []);
  const [media, setMedia] = useState<PlanMedia[]>(plan?.media ?? []);
  const [aiNotes, setAiNotes] = useState(plan?.aiNotes ?? "");

  const [newItem, setNewItem] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploadNonce, setUploadNonce] = useState(0);
  const [aiState, setAiState] = useState<"idle" | "loading" | "applied" | "error" | "credits">("idle");

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  function addChecklistItem() {
    const text = newItem.trim();
    if (!text) return;
    setChecklist((c) => [...c, { id: uid(), text: text.slice(0, 200), done: false }]);
    setNewItem("");
  }

  async function runAi() {
    setAiState("loading");
    try {
      const res = await fetch("/api/dashboard/planner/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          type,
          title: title.trim() || undefined,
          description: description.trim() || undefined,
          brief: title.trim() || description.trim() || undefined,
        }),
      });
      if (res.status === 402) {
        setAiState("credits");
        return;
      }
      if (!res.ok) {
        setAiState("error");
        return;
      }
      const data = (await res.json()) as {
        title?: string;
        description?: string;
        checklist?: string[];
        tips?: string[];
        timingHint?: string;
      };
      if (!title.trim() && data.title) setTitle(data.title);
      if (!description.trim() && data.description) setDescription(data.description);
      if (Array.isArray(data.checklist) && data.checklist.length) {
        setChecklist((c) => [
          ...c,
          ...data.checklist!.map((text) => ({ id: uid(), text: text.slice(0, 200), done: false })),
        ]);
      }
      const notes = [data.timingHint, ...(data.tips ?? [])].filter(Boolean).join("\n");
      if (notes) setAiNotes(notes);
      setAiState("applied");
    } catch {
      setAiState("error");
    }
  }

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="tenant" value={slug} />
      {isEdit && <input type="hidden" name="planId" value={plan!.id} />}
      <input type="hidden" name="checklist" value={JSON.stringify(checklist)} />
      <input type="hidden" name="media" value={JSON.stringify(media)} />
      <input type="hidden" name="aiNotes" value={aiNotes} />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl space-y-5 px-6 py-8">
          <FormError message={state.error} />

          {aiEnabled && (
            <button
              type="button"
              onClick={runAi}
              disabled={aiState === "loading"}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--brand)]/30 bg-[var(--brand-soft)] px-4 py-2.5 text-sm font-semibold text-[color:var(--brand)] transition hover:bg-[var(--brand-soft)]/70 disabled:opacity-60"
            >
              <Icon name="sparkles" size={17} />
              {aiState === "loading" ? t("aiLoading") : t("aiButton")}
            </button>
          )}
          {aiState === "applied" && <p className="text-xs font-medium text-emerald-600">{t("aiApplied")}</p>}
          {aiState === "error" && <p className="text-xs font-medium text-red-600">{t("aiError")}</p>}
          {aiState === "credits" && <p className="text-xs font-medium text-red-600">{t("aiOutOfCredits")}</p>}

          <div>
            <Label htmlFor="pl-title">{t("titleLabel")}</Label>
            <Input id="pl-title" name="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder={t("titlePlaceholder")} required autoFocus />
          </div>
          <div>
            <Label htmlFor="pl-desc">{t("descriptionLabel")}</Label>
            <Textarea id="pl-desc" name="description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} placeholder={t("descriptionPlaceholder")} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="pl-type">{t("typeLabel")}</Label>
              <select id="pl-type" name="type" value={type} onChange={(e) => setType(e.target.value as PlanType)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                {TYPES.map((x) => (
                  <option key={x} value={x}>{t(`type.${x}`)}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="pl-status">{t("statusLabel")}</Label>
              <select id="pl-status" name="status" value={status} onChange={(e) => setStatus(e.target.value as PlanStatus)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                {STATUSES.map((x) => (
                  <option key={x} value={x}>{t(`status.${x}`)}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="pl-sched">{t("scheduleLabel")}</Label>
              <Input id="pl-sched" name="scheduledAt" type="datetime-local" defaultValue={toDatetimeLocal(plan?.scheduledAt ?? null)} />
              <p className="mt-1 text-xs text-slate-400">{t("scheduleHint")}</p>
            </div>
            <div>
              <Label htmlFor="pl-space">{t("spaceLabel")}</Label>
              <select id="pl-space" name="spaceId" defaultValue={plan?.spaceId ?? ""} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <option value="">{t("spaceNone")}</option>
                {spaces.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Checklist */}
          <div>
            <Label>{t("checklistLabel")}</Label>
            <div className="mt-1.5 space-y-1.5">
              {checklist.map((c) => (
                <div key={c.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setChecklist((list) => list.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)))}
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded border transition",
                      c.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 text-transparent hover:border-slate-400",
                    )}
                    aria-pressed={c.done}
                  >
                    <Icon name="check" size={13} />
                  </button>
                  <span className={cn("min-w-0 flex-1 truncate text-sm", c.done ? "text-slate-400 line-through" : "text-slate-700")}>{c.text}</span>
                  <button
                    type="button"
                    onClick={() => setChecklist((list) => list.filter((x) => x.id !== c.id))}
                    aria-label={t("delete")}
                    className="text-slate-300 transition hover:text-red-600"
                  >
                    <Icon name="close" size={15} />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addChecklistItem();
                  }
                }}
                maxLength={200}
                placeholder={t("checklistPlaceholder")}
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-900"
              />
              <button type="button" onClick={addChecklistItem} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                {t("checklistAdd")}
              </button>
            </div>
          </div>

          {/* Media */}
          <div>
            <Label>{t("mediaLabel")}</Label>
            {media.length > 0 && (
              <div className="mt-1.5 grid grid-cols-4 gap-2 sm:grid-cols-5">
                {media.map((m, i) => (
                  <div key={m.id ?? `${m.url}-${i}`} className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.url} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setMedia((list) => list.filter((_, idx) => idx !== i))}
                      aria-label={t("mediaRemove")}
                      className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-md bg-black/55 text-white opacity-0 backdrop-blur-sm transition hover:bg-red-600 group-hover:opacity-100"
                    >
                      <Icon name="close" size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => setPickerOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                <Icon name="gallery" size={16} />
                {t("mediaFromLibrary")}
              </button>
            </div>
            <div className="mt-2">
              <ImageUpload
                key={uploadNonce}
                tenant={slug}
                name="plannerUploadTmp"
                purpose="planner"
                onChange={(url) => {
                  if (!url) return;
                  setMedia((list) => [...list, { url, storageObjectId: null, contentType: null }]);
                  setUploadNonce((n) => n + 1);
                }}
              />
            </div>
          </div>

          {aiNotes && (
            <div className="rounded-xl border border-[var(--brand)]/20 bg-[var(--brand-soft)]/50 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-[color:var(--brand)]">
                <Icon name="sparkles" size={13} />
                {t("aiNotesLabel")}
              </p>
              <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{aiNotes}</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
        <button type="button" onClick={onDone} className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100">
          {t("cancel")}
        </button>
        <button type="submit" disabled={pending} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50">
          {pending ? t("saving") : isEdit ? t("save") : t("create")}
        </button>
      </div>

      <LibraryPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        slug={slug}
        onPick={(item) => {
          setMedia((list) =>
            list.some((m) => m.storageObjectId === item.id)
              ? list
              : [...list, { url: item.url, storageObjectId: item.id, contentType: item.contentType }],
          );
        }}
      />
    </form>
  );
}

interface LibItem {
  id: string;
  url: string;
  name: string;
  contentType: string;
}

/** Media-library picker with search (planner). */
function LibraryPicker({
  open,
  onClose,
  slug,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  onPick: (item: LibItem) => void;
}) {
  const t = useTranslations("dashboard.planner");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<LibItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      fetch(`/api/dashboard/media/library?slug=${encodeURIComponent(slug)}&take=120&q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
        .then((data: { items?: LibItem[] }) => {
          if (!cancelled) setItems(data.items ?? []);
        })
        .catch(() => {
          if (!cancelled) setError(true);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [open, slug, q]);

  return (
    <Sheet open={open} onClose={onClose} title={t("pickerTitle")} subtitle={t("pickerSubtitle")} icon="gallery">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-slate-100 p-4">
          <div className="mx-auto flex max-w-xl items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
            <Icon name="search" size={16} className="text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("pickerSearch")}
              className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {loading ? (
            <p className="py-10 text-center text-sm text-slate-400">{t("pickerLoading")}</p>
          ) : error ? (
            <p className="py-10 text-center text-sm text-red-500">{t("pickerError")}</p>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">{t("pickerEmpty")}</p>
          ) : (
            <div className="mx-auto grid max-w-4xl grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onPick(item)}
                  title={item.name}
                  className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 transition hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.url} alt={item.name} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-[1.03]" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}
