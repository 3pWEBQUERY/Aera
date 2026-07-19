"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  unsubscribeNewsletterAction,
  type NewsletterPreferenceState,
} from "@/app/actions/newsletter";

const initial: NewsletterPreferenceState = {};

export function NewsletterUnsubscribeForm({ token }: { token: string }) {
  const t = useTranslations("unsubscribe");
  const [state, action, pending] = useActionState(unsubscribeNewsletterAction, initial);
  if (state.ok) {
    return <p className="text-sm leading-6 text-slate-600">{t("success")}</p>;
  }
  return (
    <form action={action}>
      <input type="hidden" name="token" value={token} />
      {state.error && (
        <p role="alert" className="mb-4 text-sm text-red-700">
          {t("invalid")}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-11 items-center rounded-full bg-slate-950 px-5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? t("pending") : t("confirm")}
      </button>
    </form>
  );
}
