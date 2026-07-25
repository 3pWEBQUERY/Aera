"use client";

import { useActionState, useId } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { createTicketAction, type SupportState } from "@/app/actions/support";
import { Icon } from "@/components/dashboard/icons";
import { Input, Label, Textarea } from "@/components/ui/field";
import { FormError } from "@/components/ui/misc";

/**
 * Ticket-Formular der Hilfe-Seite.
 *
 * Bewusst auch für Ausgeloggte: wer sich nicht anmelden kann, muss uns genau
 * dann erreichen können. Eingeloggte sehen kein E-Mail-Feld — ihre Adresse
 * kommt serverseitig aus der Session, damit niemand Antworten auf eine fremde
 * Adresse umleiten kann.
 */
export function ContactForm({
  signedIn,
  accountHref,
}: {
  signedIn: boolean;
  accountHref: string;
}) {
  const t = useTranslations("help.contact");
  const [state, action, pending] = useActionState(createTicketAction, {} as SupportState);
  const ids = { name: useId(), email: useId(), subject: useId(), body: useId() };

  if (state.created) {
    return (
      <div className="rounded-2xl border border-[#161613]/10 bg-white p-8 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
          <Icon name="check" size={26} />
        </span>
        <p className="display-serif mt-4 text-2xl">{t("sentTitle")}</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#161613]/60">
          {signedIn ? t("sentTextMember") : t("sentTextGuest")}
        </p>
        {signedIn && (
          <Link
            href={accountHref}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#161613] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#161613]/85"
          >
            {t("sentCta")}
            <Icon name="chevron" size={15} className="-rotate-90" />
          </Link>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5 rounded-2xl border border-[#161613]/10 bg-white p-6 sm:p-8">
      <FormError message={state.error} />

      {!signedIn && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor={ids.name}>{t("name")}</Label>
            <Input id={ids.name} name="name" autoComplete="name" maxLength={120} />
          </div>
          <div>
            <Label htmlFor={ids.email}>{t("email")}</Label>
            <Input
              id={ids.email}
              name="email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
            />
          </div>
        </div>
      )}

      <div>
        <Label htmlFor={ids.subject}>{t("subject")}</Label>
        <Input id={ids.subject} name="subject" required minLength={3} maxLength={120} placeholder={t("subjectPlaceholder")} />
      </div>

      <div>
        <Label htmlFor={ids.body}>{t("message")}</Label>
        <Textarea id={ids.body} name="body" required rows={7} minLength={10} maxLength={5000} placeholder={t("messagePlaceholder")} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-xl bg-[#161613] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#161613]/85 disabled:opacity-50"
        >
          {pending ? t("sending") : t("send")}
        </button>
        <p className="text-xs leading-5 text-[#161613]/45">
          {signedIn ? t("footnoteMember") : t("footnoteGuest")}
        </p>
      </div>
    </form>
  );
}
