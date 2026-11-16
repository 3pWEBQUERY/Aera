"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { resendVerificationAction, type AccountState } from "@/app/actions/account";
import { cn } from "@/lib/utils";

/**
 * Slim reminder bar shown to logged-in users whose e-mail address is not yet
 * verified. Renders nothing once verified (the server decides via prop).
 * Eingehängt in /home, /c/[slug] und im Creator-Dashboard.
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
        <span role="status">{t.rich("sent", rich)}</span>
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
          {state.error && (
            <span role="alert" className="ml-2 text-red-700">
              {state.error}
            </span>
          )}
        </form>
      )}
    </div>
  );
}

/**
 * Button „Bestätigungslink senden“ für das Konto und die Fehlerseite eines
 * abgelaufenen Links. Nutzt dieselbe Action wie der Banner (Rate-Limit dort).
 */
export function ResendVerificationButton({
  email,
  className,
}: {
  email: string;
  className?: string;
}) {
  const t = useTranslations("verifyBanner");
  const [state, action, pending] = useActionState<AccountState, FormData>(
    resendVerificationAction,
    {},
  );
  const rich = {
    strong: (chunks: React.ReactNode) => <strong>{chunks}</strong>,
    email,
  };

  if (state.ok) {
    return (
      <p role="status" className={cn("text-sm text-emerald-800", className)}>
        {t.rich("sent", rich)}
      </p>
    );
  }
  return (
    <form action={action} className={className}>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-10 items-center rounded-xl border border-[#161613]/20 px-4 text-sm font-semibold text-[#161613] transition hover:border-[#161613]/50 disabled:opacity-50"
      >
        {pending ? t("resending") : t("sendLink")}
      </button>
      {state.error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
