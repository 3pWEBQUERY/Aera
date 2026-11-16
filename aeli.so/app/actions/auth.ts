"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authenticate, endCurrentSessions, registerUser } from "@/lib/auth";
import { clearSessionCookie } from "@/lib/session";
import { clientIp, rateLimit, rateLimitStatus } from "@/lib/rate-limit";
import { checkbox, formError, text, type FormState } from "@/lib/action-state";

/**
 * Anmeldung und Registrierung.
 *
 * Beide enden mit einem `redirect`. Das ist wichtig: nach einem erfolgreichen
 * POST darf kein Zustand im Formular zurückbleiben, sonst legt ein Neuladen
 * die Anfrage noch einmal ab.
 */

/**
 * Nur relative Ziele. Ohne diese Prüfung wäre `?weiter=https://…` eine offene
 * Weiterleitung — und damit eine Anmeldemaske auf unserer Domain, die danach
 * auf eine fremde Seite führt.
 */
function safeNext(value: string): string {
  // Browser strippen Tabs/Zeilenumbrueche und lesen "\\" wie "/": aus
  // "/\\evil.com" oder "/\t/evil.com" wuerde sonst "//evil.com".
  // eslint-disable-next-line no-control-regex
  if (!value.startsWith("/") || value.startsWith("//") || /[\u0000-\u001f\u007f\\]/.test(value)) {
    return "/studio";
  }
  try {
    const probe = "https://same-origin.invalid";
    return new URL(value, probe).origin === probe ? value : "/studio";
  } catch {
    return "/studio";
  }
}

/** „1 Minute“, „5 Minuten“. */
function minutes(seconds: number): string {
  const value = Math.max(1, Math.ceil(seconds / 60));
  return value === 1 ? "1 Minute" : `${value} Minuten`;
}

const LOGIN_WINDOW_MS = 10 * 60_000;

export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
  const email = text(form, "email", 320);
  const password = text(form, "password", 200);
  // Lang genug für einen Wiederherstellungscode mit Trennzeichen.
  const secondFactor = text(form, "totp", 40);
  const next = safeNext(text(form, "weiter", 300));

  if (!email || !password) {
    return formError("Bitte E-Mail-Adresse und Passwort eingeben.");
  }

  // Zwei Grenzen statt einer: die IP bremst breites Durchprobieren, die
  // E-Mail schützt ein einzelnes Konto auch dann, wenn die Versuche aus
  // vielen Netzen kommen. Gezählt werden nur FEHLVERSUCHE — wer sich
  // mehrmals erfolgreich anmeldet (zweites Gerät, abgelaufene Sitzung), soll
  // sich nicht selbst aussperren.
  const ip = clientIp(await headers());
  const ipKey = `login:ip:${ip}`;
  const accountKey = `login:mail:${email.toLowerCase()}`;
  const [byIp, byAccount] = await Promise.all([
    rateLimitStatus(ipKey, 20, LOGIN_WINDOW_MS),
    rateLimitStatus(accountKey, 8, LOGIN_WINDOW_MS),
  ]);
  if (!byIp.ok || !byAccount.ok) {
    const wait = Math.max(byIp.retryAfter, byAccount.retryAfter);
    return formError(`Zu viele Versuche. Bitte warte ${minutes(wait)} und probiere es erneut.`);
  }

  const result = await authenticate(email, password, secondFactor || undefined);

  if (!result.ok) {
    // Die erste Rückfrage nach dem zweiten Faktor ist kein Fehlversuch.
    if (result.error) {
      await Promise.all([
        rateLimit(ipKey, 20, LOGIN_WINDOW_MS),
        rateLimit(accountKey, 8, LOGIN_WINDOW_MS),
      ]);
    }
    if (result.needsTotp) {
      const errors: Record<string, string> = {
        totpCodeInvalid: "Der Code stimmt nicht. Gib den aktuellen Code aus deiner App ein.",
        recoveryCodeInvalid:
          "Dieser Wiederherstellungscode passt nicht oder wurde schon benutzt.",
        totpUnavailable:
          "Wir können App-Codes hier gerade nicht prüfen. Nimm einen Wiederherstellungscode oder melde dich über aera.so an.",
      };
      return {
        // Kein Fehler beim ersten Mal: das Konto hat Zwei-Faktor, das ist kein
        // Fehlverhalten. Erst ein falscher Code ist einer.
        fieldErrors: result.error ? { totp: errors[result.error] ?? errors.totpCodeInvalid! } : undefined,
        notice: "Gib den Code aus deiner Authenticator-App ein.",
        data: { needsTotp: true, email },
      };
    }
    return formError("E-Mail-Adresse oder Passwort stimmen nicht.");
  }

  if (result.usedRecoveryCode) {
    redirect(`/studio?wiederherstellung=${result.recoveryCodesLeft ?? 0}`);
  }
  redirect(next);
}

export async function signupAction(_prev: FormState, form: FormData): Promise<FormState> {
  const name = text(form, "name", 120);
  const email = text(form, "email", 320);
  const password = text(form, "password", 200);
  const accepted = checkbox(form, "legal");

  const fieldErrors: Record<string, string> = {};
  if (name.length < 2) fieldErrors.name = "Bitte gib deinen Namen an.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    fieldErrors.email = "Diese Adresse sieht nicht vollständig aus.";
  }
  // Zehn Zeichen statt acht plus Sonderzeichenregeln: Länge ist der einzige
  // Faktor, der beim Raten wirklich zählt, und Regeln erzeugen vor allem
  // Passwörter, die alle gleich aussehen.
  if (password.length < 10) fieldErrors.password = "Mindestens 10 Zeichen, bitte.";
  if (!accepted) fieldErrors.legal = "Ohne Zustimmung geht es leider nicht.";
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const ip = clientIp(await headers());
  if (!(await rateLimit(`signup:${ip}`, 5, 60 * 60_000)).ok) {
    return formError("Zu viele Registrierungen von hier aus. Bitte versuch es später noch einmal.");
  }

  const result = await registerUser({ email, name, password });
  if (!result.ok) {
    if (result.error === "emailAlreadyRegistered") {
      return {
        fieldErrors: {
          email:
            "Für diese Adresse gibt es schon ein Konto — auch, wenn du es auf aera.so angelegt hast.",
        },
        notice: "Melde dich einfach mit deinen bestehenden Zugangsdaten an.",
      };
    }
    return formError("Das hat nicht geklappt. Bitte prüfe deine Eingaben.");
  }

  // Der Wunsch-Handle aus dem Hero der Startseite wird durchgereicht, damit
  // das Onboarding nicht mit einem leeren Feld beginnt. Er ist ein Vorschlag,
  // keine Reservierung — geprüft wird er erst dort.
  const wish = text(form, "h", 60);
  redirect(wish ? `/onboarding?h=${encodeURIComponent(wish)}` : "/onboarding");
}

export async function logoutAction(): Promise<void> {
  // Erst alle Aeli-Sitzungen entwerten, dann das Cookie löschen: ein kopiertes
  // Token ist danach genauso wertlos wie das in diesem Browser.
  await endCurrentSessions();
  await clearSessionCookie();
  redirect("/");
}
