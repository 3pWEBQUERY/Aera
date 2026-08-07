"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authenticate, registerUser } from "@/lib/auth";
import { clearSessionCookie } from "@/lib/session";
import { clientIp, rateLimit } from "@/lib/rate-limit";
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
  return value.startsWith("/") && !value.startsWith("//") ? value : "/studio";
}

export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
  const email = text(form, "email", 320);
  const password = text(form, "password", 200);
  const totp = text(form, "totp", 10);
  const next = safeNext(text(form, "weiter", 300));

  if (!email || !password) {
    return formError("Bitte E-Mail-Adresse und Passwort eingeben.");
  }

  // Zwei Grenzen statt einer: die IP bremst breites Durchprobieren, die
  // E-Mail schützt ein einzelnes Konto auch dann, wenn die Versuche aus
  // vielen Netzen kommen.
  const ip = clientIp(await headers());
  const byIp = rateLimit(`login:ip:${ip}`, 20, 10 * 60_000);
  const byAccount = rateLimit(`login:mail:${email.toLowerCase()}`, 8, 10 * 60_000);
  if (!byIp.ok || !byAccount.ok) {
    const wait = Math.max(byIp.retryAfter, byAccount.retryAfter);
    return formError(
      `Zu viele Versuche. Bitte warte ${Math.ceil(wait / 60)} Minute(n) und probiere es erneut.`,
    );
  }

  const result = await authenticate(email, password, totp || undefined);

  if (!result.ok) {
    if (result.needsTotp) {
      return {
        // Kein Fehler beim ersten Mal: das Konto hat Zwei-Faktor, das ist kein
        // Fehlverhalten. Erst ein falscher Code ist einer.
        error: result.error === "totpCodeInvalid" ? "Der Code stimmt nicht." : undefined,
        notice: "Gib den Code aus deiner Authenticator-App ein.",
        data: { needsTotp: true, email },
      };
    }
    if (result.error === "totpUnavailable") {
      return formError(
        "Dein Konto nutzt Zwei-Faktor, wir können den Code hier gerade nicht prüfen. " +
          "Melde dich bitte über aera.so an.",
      );
    }
    return formError("E-Mail-Adresse oder Passwort stimmen nicht.");
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
  if (!rateLimit(`signup:${ip}`, 5, 60 * 60_000).ok) {
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
  await clearSessionCookie();
  redirect("/");
}
