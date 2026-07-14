"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Input, Label } from "@/components/ui/field";
import { FormError } from "@/components/ui/misc";
import {
  signupAction,
  loginAction,
  type AuthState,
} from "@/app/actions/auth";
import {
  memberSignupAction,
  type EngageState,
} from "@/app/actions/engage";

const initial: AuthState = {};
const initialEngage: EngageState = {};

/** Pill CTA — follows `--brand`, so it is ink on Aera pages and the
 *  creator's color inside a community. */
const CTA_CLASS =
  "inline-flex min-h-12 w-full items-center justify-center rounded-xl px-7 text-base font-semibold " +
  "text-white transition-colors duration-200 bg-[var(--brand)] hover:bg-[var(--brand-hover)] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)] " +
  "disabled:cursor-not-allowed disabled:opacity-50";

export function SignupForm({ next }: { next?: string }) {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState(signupAction, initial);
  return (
    <form action={action} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      <FormError message={state.error} />
      <div>
        <Label htmlFor="name">{t("name")}</Label>
        <Input id="name" name="name" autoComplete="name" required />
      </div>
      <div>
        <Label htmlFor="email">{t("email")}</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div>
        <Label htmlFor="password">{t("password")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      <button type="submit" className={CTA_CLASS} disabled={pending}>
        {pending ? t("signingUp") : t("signup")}
      </button>
    </form>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState(loginAction, initial);
  return (
    <form action={action} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      <FormError message={state.error} />
      <div>
        <Label htmlFor="email">{t("email")}</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <Label htmlFor="password">{t("password")}</Label>
          <a
            href="/forgot"
            className="mb-1.5 text-xs font-medium text-[color:var(--brand)] hover:underline"
          >
            {t("forgotPassword")}
          </a>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      {state.needsTotp && (
        <div>
          <Label htmlFor="totp">{t("totpLabel")}</Label>
          <Input
            id="totp"
            name="totp"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            placeholder="123456"
            autoFocus
            required
          />
          <p className="mt-1 text-xs text-slate-400">{t("totpHint")}</p>
        </div>
      )}
      <button type="submit" className={CTA_CLASS} disabled={pending}>
        {pending ? t("loggingIn") : t("login")}
      </button>
    </form>
  );
}

/**
 * Whitelabel signup on a creator page: creates the account AND the free
 * membership of that community in one step (memberSignupAction).
 */
export function MemberSignupForm({
  tenant,
  cta,
  refCode,
}: {
  tenant: string;
  cta: string;
  /** Referral-Code aus ?ref= — wird beim Beitritt verbucht. */
  refCode?: string;
}) {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState(memberSignupAction, initialEngage);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="tenant" value={tenant} />
      {refCode && <input type="hidden" name="ref" value={refCode} />}
      <FormError message={state.error} />
      <div>
        <Label htmlFor="ms-name">{t("name")}</Label>
        <Input id="ms-name" name="name" autoComplete="name" required />
      </div>
      <div>
        <Label htmlFor="ms-email">{t("email")}</Label>
        <Input id="ms-email" name="email" type="email" autoComplete="email" required />
      </div>
      <div>
        <Label htmlFor="ms-password">{t("password")}</Label>
        <Input
          id="ms-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      <button type="submit" className={CTA_CLASS} disabled={pending}>
        {pending ? t("signingUp") : cta}
      </button>
    </form>
  );
}
