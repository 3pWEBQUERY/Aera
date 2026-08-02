"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "./icons";
import { RichTextEditor } from "./rich-text-editor";
import { uploadMediaFile } from "@/lib/client-upload";
import {
  MAX_BLOCKS,
  MAX_PAGES,
  emptyBlock,
  newBlockId,
  PAGE_BLOCK_TYPES,
  type PageBlock,
  type PageBlockType,
} from "@/lib/community-pages";
import {
  PAGE_TEMPLATES,
  TEMPLATE_ICON,
  templateBlocks,
  type PageTemplateKey,
} from "@/lib/community-page-templates";
import {
  createCommunityPageAction,
  deleteCommunityPageAction,
  reorderCommunityPagesAction,
  saveCommunityPageAction,
} from "@/app/actions/community-pages";

/**
 * Der Bereich "Seiten" des Layout-Editors.
 *
 * Anders als die uebrigen Bereiche speichert er nicht ueber das umgebende
 * Formular: Seiten liegen in einer eigenen Tabelle, und ein <form> im <form>
 * gibt es in HTML nicht. Die Server-Actions werden deshalb direkt gerufen.
 * Fuer den Creator heisst das: der Knopf oben speichert das Layout, der Knopf
 * in der Seite speichert die Seite — jeweils dort, wo er hingehoert.
 */

export interface EditablePage {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: "DRAFT" | "PUBLISHED";
  visibility: "PUBLIC" | "MEMBERS" | "PAID";
  showInNav: boolean;
  blocks: PageBlock[];
}

const BLOCK_ICON: Record<PageBlockType, IconName> = {
  TEXT: "feed",
  IMAGE: "gallery",
  GALLERY: "grid",
  VIDEO: "videos",
  QUOTE: "megaphone",
  FAQ: "info",
  CTA: "bolt",
  LINKS: "link",
  STATS: "trendingUp",
  DIVIDER: "eraser",
};

const INPUT =
  "w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-ring)]";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-slate-800">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

/** Segmentierte Auswahl — kompakter als Radios, wenn es zwei bis drei Werte sind. */
function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { key: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-xl border border-slate-200 p-0.5">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={cn(
            "flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
            value === o.key
              ? "bg-[var(--action)] text-[var(--action-fg)]"
              : "text-slate-500 hover:bg-slate-100",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Bild- oder Videofeld mit Upload. Zeigt die Vorschau, sobald etwas dasteht. */
function MediaField({
  slug,
  label,
  hint,
  url,
  kind,
  onChange,
}: {
  slug: string;
  label: string;
  hint?: string;
  url: string;
  kind: "image" | "video";
  onChange: (url: string) => void;
}) {
  const t = useTranslations("dashboard.pages");
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await uploadMediaFile({ file, tenant: slug, purpose: "page-block" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div>
      <span className="mb-1.5 block text-sm font-semibold text-slate-800">{label}</span>
      {url ? (
        <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          {kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="h-36 w-full object-cover" />
          ) : (
            <video src={url} className="h-36 w-full bg-slate-900 object-contain" />
          )}
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label={t("removeMedia")}
            className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-slate-500 shadow-sm transition hover:text-red-600"
          >
            <Icon name="trash" size={15} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          className="flex h-24 w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 text-slate-500 transition hover:border-[var(--brand)] hover:text-slate-700 disabled:opacity-50"
        >
          <Icon name={kind === "image" ? "gallery" : "videos"} size={20} />
          <span className="text-xs font-semibold">{busy ? t("uploading") : t("upload")}</span>
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept={kind === "image" ? "image/*" : "video/*"}
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0])}
      />
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
      {hint && !url && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </div>
  );
}

/** Kopfzeile einer wiederholbaren Zeile: greifen, zuklappen, loeschen. */
function RowFrame({
  onRemove,
  removeLabel,
  children,
}: {
  onRemove: () => void;
  removeLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative rounded-xl border border-slate-200 bg-slate-50 p-3 pr-10">
      <div className="space-y-2">{children}</div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
      >
        <Icon name="trash" size={14} />
      </button>
    </div>
  );
}

/* ------------------------------------------------------- Baustein-Editoren */

function BlockFields({
  slug,
  block,
  onChange,
}: {
  slug: string;
  block: PageBlock;
  onChange: (next: PageBlock) => void;
}) {
  const t = useTranslations("dashboard.pages");
  const patch = (fields: Partial<PageBlock>) => onChange({ ...block, ...fields } as PageBlock);

  switch (block.type) {
    case "TEXT":
      return (
        <div className="space-y-3">
          <Field label={t("fieldHeading")}>
            <input
              className={INPUT}
              value={block.title}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder={t("optional")}
            />
          </Field>
          <div>
            <span className="mb-1.5 block text-sm font-semibold text-slate-800">
              {t("fieldText")}
            </span>
            {/*
             * Der Editor traegt seinen Text sonst ueber ein verstecktes Feld ins
             * umgebende Formular. Hier gibt es keins, also fangen wir ihn ab.
             */}
            <RichTextEditor
              tenant={slug}
              defaultHtml={block.html}
              onChange={(html) => patch({ html })}
              name={`page-block-${block.id}`}
            />
          </div>
        </div>
      );

    case "IMAGE":
      return (
        <div className="space-y-3">
          <MediaField
            slug={slug}
            kind="image"
            label={t("fieldImage")}
            url={block.url}
            onChange={(url) => patch({ url })}
          />
          <Field label={t("fieldAlt")} hint={t("fieldAltHint")}>
            <input
              className={INPUT}
              value={block.alt}
              onChange={(e) => patch({ alt: e.target.value })}
            />
          </Field>
          <Field label={t("fieldCaption")}>
            <input
              className={INPUT}
              value={block.caption}
              onChange={(e) => patch({ caption: e.target.value })}
              placeholder={t("optional")}
            />
          </Field>
          <Field label={t("fieldWidth")}>
            <Segmented
              value={block.width}
              onChange={(width) => patch({ width })}
              options={[
                { key: "INSET" as const, label: t("widthINSET") },
                { key: "WIDE" as const, label: t("widthWIDE") },
                { key: "FULL" as const, label: t("widthFULL") },
              ]}
            />
          </Field>
        </div>
      );

    case "GALLERY":
      return (
        <div className="space-y-3">
          <Field label={t("fieldHeading")}>
            <input
              className={INPUT}
              value={block.title}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder={t("optional")}
            />
          </Field>
          <Field label={t("fieldLayout")}>
            <Segmented
              value={block.layout}
              onChange={(layout) => patch({ layout })}
              options={[
                { key: "GRID" as const, label: t("layoutGRID") },
                { key: "ROW" as const, label: t("layoutROW") },
              ]}
            />
          </Field>
          <div className="space-y-2">
            {block.images.map((img, i) => (
              <RowFrame
                key={img.id}
                removeLabel={t("removeImage")}
                onRemove={() => patch({ images: block.images.filter((x) => x.id !== img.id) })}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt="" className="h-20 w-full rounded-lg object-cover" />
                <input
                  className={INPUT}
                  value={img.alt}
                  placeholder={t("fieldAlt")}
                  onChange={(e) => {
                    const images = [...block.images];
                    images[i] = { ...img, alt: e.target.value };
                    patch({ images });
                  }}
                />
              </RowFrame>
            ))}
          </div>
          <MediaField
            slug={slug}
            kind="image"
            label={t("addImage")}
            url=""
            onChange={(url) =>
              url && patch({ images: [...block.images, { id: newBlockId(), url, alt: "" }] })
            }
          />
        </div>
      );

    case "VIDEO":
      return (
        <div className="space-y-3">
          <MediaField
            slug={slug}
            kind="video"
            label={t("fieldVideo")}
            hint={t("fieldVideoHint")}
            url={block.url}
            onChange={(url) => patch({ url })}
          />
          <MediaField
            slug={slug}
            kind="image"
            label={t("fieldPoster")}
            url={block.posterUrl}
            onChange={(posterUrl) => patch({ posterUrl })}
          />
          <Field label={t("fieldHeading")}>
            <input
              className={INPUT}
              value={block.title}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder={t("optional")}
            />
          </Field>
          <Field label={t("fieldCaption")}>
            <input
              className={INPUT}
              value={block.caption}
              onChange={(e) => patch({ caption: e.target.value })}
              placeholder={t("optional")}
            />
          </Field>
        </div>
      );

    case "QUOTE":
      return (
        <div className="space-y-3">
          <Field label={t("fieldQuote")}>
            <textarea
              className={cn(INPUT, "min-h-24 resize-y")}
              value={block.text}
              onChange={(e) => patch({ text: e.target.value })}
            />
          </Field>
          <Field label={t("fieldAuthor")}>
            <input
              className={INPUT}
              value={block.author}
              onChange={(e) => patch({ author: e.target.value })}
              placeholder={t("optional")}
            />
          </Field>
          <Field label={t("fieldRole")}>
            <input
              className={INPUT}
              value={block.role}
              onChange={(e) => patch({ role: e.target.value })}
              placeholder={t("optional")}
            />
          </Field>
        </div>
      );

    case "FAQ":
      return (
        <div className="space-y-3">
          <Field label={t("fieldHeading")}>
            <input
              className={INPUT}
              value={block.title}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder={t("optional")}
            />
          </Field>
          <div className="space-y-2">
            {block.items.map((item, i) => (
              <RowFrame
                key={item.id}
                removeLabel={t("removeEntry")}
                onRemove={() => patch({ items: block.items.filter((x) => x.id !== item.id) })}
              >
                <input
                  className={INPUT}
                  value={item.question}
                  placeholder={t("fieldQuestion")}
                  onChange={(e) => {
                    const items = [...block.items];
                    items[i] = { ...item, question: e.target.value };
                    patch({ items });
                  }}
                />
                <textarea
                  className={cn(INPUT, "min-h-20 resize-y")}
                  value={item.answer}
                  placeholder={t("fieldAnswer")}
                  onChange={(e) => {
                    const items = [...block.items];
                    items[i] = { ...item, answer: e.target.value };
                    patch({ items });
                  }}
                />
              </RowFrame>
            ))}
          </div>
          <AddRow
            label={t("addQuestion")}
            onClick={() =>
              patch({
                items: [...block.items, { id: newBlockId(), question: "", answer: "" }],
              })
            }
          />
        </div>
      );

    case "CTA":
      return (
        <div className="space-y-3">
          <Field label={t("fieldHeading")}>
            <input
              className={INPUT}
              value={block.title}
              onChange={(e) => patch({ title: e.target.value })}
            />
          </Field>
          <Field label={t("fieldText")}>
            <textarea
              className={cn(INPUT, "min-h-20 resize-y")}
              value={block.text}
              onChange={(e) => patch({ text: e.target.value })}
              placeholder={t("optional")}
            />
          </Field>
          <Field label={t("fieldButtonLabel")}>
            <input
              className={INPUT}
              value={block.label}
              onChange={(e) => patch({ label: e.target.value })}
            />
          </Field>
          <Field label={t("fieldLink")} hint={t("fieldLinkHint")}>
            <input
              className={INPUT}
              value={block.href}
              onChange={(e) => patch({ href: e.target.value })}
              placeholder="https://…"
            />
          </Field>
          <Field label={t("fieldStyle")}>
            <Segmented
              value={block.style}
              onChange={(style) => patch({ style })}
              options={[
                { key: "SOLID" as const, label: t("styleSOLID") },
                { key: "OUTLINE" as const, label: t("styleOUTLINE") },
              ]}
            />
          </Field>
        </div>
      );

    case "LINKS":
      return (
        <div className="space-y-3">
          <Field label={t("fieldHeading")}>
            <input
              className={INPUT}
              value={block.title}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder={t("optional")}
            />
          </Field>
          <div className="space-y-2">
            {block.items.map((item, i) => (
              <RowFrame
                key={item.id}
                removeLabel={t("removeEntry")}
                onRemove={() => patch({ items: block.items.filter((x) => x.id !== item.id) })}
              >
                <input
                  className={INPUT}
                  value={item.label}
                  placeholder={t("fieldLabel")}
                  onChange={(e) => {
                    const items = [...block.items];
                    items[i] = { ...item, label: e.target.value };
                    patch({ items });
                  }}
                />
                <input
                  className={INPUT}
                  value={item.description}
                  placeholder={t("fieldDescriptionShort")}
                  onChange={(e) => {
                    const items = [...block.items];
                    items[i] = { ...item, description: e.target.value };
                    patch({ items });
                  }}
                />
                <input
                  className={INPUT}
                  value={item.href}
                  placeholder="https://…"
                  onChange={(e) => {
                    const items = [...block.items];
                    items[i] = { ...item, href: e.target.value };
                    patch({ items });
                  }}
                />
              </RowFrame>
            ))}
          </div>
          <AddRow
            label={t("addLink")}
            onClick={() =>
              patch({
                items: [
                  ...block.items,
                  { id: newBlockId(), label: "", description: "", href: "" },
                ],
              })
            }
          />
        </div>
      );

    case "STATS":
      return (
        <div className="space-y-3">
          <Field label={t("fieldHeading")}>
            <input
              className={INPUT}
              value={block.title}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder={t("optional")}
            />
          </Field>
          <div className="space-y-2">
            {block.items.map((item, i) => (
              <RowFrame
                key={item.id}
                removeLabel={t("removeEntry")}
                onRemove={() => patch({ items: block.items.filter((x) => x.id !== item.id) })}
              >
                <input
                  className={INPUT}
                  value={item.value}
                  placeholder={t("fieldValue")}
                  onChange={(e) => {
                    const items = [...block.items];
                    items[i] = { ...item, value: e.target.value };
                    patch({ items });
                  }}
                />
                <input
                  className={INPUT}
                  value={item.label}
                  placeholder={t("fieldLabel")}
                  onChange={(e) => {
                    const items = [...block.items];
                    items[i] = { ...item, label: e.target.value };
                    patch({ items });
                  }}
                />
              </RowFrame>
            ))}
          </div>
          <AddRow
            label={t("addStat")}
            onClick={() =>
              patch({ items: [...block.items, { id: newBlockId(), value: "", label: "" }] })
            }
          />
        </div>
      );

    case "DIVIDER":
      return (
        <Field label={t("fieldDividerStyle")}>
          <Segmented
            value={block.style}
            onChange={(style) => patch({ style })}
            options={[
              { key: "LINE" as const, label: t("dividerLINE") },
              { key: "SPACE" as const, label: t("dividerSPACE") },
              { key: "DOTS" as const, label: t("dividerDOTS") },
            ]}
          />
        </Field>
      );
  }
}

function AddRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-[var(--brand)] hover:text-slate-900"
    >
      <Icon name="plus" size={15} />
      {label}
    </button>
  );
}

/* --------------------------------------------------------- Baustein-Liste */

function BlockCard({
  slug,
  block,
  open,
  onToggle,
  onChange,
  onRemove,
  dragProps,
}: {
  slug: string;
  block: PageBlock;
  open: boolean;
  onToggle: () => void;
  onChange: (next: PageBlock) => void;
  onRemove: () => void;
  dragProps: React.HTMLAttributes<HTMLDivElement>;
}) {
  const t = useTranslations("dashboard.pages");
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white" {...dragProps}>
      <div className="flex items-center gap-2 p-2.5">
        <Icon
          name="grip"
          size={16}
          className="shrink-0 cursor-grab text-slate-300 active:cursor-grabbing"
        />
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
            <Icon name={BLOCK_ICON[block.type]} size={15} />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
            {t(`blockType.${block.type}`)}
          </span>
          <Icon
            name="chevron"
            size={16}
            className={cn("shrink-0 text-slate-400 transition-transform", open && "rotate-180")}
          />
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={t("removeBlock")}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
        >
          <Icon name="trash" size={15} />
        </button>
      </div>
      {open && (
        <div className="border-t border-slate-100 p-3.5">
          <BlockFields slug={slug} block={block} onChange={onChange} />
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------- Seiten-Editor */

function PageEditor({
  slug,
  page,
  onBack,
  onSaved,
  onDeleted,
}: {
  slug: string;
  page: EditablePage;
  onBack: () => void;
  onSaved: (next: EditablePage) => void;
  onDeleted: () => void;
}) {
  const t = useTranslations("dashboard.pages");
  const [draft, setDraft] = useState<EditablePage>(page);
  const [openBlock, setOpenBlock] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();
  const dragFrom = useRef<number | null>(null);

  function edit(fields: Partial<EditablePage>) {
    setDraft((d) => ({ ...d, ...fields }));
    setDirty(true);
  }

  function setBlocks(blocks: PageBlock[]) {
    edit({ blocks });
  }

  function save() {
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set("tenant", slug);
      fd.set("pageId", draft.id);
      fd.set(
        "payload",
        JSON.stringify({
          title: draft.title,
          slug: draft.slug,
          description: draft.description,
          status: draft.status,
          visibility: draft.visibility,
          showInNav: draft.showInNav,
          blocks: draft.blocks,
        }),
      );
      const res = await saveCommunityPageAction({}, fd);
      if (res.error) {
        setError(res.error);
        return;
      }
      setDirty(false);
      onSaved(draft);
    });
  }

  function remove() {
    start(async () => {
      const fd = new FormData();
      fd.set("tenant", slug);
      fd.set("pageId", draft.id);
      const res = await deleteCommunityPageAction({}, fd);
      if (res.error) {
        setError(res.error);
        return;
      }
      onDeleted();
    });
  }

  const full = draft.blocks.length >= MAX_BLOCKS;

  return (
    <div className="px-6 py-6">
      <button
        type="button"
        onClick={onBack}
        className="mb-5 flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-slate-900"
      >
        <Icon name="chevron" size={15} className="rotate-90" />
        {t("allPages")}
      </button>

      <div className="space-y-5">
        <Field label={t("fieldTitle")}>
          <input
            className={INPUT}
            value={draft.title}
            onChange={(e) => edit({ title: e.target.value })}
          />
        </Field>

        <Field label={t("fieldSlug")} hint={`/c/${slug}/p/${draft.slug || "…"}`}>
          <input
            className={INPUT}
            value={draft.slug}
            onChange={(e) => edit({ slug: e.target.value })}
          />
        </Field>

        <Field label={t("fieldDescription")} hint={t("fieldDescriptionHint")}>
          <textarea
            className={cn(INPUT, "min-h-20 resize-y")}
            value={draft.description}
            onChange={(e) => edit({ description: e.target.value })}
          />
        </Field>

        <Field label={t("fieldStatus")}>
          <Segmented
            value={draft.status}
            onChange={(status) => edit({ status })}
            options={[
              { key: "DRAFT" as const, label: t("statusDRAFT") },
              { key: "PUBLISHED" as const, label: t("statusPUBLISHED") },
            ]}
          />
        </Field>

        <Field label={t("fieldVisibility")}>
          <Segmented
            value={draft.visibility}
            onChange={(visibility) => edit({ visibility })}
            options={[
              { key: "PUBLIC" as const, label: t("visPUBLIC") },
              { key: "MEMBERS" as const, label: t("visMEMBERS") },
              { key: "PAID" as const, label: t("visPAID") },
            ]}
          />
        </Field>

        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={draft.showInNav}
            onChange={(e) => edit({ showInNav: e.target.checked })}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-[var(--brand)]"
          />
          <span>
            <span className="block text-sm font-semibold text-slate-800">{t("fieldShowInNav")}</span>
            <span className="block text-xs text-slate-400">{t("fieldShowInNavHint")}</span>
          </span>
        </label>
      </div>

      {/* ------------------------------------------------------- Bausteine */}
      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">{t("blocksTitle")}</h3>
          <span className="text-xs text-slate-400">
            {draft.blocks.length}/{MAX_BLOCKS}
          </span>
        </div>

        <div className="space-y-2">
          {draft.blocks.map((block, index) => (
            <BlockCard
              key={block.id}
              slug={slug}
              block={block}
              open={openBlock === block.id}
              onToggle={() => setOpenBlock((id) => (id === block.id ? null : block.id))}
              onChange={(next) => {
                const blocks = [...draft.blocks];
                blocks[index] = next;
                setBlocks(blocks);
              }}
              onRemove={() => setBlocks(draft.blocks.filter((b) => b.id !== block.id))}
              dragProps={{
                draggable: true,
                onDragStart: () => {
                  dragFrom.current = index;
                },
                onDragOver: (e) => e.preventDefault(),
                onDrop: () => {
                  const from = dragFrom.current;
                  dragFrom.current = null;
                  if (from === null || from === index) return;
                  const blocks = [...draft.blocks];
                  const [moved] = blocks.splice(from, 1);
                  blocks.splice(index, 0, moved);
                  setBlocks(blocks);
                },
              }}
            />
          ))}
        </div>

        {draft.blocks.length === 0 && (
          <p className="rounded-2xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">
            {t("noBlocks")}
          </p>
        )}

        <div className="relative mt-3">
          <button
            type="button"
            disabled={full}
            onClick={() => setAddOpen((v) => !v)}
            onBlur={() => setTimeout(() => setAddOpen(false), 160)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-40"
          >
            <Icon name="plus" size={16} />
            {full ? t("blocksFull") : t("addBlock")}
          </button>
          {addOpen && (
            <div className="absolute bottom-12 left-0 z-30 max-h-80 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white py-1.5 shadow-xl">
              {PAGE_BLOCK_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onMouseDown={() => {
                    const block = emptyBlock(type);
                    setBlocks([...draft.blocks, block]);
                    setOpenBlock(block.id);
                    setAddOpen(false);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-slate-50"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                    <Icon name={BLOCK_ICON[type]} size={15} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-800">
                      {t(`blockType.${type}`)}
                    </span>
                    <span className="block truncate text-xs text-slate-400">
                      {t(`blockHint.${type}`)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ---------------------------------------------------------- Fusszeile */}
      <div className="sticky bottom-0 -mx-6 mt-8 border-t border-slate-200 bg-white px-6 py-4">
        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={pending || !draft.title.trim()}
            className="flex-1 rounded-xl bg-[var(--action)] px-4 py-2.5 text-sm font-semibold text-[var(--action-fg)] transition hover:bg-[var(--action-hover)] disabled:opacity-50"
          >
            {pending ? t("saving") : dirty ? t("savePage") : t("savedPage")}
          </button>
          <button
            type="button"
            onClick={() => (confirmDelete ? remove() : setConfirmDelete(true))}
            onBlur={() => setTimeout(() => setConfirmDelete(false), 3000)}
            disabled={pending}
            className={cn(
              "rounded-xl px-4 py-2.5 text-sm font-semibold transition",
              confirmDelete
                ? "bg-red-600 text-white hover:bg-red-700"
                : "text-slate-500 hover:bg-red-50 hover:text-red-600",
            )}
          >
            {confirmDelete ? t("deleteConfirm") : t("delete")}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Seitenliste */

export function PagesPanel({
  slug,
  pages,
  setPages,
  onChanged,
}: {
  slug: string;
  pages: EditablePage[];
  setPages: (next: EditablePage[]) => void;
  /** Meldet dem Editor, dass die Vorschau neu geladen werden sollte. */
  onChanged: () => void;
}) {
  const t = useTranslations("dashboard.pages");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dragFrom = useRef<number | null>(null);
  const tTpl = useTranslations("dashboard.pages.templates");

  const editing = pages.find((p) => p.id === editingId) ?? null;

  /**
   * Legt eine Seite aus einer Vorlage an.
   *
   * Die Bausteine entstehen hier im Browser, weil die Vorlagentexte in der
   * Sprache des Creators aufgeloest werden muessen und der Uebersetzer hier
   * schon steht. Geprueft werden sie trotzdem serverseitig — die Vertrauens-
   * grenze verschiebt sich dadurch nicht.
   */
  function createFrom(template: PageTemplateKey) {
    const title = tTpl(`${template}.title`);
    setError(null);
    start(async () => {
      const blocks = templateBlocks(template, (k) => tTpl(`content.${k}`), slug);
      const fd = new FormData();
      fd.set("tenant", slug);
      fd.set("title", title);
      if (blocks.length > 0) fd.set("blocks", JSON.stringify(blocks));
      const res = await createCommunityPageAction({}, fd);
      if (res.error || !res.createdId) {
        setError(res.error ?? null);
        return;
      }
      const page: EditablePage = {
        id: res.createdId,
        // Der Server leitet die Adresse aus dem Titel ab und macht sie
        // eindeutig. Bis zum ersten Speichern zeigen wir seinen Vorschlag —
        // danach steht der echte Wert ohnehin im Feld.
        slug: title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 60),
        title,
        description: "",
        status: "DRAFT",
        visibility: "PUBLIC",
        showInNav: true,
        blocks,
      };
      setPages([...pages, page]);
      setAdding(false);
      setEditingId(page.id);
      onChanged();
    });
  }

  function persistOrder(next: EditablePage[]) {
    setPages(next);
    start(async () => {
      const fd = new FormData();
      fd.set("tenant", slug);
      fd.set("order", JSON.stringify(next.map((p) => p.id)));
      const res = await reorderCommunityPagesAction({}, fd);
      if (res.error) setError(res.error);
      else onChanged();
    });
  }

  if (editing) {
    return (
      <PageEditor
        slug={slug}
        page={editing}
        onBack={() => setEditingId(null)}
        onSaved={(next) => {
          setPages(pages.map((p) => (p.id === next.id ? next : p)));
          onChanged();
        }}
        onDeleted={() => {
          setPages(pages.filter((p) => p.id !== editing.id));
          setEditingId(null);
          onChanged();
        }}
      />
    );
  }

  return (
    <div className="px-6 py-6">
      <p className="mb-5 text-sm leading-6 text-slate-500">{t("intro")}</p>

      {/* Die Startseite steht fest und wird hier nur gezeigt, damit die Liste
          dieselbe Reihenfolge hat wie die Reiter auf der Community-Seite. */}
      <div className="mb-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-slate-500">
          <Icon name="home" size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-800">
            {t("homeTab")}
          </span>
          <span className="block text-xs text-slate-400">{t("homeTabHint")}</span>
        </span>
        <Icon name="lock" size={14} className="shrink-0 text-slate-300" />
      </div>

      <div className="space-y-2">
        {pages.map((page, index) => (
          <div
            key={page.id}
            draggable
            onDragStart={() => {
              dragFrom.current = index;
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              const from = dragFrom.current;
              dragFrom.current = null;
              if (from === null || from === index) return;
              const next = [...pages];
              const [moved] = next.splice(from, 1);
              next.splice(index, 0, moved);
              persistOrder(next);
            }}
            className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3"
          >
            <Icon
              name="grip"
              size={16}
              className="shrink-0 cursor-grab text-slate-300 active:cursor-grabbing"
            />
            <button
              type="button"
              onClick={() => setEditingId(page.id)}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-slate-800">
                    {page.title}
                  </span>
                  {page.status === "DRAFT" && (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                      {t("statusDRAFT")}
                    </span>
                  )}
                  {!page.showInNav && (
                    <Icon name="eyeOff" size={13} className="shrink-0 text-slate-300" />
                  )}
                </span>
                <span className="block truncate text-xs text-slate-400">
                  {t("blockCount", { count: page.blocks.length })}
                </span>
              </span>
              <Icon name="chevron" size={16} className="shrink-0 -rotate-90 text-slate-400" />
            </button>
          </div>
        ))}
      </div>

      {pages.length === 0 && !adding && (
        <p className="rounded-2xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">
          {t("noPages")}
        </p>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {adding ? (
        <div className="mt-3">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">{tTpl("pick")}</h3>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="text-sm font-semibold text-slate-500 transition hover:text-slate-900"
            >
              {t("cancel")}
            </button>
          </div>
          <p className="mb-3 text-xs leading-5 text-slate-400">{tTpl("pickHint")}</p>
          <div className="grid grid-cols-2 gap-2">
            {PAGE_TEMPLATES.map((key) => (
              <button
                key={key}
                type="button"
                disabled={pending}
                onClick={() => createFrom(key)}
                className="group flex flex-col gap-2 rounded-2xl border border-slate-200 p-3 text-left transition hover:border-[var(--brand)] hover:bg-slate-50 disabled:opacity-50"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition group-hover:bg-[var(--brand-soft)] group-hover:text-[color:var(--brand)]">
                  <Icon name={TEMPLATE_ICON[key]} size={17} />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-slate-800">
                    {tTpl(`${key}.name`)}
                  </span>
                  <span className="mt-0.5 block text-xs leading-4 text-slate-400">
                    {tTpl(`${key}.hint`)}
                  </span>
                </span>
              </button>
            ))}
          </div>
          {pending && <p className="mt-3 text-sm text-slate-400">{t("creating")}</p>}
        </div>
      ) : (
        <button
          type="button"
          disabled={pages.length >= MAX_PAGES}
          onClick={() => setAdding(true)}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-40"
        >
          <Icon name="plus" size={16} />
          {pages.length >= MAX_PAGES ? t("pagesFull") : t("addPage")}
        </button>
      )}
    </div>
  );
}
