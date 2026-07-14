"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { createPostAction, type EngageState } from "@/app/actions/engage";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { FormError } from "@/components/ui/misc";

const initial: EngageState = {};

export function PostComposer({
  slug,
  space,
  withTitle,
}: {
  slug: string;
  space: string;
  withTitle?: boolean;
}) {
  const t = useTranslations("spaces");
  const [state, action, pending] = useActionState(createPostAction, initial);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state.ok]);

  return (
    <form
      ref={ref}
      action={action}
      className="space-y-2 rounded-xl border border-[#161613]/10 bg-white p-4"
    >
      <input type="hidden" name="tenant" value={slug} />
      <input type="hidden" name="space" value={space} />
      <FormError message={state.error} />
      {withTitle && (
        <Input name="title" placeholder={t("titlePlaceholder")} maxLength={140} />
      )}
      <Textarea
        name="body"
        rows={3}
        required
        placeholder={t("composerPlaceholder")}
      />
      <div className="flex justify-end">
        <Button type="submit" variant="brand" size="sm" disabled={pending}>
          {pending ? t("sending") : t("postCta")}
        </Button>
      </div>
    </form>
  );
}
