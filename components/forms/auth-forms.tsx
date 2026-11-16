"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
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

/** Pill CTA. Innerhalb einer Community faellt er auf `--brand` zurueck und
 *  traegt damit die Farbe des Creators. Auf den Aera-eigenen Seiten (Login,
 *  Registrierung, Konto) setzt AERA_INK_VARS `--cta-*` auf die Aktionsfarbe —
 *  dort ist das ein Aktionsbutton und kein Markenbutton. */
const CTA_CLASS =
  "inline-flex min-h-12 w-full items-center justify-center rounded-xl px-7 text-base font-semibold " +
  "text-[var(--cta-fg,#fff)] transition-colors duration-200 " +
  "bg-[var(--cta-bg,var(--brand))] hover:bg-[var(--cta-hover,var(--brand-hover))] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)] " +
  "disabled:cursor-not-allowed disabled:opacity-50";

export function LegalAcceptanceField({ id }: { id: string }) {
  const t = useTranslations("auth");
  const textId = `${id}-text`;
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 text-sm leading-5 text-slate-600">
      <input
        id={id}
        name="legalAcceptance"
        type="checkbox"
        required
        aria-describedby={textId}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-[var(--brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
      />
      <span id={textId}>
        {t.rich("legalAcceptance", {
          terms: (chunks) => (
            <Link href="/agb" className="font-medium underline underline-offset-2" target="_blank">
              {chunks}
            </Link>
          ),
          privacy: (chunks) => (
            <Link
              href="/datenschutz"
              className="font-medium underline underline-offset-2"
              target="_blank"
            >
              {chunks}
            </Link>
          ),
        })}
      </span>
    </label>
  );
}

export function SignupForm({ next }: { next?: string }) {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState(signupAction, initial);
  return (
    <form action={action} aria-describedby={state.error ? "signup-error" : undefined} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      <FormError id="signup-error" message={state.error} />
      <div>
        <Label htmlFor="name">{t("name")}</Label>
        <Input id="name" name="name" autoComplete="name" aria-invalid={state.error ? true : undefined} required />
      </div>
      <div>
        <Label htmlFor="email">{t("email")}</Label>
        <Input id="email" name="email" type="email" autoComplete="email" aria-invalid={state.error ? true : undefined} required />
      </div>
      <div>
        <Label htmlFor="password">{t("password")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          aria-invalid={state.error ? true : undefined}
          minLength={8}
          required
        />
      </div>
      <LegalAcceptanceField id="signup-legal-acceptance" />
      <button type="submit" className={CTA_CLASS} disabled={pending}>
        {pending ? t("signingUp") : t("signup")}
      </button>
    </form>
  );
}

/**
 * Schickt ein Formular ab, ohne dass React es danach zurücksetzt. React 19
 * leert bei `<form action={fn}>` nach jeder Antwort alle Felder; hier bleiben
 * die Eingaben stehen (WCAG 3.3.7). `action={…}` bleibt zusätzlich gesetzt,
 * damit das Formular auch ohne JavaScript abschickbar ist.
 */
export function submitWithoutReset(dispatch: (fd: FormData) => void) {
  return (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const fd = new FormData(event.currentTarget, submitter ?? undefined);
    startTransition(() => dispatch(fd));
  };
}

type LoginStage = "credentials" | "code";

export function LoginForm({ next }: { next?: string }) {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState(loginAction, initial);
  const [stage, setStage] = useState<LoginStage>("credentials");
  const [codeMode, setCodeMode] = useState<"totp" | "recovery">("totp");
  const [email, setEmail] = useState("");
  const [seenState, setSeenState] = useState(state);
  // Modus, in dem der letzte Code-Fehler entstand — nach dem Umschalten
  // zwischen App-Code und Wiederherstellungscode passt er nicht mehr.
  const [errorMode, setErrorMode] = useState(codeMode);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  // Neue Antwort der Action: Schritt ableiten. Ein Rate-Limit im Code-Schritt
  // (ohne needsTotp) lässt den Schritt stehen, statt zurückzuspringen.
  if (state !== seenState) {
    setSeenState(state);
    setErrorMode(codeMode);
    if (state.needsTotp) setStage("code");
    else if (state.errorField === "credentials") setStage("credentials");
  }

  // Falsches Passwort: Feld leeren und fokussieren, die E-Mail bleibt.
  // Falscher Code: Code markieren, damit man ihn direkt überschreibt.
  useEffect(() => {
    if (state.errorField === "credentials" && passwordRef.current) {
      passwordRef.current.value = "";
      passwordRef.current.focus();
    } else if (state.errorField === "code") {
      codeRef.current?.select();
    }
  }, [state]);

  const credentialsInvalid = state.errorField === "credentials";
  const codeInvalid = state.errorField === "code" && errorMode === codeMode;
  const generalError = state.error && state.errorField !== "code" ? state.error : undefined;
  const currentEmail = email || state.email || "";
  const forgotHref = currentEmail
    ? `/forgot?email=${encodeURIComponent(currentEmail)}`
    : "/forgot";

  function backToCredentials() {
    setStage("credentials");
    setCodeMode("totp");
    if (passwordRef.current) passwordRef.current.value = "";
    // Nach dem Umschalten ist das E-Mail-Feld wieder sichtbar.
    requestAnimationFrame(() => emailRef.current?.focus());
  }

  return (
    <form
      action={action}
      onSubmit={submitWithoutReset(action)}
      aria-describedby={generalError ? "login-error" : undefined}
      className="space-y-4"
    >
      {next && <input type="hidden" name="next" value={next} />}
      <FormError id="login-error" message={generalError} />

      {/* Schritt 1. Im Code-Schritt nur ausgeblendet, nicht entfernt: So
          bleiben E-Mail und Passwort im Formular, ohne erneut getippt oder
          an den Server zurückgegeben zu werden. */}
      <div hidden={stage === "code"} className="space-y-4">
        <div>
          <Label htmlFor="email">{t("email")}</Label>
          <Input
            ref={emailRef}
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={state.email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={credentialsInvalid || undefined}
            aria-describedby={credentialsInvalid ? "login-error" : undefined}
            required
          />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="password">{t("password")}</Label>
            <a
              href={forgotHref}
              className="mb-1.5 text-xs font-medium text-[color:var(--brand)] hover:underline"
            >
              {t("forgotPassword")}
            </a>
          </div>
          <Input
            ref={passwordRef}
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={credentialsInvalid || undefined}
            aria-describedby={credentialsInvalid ? "login-error" : undefined}
            required
          />
        </div>
      </div>

      {stage === "code" && (
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {codeMode === "totp" ? t("totpLabel") : t("recoveryHeading")}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {t.rich("codeFor", {
                email: state.email || currentEmail,
                strong: (chunks) => <strong className="font-semibold text-slate-900">{chunks}</strong>,
              })}{" "}
              <button
                type="button"
                onClick={backToCredentials}
                className="font-medium text-[color:var(--brand)] underline underline-offset-2 hover:no-underline"
              >
                {t("useOtherEmail")}
              </button>
            </p>
          </div>
          <div>
            {codeMode === "totp" ? (
              <>
                <Label htmlFor="totp">{t("totpFieldLabel")}</Label>
                <Input
                  key="totp"
                  ref={codeRef}
                  id="totp"
                  name="totp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  aria-invalid={codeInvalid || undefined}
                  aria-describedby={codeInvalid ? "login-code-hint login-code-error" : "login-code-hint"}
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="123456"
                  autoFocus
                  required
                />
                <p id="login-code-hint" className="mt-1 text-xs text-slate-500">
                  {t("totpHint")}
                </p>
              </>
            ) : (
              <>
                <Label htmlFor="recovery-code">{t("recoveryLabel")}</Label>
                <Input
                  key="recovery"
                  ref={codeRef}
                  id="recovery-code"
                  name="recoveryCode"
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-invalid={codeInvalid || undefined}
                  aria-describedby={codeInvalid ? "login-code-hint login-code-error" : "login-code-hint"}
                  maxLength={32}
                  placeholder="abcd-efgh-jkmn"
                  autoFocus
                  required
                />
                <p id="login-code-hint" className="mt-1 text-xs text-slate-500">
                  {t("recoveryHint")}
                </p>
              </>
            )}
            {codeInvalid && state.error && (
              <p id="login-code-error" role="alert" className="mt-2 text-sm text-red-700">
                {state.error}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setCodeMode((m) => (m === "totp" ? "recovery" : "totp"))}
            className="text-left text-sm font-medium text-[color:var(--brand)] underline underline-offset-2 hover:no-underline"
          >
            {codeMode === "totp" ? t("useRecoveryCode") : t("useAppCode")}
          </button>
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
    <form action={action} aria-describedby={state.error ? "member-signup-error" : undefined} className="space-y-4">
      <input type="hidden" name="tenant" value={tenant} />
      {refCode && <input type="hidden" name="ref" value={refCode} />}
      <FormError id="member-signup-error" message={state.error} />
      <div>
        <Label htmlFor="ms-name">{t("name")}</Label>
        <Input id="ms-name" name="name" autoComplete="name" aria-invalid={state.error ? true : undefined} required />
      </div>
      <div>
        <Label htmlFor="ms-email">{t("email")}</Label>
        <Input id="ms-email" name="email" type="email" autoComplete="email" aria-invalid={state.error ? true : undefined} required />
      </div>
      <div>
        <Label htmlFor="ms-password">{t("password")}</Label>
        <Input
          id="ms-password"
          name="password"
          type="password"
          autoComplete="new-password"
          aria-invalid={state.error ? true : undefined}
          minLength={8}
          required
        />
      </div>
      <LegalAcceptanceField id="member-signup-legal-acceptance" />
      <div className="border-t border-slate-200 pt-4">
        <label htmlFor="member-signup-newsletter" className="flex cursor-pointer items-start gap-3 text-sm text-slate-700">
          <input
            id="member-signup-newsletter"
            name="newsletterOptIn"
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-[var(--brand-ring)]"
          />
          <span>{t("newsletterOptInLabel")}</span>
        </label>
        <p className="ml-7 mt-1 text-xs leading-5 text-slate-500">
          {t("newsletterOptInHint")}
        </p>
      </div>
      <button type="submit" className={CTA_CLASS} disabled={pending}>
        {pending ? t("signingUp") : cta}
      </button>
    </form>
  );
}
