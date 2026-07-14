"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  createMediaFolderAction,
  renameMediaFolderAction,
  deleteMediaFolderAction,
  moveMediaToFolderAction,
  renameMediaAction,
  deleteMediaAction,
  type ActionState,
} from "@/app/actions/dashboard";
import { Sheet } from "./sheet";
import { Icon } from "./icons";
import { Input, Label } from "@/components/ui/field";
import { Pill, EmptyState, FormError } from "@/components/ui/misc";
import { cn, formatDateTime } from "@/lib/utils";

export interface MediaFolderData {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
}

/** Curated folder accent colors. Must match FOLDER_COLORS in actions/dashboard. */
export const FOLDER_COLORS = [
  "#C2410C", "#B45309", "#475569", "#BE123C",
  "#6D28D9", "#1D4ED8", "#0F766E", "#15803D",
] as const;
const DEFAULT_FOLDER_COLOR = FOLDER_COLORS[0];

const UNFILED = "__unfiled__";

export interface MediaItemData {
  id: string;
  url: string;
  key: string;
  purpose: string;
  contentType: string | null;
  sizeBytes: number;
  visibility: string;
  displayName: string | null;
  folderId: string | null;
  createdAt: string;
}

const initial: ActionState = {};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function isImage(item: MediaItemData) {
  return (item.contentType ?? "").startsWith("image/");
}

function isVideo(item: MediaItemData) {
  return (item.contentType ?? "").startsWith("video/");
}

function itemLabel(item: MediaItemData) {
  if (item.displayName) return item.displayName;
  const base = item.key.split("/").pop() ?? item.purpose;
  return base;
}

type FilterType = "" | "image" | "video";

export function MediaLibrary({
  slug,
  folders,
  items,
  storage,
}: {
  slug: string;
  folders: MediaFolderData[];
  items: MediaItemData[];
  /** Plan storage quota (Railway bucket): current usage vs. limit. */
  storage: { usedBytes: number; limitBytes: number };
}) {
  const t = useTranslations("dashboard.media");
  const locale = useLocale();
  const router = useRouter();
  const nf = new Intl.NumberFormat(locale);

  // ---- Direct uploads into the library (purpose "library") ----
  const uploadRef = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<{ done: number; total: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function uploadFiles(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (files.length === 0) return;
    setUploadError(null);
    setUploadState({ done: 0, total: files.length });
    for (let i = 0; i < files.length; i++) {
      const fd = new FormData();
      fd.set("file", files[i]);
      fd.set("tenant", slug);
      fd.set("purpose", "library");
      try {
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          setUploadError(j.error ?? t("uploadFailed", { name: files[i].name }));
          // Quota errors abort the batch — the rest would fail identically.
          if (res.status === 413) break;
        }
      } catch {
        setUploadError(t("uploadFailed", { name: files[i].name }));
      }
      setUploadState({ done: i + 1, total: files.length });
    }
    setUploadState(null);
    router.refresh();
  }

  const usedPct = storage.limitBytes > 0
    ? Math.min(100, (storage.usedBytes / storage.limitBytes) * 100)
    : 0;

  const [q, setQ] = useState("");
  const [type, setType] = useState<FilterType>("");
  const [active, setActive] = useState<string | null>(UNFILED);
  const [createOpen, setCreateOpen] = useState(false);
  const [renameFolder, setRenameFolder] = useState<MediaFolderData | null>(null);
  const [editing, setEditing] = useState<MediaItemData | null>(null);
  const [renaming, setRenaming] = useState<MediaItemData | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((item) => {
      if (type === "image" && !isImage(item)) return false;
      if (type === "video" && !isVideo(item)) return false;
      if (!needle) return true;
      const hay = `${itemLabel(item)} ${item.purpose} ${item.key}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [items, q, type]);

  const byFolder = useMemo(() => {
    const map = new Map<string | null, MediaItemData[]>();
    map.set(null, []);
    for (const f of folders) map.set(f.id, []);
    for (const item of filtered) {
      const key = item.folderId && map.has(item.folderId) ? item.folderId : null;
      map.get(key)!.push(item);
    }
    return map;
  }, [filtered, folders]);

  const stats = useMemo(
    () => ({
      all: items.length,
      images: items.filter(isImage).length,
      videos: items.filter(isVideo).length,
    }),
    [items],
  );

  function openFolder(id: string) {
    setActive((prev) => (prev === id ? null : id));
  }

  function onDragStart(id: string) {
    dragId.current = id;
  }

  function onDrop(folderId: string | null) {
    const objectId = dragId.current;
    dragId.current = null;
    setDragOverFolder(null);
    if (!objectId) return;
    const item = items.find((i) => i.id === objectId);
    if (!item) return;
    if ((item.folderId ?? null) === folderId) return;

    const fd = new FormData();
    fd.set("tenant", slug);
    fd.set("objectId", objectId);
    fd.set("folderId", folderId ?? "");
    startTransition(() => {
      void moveMediaToFolderAction(fd);
    });
  }

  const tabs: { value: FilterType; label: string; count: number }[] = [
    { value: "", label: t("tabAll"), count: stats.all },
    { value: "image", label: t("tabImages"), count: stats.images },
    { value: "video", label: t("tabVideos"), count: stats.videos },
  ];

  const unfiled = byFolder.get(null) ?? [];

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white">
            <Icon name="gallery" size={20} />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">{t("title")}</h1>
              <Pill className="bg-slate-100 text-slate-500">{nf.format(items.length)}</Pill>
            </div>
            <p className="text-sm text-slate-400">{t("subtitle")}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/dashboard/${slug}/media/studio`}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <Icon name="sparkles" size={17} className="text-slate-400" />
            {t("openStudio")}
          </Link>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <Icon name="archive" size={17} className="text-slate-400" />
            {t("createFolder")}
          </button>
          <button
            type="button"
            disabled={!!uploadState}
            onClick={() => uploadRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] disabled:opacity-60"
          >
            <Icon name={uploadState ? "clock" : "plus"} size={18} />
            {uploadState
              ? t("uploadingProgress", { done: uploadState.done, total: uploadState.total })
              : t("uploadMedia")}
          </button>
        </div>
      </div>

      {/* Plan storage meter (Railway bucket) */}
      <div className="mb-5 rounded-2xl border border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-slate-700">{t("storageTitle")}</p>
          <p className="text-sm text-slate-500">
            {t("storageOf", {
              used: formatBytes(storage.usedBytes),
              limit: formatBytes(storage.limitBytes),
            })}
          </p>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              usedPct > 90 ? "bg-red-500" : usedPct > 75 ? "bg-amber-500" : "bg-slate-900",
            )}
            style={{ width: `${Math.max(usedPct, 1)}%` }}
          />
        </div>
      </div>

      {uploadError && (
        <p className="mb-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {uploadError}
        </p>
      )}

      <input
        ref={uploadRef}
        type="file"
        multiple
        accept="image/*,video/*,audio/*"
        className="hidden"
        onChange={(e) => {
          void uploadFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex w-full max-w-md items-center gap-2.5 rounded-full border border-slate-200 bg-white px-4 py-2.5 transition focus-within:border-[var(--brand)] focus-within:ring-2 focus-within:ring-[var(--brand-ring)]">
          <Icon name="search" size={17} className="shrink-0 text-slate-400" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchAria")}
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
        </div>
        <div className="flex items-center gap-1.5" role="group" aria-label={t("filterAria")}>
          {tabs.map((tab) => (
            <button
              key={tab.value || "all"}
              type="button"
              onClick={() => setType(tab.value)}
              aria-pressed={type === tab.value}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]",
                type === tab.value
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              {tab.label} ({nf.format(tab.count)})
            </button>
          ))}
        </div>
      </div>

      {items.length === 0 && folders.length === 0 ? (
        <EmptyState icon="gallery" title={t("emptyTitle")} hint={t("emptyHint")} />
      ) : filtered.length === 0 && folders.length === 0 ? (
        <EmptyState icon="search" title={t("noResultsTitle")} hint={t("noResultsHint", { q })} />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            {folders.map((folder) => (
              <FolderCard
                key={folder.id}
                folder={folder}
                count={(byFolder.get(folder.id) ?? []).length}
                previews={(byFolder.get(folder.id) ?? []).slice(0, 3)}
                active={active === folder.id}
                dropTarget={dragOverFolder === folder.id}
                onOpen={() => openFolder(folder.id)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverFolder(folder.id);
                }}
                onDragLeave={() => setDragOverFolder((v) => (v === folder.id ? null : v))}
                onDrop={(e) => {
                  e.preventDefault();
                  onDrop(folder.id);
                }}
                onSettings={() => setRenameFolder(folder)}
                onDelete={() => {
                  if (!window.confirm(t("confirmDeleteFolder"))) return;
                  const fd = new FormData();
                  fd.set("tenant", slug);
                  fd.set("folderId", folder.id);
                  startTransition(() => {
                    void deleteMediaFolderAction(fd);
                  });
                }}
              />
            ))}
            <FolderCard
              unfiled
              folder={{ id: UNFILED, name: t("unfiled"), color: "#64748B", sortOrder: 0 }}
              count={unfiled.length}
              previews={unfiled.slice(0, 3)}
              active={active === UNFILED}
              dropTarget={dragOverFolder === "__root__"}
              onOpen={() => openFolder(UNFILED)}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverFolder("__root__");
              }}
              onDragLeave={() => setDragOverFolder((v) => (v === "__root__" ? null : v))}
              onDrop={(e) => {
                e.preventDefault();
                onDrop(null);
              }}
            />
          </div>

          {active !== null &&
            (() => {
              const isUnfiled = active === UNFILED;
              const folder = isUnfiled ? null : folders.find((f) => f.id === active);
              if (!isUnfiled && !folder) return null;
              const panelItems = isUnfiled ? unfiled : byFolder.get(active) ?? [];
              const name = isUnfiled ? t("unfiled") : folder!.name;
              const dot = isUnfiled ? "#64748B" : folder!.color;
              return (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white"
                      style={{ backgroundColor: dot, boxShadow: `0 0 0 1px ${dot}33` }}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">
                      {name}
                    </span>
                    <Pill className="bg-slate-100 text-slate-500">
                      {t("itemCount", { count: panelItems.length })}
                    </Pill>
                    <button
                      type="button"
                      onClick={() => setActive(null)}
                      aria-label={t("closeFolder")}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
                    >
                      <Icon name="close" size={16} />
                    </button>
                  </div>
                  <div className="bg-slate-50/50 p-4">
                    {panelItems.length === 0 ? (
                      <p className="py-8 text-center text-sm text-slate-400">
                        {isUnfiled ? t("unfiledEmpty") : t("folderEmpty")}
                      </p>
                    ) : (
                      <MediaGrid
                        items={panelItems}
                        slug={slug}
                        onDragStart={onDragStart}
                        onEdit={setEditing}
                        onRename={setRenaming}
                        folders={folders}
                      />
                    )}
                  </div>
                </div>
              );
            })()}
        </div>
      )}

      <Sheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t("createFolder")}
        subtitle={t("createFolderHint")}
        icon="archive"
      >
        <FolderForm
          slug={slug}
          onDone={() => setCreateOpen(false)}
          action={createMediaFolderAction}
          submitLabel={t("createFolderCta")}
        />
      </Sheet>

      <Sheet
        open={!!renameFolder}
        onClose={() => setRenameFolder(null)}
        title={t("folderSettings")}
        subtitle={renameFolder?.name}
        icon="settings"
      >
        {renameFolder && (
          <FolderForm
            key={renameFolder.id}
            slug={slug}
            folderId={renameFolder.id}
            defaultName={renameFolder.name}
            defaultColor={renameFolder.color}
            onDone={() => setRenameFolder(null)}
            action={renameMediaFolderAction}
            submitLabel={t("save")}
          />
        )}
      </Sheet>

      <Sheet
        open={!!renaming}
        onClose={() => setRenaming(null)}
        title={t("renameMedia")}
        subtitle={renaming ? itemLabel(renaming) : undefined}
        icon="edit"
      >
        {renaming && (
          <RenameMediaForm
            key={renaming.id}
            slug={slug}
            item={renaming}
            onDone={() => setRenaming(null)}
          />
        )}
      </Sheet>

      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={t("editMedia")}
        subtitle={editing ? itemLabel(editing) : undefined}
        icon="gallery"
      >
        {editing && (
          <EditMediaView
            key={editing.id}
            slug={slug}
            item={editing}
            folders={folders}
            onDone={() => setEditing(null)}
            onRename={() => {
              setRenaming(editing);
              setEditing(null);
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

function MediaGrid({
  items,
  slug,
  folders,
  onDragStart,
  onEdit,
  onRename,
}: {
  items: MediaItemData[];
  slug: string;
  folders: MediaFolderData[];
  onDragStart: (id: string) => void;
  onEdit: (item: MediaItemData) => void;
  onRename: (item: MediaItemData) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {items.map((item) => (
        <MediaCard
          key={item.id}
          item={item}
          slug={slug}
          folders={folders}
          onDragStart={onDragStart}
          onEdit={() => onEdit(item)}
          onRename={() => onRename(item)}
        />
      ))}
    </div>
  );
}

function MediaCard({
  item,
  slug,
  folders,
  onDragStart,
  onEdit,
  onRename,
}: {
  item: MediaItemData;
  slug: string;
  folders: MediaFolderData[];
  onDragStart: (id: string) => void;
  onEdit: () => void;
  onRename: () => void;
}) {
  const t = useTranslations("dashboard.media");
  const [, startTransition] = useTransition();

  return (
    <div
      draggable
      onDragStart={() => onDragStart(item.id)}
      className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-white text-left transition hover:border-slate-300 hover:shadow-sm"
    >
      <button
        type="button"
        onClick={onEdit}
        aria-label={t("openAria", { name: itemLabel(item) })}
        className="absolute inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand-ring)]"
      >
        {isImage(item) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.url} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : isVideo(item) ? (
          <span className="flex h-full w-full items-center justify-center bg-slate-900 text-white">
            <Icon name="play" size={26} />
          </span>
        ) : (
          <span className="flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-100 text-slate-500">
            <Icon name="archive" size={26} />
          </span>
        )}
        <span className="absolute inset-x-0 bottom-0 truncate bg-black/50 px-2 py-1 text-[11px] text-white">
          {itemLabel(item)}
        </span>
      </button>
      <div className="absolute right-1.5 top-1.5 z-10">
        <ItemMenu
          item={item}
          folders={folders}
          onEdit={onEdit}
          onRename={onRename}
          onDelete={() => {
            if (!window.confirm(t("confirmDeleteMedia"))) return;
            const fd = new FormData();
            fd.set("tenant", slug);
            fd.set("objectId", item.id);
            startTransition(() => {
              void deleteMediaAction(fd);
            });
          }}
          onMove={(folderId) => {
            const fd = new FormData();
            fd.set("tenant", slug);
            fd.set("objectId", item.id);
            fd.set("folderId", folderId ?? "");
            startTransition(() => {
              void moveMediaToFolderAction(fd);
            });
          }}
        />
      </div>
    </div>
  );
}

/**
 * One "document" peeking out of the folder pocket. Shows the real media item
 * (image cover / video tile / generic file) as a small tilted card.
 */
function PeekCard({
  item,
  className,
}: {
  item?: MediaItemData;
  className: string;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute aspect-[3/4] w-[30%] overflow-hidden rounded-lg bg-white shadow-[0_5px_14px_rgba(0,0,0,0.18)] ring-1 ring-black/5",
        "transition-transform duration-300 ease-out",
        className,
      )}
    >
      {item ? (
        isImage(item) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.url} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover" />
        ) : isVideo(item) ? (
          <span className="flex h-full w-full items-center justify-center bg-slate-900 text-white/90">
            <Icon name="play" size={18} />
          </span>
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-400">
            <Icon name="archive" size={18} />
          </span>
        )
      ) : (
        /* Empty slot: quiet paper card with faint text lines (like the reference). */
        <span className="block h-full w-full bg-white p-2">
          <span className="mt-1 block h-1.5 w-3/4 rounded-full bg-slate-200" />
          <span className="mt-1.5 block h-1.5 w-1/2 rounded-full bg-slate-200" />
        </span>
      )}
    </div>
  );
}

/**
 * CSS-built folder artwork (no raster image): the tile is the folder back in
 * its accent color, up to three real media peek out at the top and a frosted
 * "pocket" with a tab notch covers the lower two thirds.
 */
/**
 * Layered folder artwork. The documents live in an UNCLIPPED layer so they can
 * rise above the tile on hover; the frosted pocket lives in its own CLIPPED
 * layer above them so their lower ends still sit "inside" the folder.
 */
function FolderPocket({ previews }: { previews: MediaItemData[] }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-10">
      {/* Documents — the folder's latest media. On hover they slide up out of
          the folder (the parent card is NOT overflow-hidden). */}
      <PeekCard
        item={previews[2]}
        className="right-[15%] top-[9%] rotate-[13deg] group-hover:-translate-y-[22%] group-hover:rotate-[9deg]"
      />
      <PeekCard
        item={previews[1]}
        className="right-[28%] top-[6%] rotate-[6deg] group-hover:-translate-y-[24%] group-hover:rotate-[2deg]"
      />
      <PeekCard
        item={previews[0]}
        className="left-[24%] top-[4%] w-[34%] -rotate-[8deg] group-hover:-translate-y-[22%] group-hover:-rotate-[4deg]"
      />

      {/* Frosted pocket — clipped to the tile so the rounded corners stay
          clean. On hover the pocket "opens": its edge slides down while the
          documents rise. */}
      <div className="absolute inset-0 overflow-hidden rounded-[28px]">
        <div className="absolute inset-x-0 bottom-0 h-[62%] transition-[height] duration-300 ease-out group-hover:h-[46%]">
          <div
            className="absolute inset-0 bg-gradient-to-b from-white/40 via-white/20 to-white/10 backdrop-blur-[5px]"
            style={{
              clipPath: "polygon(0 16%, 30% 16%, 40% 0, 100% 0, 100% 100%, 0 100%)",
            }}
          />
          {/* Hairline along the pocket edge for definition. */}
          <div
            className="absolute inset-0 bg-white/25"
            style={{
              clipPath:
                "polygon(0 16%, 30% 16%, 40% 0, 100% 0, 100% 2.5%, 40.6% 2.5%, 30.8% 18.2%, 0 18.2%)",
            }}
          />
        </div>
      </div>
    </div>
  );
}

function FolderCard({
  folder,
  count,
  previews,
  active,
  dropTarget,
  unfiled = false,
  onOpen,
  onDragOver,
  onDragLeave,
  onDrop,
  onSettings,
  onDelete,
}: {
  folder: MediaFolderData;
  count: number;
  /** Latest media of this folder — rendered as the peeking documents. */
  previews: MediaItemData[];
  active: boolean;
  dropTarget: boolean;
  unfiled?: boolean;
  onOpen: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onSettings?: () => void;
  onDelete?: () => void;
}) {
  const t = useTranslations("dashboard.media");
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={t("openAria", { name: folder.name })}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        // NOT overflow-hidden: the peeking media and the settings dropdown may
        // extend beyond the tile. Hover/menu lifts the card above neighbours.
        "group relative aspect-[1.04/1] cursor-pointer select-none rounded-[28px]",
        "hover:z-20 focus-within:z-30",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2",
        active && "ring-2 ring-slate-900 ring-offset-2",
      )}
    >
      {/* Tile background — clipped layer for clean rounded corners + glow. */}
      <div
        aria-hidden
        className="absolute inset-0 overflow-hidden rounded-[28px]"
        style={{
          backgroundColor: folder.color,
          // Soft colored glow underneath, like the reference — no hover change.
          boxShadow: `0 22px 44px -22px ${folder.color}99`,
        }}
      />
      <FolderPocket previews={previews} />
      {dropTarget && (
        <div className="pointer-events-none absolute inset-0 z-30 rounded-[28px] ring-[3px] ring-inset ring-white" />
      )}
      <div className="absolute inset-x-0 bottom-0 z-20 flex items-end justify-between gap-3 px-4 pb-3.5 sm:px-5 sm:pb-4">
        <div className="min-w-0 pb-0.5">
          <p className="truncate text-lg font-bold leading-none tracking-[-0.02em] text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.22)] sm:text-xl">
            {folder.name}
          </p>
          <p className="mt-1 truncate text-xs font-medium text-white/85 drop-shadow-[0_1px_3px_rgba(0,0,0,0.22)] sm:text-[13px]">
            {t("itemCount", { count })}
          </p>
        </div>
        {!unfiled && onSettings && onDelete ? (
          <FolderMenu folder={folder} onSettings={onSettings} onDelete={onDelete} />
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/80">
            <Icon name="gallery" size={17} />
          </span>
        )}
      </div>
    </div>
  );
}

/** Gear button + dropdown on a folder card. Opens upward to clear the tile. */
function FolderMenu({
  folder,
  onSettings,
  onDelete,
}: {
  folder: MediaFolderData;
  onSettings: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("dashboard.media");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label={t("folderMenuAria", { name: folder.name })}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-full text-white/95 drop-shadow-sm transition hover:bg-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
      >
        <Icon name="settings" size={19} />
      </button>
      {open && (
        <div
          role="menu"
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-full right-0 z-40 mb-2 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
        >
          <button
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onSettings();
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-100"
          >
            <Icon name="settings" size={15} className="text-slate-400" />
            {t("folderSettings")}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onDelete();
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-red-600 transition hover:bg-red-50"
          >
            <Icon name="trash" size={15} />
            {t("delete")}
          </button>
        </div>
      )}
    </div>
  );
}

function ItemMenu({
  item,
  folders,
  onEdit,
  onRename,
  onDelete,
  onMove,
}: {
  item: MediaItemData;
  folders: MediaFolderData[];
  onEdit: () => void;
  onRename: () => void;
  onDelete: () => void;
  onMove: (folderId: string | null) => void;
}) {
  const t = useTranslations("dashboard.media");
  const [open, setOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setMoveOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setMoveOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
          setMoveOpen(false);
        }}
        aria-label={t("itemMenuAria", { name: itemLabel(item) })}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/90 text-slate-700 shadow transition hover:bg-white sm:opacity-0 sm:group-hover:opacity-100"
      >
        <Icon name="more" size={14} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-1.5 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-100"
          >
            <Icon name="eye" size={15} className="text-slate-400" />
            {t("edit")}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onRename();
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-100"
          >
            <Icon name="edit" size={15} className="text-slate-400" />
            {t("rename")}
          </button>
          {folders.length > 0 && (
            <div className="relative">
              <button
                type="button"
                role="menuitem"
                onClick={() => setMoveOpen((v) => !v)}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-100"
              >
                <span className="flex items-center gap-2.5">
                  <Icon name="archive" size={15} className="text-slate-400" />
                  {t("moveToFolder")}
                </span>
                <Icon
                  name="chevron"
                  size={14}
                  className={cn("text-slate-400 transition", moveOpen && "rotate-180")}
                />
              </button>
              {moveOpen && (
                <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onMove(null);
                    }}
                    className={cn(
                      "flex w-full rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition hover:bg-white",
                      !item.folderId ? "text-slate-900" : "text-slate-600",
                    )}
                  >
                    {t("unfiled")}
                  </button>
                  {folders.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        onMove(f.id);
                      }}
                      className={cn(
                        "flex w-full rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition hover:bg-white",
                        item.folderId === f.id ? "text-slate-900" : "text-slate-600",
                      )}
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-red-600 transition hover:bg-red-50"
          >
            <Icon name="trash" size={15} />
            {t("delete")}
          </button>
        </div>
      )}
    </div>
  );
}

/** Live preview of the folder tile inside the create/settings sheet. */
function FolderPreview({ name, color }: { name: string; color: string }) {
  return (
    <div className="mx-auto w-44">
      <div
        className="relative aspect-[7/6] overflow-hidden rounded-[20px]"
        style={{
          backgroundColor: color,
          boxShadow: `0 14px 28px -14px ${color}99`,
        }}
      >
        <FolderPocket previews={[]} />
        <div className="absolute inset-x-0 bottom-0 z-20 p-3.5">
          <p className="truncate text-[15px] font-bold leading-tight text-white drop-shadow-sm">
            {name}
          </p>
        </div>
      </div>
    </div>
  );
}

function FolderForm({
  slug,
  folderId,
  defaultName = "",
  defaultColor = DEFAULT_FOLDER_COLOR,
  onDone,
  action,
  submitLabel,
}: {
  slug: string;
  folderId?: string;
  defaultName?: string;
  defaultColor?: string;
  onDone: () => void;
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  submitLabel: string;
}) {
  const t = useTranslations("dashboard.media");
  const tc = useTranslations("common");
  const [state, formAction, pending] = useActionState(action, initial);
  const [name, setName] = useState(defaultName);
  const [color, setColor] = useState<string>(
    (FOLDER_COLORS as readonly string[]).includes(defaultColor)
      ? defaultColor
      : DEFAULT_FOLDER_COLOR,
  );

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="tenant" value={slug} />
      <input type="hidden" name="color" value={color} />
      {folderId && <input type="hidden" name="folderId" value={folderId} />}
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-md space-y-6">
          <FolderPreview name={name || t("folderNamePlaceholder")} color={color} />
          <div>
            <Label htmlFor="folder-name">{t("folderNameLabel")}</Label>
            <Input
              id="folder-name"
              name="name"
              required
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("folderNamePlaceholder")}
              autoFocus
            />
          </div>
          <div>
            <Label>{t("folderColorLabel")}</Label>
            <div className="mt-2 flex flex-wrap gap-2.5">
              {FOLDER_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={c}
                  aria-pressed={color === c}
                  className={cn(
                    "h-9 w-9 rounded-full ring-offset-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900",
                    color === c
                      ? "ring-2 ring-slate-900"
                      : "ring-1 ring-black/10 hover:scale-105",
                  )}
                  style={{ backgroundColor: c }}
                >
                  {color === c && (
                    <Icon name="check" size={16} className="mx-auto text-white drop-shadow" />
                  )}
                </button>
              ))}
            </div>
          </div>
          <FormError message={state.error} />
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
        <button
          type="button"
          onClick={onDone}
          className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
        >
          {tc("cancel")}
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          {pending ? t("saving") : submitLabel}
        </button>
      </div>
    </form>
  );
}

function RenameMediaForm({
  slug,
  item,
  onDone,
}: {
  slug: string;
  item: MediaItemData;
  onDone: () => void;
}) {
  const t = useTranslations("dashboard.media");
  const tc = useTranslations("common");
  const [state, formAction, pending] = useActionState(renameMediaAction, initial);

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="tenant" value={slug} />
      <input type="hidden" name="objectId" value={item.id} />
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-md space-y-4">
          <div>
            <Label htmlFor="display-name">{t("displayNameLabel")}</Label>
            <Input
              id="display-name"
              name="displayName"
              maxLength={120}
              defaultValue={item.displayName ?? itemLabel(item)}
              placeholder={t("displayNamePlaceholder")}
              autoFocus
            />
          </div>
          <FormError message={state.error} />
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
        <button
          type="button"
          onClick={onDone}
          className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
        >
          {tc("cancel")}
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          {pending ? t("saving") : t("save")}
        </button>
      </div>
    </form>
  );
}

function EditMediaView({
  slug,
  item,
  folders,
  onDone,
  onRename,
}: {
  slug: string;
  item: MediaItemData;
  folders: MediaFolderData[];
  onDone: () => void;
  onRename: () => void;
}) {
  const t = useTranslations("dashboard.media");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [, startTransition] = useTransition();
  const folder = folders.find((f) => f.id === item.folderId);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl space-y-6 px-6 py-10">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-900">
            {isImage(item) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.url}
                alt={itemLabel(item)}
                className="max-h-96 w-full object-contain"
              />
            ) : isVideo(item) ? (
              <video src={item.url} controls preload="metadata" className="max-h-96 w-full" />
            ) : (
              <div className="flex h-48 items-center justify-center text-white">
                <Icon name="archive" size={36} />
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <InfoRow label={t("name")} value={itemLabel(item)} />
            <InfoRow label={t("purpose")} value={item.purpose} />
            <InfoRow label={t("type")} value={item.contentType ?? t("unknown")} />
            <InfoRow label={t("size")} value={formatBytes(item.sizeBytes)} />
            <InfoRow label={t("folder")} value={folder?.name ?? t("unfiled")} />
            <InfoRow label={t("date")} value={formatDateTime(item.createdAt, locale)} />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onRename}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <Icon name="edit" size={15} className="text-slate-400" />
              {t("rename")}
            </button>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <Icon name="external" size={15} className="text-slate-400" />
              {t("openInNewTab")}
            </a>
            {isImage(item) && (
              <Link
                href={`/dashboard/${slug}/media/studio?image=${item.id}`}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <Icon name="sparkles" size={15} className="text-slate-400" />
                {t("openInStudio")}
              </Link>
            )}
          </div>

          <div className="rounded-2xl border border-red-200 bg-red-50/40 p-4">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-red-700">
              <Icon name="alert" size={15} />
              {t("dangerZone")}
            </p>
            <button
              type="button"
              onClick={() => {
                if (!window.confirm(t("confirmDeleteMedia"))) return;
                const fd = new FormData();
                fd.set("tenant", slug);
                fd.set("objectId", item.id);
                startTransition(() => {
                  void deleteMediaAction(fd).then(onDone);
                });
              }}
              className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
            >
              {t("delete")}
            </button>
            <p className="mt-2 text-xs text-red-600/90">{t("dangerDesc")}</p>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
        <button
          type="button"
          onClick={onDone}
          className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
        >
          {tc("cancel")}
        </button>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="shrink-0 text-sm text-slate-400">{label}</span>
      <span className="min-w-0 truncate text-right text-sm font-medium text-slate-800">{value}</span>
    </div>
  );
}
