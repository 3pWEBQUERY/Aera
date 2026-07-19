"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  updateMemberProfileAction,
  changePasswordAction,
  type AccountState,
} from "@/app/actions/account";
import { AvatarUpload } from "@/components/dashboard/avatar-upload";
import { Input, Label } from "@/components/ui/field";
import { FormError } from "@/components/ui/misc";

const initial: AccountState = {};

const CTA_CLASS =
  "inline-flex min-h-11 items-center justify-center rounded-full px-6 text-sm font-semibold " +
  "text-white transition-colors duration-200 bg-[var(--brand)] hover:bg-[var(--brand-hover)] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)] " +
  "disabled:cursor-not-allowed disabled:opacity-50";

function SavedHint({ show, label }: { show: boolean; label: string }) {
  if (!show) return null;
  return (
    <span className="text-sm font-medium text-emerald-700">{label}</span>
  );
}

/** Auto-hide the "Gespeichert." hint a moment after a successful save. */
function useSavedFlash(ok: boolean | undefined) {
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!ok) return;
    setShow(true);
    timer.current = setTimeout(() => setShow(false), 2500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [ok]);
  return show;
}

export function MemberProfileForm({
  slug,
  path,
  user,
}: {
  /** Community used to route the avatar upload. Null = no community yet;
   * the photo uploader is hidden but the name stays editable. */
  slug: string | null;
  path: string;
  user: { name: string; avatarUrl: string | null };
}) {
  const [state, action, pending] = useActionState(updateMemberProfileAction, initial);
  const saved = useSavedFlash(state.ok);
  const t = useTranslations("account");

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="path" value={path} />
      <FormError message={state.error} />
      {slug && (
        <div>
          <Label>{t("profilePhoto")}</Label>
          <AvatarUpload
            tenant={slug}
            name="avatarUrl"
            defaultUrl={user.avatarUrl}
            fallbackName={user.name}
          />
        </div>
      )}
      <div>
        <Label htmlFor="mp-name">{t("name")}</Label>
        <Input
          id="mp-name"
          name="name"
          defaultValue={user.name}
          required
          minLength={2}
          maxLength={60}
        />
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" className={CTA_CLASS} disabled={pending}>
          {pending ? t("savingProfile") : t("saveProfile")}
        </button>
        <SavedHint show={saved} label={t("saved")} />
      </div>
    </form>
  );
}

export function MemberPasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, initial);
  const saved = useSavedFlash(state.ok);
  const formRef = useRef<HTMLFormElement>(null);
  const t = useTranslations("account");

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form ref={formRef} action={action} className="space-y-5">
      <FormError message={state.error} />
      <div>
        <Label htmlFor="mp-current">{t("currentPassword")}</Label>
        <Input
          id="mp-current"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      <div>
        <Label htmlFor="mp-new">{t("newPassword")}</Label>
        <Input
          id="mp-new"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <p className="mt-1 text-xs text-[#161613]/50">{t("passwordHint")}</p>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" className={CTA_CLASS} disabled={pending}>
          {pending ? t("changingPassword") : t("changePassword")}
        </button>
        <SavedHint show={saved} label={t("saved")} />
      </div>
    </form>
  );
}
