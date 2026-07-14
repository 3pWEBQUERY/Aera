"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import {
  startTotpSetupAction,
  confirmTotpAction,
  disableTotpAction,
  type TotpState,
} from "@/app/actions/account";
import { Input, Label } from "@/components/ui/field";
import { FormError } from "@/components/ui/misc";
import { Icon } from "@/components/dashboard/icons";

const initial: TotpState = {};

const CTA_CLASS =
  "inline-flex min-h-11 items-center justify-center rounded-full px-6 text-sm font-semibold " +
  "text-white transition-colors duration-200 bg-[var(--brand)] hover:bg-[var(--brand-hover)] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)] " +
  "disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Zwei-Faktor-Verwaltung im Mitgliedskonto:
 * aus -> Einrichtung starten (QR + Secret) -> Code bestätigen -> aktiv.
 * Deaktivierung erfordert einen gültigen aktuellen Code.
 */
export function TotpSettings({ enabled: initiallyEnabled }: { enabled: boolean }) {
  const [startState, startAction, starting] = useActionState(startTotpSetupAction, initial);
  const [confirmState, confirmAction, confirming] = useActionState(confirmTotpAction, initial);
  const [disableState, disableAction, disabling] = useActionState(disableTotpAction, initial);
  const [showSecret, setShowSecret] = useState(false);
  const t = useTranslations("account");

  // Zustand aus den drei Action-Ergebnissen ableiten.
  const enabled =
    confirmState.enabled === true ||
    (initiallyEnabled && disableState.enabled !== false);
  const setupData = !enabled && startState.qrDataUrl ? startState : null;

  // ---- aktiv -----------------------------------------------------------
  if (enabled) {
    return (
      <div className="space-y-4">
        <p className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">
          <Icon name="check" size={15} />
          {t("twoFaActive")}
        </p>
        <p className="text-sm text-[#161613]/60">
          {t("twoFaActiveDesc")}
        </p>
        <form action={disableAction} className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="totp-off">{t("twoFaDisableLabel")}</Label>
            <Input
              id="totp-off"
              name="code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="123456"
              required
              className="w-36"
            />
          </div>
          <button
            type="submit"
            disabled={disabling}
            className="rounded-full border border-red-200 px-5 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
          >
            {disabling ? t("twoFaDisabling") : t("twoFaDisable")}
          </button>
        </form>
        <FormError message={disableState.error} />
      </div>
    );
  }

  // ---- Einrichtung läuft -------------------------------------------------
  if (setupData) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-[#161613]/70">
          {t("twoFaSetupIntro")}
        </p>
        <div className="flex flex-wrap items-start gap-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={setupData.qrDataUrl}
            alt={t("twoFaQrAlt")}
            width={160}
            height={160}
            className="rounded-xl ring-1 ring-[#161613]/10"
          />
          <div className="min-w-0 space-y-2 text-xs text-[#161613]/60">
            <p>{t("twoFaNoScanner")}</p>
            <div className="flex items-center gap-2">
              <code className="rounded bg-[#161613]/5 px-2 py-1">
                {showSecret ? setupData.secret : "••••••••••••••••"}
              </code>
              <button
                type="button"
                onClick={() => setShowSecret((s) => !s)}
                className="text-[#161613]/50 transition hover:text-[#161613]"
                aria-label={showSecret ? t("twoFaHideSecret") : t("twoFaShowSecret")}
              >
                <Icon name={showSecret ? "eyeOff" : "eye"} size={14} />
              </button>
            </div>
          </div>
        </div>
        <form action={confirmAction} className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="totp-code">{t("twoFaCodeFromApp")}</Label>
            <Input
              id="totp-code"
              name="code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="123456"
              autoFocus
              required
              className="w-36"
            />
          </div>
          <button type="submit" className={CTA_CLASS} disabled={confirming}>
            {confirming ? t("twoFaChecking") : t("twoFaActivate")}
          </button>
        </form>
        <FormError message={confirmState.error} />
      </div>
    );
  }

  // ---- aus ---------------------------------------------------------------
  return (
    <div className="space-y-4">
      <p className="text-sm text-[#161613]/60">
        {t("twoFaOffDesc")}
      </p>
      <form action={startAction}>
        <button type="submit" className={CTA_CLASS} disabled={starting}>
          {starting ? t("twoFaPreparing") : t("twoFaSetup")}
        </button>
      </form>
      <FormError message={startState.error} />
    </div>
  );
}
