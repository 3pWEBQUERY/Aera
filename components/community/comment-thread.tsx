"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  createCommentAction,
  toggleCommentLikeAction,
  type EngageState,
} from "@/app/actions/engage";
import { Avatar, FormError } from "@/components/ui/misc";
import { Textarea } from "@/components/ui/field";
import { Icon } from "@/components/dashboard/icons";
import { cn, timeAgo } from "@/lib/utils";
import { EMOJIS } from "@/lib/emoji";

/**
 * Kommentare mit Antworten — dieselbe Mechanik wie im Forum, nur ohne
 * Auf-/Abstimmung: unter einem Artikel wird geantwortet, nicht abgestimmt.
 *
 * Der Baum entsteht hier im Browser aus der flachen Liste. Die Server-Action
 * pruefte `parentId` schon immer gegen denselben Beitrag; gefehlt hat nur die
 * Oberflaeche, die einen Elternteil setzen kann.
 */

export interface ThreadComment {
  id: string;
  body: string;
  authorName: string;
  authorAvatar: string | null;
  createdAt: string | Date;
  parentId: string | null;
  likes: number;
  likedByMe: boolean;
}

interface Node extends ThreadComment {
  children: Node[];
}

/** Ab dieser Tiefe wird nicht weiter eingerueckt — sonst bleibt kein Platz. */
const MAX_INDENT = 4;
/** So viele Antworten stehen offen, der Rest kommt auf Klick. */
const VISIBLE_REPLIES = 3;

function buildTree(comments: ThreadComment[]): Node[] {
  const map = new Map<string, Node>();
  comments.forEach((c) => map.set(c.id, { ...c, children: [] }));
  const roots: Node[] = [];
  map.forEach((node) => {
    // Ein Elternteil, den es nicht (mehr) gibt, wuerde den Kommentar
    // verschwinden lassen — solche Waisen haengen wir oben ein.
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  const byTime = (a: Node, b: Node) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  const sortRec = (nodes: Node[]) => {
    nodes.sort(byTime);
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

function countAll(nodes: Node[]): number {
  return nodes.reduce((sum, n) => sum + 1 + countAll(n.children), 0);
}

export function CommentThread({
  slug,
  spaceSlug,
  postId,
  isMember,
  comments,
}: {
  slug: string;
  spaceSlug: string;
  postId: string;
  isMember: boolean;
  comments: ThreadComment[];
}) {
  const t = useTranslations("spaces");
  const tree = buildTree(comments);

  return (
    <div className="rounded-xl border border-[#161613]/10 bg-white p-5">
      <h2 className="mb-4 font-semibold text-[#161613]">
        {t("commentCount", { count: comments.length })}
      </h2>

      {isMember && (
        <div className="mb-6">
          <ReplyForm
            slug={slug}
            space={spaceSlug}
            postId={postId}
            parentId=""
            cta={t("commentCta")}
            placeholder={t("replyPlaceholder")}
          />
        </div>
      )}

      {tree.length === 0 ? (
        <p className="text-sm text-[#161613]/60">{t("noComments")}</p>
      ) : (
        <div className="space-y-5">
          {tree.map((node) => (
            <CommentNode
              key={node.id}
              node={node}
              slug={slug}
              spaceSlug={spaceSlug}
              postId={postId}
              isMember={isMember}
              depth={0}
            />
          ))}
        </div>
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
  const [showAll, setShowAll] = useState(false);

  const hidden = Math.max(0, node.children.length - VISIBLE_REPLIES);
  const shown = showAll ? node.children : node.children.slice(0, VISIBLE_REPLIES);

  return (
    <div className="flex gap-2.5">
      <Avatar name={node.authorName} src={node.authorAvatar} size={32} />
      <div className="min-w-0 flex-1">
        {/* Blase wie im Messenger: der Text steht auf einer eigenen Flaeche,
            Name und Zeit darueber — so bleibt eine tiefe Verschachtelung
            lesbar. */}
        <div className="inline-block max-w-full rounded-2xl bg-[#161613]/[0.04] px-3.5 py-2.5">
          <p className="text-xs text-[#161613]/50">
            <span className="font-semibold text-[#161613]/80">{node.authorName}</span>
            {" · "}
            {timeAgo(node.createdAt, locale)}
          </p>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-[#161613]/85">
            {node.body}
          </p>
        </div>

        <div className="mt-1 flex items-center gap-3 pl-1">
          <LikeButton
            slug={slug}
            space={spaceSlug}
            commentId={node.id}
            likes={node.likes}
            liked={node.likedByMe}
            label={node.likedByMe ? t("unlike") : t("like")}
          />
          {isMember && (
            <button
              type="button"
              onClick={() => setReplyOpen((v) => !v)}
              className="text-xs font-semibold text-[#161613]/55 transition hover:text-[#161613]"
            >
              {t("replyCta")}
            </button>
          )}
        </div>

        {replyOpen && (
          <ReplyForm
            slug={slug}
            space={spaceSlug}
            postId={postId}
            parentId={node.id}
            cta={t("replyCta")}
            placeholder={t("yourCommentPlaceholder")}
            onDone={() => setReplyOpen(false)}
          />
        )}

        {node.children.length > 0 && (
          <div
            className={
              depth < MAX_INDENT
                ? "mt-3 space-y-4 border-l border-[#161613]/10 pl-3"
                : "mt-3 space-y-4"
            }
          >
            {shown.map((c) => (
              <CommentNode
                key={c.id}
                node={c}
                slug={slug}
                spaceSlug={spaceSlug}
                postId={postId}
                isMember={isMember}
                depth={depth + 1}
              />
            ))}
            {hidden > 0 && !showAll && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#161613]/55 transition hover:text-[#161613]"
              >
                <Icon name="chevron" size={13} />
                {t("showReplies", { count: hidden })}
              </button>
            )}
          </div>
        )}
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
  placeholder,
  onDone,
}: {
  slug: string;
  space: string;
  postId: string;
  parentId: string;
  cta: string;
  placeholder: string;
  onDone?: () => void;
}) {
  const t = useTranslations("spaces");
  const [state, action, pending] = useActionState(createCommentAction, initial);
  const boxRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (state.ok) {
      if (boxRef.current) boxRef.current.value = "";
      onDone?.();
    }
  }, [state.ok, onDone]);

  return (
    <form action={action} className="mt-2 space-y-2">
      <input type="hidden" name="tenant" value={slug} />
      <input type="hidden" name="space" value={space} />
      <input type="hidden" name="postId" value={postId} />
      <input type="hidden" name="parentId" value={parentId} />
      <FormError message={state.error} />
      <Textarea ref={boxRef} name="body" rows={2} required placeholder={placeholder} />
      <div className="flex items-center justify-end gap-2">
        <EmojiPicker targetRef={boxRef} label={t("emojiLabel")} />
        <span className="flex-1" />
        {onDone && (
          <button
            type="button"
            onClick={onDone}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-[#161613]/60 transition hover:bg-[#161613]/5"
          >
            {t("cancel")}
          </button>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[var(--action)] px-4 py-1.5 text-sm font-semibold text-[var(--action-fg)] transition hover:bg-[var(--action-hover)] disabled:opacity-50"
        >
          {pending ? t("sending") : cta}
        </button>
      </div>
    </form>
  );
}

/**
 * "Gefaellt mir" als eigenes Formular — ein Serveraufruf ohne Umweg ueber
 * JavaScript-Zustand. Die Zahl daneben zaehlt nur, wenn es etwas zu zaehlen
 * gibt; eine dauerhafte 0 traegt keine Information.
 */
function LikeButton({
  slug,
  space,
  commentId,
  likes,
  liked,
  label,
}: {
  slug: string;
  space: string;
  commentId: string;
  likes: number;
  liked: boolean;
  label: string;
}) {
  return (
    <form action={toggleCommentLikeAction} className="inline-flex">
      <input type="hidden" name="tenant" value={slug} />
      <input type="hidden" name="space" value={space} />
      <input type="hidden" name="commentId" value={commentId} />
      <button
        type="submit"
        aria-pressed={liked}
        aria-label={label}
        className={cn(
          "inline-flex items-center gap-1 text-xs font-semibold transition",
          liked ? "text-[var(--action-strong)]" : "text-[#161613]/55 hover:text-[#161613]",
        )}
      >
        <Icon name="heart" size={13} fill={liked ? "currentColor" : "none"} />
        {likes > 0 && likes}
      </button>
    </form>
  );
}

/**
 * Emoji-Auswahl fuer ein Textfeld. Fuegt an der Einfuegemarke ein statt am
 * Ende — wer mitten im Satz ein Emoji setzt, will es dort haben.
 *
 * Wie die Zeichen aussehen, entscheidet das Geraet: auf iPhone und Mac sind
 * es Apples Emoji, auf Android Googles. Eine eigene Schrift mitzuliefern
 * waere weder lizenzrechtlich moeglich noch gewuenscht.
 */
function EmojiPicker({ targetRef, label }: { targetRef: React.RefObject<HTMLTextAreaElement | null>; label: string }) {
  const [open, setOpen] = useState(false);

  function insert(emoji: string) {
    const el = targetRef.current;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    el.value = el.value.slice(0, start) + emoji + el.value.slice(end);
    const caret = start + emoji.length;
    el.setSelectionRange(caret, caret);
    el.focus();
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-[#161613]/50 transition hover:bg-[#161613]/5 hover:text-[#161613]"
      >
        <Icon name="smile" size={17} />
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 cursor-default"
          />
          <div className="popover-in absolute bottom-full left-0 z-40 mb-2 w-[17.5rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-[#161613]/10 bg-white p-2 shadow-xl">
            <div className="grid max-h-56 grid-cols-8 gap-0.5 overflow-y-auto">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => insert(e)}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-lg transition hover:bg-[#161613]/5"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
