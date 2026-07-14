"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  createArticleAction,
  updateArticleAction,
  deleteArticleAction,
  updateSpaceSettingsAction,
  type ActionState,
} from "@/app/actions/dashboard";
import { Sheet } from "./sheet";
import { Icon } from "./icons";
import { Input, Label, Textarea, Select } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Pill, FormError } from "@/components/ui/misc";
import { formatDate, excerpt } from "@/lib/utils";
import { type KnowledgeSettings } from "@/lib/space-settings";

export interface KArticle {
  id: string;
  title: string;
  body: string;
  createdAt: string | Date;
}
interface SpaceInfo {
  id: string;
  slug: string;
  name: string;
}

const initial: ActionState = {};

export function KnowledgeManager({
  slug,
  space,
  articles,
  settings,
}: {
  slug: string;
  space: SpaceInfo;
  articles: KArticle[];
  settings: KnowledgeSettings;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<KArticle | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [nonce, setNonce] = useState(0);
  const t = useTranslations("dashboard.knowledge");
  const tSort = useTranslations("dashboard.sortLabels");
  const locale = useLocale();

  function openCreate() {
    setNonce((n) => n + 1);
    setCreateOpen(true);
  }

  const summary: string[] = [
    tSort(settings.sort),
    settings.pageSize === 0 ? t("onePage") : t("perPageSummary", { count: settings.pageSize }),
    settings.layout === "GRID" ? t("summaryGrid") : t("summaryList"),
  ];
  if (settings.showSearch) summary.push(t("summarySearch"));
  if (settings.showIndex) summary.push(t("summaryIndex"));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white">
            <Icon name="knowledge" size={20} />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">{space.name}</h1>
              <Pill className="bg-slate-100 text-slate-500">{t("badge")}</Pill>
            </div>
            <p className="text-sm text-slate-400">
              /{space.slug} · {t("articleCount", { count: articles.length })}
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
            onClick={() => setSettingsOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <Icon name="settings" size={16} className="text-slate-400" />
            {t("settings")}
          </button>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98]"
          >
            <Icon name="plus" size={18} />
            {t("writeArticle")}
          </button>
        </div>
      </div>

      {/* Active display config, so the creator sees what visitors get. */}
      <div className="mb-6 flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
        <span className="mr-1 text-xs font-medium text-slate-400">{t("displayLabel")}</span>
        {summary.map((s) => (
          <Pill key={s} className="bg-white text-slate-600 ring-1 ring-slate-200">
            {s}
          </Pill>
        ))}
        <button
          onClick={() => setSettingsOpen(true)}
          className="ml-auto text-xs font-medium text-violet-600 hover:text-violet-800"
        >
          {t("customize")}
        </button>
      </div>

      {articles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-16 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
            <Icon name="knowledge" size={24} />
          </div>
          <p className="mt-3 font-medium text-slate-700">{t("emptyTitle")}</p>
          <p className="mt-1 text-sm text-slate-500">{t("emptyHint")}</p>
          <button
            onClick={openCreate}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <Icon name="plus" size={18} /> {t("writeArticle")}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {articles.map((a) => (
            <div key={a.id} className="rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-slate-300">
              <div className="flex items-start justify-between gap-3">
                <button onClick={() => setEditing(a)} className="min-w-0 flex-1 text-left">
                  <p className="font-semibold text-slate-900">{a.title}</p>
                  <p className="text-xs text-slate-400">{formatDate(a.createdAt, locale)}</p>
                  {a.body && <p className="mt-2 text-sm text-slate-500">{excerpt(a.body, 200)}</p>}
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => setEditing(a)}
                    className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
                  >
                    {t("edit")}
                  </button>
                  <form action={deleteArticleAction}>
                    <input type="hidden" name="tenant" value={slug} />
                    <input type="hidden" name="spaceSlug" value={space.slug} />
                    <input type="hidden" name="articleId" value={a.id} />
                    <button
                      className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50"
                      onClick={(e) => {
                        if (!confirm(t("confirmDelete"))) e.preventDefault();
                      }}
                    >
                      {t("delete")}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Sheet open={createOpen} onClose={() => setCreateOpen(false)} title={t("sheetWrite")} subtitle={space.name} icon="knowledge">
        <ArticleForm key={`c${nonce}`} slug={slug} space={space} onDone={() => setCreateOpen(false)} />
      </Sheet>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={t("sheetEdit")} subtitle={editing?.title} icon="knowledge">
        {editing && (
          <ArticleForm key={`e${editing.id}`} slug={slug} space={space} article={editing} onDone={() => setEditing(null)} />
        )}
      </Sheet>

      <Sheet open={settingsOpen} onClose={() => setSettingsOpen(false)} title={t("sheetSettings")} subtitle={space.name} icon="settings">
        <SettingsForm slug={slug} space={space} settings={settings} onDone={() => setSettingsOpen(false)} />
      </Sheet>
    </div>
  );
}

function ArticleForm({
  slug,
  space,
  article,
  onDone,
}: {
  slug: string;
  space: SpaceInfo;
  article?: KArticle;
  onDone: () => void;
}) {
  const isEdit = !!article;
  const [state, action, pending] = useActionState(isEdit ? updateArticleAction : createArticleAction, initial);
  const t = useTranslations("dashboard.knowledge");
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="tenant" value={slug} />
      <input type="hidden" name="spaceId" value={space.id} />
      <input type="hidden" name="spaceSlug" value={space.slug} />
      {isEdit && <input type="hidden" name="articleId" value={article!.id} />}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl space-y-5 px-6 py-8">
          <FormError message={state.error} />
          <div>
            <Label htmlFor="ka-title">{t("titleLabel")}</Label>
            <Input id="ka-title" name="title" required defaultValue={article?.title} placeholder={t("titlePlaceholder")} className="text-base" />
          </div>
          <div>
            <Label htmlFor="ka-body">{t("contentLabel")}</Label>
            <Textarea id="ka-body" name="body" rows={14} defaultValue={article?.body} placeholder={t("bodyPlaceholder")} />
          </div>
        </div>
      </div>
      <Footer pending={pending} onDone={onDone} cta={isEdit ? t("saveChanges") : t("publish")} />
    </form>
  );
}

function SegmentedLayout({ defaultValue }: { defaultValue: "LIST" | "GRID" }) {
  const [val, setVal] = useState<"LIST" | "GRID">(defaultValue);
  const t = useTranslations("dashboard.knowledge");
  const opts: { v: "LIST" | "GRID"; label: string; icon: "feed" | "gallery" }[] = [
    { v: "LIST", label: t("layoutList"), icon: "feed" },
    { v: "GRID", label: t("layoutGrid"), icon: "gallery" },
  ];
  return (
    <div>
      <input type="hidden" name="layout" value={val} />
      <div className="grid grid-cols-2 gap-2">
        {opts.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => setVal(o.v)}
            className={
              "flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition " +
              (val === o.v
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 text-slate-600 hover:bg-slate-50")
            }
          >
            <Icon name={o.icon} size={16} />
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SettingsForm({
  slug,
  space,
  settings,
  onDone,
}: {
  slug: string;
  space: SpaceInfo;
  settings: KnowledgeSettings;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(updateSpaceSettingsAction, initial);
  const t = useTranslations("dashboard.knowledge");
  const tSort = useTranslations("dashboard.sortLabels");
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="tenant" value={slug} />
      <input type="hidden" name="spaceId" value={space.id} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl space-y-6 px-6 py-8">
          <FormError message={state.error} />

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Label htmlFor="set-sort">{t("sortLabel")}</Label>
              <Select id="set-sort" name="sort" defaultValue={settings.sort}>
                <option value="NEWEST">{tSort("NEWEST")}</option>
                <option value="OLDEST">{tSort("OLDEST")}</option>
                <option value="AZ">{tSort("AZ")}</option>
                <option value="ZA">{tSort("ZA")}</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="set-page">{t("perPage")}</Label>
              <Select id="set-page" name="pageSize" defaultValue={String(settings.pageSize)}>
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="0">{t("allOnePage")}</option>
              </Select>
            </div>
          </div>

          <div>
            <Label>{t("layout")}</Label>
            <SegmentedLayout defaultValue={settings.layout} />
          </div>

          <div className="space-y-2.5">
            <Switch name="showSearch" defaultChecked={settings.showSearch} label={t("showSearch")} hint={t("showSearchHint")} />
            <Switch name="showIndex" defaultChecked={settings.showIndex} label={t("showIndex")} hint={t("showIndexHint")} />
            <Switch name="showDates" defaultChecked={settings.showDates} label={t("showDates")} hint={t("showDatesHint")} />
          </div>
        </div>
      </div>
      <Footer pending={pending} onDone={onDone} cta={t("saveSettings")} />
    </form>
  );
}

function Footer({ pending, onDone, cta }: { pending: boolean; onDone: () => void; cta: string }) {
  const t = useTranslations("dashboard.knowledge");
  return (
    <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
      <button type="button" onClick={onDone} className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100">
        {t("cancel")}
      </button>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50"
      >
        {pending ? t("saving") : cta}
      </button>
    </div>
  );
}
