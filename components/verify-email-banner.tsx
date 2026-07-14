"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { resendVerificationAction, type AccountState } from "@/app/actions/account";

/**
 * Slim reminder bar shown to logged-in users whose e-mail address is not yet
 * verified. Renders nothing once verified (the server decides via prop).
 */
export function VerifyEmailBanner({ email }: { email: string }) {
  const t = useTranslations("verifyBanner");
  const [state, action, pending] = useActionState<AccountState, FormData>(
    resendVerificationAction,
    {},
  );

  const rich = {
    strong: (chunks: React.ReactNode) => <strong>{chunks}</strong>,
    email,
  };

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
      {state.ok ? (
        <span>{t.rich("sent", rich)}</span>
      ) : (
        <form action={action} className="inline">
          <span>{t.rich("prompt", rich)} </span>
          <button
            type="submit"
            disabled={pending}
            className="font-semibold underline underline-offset-2 hover:text-amber-700 disabled:opacity-50"
          >
            {pending ? t("resending") : t("resend")}
          </button>
          {state.error && <span className="ml-2 text-red-700">{state.error}</span>}
        </form>
      )}
    </div>
  );
}
