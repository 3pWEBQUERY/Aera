"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  createSpacePostAction,
  updatePostAction,
  deletePostAction,
  updateBlogSettingsAction,
  type ActionState,
} from "@/app/actions/dashboard";
import { Sheet } from "./sheet";
import { Icon } from "./icons";
import { ImageUpload } from "./image-upload";
import { RichTextEditor } from "./rich-text-editor";
import { Input, Label, Select } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Pill, FormError } from "@/components/ui/misc";
import { formatDate } from "@/lib/utils";
import { type BlogSettings } from "@/lib/space-settings";

export interface BlogAdminPost {
  id: string;
  title: string;
  excerpt: string;
  coverUrl: string | null;
  bodyHtml: string | null;
  createdAt: string | Date;
  authorName: string;
}
interface SpaceInfo {
  id: string;
  slug: string;
  name: string;
}

const initial: ActionState = {};

export function BlogManager({
  slug,
  space,
  posts,
  settings,
}: {
  slug: string;
  space: SpaceInfo;
  posts: BlogAdminPost[];
  settings: BlogSettings;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<BlogAdminPost | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [nonce, setNonce] = useState(0);
  const t = useTranslations("dashboard.blog");
  const tLayout = useTranslations("dashboard.blog.layoutSummary");
  const tSort = useTranslations("dashboard.sortLabels");
  const locale = useLocale();

  function openCreate() {
    setNonce((n) => n + 1);
    setCreateOpen(true);
  }

  const summary = [
    tLayout(settings.layout),
    t("columnsSummary", { count: settings.columns }),
    settings.pageSize === 0 ? t("onePage") : t("perPageSummary", { count: settings.pageSize }),
    tSort(settings.sort),
  ];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white">
            <Icon name="blog" size={20} />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">{space.name}</h1>
              <Pill className="bg-slate-100 text-slate-500">{t("badge")}</Pill>
            </div>
            <p className="text-sm text-slate-400">
              /{space.slug} · {t("postCount", { count: posts.length })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/c/${slug}/s/${space.slug}`} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
            <Icon name="external" size={16} className="text-slate-400" />
            {t("view")}
          </Link>
          <button onClick={() => setSettingsOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
            <Icon name="settings" size={16} className="text-slate-400" />
            {t("settings")}
          </button>
          <button onClick={openCreate} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98]">
            <Icon name="plus" size={18} />
            {t("writePost")}
          </button>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
        <span className="mr-1 text-xs font-medium text-slate-400">{t("displayLabel")}</span>
        {summary.map((s) => (
          <Pill key={s} className="bg-white text-slate-600 ring-1 ring-slate-200">{s}</Pill>
        ))}
        <button onClick={() => setSettingsOpen(true)} className="ml-auto text-xs font-medium text-violet-600 hover:text-violet-800">
          {t("customize")}
        </button>
      </div>

      {posts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-16 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
            <Icon name="blog" size={24} />
          </div>
          <p className="mt-3 font-medium text-slate-700">{t("emptyTitle")}</p>
          <p className="mt-1 text-sm text-slate-500">{t("emptyHint")}</p>
          <button onClick={openCreate} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800">
            <Icon name="plus" size={18} /> {t("writePost")}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((p) => (
            <div key={p.id} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-3 transition hover:border-slate-300">
              <div className="relative hidden h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-slate-100 sm:block">
                {p.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <span className="bg-[var(--brand)] absolute inset-0 flex items-center justify-center text-sm font-bold text-white/90">
                    {p.title.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <button onClick={() => setEditing(p)} className="min-w-0 flex-1 text-left">
                <p className="truncate font-semibold text-slate-900">{p.title}</p>
                <p className="text-xs text-slate-400">{p.authorName} · {formatDate(p.createdAt, locale)}</p>
                {p.excerpt && <p className="mt-1 line-clamp-1 text-sm text-slate-500">{p.excerpt}</p>}
              </button>
              <div className="flex shrink-0 items-center gap-1">
                <button onClick={() => setEditing(p)} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100">
                  {t("edit")}
                </button>
                <form action={deletePostAction}>
                  <input type="hidden" name="tenant" value={slug} />
                  <input type="hidden" name="spaceSlug" value={space.slug} />
                  <input type="hidden" name="postId" value={p.id} />
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
          ))}
        </div>
      )}

      <Sheet open={createOpen} onClose={() => setCreateOpen(false)} title={t("sheetWrite")} subtitle={space.name} icon="blog">
        <BlogPostForm key={`c${nonce}`} slug={slug} space={space} onDone={() => setCreateOpen(false)} />
      </Sheet>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={t("sheetEdit")} subtitle={editing?.title} icon="blog">
        {editing && <BlogPostForm key={`e${editing.id}`} slug={slug} space={space} post={editing} onDone={() => setEditing(null)} />}
      </Sheet>

      <Sheet open={settingsOpen} onClose={() => setSettingsOpen(false)} title={t("sheetSettings")} subtitle={space.name} icon="settings">
        <BlogSettingsForm slug={slug} space={space} settings={settings} onDone={() => setSettingsOpen(false)} />
      </Sheet>
    </div>
  );
}

function BlogPostForm({
  slug,
  space,
  post,
  onDone,
}: {
  slug: string;
  space: SpaceInfo;
  post?: BlogAdminPost;
  onDone: () => void;
}) {
  const isEdit = !!post;
  const [state, action, pending] = useActionState(isEdit ? updatePostAction : createSpacePostAction, initial);
  const t = useTranslations("dashboard.blog");
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="tenant" value={slug} />
      <input type="hidden" name="spaceId" value={space.id} />
      <input type="hidden" name="spaceSlug" value={space.slug} />
      {isEdit && <input type="hidden" name="postId" value={post!.id} />}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-5 px-6 py-8">
          <FormError message={state.error} />
          <div>
            <Label>{t("coverLabel")}</Label>
            <ImageUpload tenant={slug} name="imageUrl" purpose="blog-cover" defaultUrl={post?.coverUrl ?? null} />
          </div>
          <div>
            <Label htmlFor="bp-title">{t("titleLabel")}</Label>
            <Input id="bp-title" name="title" required defaultValue={post?.title} placeholder={t("titlePlaceholder")} className="text-base" />
          </div>
          <div>
            <Label>{t("contentLabel")}</Label>
            <RichTextEditor tenant={slug} name="bodyHtml" defaultHtml={post?.bodyHtml ?? ""} />
          </div>
        </div>
      </div>
      <Footer pending={pending} onDone={onDone} cta={isEdit ? t("saveChanges") : t("publish")} />
    </form>
  );
}

function Segmented({
  name,
  value,
  options,
}: {
  name: string;
  value: string;
  options: { v: string; label: string }[];
}) {
  const [val, setVal] = useState(value);
  return (
    <div>
      <input type="hidden" name={name} value={val} />
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => setVal(o.v)}
            className={
              "rounded-xl border px-3 py-2.5 text-sm font-medium transition " +
              (val === o.v ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50")
            }
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function BlogSettingsForm({
  slug,
  space,
  settings,
  onDone,
}: {
  slug: string;
  space: SpaceInfo;
  settings: BlogSettings;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(updateBlogSettingsAction, initial);
  const t = useTranslations("dashboard.blog");
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

          <div>
            <Label>{t("cardLayout")}</Label>
            <Segmented
              name="layout"
              value={settings.layout}
              options={[
                { v: "MAGAZINE", label: t("layoutMagazine") },
                { v: "GRID", label: t("layoutGrid") },
                { v: "LIST", label: t("layoutList") },
              ]}
            />
            <p className="mt-1.5 text-xs text-slate-400">
              {t("layoutHint")}
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Label>{t("columns")}</Label>
              <Segmented name="columns" value={String(settings.columns)} options={[{ v: "2", label: "2" }, { v: "3", label: "3" }]} />
            </div>
            <div>
              <Label htmlFor="bs-page">{t("perPage")}</Label>
              <Select id="bs-page" name="pageSize" defaultValue={String(settings.pageSize)}>
                <option value="6">6</option>
                <option value="9">9</option>
                <option value="12">12</option>
                <option value="18">18</option>
                <option value="0">{t("allOnePage")}</option>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="bs-sort">{t("sortLabel")}</Label>
            <Select id="bs-sort" name="sort" defaultValue={settings.sort}>
              <option value="NEWEST">{tSort("NEWEST")}</option>
              <option value="OLDEST">{tSort("OLDEST")}</option>
              <option value="AZ">{tSort("AZ")}</option>
              <option value="ZA">{tSort("ZA")}</option>
            </Select>
          </div>

          <div className="space-y-2.5">
            <Switch name="featured" defaultChecked={settings.featured} label={t("heroToggle")} hint={t("heroHint")} />
            <Switch name="showCover" defaultChecked={settings.showCover} label={t("showCover")} />
            <Switch name="showExcerpt" defaultChecked={settings.showExcerpt} label={t("showExcerpt")} />
            <Switch name="showAuthor" defaultChecked={settings.showAuthor} label={t("showAuthor")} />
            <Switch name="showDate" defaultChecked={settings.showDate} label={t("showDate")} />
            <Switch name="showReadTime" defaultChecked={settings.showReadTime} label={t("showReadTime")} />
          </div>
        </div>
      </div>
      <Footer pending={pending} onDone={onDone} cta={t("saveSettings")} />
    </form>
  );
}

function Footer({ pending, onDone, cta }: { pending: boolean; onDone: () => void; cta: string }) {
  const t = useTranslations("dashboard.blog");
  return (
    <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
      <button type="button" onClick={onDone} className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100">
        {t("cancel")}
      </button>
      <button type="submit" disabled={pending} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50">
        {pending ? t("saving") : cta}
      </button>
    </div>
  );
}
