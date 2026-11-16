"use client";

import { useEffect, useRef, useState } from "react";
import { useResilientActionState } from "@/components/forms/use-resilient-action-state";
import { useTranslations } from "next-intl";
import {
  startTotpSetupAction,
  confirmTotpAction,
  disableTotpAction,
  regenerateRecoveryCodesAction,
  type TotpState,
} from "@/app/actions/account";
import { Input, Label } from "@/components/ui/field";
import { FormError } from "@/components/ui/misc";
import { Icon } from "@/components/dashboard/icons";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { submitWithoutReset } from "@/components/forms/submit-without-reset";

const initial: TotpState = {};

const CTA_CLASS =
  "inline-flex min-h-11 items-center justify-center rounded-xl px-6 text-sm font-semibold " +
  "text-[var(--cta-fg,#fff)] transition-colors duration-200 " +
  "bg-[var(--cta-bg,var(--brand))] hover:bg-[var(--cta-hover,var(--brand-hover))] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)] " +
  "disabled:cursor-not-allowed disabled:opacity-50";

const SECONDARY_CLASS =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#161613]/20 px-4 text-sm font-semibold " +
  "text-[#161613] transition hover:border-[#161613]/50 disabled:opacity-50";

/** „ABCD EFGH …“ — Vierergruppen lassen sich leichter abtippen. */
function groupKey(secret: string): string {
  return secret.match(/.{1,4}/g)?.join(" ") ?? secret;
}

/** Kurze Rückmeldung nach dem Kopieren, per aria-live angesagt. */
function useCopied(): [string | null, (id: string, text: string) => Promise<void>] {
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 2500);
    return () => clearTimeout(timer);
  }, [copied]);
  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
    } catch {
      setCopied(null);
    }
  }
  return [copied, copy];
}

/**
 * Zeigt neue Wiederherstellungscodes genau einmal: kopieren, als Textdatei
 * speichern, dann „Ich habe die Codes gespeichert“.
 */
function RecoveryCodesPanel({
  codes,
  email,
  onDone,
}: {
  codes: string[];
  email: string;
  onDone: () => void;
}) {
  const t = useTranslations("account");
  const [copied, copy] = useCopied();
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Fokus auf die Überschrift: Screenreader lesen den neuen Abschnitt vor.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const fileText = [
    t("recoveryFileTitle", { email }),
    t("recoveryFileHint"),
    "",
    ...codes,
    "",
  ].join("\n");

  function download() {
    const blob = new Blob([fileText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "aera-wiederherstellungscodes.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div>
        <h3
          ref={headingRef}
          tabIndex={-1}
          className="text-base font-semibold text-[#161613] focus:outline-none"
        >
          {t("recoveryCodesTitle")}
        </h3>
        <p className="mt-1 text-sm leading-6 text-[#161613]/75">{t("recoveryCodesIntro")}</p>
      </div>
      <ul
        aria-label={t("recoveryCodesTitle")}
        className="grid grid-cols-1 gap-x-6 gap-y-1.5 rounded-lg bg-white p-4 font-mono text-sm text-[#161613] ring-1 ring-[#161613]/10 min-[400px]:grid-cols-2"
      >
        {codes.map((code) => (
          <li key={code} className="tracking-wide">
            {code}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => copy("codes", codes.join("\n"))} className={SECONDARY_CLASS}>
          <Icon name={copied === "codes" ? "check" : "copy"} size={15} />
          {t("recoveryCopy")}
        </button>
        <button type="button" onClick={download} className={SECONDARY_CLASS}>
          <Icon name="export" size={15} />
          {t("recoveryDownload")}
        </button>
      </div>
      <p aria-live="polite" className="min-h-5 text-sm text-emerald-800">
        {copied === "codes" ? t("recoveryCopied") : ""}
      </p>
      <button type="button" onClick={onDone} className={CTA_CLASS}>
        {t("recoverySaved")}
      </button>
    </div>
  );
}

/**
 * Zwei-Faktor-Verwaltung im Mitgliedskonto:
 * aus -> Einrichtung starten (QR + Schlüssel) -> Code bestätigen -> Codes
 * sichern -> aktiv. Abschalten und neue Codes verlangen einen App-Code oder
 * einen Wiederherstellungscode.
 */
export function TotpSettings({
  enabled: initiallyEnabled,
  recoveryCodesLeft: initialCodesLeft = 0,
  email,
  usedRecoveryCode = false,
}: {
  enabled: boolean;
  /** Unbenutzte Wiederherstellungscodes (nur bei aktiver 2FA sinnvoll). */
  recoveryCodesLeft?: number;
  email: string;
  /** Gerade mit einem Wiederherstellungscode angemeldet (?recovery=1). */
  usedRecoveryCode?: boolean;
}) {
  const [startState, startAction, starting] = useResilientActionState(startTotpSetupAction, initial);
  const [confirmState, confirmAction, confirming] = useResilientActionState(confirmTotpAction, initial);
  const [disableState, disableAction, disabling] = useResilientActionState(disableTotpAction, initial);
  const [regenState, regenAction, regenerating] = useResilientActionState(
    regenerateRecoveryCodesAction,
    initial,
  );
  const [confirm, confirmDialog] = useConfirm();
  const [copied, copy] = useCopied();
  // Codes, die noch bestätigt werden müssen („Ich habe die Codes gespeichert“).
  const [pendingCodes, setPendingCodes] = useState<string[] | null>(null);
  const [seen, setSeen] = useState({ confirmState, regenState });
  const t = useTranslations("account");

  // Neue Codes aus Aktivierung oder Neuerzeugung einmal übernehmen.
  if (seen.confirmState !== confirmState || seen.regenState !== regenState) {
    setSeen({ confirmState, regenState });
    const fresh =
      (regenState !== seen.regenState && regenState.recoveryCodes) ||
      (confirmState !== seen.confirmState && confirmState.recoveryCodes);
    if (fresh) setPendingCodes(fresh);
  }

  // Zustand aus den Action-Ergebnissen ableiten.
  const enabled =
    (confirmState.enabled === true || initiallyEnabled) && disableState.enabled !== false;
  const setupData = !enabled && startState.qrDataUrl ? startState : null;
  const codesLeft =
    regenState.recoveryCodesLeft ?? confirmState.recoveryCodesLeft ?? initialCodesLeft;

  // ---- neue Codes sichern ---------------------------------------------
  if (enabled && pendingCodes) {
    return (
      <RecoveryCodesPanel codes={pendingCodes} email={email} onDone={() => setPendingCodes(null)} />
    );
  }

  // ---- aktiv -----------------------------------------------------------
  if (enabled) {
    const low = codesLeft <= 3;
    return (
      <div className="space-y-5">
        <p className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">
          <Icon name="check" size={15} />
          {t("twoFaActive")}
        </p>
        {usedRecoveryCode && (
          <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            {t("recoveryUsedNotice", { count: codesLeft })}
          </p>
        )}
        <p className="text-sm text-[#161613]/65">{t("twoFaActiveDesc")}</p>

        <div className="border-t border-[#161613]/10 pt-4">
          <h3 className="text-sm font-semibold text-[#161613]">{t("recoveryCodesTitle")}</h3>
          <p className={low ? "mt-1 text-sm font-medium text-amber-700" : "mt-1 text-sm text-[#161613]/65"}>
            {t("recoveryCodesLeft", { count: codesLeft })}
          </p>
          <form
            action={regenAction}
            onSubmit={submitWithoutReset(regenAction, () =>
              confirm({
                title: t("recoveryRegenConfirmTitle"),
                body: t("recoveryRegenConfirmBody"),
                confirmLabel: t("recoveryRegenerate"),
              }),
            )}
            className="mt-3 flex flex-wrap items-end gap-3"
          >
            <div>
              <Label htmlFor="totp-regen">{t("secondFactorLabel")}</Label>
              <Input
                id="totp-regen"
                name="code"
                autoComplete="one-time-code"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={32}
                aria-invalid={regenState.error ? true : undefined}
                aria-describedby={regenState.error ? "totp-regen-error" : undefined}
                required
                className="w-56"
              />
            </div>
            <button type="submit" disabled={regenerating} className={SECONDARY_CLASS}>
              {regenerating ? t("twoFaChecking") : t("recoveryRegenerate")}
            </button>
          </form>
          <FormError id="totp-regen-error" message={regenState.error} />
        </div>

        <div className="border-t border-[#161613]/10 pt-4">
          <form
            action={disableAction}
            onSubmit={submitWithoutReset(disableAction)}
            className="flex flex-wrap items-end gap-3"
          >
            <div>
              <Label htmlFor="totp-off">{t("twoFaDisableLabel")}</Label>
              <Input
                id="totp-off"
                name="code"
                autoComplete="one-time-code"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={32}
                aria-invalid={disableState.error ? true : undefined}
                aria-describedby={disableState.error ? "totp-off-error" : undefined}
                required
                className="w-56"
              />
            </div>
            <button
              type="submit"
              disabled={disabling}
              className="min-h-10 rounded-xl border border-red-200 px-5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
            >
              {disabling ? t("twoFaDisabling") : t("twoFaDisable")}
            </button>
          </form>
          <FormError id="totp-off-error" message={disableState.error} />
        </div>
        {confirmDialog}
      </div>
    );
  }

  // ---- Einrichtung läuft -------------------------------------------------
  if (setupData) {
    const secret = setupData.secret ?? "";
    return (
      <div className="space-y-4">
        <p className="text-sm text-[#161613]/70">{t("twoFaSetupIntro")}</p>
        <div className="flex flex-wrap items-start gap-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={setupData.qrDataUrl}
            alt={t("twoFaQrAlt")}
            width={160}
            height={160}
            className="rounded-xl ring-1 ring-[#161613]/10"
          />
          <div className="min-w-56 flex-1 space-y-2 text-sm text-[#161613]/65">
            <p id="totp-key-label">{t("twoFaNoScanner")}</p>
            <code
              aria-labelledby="totp-key-label"
              className="block break-words rounded-lg bg-[#161613]/5 px-3 py-2 font-mono text-sm tracking-wide text-[#161613]"
            >
              {groupKey(secret)}
            </code>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => copy("key", secret)} className={SECONDARY_CLASS}>
                <Icon name={copied === "key" ? "check" : "copy"} size={15} />
                {t("twoFaCopyKey")}
              </button>
              {setupData.otpauth && (
                // Nur auf Touch-Geräten: dort läuft die App auf demselben
                // Gerät, und den QR-Code kann man nicht abscannen.
                <a
                  href={setupData.otpauth}
                  className={`${SECONDARY_CLASS.replace("inline-flex ", "")} hidden pointer-coarse:inline-flex`}
                >
                  {t("twoFaOpenInApp")}
                </a>
              )}
            </div>
            <p aria-live="polite" className="min-h-5 text-emerald-800">
              {copied === "key" ? t("twoFaKeyCopied") : ""}
            </p>
          </div>
        </div>
        <form
          action={confirmAction}
          onSubmit={submitWithoutReset(confirmAction)}
          className="flex flex-wrap items-end gap-3"
        >
          <div>
            <Label htmlFor="totp-code">{t("twoFaCodeFromApp")}</Label>
            <Input
              id="totp-code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="123456"
              autoFocus
              aria-invalid={confirmState.error ? true : undefined}
              aria-describedby={confirmState.error ? "totp-code-error" : undefined}
              required
              className="w-36"
            />
          </div>
          <button type="submit" className={CTA_CLASS} disabled={confirming}>
            {confirming ? t("twoFaChecking") : t("twoFaActivate")}
          </button>
        </form>
        <FormError id="totp-code-error" message={confirmState.error} />
      </div>
    );
  }

  // ---- aus ---------------------------------------------------------------
  return (
    <div className="space-y-4">
      <p className="text-sm text-[#161613]/65">{t("twoFaOffDesc")}</p>
      <form action={startAction}>
        <button type="submit" className={CTA_CLASS} disabled={starting}>
          {starting ? t("twoFaPreparing") : t("twoFaSetup")}
        </button>
      </form>
      <FormError message={startState.error} />
    </div>
  );
}
