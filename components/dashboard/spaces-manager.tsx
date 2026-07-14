"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  createSpaceAction,
  updateSpaceAction,
  deleteSpaceAction,
  toggleSpaceArchiveAction,
  type ActionState,
} from "@/app/actions/dashboard";
import { Sheet } from "./sheet";
import { Icon, type IconName } from "./icons";
import { Input, Label, Textarea } from "@/components/ui/field";
import { Pill, FormError } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export interface SpaceRowData {
  id: string;
  name: string;
  slug: string;
  type: string;
  visibility: string;
  description: string | null;
  requiredEntitlementKey: string | null;
  isArchived: boolean;
  postCount: number;
}

const TYPES: { value: string; icon: IconName }[] = [
  { value: "FEED", icon: "feed" },
  { value: "FORUM", icon: "forum" },
  { value: "COURSE", icon: "courses" },
  { value: "SHOP", icon: "products" },
  { value: "NEWSLETTER", icon: "newsletter" },
  { value: "EVENTS", icon: "events" },
  { value: "BLOG", icon: "blog" },
  { value: "KNOWLEDGE", icon: "knowledge" },
  { value: "GALLERY", icon: "gallery" },
  { value: "VIDEOS", icon: "videos" },
  { value: "CHAT", icon: "chat" },
  { value: "PODCAST", icon: "podcast" },
  { value: "LINKS", icon: "link" },
  { value: "ADS", icon: "megaphone" },
  { value: "LIVE", icon: "videos" },
  { value: "REQUESTS", icon: "messages" },
  { value: "BOOKING", icon: "clock" },
  { value: "STORIES", icon: "sparkles" },
  { value: "TIPS", icon: "heart" },
  { value: "CALENDAR", icon: "events" },
];

const VIS: { value: string; icon: IconName }[] = [
  { value: "PUBLIC", icon: "feed" },
  { value: "MEMBERS", icon: "members" },
  { value: "PAID", icon: "lock" },
];

const typeIcon: Record<string, IconName> = Object.fromEntries(
  TYPES.map((t) => [t.value, t.icon]),
) as Record<string, IconName>;
const visCls: Record<string, string> = {
  PUBLIC: "bg-green-100 text-green-700",
  MEMBERS: "bg-slate-100 text-slate-600",
  PAID: "bg-violet-100 text-violet-700",
};

const initial: ActionState = {};

export function SpacesManager({
  slug,
  spaces,
}: {
  slug: string;
  spaces: SpaceRowData[];
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<SpaceRowData | null>(null);
  const t = useTranslations("dashboard.spaces");

  const active = spaces.filter((s) => !s.isArchived);
  const archived = spaces.filter((s) => s.isArchived);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:mb-7 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{t("title")}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {t("subtitle", { count: active.length })}
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center justify-center gap-2 self-start rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] sm:self-auto"
        >
          <Icon name="plus" size={18} />
          {t("createSpace")}
        </button>
      </div>

      {spaces.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-16 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <Icon name="spaces" size={24} />
          </span>
          <p className="mt-4 font-semibold text-slate-800">{t("emptyTitle")}</p>
          <p className="mt-1 text-sm text-slate-500">
            {t("emptyText")}
          </p>
          <button
            onClick={() => setCreateOpen(true)}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <Icon name="plus" size={18} />
            {t("createSpace")}
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {active.map((s) => (
            <Row key={s.id} space={s} slug={slug} onEdit={() => setEditing(s)} />
          ))}
          {archived.length > 0 && (
            <>
              <p className="px-1 pb-1 pt-5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                {t("archived")}
              </p>
              {archived.map((s) => (
                <Row key={s.id} space={s} slug={slug} onEdit={() => setEditing(s)} />
              ))}
            </>
          )}
        </div>
      )}

      <Sheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t("createTitle")}
        subtitle={t("createSubtitle")}
        icon="spaces"
      >
        <SpaceForm slug={slug} onDone={() => setCreateOpen(false)} />
      </Sheet>

      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={t("editTitle")}
        subtitle={editing ? `/${editing.slug}` : undefined}
        icon="spaces"
      >
        {editing && (
          <SpaceForm
            key={editing.id}
            slug={slug}
            space={editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Sheet>
    </div>
  );
}

function Row({
  space,
  slug,
  onEdit,
}: {
  space: SpaceRowData;
  slug: string;
  onEdit: () => void;
}) {
  const t = useTranslations("dashboard");
  return (
    <div
      onClick={onEdit}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onEdit();
        }
      }}
      className={cn(
        "group flex cursor-pointer flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm sm:flex-nowrap sm:gap-4",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]",
        space.isArchived && "opacity-60",
      )}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
        <Icon name={typeIcon[space.type] ?? "spaces"} size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-slate-900">{space.name}</p>
          <Pill className="bg-slate-100 text-slate-500">{t(`spaceTypes.${space.type}.label`)}</Pill>
          <Pill className={visCls[space.visibility] ?? visCls.MEMBERS}>{t(`visibility.${space.visibility}.label`)}</Pill>
          {space.requiredEntitlementKey && (
            <span className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
              <Icon name="lock" size={12} className="shrink-0" />
              <span className="truncate">{space.requiredEntitlementKey}</span>
            </span>
          )}
        </div>
        <p className="mt-0.5 text-sm text-slate-400">
          /{space.slug} · {t("spaces.postCount", { count: space.postCount })}
        </p>
      </div>
      {/* Actions: always visible on touch (own row), hover-revealed on desktop. */}
      <div className="flex w-full items-center justify-end gap-1 border-t border-slate-100 pt-2.5 sm:w-auto sm:border-0 sm:pt-0 sm:opacity-0 sm:transition sm:group-hover:opacity-100">
        <span className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500">
          <Icon name="settings" size={16} />
          {t("spaces.edit")}
        </span>
        <form action={toggleSpaceArchiveAction} onClick={(e) => e.stopPropagation()}>
          <input type="hidden" name="tenant" value={slug} />
          <input type="hidden" name="spaceId" value={space.id} />
          <button className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]">
            <Icon name="archive" size={16} />
            {space.isArchived ? t("spaces.reactivate") : t("spaces.archive")}
          </button>
        </form>
      </div>
    </div>
  );
}

function SpaceForm({
  slug,
  space,
  onDone,
}: {
  slug: string;
  space?: SpaceRowData;
  onDone: () => void;
}) {
  const isEdit = !!space;
  const t = useTranslations("dashboard");
  const [state, action, pending] = useActionState(
    isEdit ? updateSpaceAction : createSpaceAction,
    initial,
  );
  const [type, setType] = useState(space?.type ?? "FEED");
  const [visibility, setVisibility] = useState(space?.visibility ?? "MEMBERS");
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  async function performDelete() {
    if (!space) return;
    setDeleting(true);
    const fd = new FormData();
    fd.set("tenant", slug);
    fd.set("spaceId", space.id);
    await deleteSpaceAction(fd);
    onDone();
  }

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="tenant" value={slug} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="visibility" value={visibility} />
      {isEdit && <input type="hidden" name="spaceId" value={space!.id} />}

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-10">
          <FormError message={state.error} />

          <div className="mt-1">
            <Label htmlFor="sf-name">{t("spaces.nameLabel")}</Label>
            <Input
              id="sf-name"
              name="name"
              required
              defaultValue={space?.name}
              placeholder={t("spaces.namePlaceholder")}
              className="text-base"
            />
          </div>

          <div className="mt-8">
            <p className="mb-3 text-sm font-medium text-slate-700">{t("spaces.typeLabel")}</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {TYPES.map((ty) => {
                const sel = ty.value === type;
                return (
                  <button
                    key={ty.value}
                    type="button"
                    onClick={() => setType(ty.value)}
                    className={cn(
                      "flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-colors duration-200",
                      sel
                        ? "border-black bg-slate-50"
                        : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
                    )}
                  >
                    <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl transition", sel ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600")}>
                      <Icon name={ty.icon} size={20} />
                    </span>
                    <span className="text-sm font-semibold text-slate-900">{t(`spaceTypes.${ty.value}.label`)}</span>
                    <span className="text-xs leading-tight text-slate-400">{t(`spaceTypes.${ty.value}.desc`)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-8">
            <p className="mb-3 text-sm font-medium text-slate-700">{t("spaces.visibilityLabel")}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {VIS.map((v) => {
                const sel = v.value === visibility;
                return (
                  <button
                    key={v.value}
                    type="button"
                    onClick={() => setVisibility(v.value)}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors duration-200",
                      sel
                        ? "border-black bg-slate-50"
                        : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
                    )}
                  >
                    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition", sel ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600")}>
                      <Icon name={v.icon} size={18} />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-slate-900">{t(`visibility.${v.value}.label`)}</span>
                      <span className="block text-xs text-slate-400">{t(`visibility.${v.value}.desc`)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {visibility === "PAID" && (
            <div className="mt-6">
              <Label htmlFor="sf-key">{t("spaces.entitlementLabel")}</Label>
              <Input
                id="sf-key"
                name="requiredEntitlementKey"
                defaultValue={space?.requiredEntitlementKey ?? ""}
                placeholder="tier:premium"
              />
              <p className="mt-1 text-xs text-slate-400">{t("spaces.entitlementHint")}</p>
            </div>
          )}

          <div className="mt-6">
            <Label htmlFor="sf-desc">{t("spaces.descLabel")}</Label>
            <Textarea
              id="sf-desc"
              name="description"
              rows={3}
              defaultValue={space?.description ?? undefined}
              placeholder={t("spaces.descPlaceholder")}
            />
          </div>

          {isEdit && (
            <div className="mt-8 border-t border-slate-100 pt-6">
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                disabled={deleting}
                className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
              >
                <Icon name="trash" size={16} />
                {deleting ? t("spaces.deleting") : t("spaces.deleteSpace")}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
        <button type="button" onClick={onDone} className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100">
          {t("spaces.cancel")}
        </button>
        <button type="submit" disabled={pending} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50">
          {pending ? t("spaces.saving") : isEdit ? t("spaces.saveChanges") : t("spaces.createSpace")}
        </button>
      </div>

      {confirmOpen && space && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => {
              if (!deleting) setConfirmOpen(false);
            }}
          />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
                <Icon name="trash" size={18} />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-900">{t("spaces.deleteConfirmTitle")}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {t("spaces.deleteConfirmText", { name: space.name })}
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setConfirmOpen(false)}
                className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 disabled:opacity-50"
              >
                {t("spaces.cancel")}
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={performDelete}
                className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? t("spaces.deleting") : t("spaces.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
