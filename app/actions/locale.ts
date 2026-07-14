"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOCALE_COOKIE, normalizeLocale } from "@/i18n/request";

/** Setzt die Anzeigesprache (Cookie, 1 Jahr) und rendert die Seite neu. */
export async function setLocaleAction(fd: FormData): Promise<void> {
  const locale = normalizeLocale(String(fd.get("locale") || ""));
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}
