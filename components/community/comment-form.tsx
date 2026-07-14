"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { createCommentAction, type EngageState } from "@/app/actions/engage";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { FormError } from "@/components/ui/misc";

const initial: EngageState = {};

export function CommentForm({
  slug,
  space,
  postId,
}: {
  slug: string;
  space: string;
  postId: string;
}) {
  const t = useTranslations("spaces");
  const [state, action, pending] = useActionState(createCommentAction, initial);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state.ok]);

  return (
    <form ref={ref} action={action} className="space-y-2">
      <input type="hidden" name="tenant" value={slug} />
      <input type="hidden" name="space" value={space} />
      <input type="hidden" name="postId" value={postId} />
      <FormError message={state.error} />
      <Textarea name="body" rows={2} required placeholder={t("replyPlaceholder")} />
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? t("sending") : t("commentCta")}
        </Button>
      </div>
    </form>
  );
}
