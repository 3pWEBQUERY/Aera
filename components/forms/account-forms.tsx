"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { FormError } from "@/components/ui/misc";
import {
  requestPasswordResetAction,
  resetPasswordAction,
  acceptInviteAction,
  type AccountState,
} from "@/app/actions/account";

const initial: AccountState = {};

export function ForgotPasswordForm() {
  const t = useTranslations("authPages");
  const tAuth = useTranslations("auth");
  const [state, action, pending] = useActionState(requestPasswordResetAction, initial);

  if (state.ok) {
    return (
      <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
        {t("forgotSent")}
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <FormError message={state.error} />
      <div>
        <Label htmlFor="fp-email">{tAuth("email")}</Label>
        <Input id="fp-email" name="email" type="email" autoComplete="email" required autoFocus />
      </div>
      <Button type="submit" variant="brand" size="lg" className="w-full" disabled={pending}>
        {pending ? t("forgotSending") : t("forgotSubmit")}
      </Button>
    </form>
  );
}

function PasswordFields() {
  const t = useTranslations("uiMigration.auth");
  return (
    <>
      <div>
        <Label htmlFor="np-password">{t("newPassword")}</Label>
        <Input
          id="np-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      <div>
        <Label htmlFor="np-confirm">{t("confirmPassword")}</Label>
        <Input
          id="np-confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
    </>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations("uiMigration.auth");
  const [state, action, pending] = useActionState(resetPasswordAction, initial);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <FormError message={state.error} />
      <PasswordFields />
      <Button type="submit" variant="brand" size="lg" className="w-full" disabled={pending}>
        {pending ? t("savingPassword") : t("setPassword")}
      </Button>
    </form>
  );
}

export function AcceptInviteForm({
  token,
  defaultName,
  next,
}: {
  token: string;
  defaultName: string;
  next?: string;
}) {
  const t = useTranslations("uiMigration.auth");
  const [state, action, pending] = useActionState(acceptInviteAction, initial);
  const [name, setName] = useState(defaultName);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {next && <input type="hidden" name="next" value={next} />}
      <FormError message={state.error} />
      <div>
        <Label htmlFor="in-name">{t("yourName")}</Label>
        <Input
          id="in-name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          required
        />
      </div>
      <PasswordFields />
      <Button type="submit" variant="brand" size="lg" className="w-full" disabled={pending}>
        {pending ? t("activatingAccount") : t("acceptInvite")}
      </Button>
    </form>
  );
}
