"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { createPostAction, type EngageState } from "@/app/actions/engage";
import { Sheet } from "@/components/dashboard/sheet";
import { RichTextEditor } from "@/components/dashboard/rich-text-editor";
import { Icon } from "@/components/dashboard/icons";
import { FormError } from "@/components/ui/misc";

const initial: EngageState = {};

/**
 * Member-facing "create post" as a full-screen popover (same Sheet + rich
 * editor as the dashboard composer). Media-upload buttons are hidden because
 * members may not upload; formatting, emoji, GIF and links remain.
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
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#161613] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#33332e] active:scale-[0.98]"
      >
        <Icon name="plus" size={18} />
        {t("createPost")}
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={t("createPost")}
        subtitle={spaceName}
        icon="forum"
      >
        <ComposerForm slug={slug} space={space} onDone={() => setOpen(false)} />
      </Sheet>
    </>
  );
}

function ComposerForm({
  slug,
  space,
  onDone,
}: {
  slug: string;
  space: string;
  onDone: () => void;
}) {
  const t = useTranslations("spaces");
  const [state, action, pending] = useActionState(createPostAction, initial);
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);
  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="tenant" value={slug} />
      <input type="hidden" name="space" value={space} />
      <RichTextEditor
        variant="seamless"
        tenant={slug}
        name="bodyHtml"
        hideUploads
        placeholder={t("composerPlaceholder")}
        titleSlot={
          <>
            {state.error && (
              <div className="mb-4">
                <FormError message={state.error} />
              </div>
            )}
            <input
              name="title"
              placeholder={t("titlePlaceholder")}
              aria-label={t("titlePlaceholder")}
              className="w-full border-0 bg-transparent p-0 text-2xl font-bold leading-tight text-slate-900 outline-none placeholder:text-slate-300 focus:ring-0 sm:text-[28px]"
            />
          </>
        }
      />
      <div className="flex shrink-0 items-center justify-end gap-2.5 border-t border-slate-200 bg-white px-5 py-3.5 sm:px-6">
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
          className="inline-flex items-center gap-2 rounded-xl bg-[#161613] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#33332e] active:scale-[0.98] disabled:opacity-50"
        >
          {pending ? t("sending") : t("postCta")}
        </button>
      </div>
    </form>
  );
}
