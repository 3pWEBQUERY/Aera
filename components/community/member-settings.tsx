"use client";

import { useEffect, useRef, useState } from "react";
import { useResilientActionState } from "@/components/forms/use-resilient-action-state";
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
  "inline-flex min-h-11 items-center justify-center rounded-xl px-6 text-sm font-semibold " +
  "text-[var(--cta-fg,#fff)] transition-colors duration-200 " +
  "bg-[var(--cta-bg,var(--brand))] hover:bg-[var(--cta-hover,var(--brand-hover))] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)] " +
  "disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Rückmeldung nach dem Speichern. Die Live-Region steht von Anfang an im DOM
 * (sonst kündigen Screenreader den Text nicht an); nur ihr Inhalt wechselt.
 */
function SavedHint({ show, label }: { show: boolean; label: string }) {
  return (
    <span role="status" aria-live="polite" className="text-sm font-medium text-emerald-700">
      {show ? label : ""}
    </span>
  );
}

/** Lange genug sichtbar, um sie in Ruhe zu lesen (mindestens 10 Sekunden). */
const SAVED_VISIBLE_MS = 12_000;

/** Show the "Gespeichert." hint after each successful save, then hide it. */
function useSavedFlash(ok: boolean | undefined, stamp: unknown) {
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!ok) return;
    setShow(true);
    timer.current = setTimeout(() => setShow(false), SAVED_VISIBLE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [ok, stamp]);
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
  const [state, action, pending] = useResilientActionState(updateMemberProfileAction, initial);
  const saved = useSavedFlash(state.ok, state);
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
  const [state, action, pending] = useResilientActionState(changePasswordAction, initial);
  const saved = useSavedFlash(state.ok, state);
  const formRef = useRef<HTMLFormElement>(null);
  const t = useTranslations("account");

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form ref={formRef} action={action} className="flex flex-1 flex-col gap-5">
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
        <p className="mt-1 text-xs text-[#161613]/65">{t("passwordHint")}</p>
      </div>
      <div className="mt-auto flex items-center gap-3">
        <button type="submit" className={CTA_CLASS} disabled={pending}>
          {pending ? t("changingPassword") : t("changePassword")}
        </button>
        <SavedHint show={saved} label={t("saved")} />
      </div>
    </form>
  );
}
