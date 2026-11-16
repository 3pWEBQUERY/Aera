"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOCALE_COOKIE, normalizeLocale } from "@/i18n/request";
import { getCurrentUser } from "@/lib/auth";
import { systemPrisma } from "@/lib/prisma";

/**
 * Setzt die Anzeigesprache (Cookie, 1 Jahr) und rendert die Seite neu.
 * Angemeldete Personen bekommen ihre E-Mails ab jetzt ebenfalls in dieser
 * Sprache (`User.locale`).
 */
export async function setLocaleAction(fd: FormData): Promise<void> {
  const locale = normalizeLocale(String(fd.get("locale") || ""));
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  // Wie beim Profil: nur die eigene Zeile, nach Sitzungsprüfung, über den
  // privilegierten Client (aera_app darf globale User-Zeilen nicht ändern).
  // Best effort — der Sprachwechsel selbst darf daran nie scheitern.
  try {
    const user = await getCurrentUser();
    if (user && user.locale !== locale) {
      await systemPrisma.user.update({ where: { id: user.id }, data: { locale } });
    }
  } catch (error) {
    console.error("Saving the e-mail language failed:", error);
  }
  revalidatePath("/", "layout");
}
