"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  saveSpaceLinkAction,
  deleteSpaceLinkAction,
  moveSpaceLinkAction,
} from "@/app/actions/links";
import type { ActionState } from "@/app/actions/dashboard";
import { Sheet } from "./sheet";
import { Icon } from "./icons";
import { Input, Label, Textarea } from "@/components/ui/field";
import { Pill, FormError, EmptyState } from "@/components/ui/misc";

export interface LinkRow {
  id: string;
  title: string;
  url: string;
  description: string;
}

interface SpaceInfo {
  id: string;
  slug: string;
  name: string;
}

const initial: ActionState = {};

/** Dashboard manager for LINKS spaces ("Link-Hub"): curated link list. */
export function LinksManager({
  slug,
  space,
  links,
}: {
  slug: string;
  space: SpaceInfo;
  links: LinkRow[];
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LinkRow | null>(null);
  const [nonce, setNonce] = useState(0);
  const t = useTranslations("dashboard.links");

  function openCreate() {
    setEditing(null);
    setNonce((n) => n + 1);
    setOpen(true);
  }
  function openEdit(link: LinkRow) {
    setEditing(link);
    setNonce((n) => n + 1);
    setOpen(true);
  }

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white">
            <Icon name="link" size={20} />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">{space.name}</h1>
              <Pill className="bg-slate-100 text-slate-500">{t("badge")}</Pill>
            </div>
            <p className="text-sm text-slate-400">
              /{space.slug} · {t("linkCount", { count: links.length })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/c/${slug}/s/${space.slug}`}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <Icon name="external" size={16} className="text-slate-400" />
            {t("view")}
          </Link>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98]"
          >
            <Icon name="plus" size={18} />
            {t("addLink")}
          </button>
        </div>
      </div>

      {links.length === 0 ? (
        <EmptyState
          icon="link"
          title={t("emptyTitle")}
          hint={t("emptyHint")}
        >
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <Icon name="plus" size={18} /> {t("addLink")}
          </button>
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {links.map((l, i) => (
            <div
              key={l.id}
              className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5"
            >
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                <Icon name="link" size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">{l.title}</p>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 block truncate text-sm text-slate-500 hover:text-slate-900 hover:underline"
                >
                  {l.url}
                </a>
                {l.description && (
                  <p className="mt-1 text-sm text-slate-500">{l.description}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <form action={moveSpaceLinkAction}>
                  <input type="hidden" name="tenant" value={slug} />
                  <input type="hidden" name="spaceId" value={space.id} />
                  <input type="hidden" name="linkId" value={l.id} />
                  <input type="hidden" name="dir" value="up" />
                  <button
                    disabled={i === 0}
                    aria-label={t("moveUp")}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30"
                  >
                    <Icon name="chevron" size={15} className="rotate-180" />
                  </button>
                </form>
                <form action={moveSpaceLinkAction}>
                  <input type="hidden" name="tenant" value={slug} />
                  <input type="hidden" name="spaceId" value={space.id} />
                  <input type="hidden" name="linkId" value={l.id} />
                  <input type="hidden" name="dir" value="down" />
                  <button
                    disabled={i === links.length - 1}
                    aria-label={t("moveDown")}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30"
                  >
                    <Icon name="chevron" size={15} />
                  </button>
                </form>
                <button
                  onClick={() => openEdit(l)}
                  aria-label={t("edit")}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
                >
                  <Icon name="edit" size={15} />
                </button>
                <form action={deleteSpaceLinkAction}>
                  <input type="hidden" name="tenant" value={slug} />
                  <input type="hidden" name="spaceId" value={space.id} />
                  <input type="hidden" name="linkId" value={l.id} />
                  <button
                    aria-label={t("delete")}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-red-500 transition hover:bg-red-50"
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? t("sheetEdit") : t("addLink")}
        subtitle={space.name}
        icon="link"
      >
        <LinkForm
          key={nonce}
          slug={slug}
          space={space}
          link={editing}
          onDone={() => setOpen(false)}
        />
      </Sheet>
    </div>
  );
}

function LinkForm({
  slug,
  space,
  link,
  onDone,
}: {
  slug: string;
  space: SpaceInfo;
  link: LinkRow | null;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(saveSpaceLinkAction, initial);
  const t = useTranslations("dashboard.links");
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="tenant" value={slug} />
      <input type="hidden" name="spaceId" value={space.id} />
      {link && <input type="hidden" name="linkId" value={link.id} />}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl space-y-5 px-6 py-10">
          <FormError message={state.error} />
          <div>
            <Label htmlFor="lk-title">{t("titleLabel")}</Label>
            <Input
              id="lk-title"
              name="title"
              required
              defaultValue={link?.title ?? ""}
              placeholder={t("titlePlaceholder")}
              className="text-base"
            />
          </div>
          <div>
            <Label htmlFor="lk-url">{t("urlLabel")}</Label>
            <Input
              id="lk-url"
              name="url"
              required
              defaultValue={link?.url ?? ""}
              placeholder="https://…"
            />
          </div>
          <div>
            <Label htmlFor="lk-desc">{t("descLabel")}</Label>
            <Textarea
              id="lk-desc"
              name="description"
              rows={3}
              defaultValue={link?.description ?? ""}
              placeholder={t("descPlaceholder")}
            />
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
        <button
          type="button"
          onClick={onDone}
          className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
        >
          {t("cancel")}
        </button>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50"
        >
          {pending ? t("saving") : link ? t("save") : t("addLink")}
        </button>
      </div>
    </form>
  );
}
