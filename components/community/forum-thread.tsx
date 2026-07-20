"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { createCommentAction, type EngageState } from "@/app/actions/engage";
import { VoteControl } from "./vote-control";
import { PollBlock, type PollViewData } from "./poll-block";
import { Avatar, FormError } from "@/components/ui/misc";
import { Textarea } from "@/components/ui/field";
import { Icon } from "@/components/dashboard/icons";
import { timeAgo } from "@/lib/utils";

export interface ForumPost {
  id: string;
  title: string | null;
  body: string;
  bodyHtml: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  authorName: string;
  authorAvatar: string | null;
  createdAt: string | Date;
  score: number;
  myVote: "UP" | "DOWN" | null;
  commentCount: number;
}
export interface ForumComment {
  id: string;
  body: string;
  authorName: string;
  authorAvatar: string | null;
  createdAt: string | Date;
  parentId: string | null;
  score: number;
  myVote: "UP" | "DOWN" | null;
}
interface Node extends ForumComment {
  children: Node[];
}

function buildTree(comments: ForumComment[]): Node[] {
  const map = new Map<string, Node>();
  comments.forEach((c) => map.set(c.id, { ...c, children: [] }));
  const roots: Node[] = [];
  map.forEach((node) => {
    if (node.parentId && map.has(node.parentId)) map.get(node.parentId)!.children.push(node);
    else roots.push(node);
  });
  const sort = (a: Node, b: Node) =>
    b.score - a.score || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  const sortRec = (nodes: Node[]) => {
    nodes.sort(sort);
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

export function ForumThread({
  slug,
  spaceSlug,
  post,
  comments,
  isMember,
  poll,
  settings,
}: {
  slug: string;
  spaceSlug: string;
  post: ForumPost;
  comments: ForumComment[];
  isMember: boolean;
  poll?: PollViewData | null;
  settings?: {
    hideMetaInfo: boolean;
    hideLikes: boolean;
    hideComments: boolean;
    closeComments: boolean;
    customHtml: string | null;
  };
}) {
  const t = useTranslations("spaces");
  const locale = useLocale();
  const tree = buildTree(comments);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href={`/c/${slug}/s/${spaceSlug}`} className="text-sm text-[#161613]/60 hover:text-[#161613]">
        ← {t("backToForum")}
      </Link>

      <article className="flex gap-3 rounded-2xl border border-[#161613]/10 bg-white p-4">
        {!settings?.hideLikes && (
          <VoteControl tenant={slug} space={spaceSlug} targetType="post" targetId={post.id} postId={post.id} score={post.score} myVote={post.myVote} />
        )}
        <div className="min-w-0 flex-1">
          {!settings?.hideMetaInfo && (
            <div className="flex items-center gap-2.5">
              <Avatar name={post.authorName} src={post.authorAvatar} size={38} />
              <p className="text-xs text-[#161613]/50">
                <span className="font-semibold text-[#161613]/80">{post.authorName}</span> · {timeAgo(post.createdAt, locale)}
              </p>
            </div>
          )}
          {post.title && <h1 className="display-serif mt-3 text-2xl text-[#161613]">{post.title}</h1>}
          {post.bodyHtml ? (
            <div
              className="rich-content mt-5 text-[15px] text-[#161613]/80"
              dangerouslySetInnerHTML={{ __html: post.bodyHtml }}
            />
          ) : (
            post.body && <p className="mt-5 whitespace-pre-wrap text-[15px] text-[#161613]/80">{post.body}</p>
          )}
          {post.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.imageUrl} alt="" className="mt-3 max-h-[28rem] w-full rounded-xl border border-[#161613]/10 object-cover" />
          )}
          {post.videoUrl && (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video src={post.videoUrl} controls preload="metadata" className="mt-3 w-full rounded-xl border border-[#161613]/10 bg-black" />
          )}
          {poll && (
            <div className="mt-3">
              <PollBlock slug={slug} space={spaceSlug} postId={post.id} poll={poll} canVote={isMember} />
            </div>
          )}
          {settings?.customHtml && (
            <div
              className="rich-content mt-4 text-[15px] text-[#161613]/80"
              dangerouslySetInnerHTML={{ __html: settings.customHtml }}
            />
          )}
          {!settings?.hideComments && (
            <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-[#161613]/60">
              <Icon name="forum" size={16} /> {t("commentCount", { count: post.commentCount })}
            </p>
          )}
        </div>
      </article>

      {!settings?.hideComments && (
        <>
          <div className="rounded-2xl border border-[#161613]/10 bg-white p-4">
            {settings?.closeComments ? (
              <p className="inline-flex items-center gap-1.5 text-sm text-[#161613]/55">
                <Icon name="lock" size={15} /> {t("commentsClosed")}
              </p>
            ) : isMember ? (
              <ReplyForm slug={slug} space={spaceSlug} postId={post.id} parentId="" cta={t("commentCta")} />
            ) : (
              <p className="text-sm text-[#161613]/60">
                <Link href={`/login?next=${encodeURIComponent(`/c/${slug}/s/${spaceSlug}/${post.id}`)}`} className="font-medium text-[color:var(--brand)] hover:underline">
                  {t("loginLink")}
                </Link>{" "}
                {t("loginToDiscuss")}
              </p>
            )}
          </div>

          <div className="space-y-3">
            {tree.length === 0 ? (
              <p className="py-6 text-center text-sm text-[#161613]/50">{t("noComments")}</p>
            ) : (
              tree.map((node) => (
                <CommentNode key={node.id} node={node} slug={slug} spaceSlug={spaceSlug} postId={post.id} isMember={isMember} depth={0} />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function CommentNode({
  node,
  slug,
  spaceSlug,
  postId,
  isMember,
  depth,
}: {
  node: Node;
  slug: string;
  spaceSlug: string;
  postId: string;
  isMember: boolean;
  depth: number;
}) {
  const t = useTranslations("spaces");
  const locale = useLocale();
  const [replyOpen, setReplyOpen] = useState(false);
  return (
    <div>
      <div className="flex gap-2.5">
        <Avatar name={node.authorName} src={node.authorAvatar} size={30} />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-[#161613]/50">
            <span className="font-semibold text-[#161613]/80">{node.authorName}</span> · {timeAgo(node.createdAt, locale)}
          </p>
          <p className="mt-0.5 whitespace-pre-wrap text-sm text-[#161613]/80">{node.body}</p>
          <div className="mt-1 flex items-center gap-3">
            <VoteControl tenant={slug} space={spaceSlug} targetType="comment" targetId={node.id} postId={postId} score={node.score} myVote={node.myVote} layout="horizontal" />
            {isMember && (
              <button onClick={() => setReplyOpen((v) => !v)} className="text-xs font-medium text-[#161613]/60 hover:text-[#161613]">
                {t("replyCta")}
              </button>
            )}
          </div>
          {replyOpen && (
            <ReplyForm slug={slug} space={spaceSlug} postId={postId} parentId={node.id} cta={t("replyCta")} onDone={() => setReplyOpen(false)} />
          )}
          {node.children.length > 0 && (
            <div className={depth < 6 ? "mt-3 space-y-3 border-l border-[#161613]/10 pl-3" : "mt-3 space-y-3"}>
              {node.children.map((c) => (
                <CommentNode key={c.id} node={c} slug={slug} spaceSlug={spaceSlug} postId={postId} isMember={isMember} depth={depth + 1} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const initial: EngageState = {};

function ReplyForm({
  slug,
  space,
  postId,
  parentId,
  cta,
  onDone,
}: {
  slug: string;
  space: string;
  postId: string;
  parentId: string;
  cta: string;
  onDone?: () => void;
}) {
  const t = useTranslations("spaces");
  const [state, action, pending] = useActionState(createCommentAction, initial);
  useEffect(() => {
    if (state.ok) onDone?.();
  }, [state.ok, onDone]);
  return (
    <form action={action} className="mt-2 space-y-2">
      <input type="hidden" name="tenant" value={slug} />
      <input type="hidden" name="space" value={space} />
      <input type="hidden" name="postId" value={postId} />
      <input type="hidden" name="parentId" value={parentId} />
      <FormError message={state.error} />
      <Textarea name="body" rows={2} required placeholder={t("yourCommentPlaceholder")} />
      <div className="flex justify-end gap-2">
        {onDone && (
          <button type="button" onClick={onDone} className="rounded-lg px-3 py-1.5 text-sm font-medium text-[#161613]/60 hover:bg-[#161613]/5">
            {t("cancel")}
          </button>
        )}
        <button type="submit" disabled={pending} className="rounded-lg bg-[#161613] px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-[#33332e] disabled:opacity-50">
          {pending ? t("sending") : cta}
        </button>
      </div>
    </form>
  );
}
