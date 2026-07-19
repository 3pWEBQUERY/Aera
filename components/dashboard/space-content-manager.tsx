"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  createSpacePostAction,
  deletePostAction,
  createArticleAction,
  deleteArticleAction,
  type ActionState,
} from "@/app/actions/dashboard";
import { Sheet } from "./sheet";
import { Icon, type IconName } from "./icons";
import { ImageUpload } from "./image-upload";
import { VideoUpload } from "./video-upload";
import { AudioUpload } from "./audio-upload";
import { RichTextEditor } from "./rich-text-editor";
import { Input, Label, Textarea } from "@/components/ui/field";
import { Pill, FormError, EmptyState } from "@/components/ui/misc";
import { formatDate, excerpt } from "@/lib/utils";
import { PricePointSelect } from "./price-point-select";

/** Resolve the "create" CTA label for a space type (falls back to a generic verb). */
function useCreateLabel() {
  const tCreate = useTranslations("dashboard.spaceContent.createLabels");
  const t = useTranslations("dashboard.spaceContent");
  return (type: string) => (tCreate.has(type) ? tCreate(type) : t("createFallback"));
}

export interface PostItem {
  id: string;
  title: string | null;
  body: string;
  imageUrl: string | null;
  videoUrl: string | null;
  authorName: string;
  createdAt: string | Date;
  commentCount: number;
}
export interface ArticleItem {
  id: string;
  title: string;
  body: string;
  createdAt: string | Date;
}
interface SpaceInfo {
  id: string;
  slug: string;
  name: string;
  type: string;
}

const initial: ActionState = {};
const typeIcon: Record<string, IconName> = {
  FEED: "feed",
  FORUM: "forum",
  BLOG: "blog",
  GALLERY: "gallery",
  VIDEOS: "videos",
  KNOWLEDGE: "knowledge",
  COURSE: "courses",
  SHOP: "products",
  EVENTS: "events",
  NEWSLETTER: "newsletter",
  CHAT: "chat",
  PODCAST: "podcast",
  LINKS: "link",
  ADS: "megaphone",
};
const managedMeta: Record<string, { href: string; icon: IconName }> = {
  COURSE: { href: "/courses", icon: "courses" },
  SHOP: { href: "/products", icon: "products" },
  EVENTS: { href: "/events", icon: "events" },
  NEWSLETTER: { href: "/newsletter", icon: "newsletter" },
};

export function SpaceContentManager({
  slug,
  space,
  posts,
  articles,
}: {
  slug: string;
  space: SpaceInfo;
  posts: PostItem[];
  articles: ArticleItem[];
}) {
  const [open, setOpen] = useState(false);
  const [nonce, setNonce] = useState(0);
  const t = useTranslations("dashboard.spaceContent");
  const tType = useTranslations("dashboard.spaceContent.typeLabels");
  const tManaged = useTranslations("dashboard.spaceContent.managedLabels");
  const createLabelFor = useCreateLabel();

  const isPost = ["FEED", "FORUM", "BLOG", "GALLERY", "VIDEOS", "PODCAST"].includes(space.type);
  const isKnowledge = space.type === "KNOWLEDGE";
  const link = managedMeta[space.type];
  const managedLabel = link ? tManaged(space.type) : "";

  function openCreate() {
    setNonce((n) => n + 1);
    setOpen(true);
  }

  const count = isKnowledge ? articles.length : posts.length;

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white">
            <Icon name={typeIcon[space.type] ?? "spaces"} size={20} />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">{space.name}</h1>
              <Pill className="bg-slate-100 text-slate-500">{tType.has(space.type) ? tType(space.type) : space.type}</Pill>
            </div>
            <p className="text-sm text-slate-400">
              /{space.slug}
              {(isPost || isKnowledge) && ` · ${t("entryCount", { count })}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/c/${slug}/s/${space.slug}`} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
            <Icon name="external" size={16} className="text-slate-400" />
            {t("view")}
          </Link>
          {(isPost || isKnowledge) && (
            <button onClick={openCreate} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98]">
              <Icon name="plus" size={18} />
              {createLabelFor(space.type)}
            </button>
          )}
        </div>
      </div>

      {link && (
        <Link href={`/dashboard/${slug}${link.href}`} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-slate-300 hover:shadow-sm">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
            <Icon name={link.icon} size={20} />
          </span>
          <div className="flex-1">
            <p className="font-semibold text-slate-900">{t("manageCta", { label: managedLabel })}</p>
            <p className="text-sm text-slate-500">{t("manageDesc", { label: managedLabel })}</p>
          </div>
          <Icon name="chevron" size={18} className="-rotate-90 text-slate-400" />
        </Link>
      )}

      {isPost && <PostList slug={slug} space={space} posts={posts} onEmptyCreate={openCreate} />}
      {isKnowledge && <ArticleList slug={slug} space={space} articles={articles} onEmptyCreate={openCreate} />}

      {(isPost || isKnowledge) && (
        <Sheet
          open={open}
          onClose={() => setOpen(false)}
          title={createLabelFor(space.type)}
          subtitle={space.name}
          icon={typeIcon[space.type] ?? "spaces"}
        >
          {isKnowledge ? (
            <ArticleForm key={nonce} slug={slug} space={space} onDone={() => setOpen(false)} />
          ) : (
            <PostForm key={nonce} slug={slug} space={space} onDone={() => setOpen(false)} />
          )}
        </Sheet>
      )}
    </div>
  );
}

function PostForm({
  slug,
  space,
  onDone,
}: {
  slug: string;
  space: SpaceInfo;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(createSpacePostAction, initial);
  const t = useTranslations("dashboard.spaceContent");
  const createLabelFor = useCreateLabel();
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  const ty = space.type;
  const hasTitle = ty === "FORUM" || ty === "BLOG" || ty === "VIDEOS" || ty === "PODCAST";

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="tenant" value={slug} />
      <input type="hidden" name="spaceId" value={space.id} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl space-y-5 px-6 py-10">
          <FormError message={state.error} />

          {ty === "GALLERY" && (
            <div>
              <Label>{t("imageLabel")}</Label>
              <ImageUpload tenant={slug} name="imageUrl" purpose="gallery" />
            </div>
          )}
          {ty === "VIDEOS" && (
            <div>
              <Label>{t("videoLabel")}</Label>
              <VideoUpload tenant={slug} name="videoUrl" purpose="space-video" />
            </div>
          )}
          {ty === "PODCAST" && (
            <>
              <div>
                <Label>{t("audioLabel")}</Label>
                <AudioUpload tenant={slug} name="videoUrl" purpose="podcast-audio" />
              </div>
              <div>
                <Label>{t("podcastCover")}</Label>
                <ImageUpload tenant={slug} name="imageUrl" purpose="podcast-cover" />
              </div>
            </>
          )}
          {ty === "BLOG" && (
            <div>
              <Label>{t("blogCover")}</Label>
              <ImageUpload tenant={slug} name="imageUrl" purpose="blog-cover" />
            </div>
          )}
          {ty === "FEED" && (
            <div>
              <Label>{t("feedImage")}</Label>
              <ImageUpload tenant={slug} name="imageUrl" purpose="feed-image" />
            </div>
          )}

          {hasTitle && (
            <div>
              <Label htmlFor="sc-title">{ty === "VIDEOS" ? t("titleOptional") : t("titleLabel")}</Label>
              <Input id="sc-title" name="title" required={ty !== "VIDEOS"} placeholder={t("titlePlaceholder")} className="text-base" />
            </div>
          )}

          {ty === "BLOG" || ty === "FORUM" ? (
            <div>
              <Label>{t("contentLabel")}</Label>
              <RichTextEditor tenant={slug} name="bodyHtml" />
            </div>
          ) : (
            <div>
              <Label htmlFor="sc-body">
                {ty === "GALLERY"
                  ? t("galleryCaption")
                  : ty === "PODCAST"
                    ? t("podcastShownotes")
                    : t("textLabel")}
              </Label>
              <Textarea
                id="sc-body"
                name="body"
                rows={4}
                placeholder={
                  ty === "GALLERY"
                    ? t("galleryPlaceholder")
                    : ty === "PODCAST"
                      ? t("podcastPlaceholder")
                      : t("textPlaceholder")
                }
              />
            </div>
          )}

          {/* Pay-per-view / pay-per-post (FEED + VIDEOS) */}
          {(ty === "FEED" || ty === "VIDEOS") && (
            <div className="space-y-4 rounded-2xl border border-slate-200 p-4">
              <div>
                <Label htmlFor="sc-price">{t("ppvPriceLabel")}</Label>
                <PricePointSelect id="sc-price" name="priceCents" kind="oneTime" allowFree defaultCents={0} />
                <p className="mt-1 text-xs text-slate-400">{t("ppvPriceHint")}</p>
              </div>
              <div>
                <Label>{t("ppvTeaserLabel")}</Label>
                <ImageUpload tenant={slug} name="teaserUrl" purpose="ppv-teaser" />
              </div>
            </div>
          )}

          {/* Scheduling (FEED / VIDEOS / PODCAST / BLOG) */}
          {(ty === "FEED" || ty === "VIDEOS" || ty === "PODCAST" || ty === "BLOG") && (
            <div>
              <Label htmlFor="sc-schedule">{t("scheduleLabel")}</Label>
              <Input id="sc-schedule" name="scheduledAt" type="datetime-local" />
              <p className="mt-1 text-xs text-slate-400">{t("scheduleHint")}</p>
            </div>
          )}
        </div>
      </div>
      <Footer pending={pending} onDone={onDone} cta={createLabelFor(ty)} />
    </form>
  );
}

function ArticleForm({ slug, space, onDone }: { slug: string; space: SpaceInfo; onDone: () => void }) {
  const [state, action, pending] = useActionState(createArticleAction, initial);
  const t = useTranslations("dashboard.spaceContent");
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);
  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="tenant" value={slug} />
      <input type="hidden" name="spaceId" value={space.id} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl space-y-5 px-6 py-10">
          <FormError message={state.error} />
          <div>
            <Label htmlFor="ac-title">{t("articleTitleLabel")}</Label>
            <Input id="ac-title" name="title" required placeholder={t("articleTitlePlaceholder")} className="text-base" />
          </div>
          <div>
            <Label htmlFor="ac-body">{t("articleContentLabel")}</Label>
            <Textarea id="ac-body" name="body" rows={12} placeholder={t("articleBodyPlaceholder")} />
          </div>
        </div>
      </div>
      <Footer pending={pending} onDone={onDone} cta={t("publishArticle")} />
    </form>
  );
}

function Footer({ pending, onDone, cta }: { pending: boolean; onDone: () => void; cta: string }) {
  const t = useTranslations("dashboard.spaceContent");
  return (
    <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
      <button type="button" onClick={onDone} className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100">{t("cancel")}</button>
      <button type="submit" disabled={pending} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50">
        {pending ? t("saving") : cta}
      </button>
    </div>
  );
}

function SpaceEmpty({
  label,
  icon,
  onCreate,
}: {
  label: string;
  icon: IconName;
  onCreate: () => void;
}) {
  const t = useTranslations("dashboard.spaceContent");
  return (
    <EmptyState icon={icon} title={t("emptyTitle")} hint={t("emptyHint")}>
      <button onClick={onCreate} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800">
        <Icon name="plus" size={18} /> {label}
      </button>
    </EmptyState>
  );
}

function PostList({
  slug,
  space,
  posts,
  onEmptyCreate,
}: {
  slug: string;
  space: SpaceInfo;
  posts: PostItem[];
  onEmptyCreate: () => void;
}) {
  const t = useTranslations("dashboard.spaceContent");
  const locale = useLocale();
  const createLabelFor = useCreateLabel();
  if (posts.length === 0) {
    return (
      <SpaceEmpty
        label={createLabelFor(space.type)}
        icon={typeIcon[space.type] ?? "spaces"}
        onCreate={onEmptyCreate}
      />
    );
  }

  if (space.type === "GALLERY") {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {posts.map((p) => (
          <div key={p.id} className="group relative overflow-hidden rounded-xl border border-slate-200">
            {p.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.imageUrl} alt={p.body || t("imageAlt")} className="aspect-square w-full object-cover" />
            ) : (
              <div className="flex aspect-square items-center justify-center bg-slate-100 text-slate-300"><Icon name="gallery" size={24} /></div>
            )}
            <DeleteBtn slug={slug} space={space} postId={p.id} floating />
          </div>
        ))}
      </div>
    );
  }

  if (space.type === "PODCAST") {
    return (
      <div className="space-y-3">
        {posts.map((p) => (
          <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-start gap-4">
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
              ) : (
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                  <Icon name="podcast" size={24} />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{p.title || t("episodeFallback")}</p>
                    <p className="text-xs text-slate-400">
                      {p.authorName} · {formatDate(p.createdAt, locale)} · {t("commentCount", { count: p.commentCount })}
                    </p>
                  </div>
                  <DeleteBtn slug={slug} space={space} postId={p.id} />
                </div>
                {p.videoUrl && (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <audio src={p.videoUrl} controls preload="metadata" className="mt-3 w-full" />
                )}
                {p.body && <p className="mt-2 text-sm text-slate-600">{excerpt(p.body, 240)}</p>}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (space.type === "VIDEOS") {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((p) => (
          <div key={p.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {p.videoUrl ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video src={p.videoUrl} controls preload="metadata" className="aspect-video w-full bg-black" />
            ) : null}
            <div className="flex items-center justify-between gap-2 p-3">
              <p className="truncate text-sm font-medium text-slate-800">{p.title || excerpt(p.body, 40) || t("videoFallback")}</p>
              <DeleteBtn slug={slug} space={space} postId={p.id} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {posts.map((p) => (
        <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {p.title && <p className="font-semibold text-slate-900">{p.title}</p>}
              <p className="text-xs text-slate-400">
                {p.authorName} · {formatDate(p.createdAt, locale)} · {t("commentCount", { count: p.commentCount })}
              </p>
            </div>
            <DeleteBtn slug={slug} space={space} postId={p.id} />
          </div>
          {p.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.imageUrl} alt="" className="mt-3 max-h-72 w-full rounded-xl object-cover" />
          )}
          {p.body && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{excerpt(p.body, 400)}</p>}
        </div>
      ))}
    </div>
  );
}

function ArticleList({
  slug,
  space,
  articles,
  onEmptyCreate,
}: {
  slug: string;
  space: SpaceInfo;
  articles: ArticleItem[];
  onEmptyCreate: () => void;
}) {
  const t = useTranslations("dashboard.spaceContent");
  const locale = useLocale();
  const createLabelFor = useCreateLabel();
  if (articles.length === 0) {
    return <SpaceEmpty label={createLabelFor("KNOWLEDGE")} icon="knowledge" onCreate={onEmptyCreate} />;
  }
  return (
    <div className="space-y-3">
      {articles.map((a) => (
        <div key={a.id} className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-slate-900">{a.title}</p>
              <p className="text-xs text-slate-400">{formatDate(a.createdAt, locale)}</p>
            </div>
            <form action={deleteArticleAction}>
              <input type="hidden" name="tenant" value={slug} />
              <input type="hidden" name="spaceSlug" value={space.slug} />
              <input type="hidden" name="articleId" value={a.id} />
              <button className="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50">{t("delete")}</button>
            </form>
          </div>
          {a.body && <p className="mt-2 text-sm text-slate-600">{excerpt(a.body, 300)}</p>}
        </div>
      ))}
    </div>
  );
}

function DeleteBtn({
  slug,
  space,
  postId,
  floating,
}: {
  slug: string;
  space: SpaceInfo;
  postId: string;
  floating?: boolean;
}) {
  const t = useTranslations("dashboard.spaceContent");
  return (
    <form action={deletePostAction} className={floating ? "absolute right-2 top-2 sm:opacity-0 sm:transition sm:group-hover:opacity-100" : ""}>
      <input type="hidden" name="tenant" value={slug} />
      <input type="hidden" name="spaceSlug" value={space.slug} />
      <input type="hidden" name="postId" value={postId} />
      <button
        className={
          floating
            ? "flex h-7 w-7 items-center justify-center rounded-lg bg-white/90 text-red-600 shadow hover:bg-white"
            : "rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
        }
        aria-label={t("delete")}
      >
        {floating ? <Icon name="close" size={14} /> : t("delete")}
      </button>
    </form>
  );
}
