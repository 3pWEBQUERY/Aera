"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import prisma, { withAeliTransaction, withUserContext } from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { getOwnProfile, type ProfileWithBlocks } from "@/lib/profile";
import { freeCardSlug, normalizeCardSlug } from "@/lib/cards";
import { parseTheme } from "@/lib/themes";
import { formError, text, type FormState } from "@/lib/action-state";

/**
 * Karten anlegen, umbenennen, sortieren, verstecken, löschen.
 *
 * Eine Regel zieht sich durch alles hier: **eine Seite hat immer mindestens
 * eine Karte.** Ein leerer Stapel wäre kein Sonderfall, den man abfangen
 * müsste, sondern eine Seite ohne Inhalt — und jede Komponente ab hier müsste
 * ihn kennen. Deshalb weigert sich `deleteCardAction`, die letzte zu löschen,
 * und das Onboarding legt die erste gleich mit an.
 */

async function asOwner<T>(fn: (profile: ProfileWithBlocks) => Promise<T>): Promise<T> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?weiter=/studio");
  const profile = await getOwnProfile();
  if (!profile) redirect("/onboarding");
  return withUserContext(user.id, () => fn(profile));
}

function revalidateProfile(handle: string): void {
  revalidatePath("/studio", "layout");
  revalidatePath(`/p/${handle}`);
}

const MAX_CARDS = 8;

export async function addCardAction(form: FormData): Promise<void> {
  return asOwner(async (profile) => {
    // Nach oben eine Grenze, und keine willkürliche: mehr als acht Reiter
    // passen auf einem Telefon nicht mehr in eine Leiste, die man überblickt.
    // Wer mehr braucht, braucht keine Karten, sondern eine Website.
    if (profile.cards.length >= MAX_CARDS) return;

    const wish = text(form, "title", 40) || "Neue Karte";
    const slug = freeCardSlug(
      profile.cards.map((card) => card.slug),
      wish,
    );

    const card = await prisma.aeliCard.create({
      data: {
        profileId: profile.id,
        slug,
        title: wish,
        sortOrder: profile.cards.reduce((max, entry) => Math.max(max, entry.sortOrder), -1) + 1,
        // Neue Karten sind versteckt. Eine leere Karte, die sofort öffentlich
        // ist, sieht für Besucher nach einem Fehler aus — und für den Creator
        // gibt es keinen Grund, sie vor dem Befüllen zu zeigen.
        isVisible: false,
      },
    });

    revalidateProfile(profile.handle);
    redirect(`/studio?karte=${card.slug}`);
  });
}

export async function updateCardAction(_prev: FormState, form: FormData): Promise<FormState> {
  return asOwner(async (profile) => {
    const card = profile.cards.find((entry) => entry.id === text(form, "id", 40));
    if (!card) return formError("Diese Karte gibt es nicht mehr.");

    const title = text(form, "title", 40);
    if (!title) return { fieldErrors: { title: "Ohne Beschriftung findet den Reiter niemand." } };

    // Der Slug folgt dem Titel nur, solange der Creator ihn nicht selbst
    // angefasst hat. Sonst würde jedes Umbenennen eine geteilte Adresse
    // kaputtmachen — und das ist eine Entscheidung, die man treffen können
    // muss, nicht eine, die beiläufig passiert.
    const wishedSlug = normalizeCardSlug(text(form, "slug", 40));
    let slug = card.slug;
    if (wishedSlug && wishedSlug !== card.slug) {
      const taken = profile.cards.filter((entry) => entry.id !== card.id).map((entry) => entry.slug);
      if (taken.includes(wishedSlug)) {
        return { fieldErrors: { slug: "Diese Adresse hat schon eine andere Karte." } };
      }
      slug = wishedSlug;
    }

    await prisma.aeliCard.update({
      where: { id: card.id },
      // 24 statt 8: ein Schluessel wie „graduation" ist laenger als ein
      // Emoji. Alte Karten tragen weiterhin eins — `CardIcon` gibt einen
      // unbekannten Wert als Text aus, statt ihn zu verschlucken.
      data: { title, slug, icon: text(form, "icon", 24) || null },
    });

    revalidateProfile(profile.handle);
    return { notice: "Gespeichert." };
  });
}

export async function toggleCardAction(form: FormData): Promise<void> {
  return asOwner(async (profile) => {
    const card = profile.cards.find((entry) => entry.id === text(form, "id", 40));
    if (!card) return;

    // Die letzte sichtbare Karte darf nicht verschwinden: eine
    // veröffentlichte Seite ohne einzige Karte wäre leer, und der Creator
    // sähe im Studio nicht, warum.
    const visible = profile.cards.filter((entry) => entry.isVisible);
    if (card.isVisible && visible.length <= 1) return;

    await prisma.aeliCard.update({
      where: { id: card.id },
      data: { isVisible: !card.isVisible },
    });
    revalidateProfile(profile.handle);
  });
}

export async function deleteCardAction(form: FormData): Promise<void> {
  return asOwner(async (profile) => {
    const card = profile.cards.find((entry) => entry.id === text(form, "id", 40));
    if (!card || profile.cards.length <= 1) return;

    // Die Bausteine gehen mit (ON DELETE CASCADE). Das ist die Erwartung: eine
    // Karte IST ihre Bausteine, und sie stattdessen auf eine andere zu
    // schieben hieße, sie an einer Stelle wieder auftauchen zu lassen, an der
    // sie niemand vermutet.
    await prisma.aeliCard.delete({ where: { id: card.id } });
    revalidateProfile(profile.handle);
    redirect("/studio");
  });
}

/**
 * Neue Reihenfolge in einem Rutsch — dieselbe Begründung wie bei den Blöcken:
 * die vollständige Liste gewinnt, statt dass sich zwei Verschiebungen aus zwei
 * Fenstern zu einer dritten Reihenfolge addieren.
 */
export async function reorderCardsAction(orderedIds: string[]): Promise<void> {
  return asOwner(async (profile) => {
    const known = new Set(profile.cards.map((card) => card.id));
    const ids = orderedIds.filter((id) => known.has(id));
    if (ids.length !== profile.cards.length) return;

    await withAeliTransaction(async (tx) => {
      for (const [index, id] of ids.entries()) {
        await tx.aeliCard.update({ where: { id }, data: { sortOrder: index } });
      }
    });

    revalidateProfile(profile.handle);
  });
}

/**
 * Das Aussehen einer Karte.
 *
 * Zwei Fälle in einer Action, weil es für den Creator eine Entscheidung ist:
 * eigenes Design an oder aus. `theme` leer heißt „wie die Seite" — und das
 * wird als `null` gespeichert, nicht als Kopie des Seiten-Themes. Eine Kopie
 * sähe zunächst gleich aus und liefe beim nächsten Umfärben der Seite
 * auseinander.
 */
export async function updateCardThemeAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  return asOwner(async (profile) => {
    const card = profile.cards.find((entry) => entry.id === text(form, "cardId", 40));
    if (!card) return formError("Diese Karte gibt es nicht mehr.");

    const raw = text(form, "theme", 20_000);
    if (!raw) {
      // `DbNull`, nicht `JsonNull`: die Spalte soll LEER sein, nicht das
      // JSON-Literal `null` enthalten. Nur bei ersterem greift „wie die Seite".
      await prisma.aeliCard.update({ where: { id: card.id }, data: { theme: Prisma.DbNull } });
      revalidateProfile(profile.handle);
      return { notice: "Diese Karte folgt jetzt wieder dem Design der Seite." };
    }

    let incoming: unknown;
    try {
      incoming = JSON.parse(raw);
    } catch {
      return formError("Das Design ließ sich nicht lesen.");
    }

    // `parseTheme` prüft jeden Wert einzeln — was hier ankommt, ist damit immer
    // ein vollständiges, gültiges Theme und nie das, was im Formular stand.
    // Der Umweg über JSON wirft `undefined`-Felder weg: Prisma unterscheidet in
    // einer Json-Spalte nicht zwischen „nicht gesetzt" und „auf undefined
    // gesetzt", und Postgres kennt kein undefined.
    const stored = JSON.parse(JSON.stringify(parseTheme(incoming)));

    await prisma.aeliCard.update({
      where: { id: card.id },
      data: { theme: stored },
    });

    revalidateProfile(profile.handle);
    return { notice: "Gespeichert." };
  });
}
