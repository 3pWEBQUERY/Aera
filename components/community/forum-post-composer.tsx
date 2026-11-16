"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { createPostAction, type EngageState } from "@/app/actions/engage";
import { Sheet } from "@/components/dashboard/sheet";
import { RichTextEditor } from "@/components/dashboard/rich-text-editor";
import { Icon } from "@/components/dashboard/icons";
import { FormError } from "@/components/ui/misc";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { htmlHasText } from "@/lib/forum-draft";

const initial: EngageState = {};

interface Draft {
  title: string;
  html: string;
}

const draftKey = (slug: string, space: string) => `aera:forum-draft:${slug}:${space}`;

function readDraft(key: string): Draft | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    return { title: String(parsed.title ?? ""), html: String(parsed.html ?? "") };
  } catch {
    return null;
  }
}

function writeDraft(key: string, draft: Draft | null) {
  try {
    if (!draft || (!draft.title.trim() && !htmlHasText(draft.html))) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(draft));
  } catch {
    /* Speicher nicht verfügbar — der Entwurf bleibt dann nur im Zustand. */
  }
}

/**
 * Member-facing "create post" as a full-screen popover (same Sheet + rich
 * editor as the dashboard composer). Media-upload buttons are hidden because
 * members may not upload; formatting, emoji, GIF and links remain.
 *
 * Schließen verwirft nichts: Titel und Text bleiben als Entwurf (Zustand und
 * sessionStorage) und stehen beim nächsten Öffnen wieder da. Verwerfen ist
 * ein eigener, nachgefragter Schritt.
 */
export function ForumPostComposer({
  slug,
  space,
  spaceName,
}: {
  slug: string;
  space: string;
  spaceName: string;
}) {
  const t = useTranslations("spaces");
  const [open, setOpen] = useState(false);
  // Neu einhängen nach dem Absenden oder Verwerfen, damit der Editor leer startet.
  const [formKey, setFormKey] = useState(0);
  const close = useCallback(() => setOpen(false), []);
  const reset = useCallback(() => {
    writeDraft(draftKey(slug, space), null);
    setFormKey((k) => k + 1);
    setOpen(false);
  }, [slug, space]);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-[var(--primary-fg)] transition hover:bg-[var(--primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)] focus-visible:ring-offset-2 active:scale-[0.98]"
      >
        <Icon name="plus" size={18} />
        {t("createPost")}
      </button>
      <Sheet
        open={open}
        onClose={close}
        title={t("createPost")}
        subtitle={spaceName}
        icon="forum"
      >
        <ComposerForm
          key={formKey}
          slug={slug}
          space={space}
          onClose={close}
          onDone={reset}
        />
      </Sheet>
    </>
  );
}

function ComposerForm({
  slug,
  space,
  onClose,
  onDone,
}: {
  slug: string;
  space: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("spaces");
  const [state, action, pending] = useActionState(createPostAction, initial);
  const [confirm, confirmDialog] = useConfirm();
  const key = draftKey(slug, space);
  // Der Entwurf wird einmal beim Einhängen gelesen; danach führt der Editor.
  const [initialDraft] = useState<Draft>(() =>
    typeof window === "undefined" ? { title: "", html: "" } : (readDraft(key) ?? { title: "", html: "" }),
  );
  const draft = useRef<Draft>(initialDraft);
  const [hasContent, setHasContent] = useState(
    Boolean(initialDraft.title.trim() || htmlHasText(initialDraft.html)),
  );
  const titleRef = useRef<HTMLInputElement>(null);

  const update = (patch: Partial<Draft>) => {
    draft.current = { ...draft.current, ...patch };
    writeDraft(key, draft.current);
    setHasContent(Boolean(draft.current.title.trim() || htmlHasText(draft.current.html)));
  };

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  // Anfangsfokus ins Titelfeld statt auf „Schließen“. Der Sheet setzt seinen
  // Fokus im nächsten Frame; dieser Aufruf läuft einen Frame später.
  useEffect(() => {
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => titleRef.current?.focus({ preventScroll: true }));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, []);

  async function discard() {
    const ok = await confirm({
      title: t("discardDraftTitle"),
      body: t("discardDraftBody"),
      confirmLabel: t("discardDraftConfirm"),
      cancelLabel: t("discardDraftCancel"),
      tone: "danger",
    });
    if (ok) onDone();
    else titleRef.current?.focus();
  }

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="tenant" value={slug} />
      <input type="hidden" name="space" value={space} />
      <RichTextEditor
        variant="seamless"
        tenant={slug}
        name="bodyHtml"
        hideUploads
        defaultHtml={initialDraft.html}
        onChange={(html) => update({ html })}
        placeholder={t("composerPlaceholder")}
        titleSlot={
          <>
            {state.error && (
              <div className="mb-4">
                <FormError message={state.error} />
              </div>
            )}
            <label htmlFor="forum-post-title" className="mb-1.5 block text-xs font-semibold text-slate-600">
              {t("titleLabel")}
            </label>
            <input
              ref={titleRef}
              id="forum-post-title"
              name="title"
              defaultValue={initialDraft.title}
              onChange={(e) => update({ title: e.target.value })}
              placeholder={t("titlePlaceholderExample")}
              maxLength={200}
              className="w-full rounded-lg border-0 bg-transparent px-1 py-1 text-2xl font-bold leading-tight text-slate-900 outline-none placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)] sm:text-[28px]"
            />
          </>
        }
      />
      <div className="flex shrink-0 items-center justify-between gap-2.5 border-t border-slate-200 bg-white px-5 py-3.5 sm:px-6">
        {hasContent ? (
          <p className="hidden text-xs text-slate-600 sm:block" role="status">
            {t("draftKept")}
          </p>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2.5">
          {hasContent ? (
            <button
              type="button"
              onClick={discard}
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
            >
              {t("discardDraft")}
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
            >
              {t("cancel")}
            </button>
          )}
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-[var(--primary-fg)] transition hover:bg-[var(--primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)] focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-50"
          >
            {pending ? t("sending") : t("postCta")}
          </button>
        </div>
      </div>
      {confirmDialog}
    </form>
  );
}
