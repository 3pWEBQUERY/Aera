"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prisma, { systemPrisma, withAeliTransaction, withUserContext } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { allBlocks, getOwnProfile, type ProfileWithBlocks } from "@/lib/profile";
import { normalizeHandle } from "@/lib/handle";
import { handleStatus, HANDLE_PROBLEM_TEXT } from "@/lib/handle-availability";
import { parseSocials, socialLinkSchema } from "@/lib/socials";
import { parseTheme, THEME_PRESETS } from "@/lib/themes";
import { blockConfigSchema, blockDescriptor } from "@/lib/blocks";
import { normalizeExternalUrl, profileUrlLabel } from "@/lib/url";
import { deleteObject, keyFromMediaUrl } from "@/lib/storage";
import { linkCodesConfigured, verifyLinkCode } from "@/lib/link-code";
import { checkbox, formError, text, type FormState } from "@/lib/action-state";
import type { AeliBlockType } from "@/app/generated/prisma/client";

/**
 * Alles, was das Studio schreibt.
 *
 * Jede Action läuft in `asOwner(...)`. Das ist kein Ritual, sondern die Klammer,
 * in der `aeli.user_id` gesetzt ist — und damit die einzige Umgebung, in der die
 * RLS-Policies eigene Entwürfe überhaupt sehen. Ohne sie schlägt ein Schreiben
 * nicht etwa fehl, sondern findet schlicht keinen Datensatz: „ändert nichts“
 * statt „ändert Fremdes“ ist die richtige Richtung für einen Fehler, aber man
 * sucht ihn lange.
 *
 * Der Kontext wird ausdrücklich aufgespannt und nicht beiläufig gesetzt — die
 * Begründung dafür steht in lib/prisma.ts.
 */
async function asOwner<T>(fn: (profile: ProfileWithBlocks) => Promise<T>): Promise<T> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?weiter=/studio");
  const profile = await getOwnProfile();
  if (!profile) redirect("/onboarding");
  return withUserContext(user.id, () => fn(profile));
}

/** Das Studio ist eine Seite; die öffentliche Seite eine zweite. Beide neu laden. */
function revalidateProfile(handle: string): void {
  revalidatePath("/studio", "layout");
  revalidatePath(`/p/${handle}`);
}

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

export async function claimHandleAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?weiter=/onboarding");

  const existing = await getOwnProfile();
  if (existing) redirect("/studio");

  const handle = normalizeHandle(text(form, "handle", 60));
  const displayName = text(form, "displayName", 80) || user.name;
  const preset = text(form, "preset", 40);

  const status = await handleStatus(handle);
  if (!status.ok) return { fieldErrors: { handle: HANDLE_PROBLEM_TEXT[status.reason] } };

  const theme = THEME_PRESETS.find((entry) => entry.key === preset) ?? THEME_PRESETS[0];

  try {
    // Auch das Anlegen braucht den Kontext: die `WITH CHECK`-Bedingung der
    // Besitzer-Policy vergleicht `userId` mit `aeli.user_id`. Ohne ihn wäre
    // schon die allererste Zeile dieses Kontos nicht schreibbar.
    await withUserContext(user.id, async () => {
      const created = await prisma.aeliProfile.create({
        data: {
          userId: user.id,
          handle,
          displayName,
          avatarUrl: user.avatarUrl,
          theme: { preset: theme.key },
          // Eine Seite ohne Karte gibt es nicht — der Stapel beginnt mit
          // genau einer.
          cards: { create: [{ slug: "start", title: "Start", sortOrder: 0 }] },
        },
        include: { cards: true },
      });

      // Der erste Block getrennt, weil er BEIDE Fremdschluessel braucht und
      // `profileId` beim verschachtelten Anlegen unter der Karte noch nicht
      // feststeht. Er ist kein Beispieltext, sondern eine leere Zeile mit
      // Aufforderung: eine Seite mit „Lorem ipsum" veroeffentlicht niemand,
      // eine mit einem unfertigen Link schon.
      await prisma.aeliBlock.create({
        data: {
          profileId: created.id,
          cardId: created.cards[0]!.id,
          type: "LINK",
          title: "Mein erster Link",
          sortOrder: 0,
          isVisible: true,
        },
      });
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      return {
        fieldErrors: {
          handle: "Der war eine Sekunde schneller weg. Nimm einen anderen.",
        },
      };
    }
    throw e;
  }

  redirect("/studio");
}

// ---------------------------------------------------------------------------
// Profil
// ---------------------------------------------------------------------------

export async function updateIdentityAction(_prev: FormState, form: FormData): Promise<FormState> {
  return asOwner(async (profile) => {
    const displayName = text(form, "displayName", 80);
    const bio = text(form, "bio", 400);
    const avatarUrl = text(form, "avatarUrl", 2000);
    const bannerUrl = text(form, "bannerUrl", 2000);

    if (displayName.length < 1) {
      return {
        fieldErrors: { displayName: "Ohne Namen wirkt die Seite unfertig." },
      };
    }

    await prisma.aeliProfile.update({
      where: { id: profile.id },
      data: {
        displayName,
        bio: bio || null,
        avatarUrl: avatarUrl || null,
        bannerUrl: bannerUrl || null,
      },
    });

    // Erst nach dem erfolgreichen Speichern aufräumen — und nur Bilder aus
    // unserem eigenen Bucket (`keyFromMediaUrl` gibt für fremde Adressen null
    // zurück). Andersherum stünde bei einem Fehler ein Profil mit einer
    // Adresse da, hinter der nichts mehr liegt.
    await Promise.all([
      discardReplacedImage(profile.avatarUrl, avatarUrl),
      discardReplacedImage(profile.bannerUrl, bannerUrl),
    ]);

    revalidateProfile(profile.handle);
    return { notice: "Gespeichert." };
  });
}

/** Löscht das vorherige Bild, wenn es durch ein anderes ersetzt wurde. */
async function discardReplacedImage(previous: string | null, next: string): Promise<void> {
  if (!previous || previous === next) return;
  const key = keyFromMediaUrl(previous);
  if (key) await deleteObject(key);
}

export async function updateHandleAction(_prev: FormState, form: FormData): Promise<FormState> {
  return asOwner(async (profile) => {
    const handle = normalizeHandle(text(form, "handle", 60));
    if (handle === profile.handle) return { notice: "Der Handle ist unverändert." };

    const status = await handleStatus(handle, profile.id);
    if (!status.ok) return { fieldErrors: { handle: HANDLE_PROBLEM_TEXT[status.reason] } };

    try {
      await prisma.aeliProfile.update({
        where: { id: profile.id },
        data: { handle },
      });
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") {
        return {
          fieldErrors: {
            handle: "Inzwischen vergeben. Bitte such dir einen anderen.",
          },
        };
      }
      throw e;
    }

    revalidateProfile(profile.handle);
    revalidateProfile(handle);
    // Die alte Adresse führt ab jetzt ins Leere — das ist die eine Änderung, bei
    // der ein beiläufiges „Gespeichert“ zu wenig wäre. Genannt wird die ganze
    // Adresse, nicht nur der Handle: sie ist das, was der Creator gleich
    // irgendwo hineinkopiert.
    return {
      notice: `Deine Seite liegt jetzt auf ${profileUrlLabel(handle)}. Die alte Adresse funktioniert nicht mehr.`,
    };
  });
}

/**
 * Das Theme kommt als ein JSON-Feld, nicht als sechs Einzelfelder.
 *
 * Solange es nur flache Werte waren, ging beides. Seit der Hintergrund ein
 * eigenes Objekt ist — mit Verlaufsstopps, Winkel, Unschärfe — wäre die
 * Zerlegung in Formularfelder ein Kodierungsformat, das man bei jedem neuen
 * Feld anfassen müsste. `parseTheme` prüft ohnehin jeden Wert einzeln; die
 * Struktur davor muss nur JSON sein.
 */
export async function updateThemeAction(_prev: FormState, form: FormData): Promise<FormState> {
  return asOwner(async (profile) => {
    let incoming: unknown;
    try {
      incoming = JSON.parse(text(form, "theme", 20_000));
    } catch {
      return formError("Die Einstellungen kamen unvollständig an. Bitte noch einmal.");
    }

    // `parseTheme` ist die Prüfung: jeder Wert wird gegen die erlaubte Menge
    // gehalten, alles Unbekannte fällt weg. Was hier herauskommt, kann die
    // öffentliche Seite garantiert rendern.
    const theme = parseTheme(incoming);
    if (!THEME_PRESETS.some((preset) => preset.key === theme.preset)) {
      return formError("Diesen Look kennen wir nicht.");
    }

    // Ein Hintergrundbild muss aus unserem Bucket stammen. `parseTheme` lässt
    // auch fremde https-Adressen zu (für später); hier, wo gespeichert wird,
    // ist die engere Regel die richtige.
    if (theme.background?.kind === "image" && !keyFromMediaUrl(theme.background.url)) {
      return formError("Dieses Hintergrundbild können wir nicht übernehmen.");
    }

    // `undefined`-Felder fliegen raus: Prisma unterscheidet in einer
    // Json-Spalte nicht zwischen „nicht gesetzt“ und „auf undefined gesetzt“,
    // und Postgres kennt kein undefined.
    const stored = JSON.parse(JSON.stringify(theme));

    await prisma.aeliProfile.update({
      where: { id: profile.id },
      data: { theme: stored },
    });

    // Ein ausgetauschtes Hintergrundbild wird genauso aufgeräumt wie ein
    // ausgetauschtes Profilbild.
    const previous = parseTheme(profile.theme);
    if (previous.background?.kind === "image") {
      await discardReplacedImage(
        previous.background.url,
        theme.background?.kind === "image" ? theme.background.url : "",
      );
    }

    revalidateProfile(profile.handle);
    return { notice: "Look aktualisiert." };
  });
}

export async function updateSocialsAction(_prev: FormState, form: FormData): Promise<FormState> {
  return asOwner(async (profile) => {
    // Das Formular liefert `social:<platform>` je Zeile. Leere Felder bedeuten
    // „entfernen“ — deshalb wird die Liste komplett neu gebaut statt gemerged.
    const links: { platform: string; url: string }[] = [];
    for (const [key, value] of form.entries()) {
      if (!key.startsWith("social:") || typeof value !== "string") continue;
      const url = value.trim();
      if (!url) continue;
      const normalized = normalizeExternalUrl(url);
      if (!normalized) {
        return {
          fieldErrors: { [key]: "Diese Adresse können wir nicht öffnen." },
        };
      }
      const parsed = socialLinkSchema.safeParse({
        platform: key.slice(7),
        url: normalized,
      });
      if (parsed.success) links.push(parsed.data);
    }

    await prisma.aeliProfile.update({
      where: { id: profile.id },
      data: { socials: parseSocials(links) },
    });

    revalidateProfile(profile.handle);
    return { notice: "Profile aktualisiert." };
  });
}

export async function updateSeoAction(_prev: FormState, form: FormData): Promise<FormState> {
  return asOwner(async (profile) => {
    const seoImageUrl = text(form, "seoImageUrl", 2000);

    // Entweder aus unserem Bucket oder eine https-Adresse. Der Wert landet in
    // einem `og:image`-Meta-Tag; alles andere wäre für die Scraper von
    // WhatsApp und X ohnehin nur ein toter Link.
    if (seoImageUrl && !keyFromMediaUrl(seoImageUrl) && !seoImageUrl.startsWith("https://")) {
      return { fieldErrors: { seoImageUrl: "Diese Adresse können wir nicht als Bild verwenden." } };
    }

    await prisma.aeliProfile.update({
      where: { id: profile.id },
      data: {
        seoTitle: text(form, "seoTitle", 70) || null,
        seoDescription: text(form, "seoDescription", 200) || null,
        seoImageUrl: seoImageUrl || null,
        seoNoindex: checkbox(form, "seoNoindex"),
      },
    });

    // Ein ausgetauschtes Vorschaubild wird aufgeräumt wie jedes andere Bild.
    await discardReplacedImage(profile.seoImageUrl, seoImageUrl);

    revalidateProfile(profile.handle);
    return { notice: "Gespeichert." };
  });
}

export async function updatePageOptionsAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  return asOwner(async (profile) => {
    await prisma.aeliProfile.update({
      where: { id: profile.id },
      data: {
        smartSort: checkbox(form, "smartSort"),
        showBranding: checkbox(form, "showBranding"),
      },
    });
    revalidateProfile(profile.handle);
    return { notice: "Gespeichert." };
  });
}

export async function updateGateAction(_prev: FormState, form: FormData): Promise<FormState> {
  return asOwner(async (profile) => {
    const gate = text(form, "gate", 20);
    const password = text(form, "gatePassword", 200);

    if (!["NONE", "PASSWORD", "AGE", "EMAIL"].includes(gate)) {
      return formError("Unbekannte Zugangsart.");
    }

    if (gate === "PASSWORD" && !password && !profile.gatePasswordHash) {
      return {
        fieldErrors: {
          gatePassword: "Ohne Passwort schützt die Schranke nichts.",
        },
      };
    }

    await prisma.aeliProfile.update({
      where: { id: profile.id },
      data: {
        gate: gate as "NONE" | "PASSWORD" | "AGE" | "EMAIL",
        // Passwort nur überschreiben, wenn eins eingegeben wurde — ein leeres
        // Feld heißt „unverändert“, nicht „löschen“.
        ...(gate === "PASSWORD" && password
          ? { gatePasswordHash: await bcrypt.hash(password, 12) }
          : {}),
        ...(gate !== "PASSWORD" ? { gatePasswordHash: null } : {}),
      },
    });

    revalidateProfile(profile.handle);
    return { notice: "Zugang aktualisiert." };
  });
}

// ---------------------------------------------------------------------------
// Veröffentlichen
// ---------------------------------------------------------------------------

export async function publishAction(): Promise<void> {
  return asOwner(async (profile) => {
    await prisma.aeliProfile.update({
      where: { id: profile.id },
      data: {
        status: "PUBLISHED",
        // `publishedAt` bleibt beim ersten Mal stehen: es ist das Datum, seit dem
        // es diese Seite gibt, nicht das der letzten Änderung.
        publishedAt: profile.publishedAt ?? new Date(),
      },
    });
    revalidateProfile(profile.handle);
  });
}

export async function unpublishAction(): Promise<void> {
  return asOwner(async (profile) => {
    await prisma.aeliProfile.update({
      where: { id: profile.id },
      data: { status: "DRAFT" },
    });
    revalidateProfile(profile.handle);
  });
}

// ---------------------------------------------------------------------------
// Community-Brücke
// ---------------------------------------------------------------------------

export async function linkTenantAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?weiter=/studio/community");
  return asOwner(async (profile) => {
    const tenantId = text(form, "tenantId", 40);
    if (!tenantId) {
      await prisma.aeliProfile.update({
        where: { id: profile.id },
        data: { linkedTenantId: null },
      });
      revalidateProfile(profile.handle);
      return { notice: "Verknüpfung gelöst." };
    }

    // Über die privilegierte Verbindung, weil `Tenant` unter `aeli_app` nur mit
    // der Policy „aktiv“ lesbar ist — die Besitzfrage steht dort nicht drin. Sie
    // wird deshalb hier ausdrücklich gestellt: nur eine Community, die DIESEM
    // Konto gehört, darf verknüpft werden.
    const owned = await systemPrisma.tenant.findFirst({
      where: { id: tenantId, ownerId: user.id, status: "ACTIVE" },
      select: { id: true },
    });
    if (!owned) return formError("Diese Community gehört nicht zu deinem Konto.");

    await prisma.aeliProfile.update({
      where: { id: profile.id },
      data: { linkedTenantId: owned.id },
    });

    revalidateProfile(profile.handle);
    return {
      notice: "Community verknüpft. Die Brücken-Blöcke stehen jetzt bereit.",
    };
  });
}

/**
 * Einen Verbindungscode aus Aera einlösen.
 *
 * Der Weg für den Fall, dass Aeli-Seite und Community zu ZWEI Konten gehören —
 * etwa weil hier eine andere E-Mail benutzt wurde. Die Auswahl darüber zeigt
 * nur Communities, die diesem Konto gehören; sie hilft dann nicht weiter.
 *
 * Die Erlaubnis kommt von der Community-Seite: ein signierter, befristeter Code
 * (lib/link-code.ts). Wir prüfen die Signatur, holen den Namen der Community —
 * und schreiben den Zeiger. Der Community-Besitzer sieht die Verknüpfung
 * anschließend in seinem Dashboard und kann sie jederzeit wieder lösen.
 */
export async function redeemLinkCodeAction(_prev: FormState, form: FormData): Promise<FormState> {
  return asOwner(async (profile) => {
    if (!linkCodesConfigured()) {
      return formError("Verbindungscodes sind auf diesem Server nicht eingerichtet.");
    }

    const code = text(form, "code", 400);
    if (!code) return { fieldErrors: { code: "Bitte füg den Code aus Aera ein." } };

    const result = verifyLinkCode(code);
    if (!result.ok) {
      return {
        fieldErrors: {
          code:
            result.reason === "expired"
              ? "Der Code ist abgelaufen. Erzeug in Aera einen neuen — sie gelten 30 Minuten."
              : "Diesen Code können wir nicht lesen. Hast du ihn vollständig kopiert?",
        },
      };
    }

    // Der Code beweist die Erlaubnis, nicht die Existenz. Über die
    // privilegierte Verbindung nachsehen, ob es die Community noch gibt —
    // `aeli_app` sieht nur aktive Tenants und könnte „gelöscht" nicht von
    // „gesperrt" unterscheiden.
    const tenant = await systemPrisma.tenant.findFirst({
      where: { id: result.tenantId, status: "ACTIVE" },
      select: { id: true, name: true },
    });
    if (!tenant) return formError("Diese Community gibt es nicht mehr.");

    await prisma.aeliProfile.update({
      where: { id: profile.id },
      data: { linkedTenantId: tenant.id },
    });

    revalidateProfile(profile.handle);
    return { notice: `Verknüpft mit „${tenant.name}“. Die Brücken-Bausteine stehen bereit.` };
  });
}

// ---------------------------------------------------------------------------
// Blöcke
// ---------------------------------------------------------------------------

const BLOCK_TYPES: AeliBlockType[] = [
  "LINK",
  "HEADER",
  "TEXT",
  "SOCIAL_ROW",
  "DIVIDER",
  "EMBED",
  "IMAGE",
  "COMMUNITY_CTA",
  "NEWSLETTER",
  "TIP",
  "PRODUCT",
  "BOOKING",
  "LIVE_NOW",
  "MUSIC",
  "CONTACT",
  "QR_SHARE",
  "AERA_EVENTS",
  "AERA_TIERS",
  "AERA_SHOP",
  "AERA_COURSES",
  "AERA_SPACES",
];

export async function addBlockAction(formData: FormData): Promise<void> {
  return asOwner(async (profile) => {
    const type = String(formData.get("type") ?? "");
    if (!BLOCK_TYPES.includes(type as AeliBlockType)) return;

    // Auf welche Karte. Ohne Angabe die erste — aber der Baukasten schickt sie
    // immer mit, weil ein Baustein sonst auf einer Karte landen koennte, die
    // der Creator gerade gar nicht ansieht.
    const card = pickCard(profile, text(formData, "cardId", 40));
    if (!card) return;

    const descriptor = blockDescriptor(type as AeliBlockType);
    if (descriptor.needsCommunity && !profile.linkedTenantId) return;

    // Neue Blöcke kommen ans Ende IHRER Karte. Das ist die Erwartung beim Klick
    // auf „Hinzufügen“ — und der einzige Platz, der keine bestehende
    // Reihenfolge durcheinanderbringt.
    const nextOrder = card.blocks.reduce((max, block) => Math.max(max, block.sortOrder), -1) + 1;

    await prisma.aeliBlock.create({
      data: {
        profileId: profile.id,
        cardId: card.id,
        type: type as AeliBlockType,
        title: descriptor.defaults.title ?? null,
        subtitle: descriptor.defaults.subtitle ?? null,
        sortOrder: nextOrder,
      },
    });

    revalidateProfile(profile.handle);
  });
}

/** Die genannte Karte, sonst die erste. `null` nur bei einem Profil ohne. */
function pickCard(profile: ProfileWithBlocks, cardId: string) {
  return profile.cards.find((card) => card.id === cardId) ?? profile.cards[0] ?? null;
}

export async function updateBlockAction(_prev: FormState, form: FormData): Promise<FormState> {
  return asOwner(async (profile) => {
    const id = text(form, "id", 40);
    const block = allBlocks(profile).find((entry) => entry.id === id);
    if (!block) return formError("Diesen Block gibt es nicht mehr.");

    const descriptor = blockDescriptor(block.type);
    const hrefRaw = text(form, "href", 2000);
    let href: string | null = null;
    if (hrefRaw) {
      href = normalizeExternalUrl(hrefRaw);
      if (!href)
        return {
          fieldErrors: { href: "Diese Adresse können wir nicht öffnen." },
        };
    } else if (descriptor.needsHref) {
      return { fieldErrors: { href: "Ohne Ziel passiert beim Klick nichts." } };
    }

    const config = blockConfigSchema.safeParse({
      highlight: checkbox(form, "highlight"),
      thumbnailUrl: text(form, "thumbnailUrl", 2000) || undefined,
      badge: text(form, "badge", 24) || undefined,
      variantHref: text(form, "variantHref", 2000) || undefined,
      embedUrl: text(form, "embedUrl", 2000) || undefined,
      alt: text(form, "alt", 300) || undefined,
      buttonLabel: text(form, "buttonLabel", 40) || undefined,
      successMessage: text(form, "successMessage", 200) || undefined,
      withMessage: checkbox(form, "withMessage"),
      ctaLabel: text(form, "ctaLabel", 40) || undefined,
      priceCents: priceToCents(text(form, "price", 20)),
      currency: text(form, "currency", 3).toUpperCase() || undefined,
      amounts: parseAmounts(text(form, "amounts", 80)),
      limit: parseLimit(text(form, "limit", 3)),
    });

    const startsAt = parseDateTime(text(form, "startsAt", 40));
    const endsAt = parseDateTime(text(form, "endsAt", 40));
    if (startsAt && endsAt && endsAt <= startsAt) {
      return { fieldErrors: { endsAt: "Das Ende liegt vor dem Anfang." } };
    }

    await prisma.aeliBlock.update({
      where: { id: block.id },
      data: {
        title: text(form, "title", 120) || null,
        subtitle: text(form, "subtitle", 200) || null,
        href,
        mediaUrl: text(form, "mediaUrl", 2000) || null,
        icon: text(form, "icon", 8) || null,
        config: config.success ? config.data : {},
        startsAt,
        endsAt,
      },
    });

    revalidateProfile(profile.handle);
    return { notice: "Gespeichert." };
  });
}

/**
 * Wie viele Einträge ein AERA_*-Baustein zeigt.
 *
 * Leer heißt „Voreinstellung", nicht „null" — deshalb `undefined` und nicht 0.
 * Alles ausserhalb von 1..6 verwirft das Schema ohnehin; hier fällt nur weg,
 * was gar keine Zahl ist.
 */
function parseLimit(raw: string): number | undefined {
  if (!raw) return undefined;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : undefined;
}

export async function toggleBlockAction(formData: FormData): Promise<void> {
  return asOwner(async (profile) => {
    const id = String(formData.get("id") ?? "");
    const block = allBlocks(profile).find((entry) => entry.id === id);
    if (!block) return;

    await prisma.aeliBlock.update({
      where: { id: block.id },
      data: { isVisible: !block.isVisible },
    });
    revalidateProfile(profile.handle);
  });
}

export async function deleteBlockAction(formData: FormData): Promise<void> {
  return asOwner(async (profile) => {
    const id = String(formData.get("id") ?? "");
    if (!allBlocks(profile).some((entry) => entry.id === id)) return;

    await prisma.aeliBlock.delete({ where: { id } });
    revalidateProfile(profile.handle);
  });
}

export async function duplicateBlockAction(formData: FormData): Promise<void> {
  return asOwner(async (profile) => {
    const id = String(formData.get("id") ?? "");
    const block = allBlocks(profile).find((entry) => entry.id === id);
    if (!block) return;

    // Die Kopie landet direkt unter dem Original, nicht am Ende: wer dupliziert,
    // will meistens eine Variante nebendran, keine am Fuß der Seite.
    await withAeliTransaction(async (tx) => {
      await tx.aeliBlock.updateMany({
        // Nur die Karte des Originals ruecken: die Reihenfolgen der anderen
        // Karten haben mit dieser Kopie nichts zu tun.
        where: { cardId: block.cardId, sortOrder: { gt: block.sortOrder } },
        data: { sortOrder: { increment: 1 } },
      });
      await tx.aeliBlock.create({
        data: {
          profileId: profile.id,
          cardId: block.cardId,
          type: block.type,
          title: block.title ? `${block.title} (Kopie)` : null,
          subtitle: block.subtitle,
          href: block.href,
          mediaUrl: block.mediaUrl,
          icon: block.icon,
          config: block.config ?? {},
          sortOrder: block.sortOrder + 1,
          // Die Kopie startet unsichtbar. Sie ist noch nicht fertig, und eine
          // doppelte Zeile auf der öffentlichen Seite sieht nach Fehler aus.
          isVisible: false,
          startsAt: block.startsAt,
          endsAt: block.endsAt,
        },
      });
    });

    revalidateProfile(profile.handle);
  });
}

/**
 * Neue Reihenfolge in einem Rutsch.
 *
 * Der Client schickt die vollständige Liste der IDs. Das ist robuster als
 * „schiebe Block X um eine Position“: Wenn zwei Fenster offen sind, gewinnt die
 * zuletzt gespeicherte Liste vollständig, statt dass sich zwei Verschiebungen
 * zu einer dritten Reihenfolge addieren.
 */
export async function reorderBlocksAction(cardId: string, orderedIds: string[]): Promise<void> {
  return asOwner(async (profile) => {
    // Sortiert wird innerhalb EINER Karte. Die vollständige Liste bezieht sich
    // deshalb auf sie, nicht auf die Seite — sonst wäre jede Sortierung auf
    // Karte 2 ein stiller Eingriff in Karte 1.
    const card = profile.cards.find((entry) => entry.id === cardId);
    if (!card) return;
    const known = new Set(card.blocks.map((block) => block.id));
    const ids = orderedIds.filter((id) => known.has(id));
    if (ids.length !== card.blocks.length) return;

    await withAeliTransaction(async (tx) => {
      for (const [index, id] of ids.entries()) {
        await tx.aeliBlock.update({
          where: { id },
          data: { sortOrder: index },
        });
      }
    });

    revalidateProfile(profile.handle);
  });
}

// ---------------------------------------------------------------------------
// Kleinkram
// ---------------------------------------------------------------------------

/** „12,50“ und „12.50“ meinen dasselbe. Beides wird zu 1250. */
function priceToCents(input: string): number | undefined {
  if (!input) return undefined;
  const value = Number(input.replace(",", "."));
  if (!Number.isFinite(value) || value < 0) return undefined;
  return Math.round(value * 100);
}

/** „3, 5, 10“ → [300, 500, 1000] */
function parseAmounts(input: string): number[] | undefined {
  if (!input) return undefined;
  const values = input
    .split(/[,;\s]+/)
    .map((part) => priceToCents(part))
    .filter((cents): cents is number => typeof cents === "number" && cents >= 100);
  return values.length ? values.slice(0, 4) : undefined;
}

/**
 * Erwartet einen vollständigen Zeitpunkt MIT Zone (`…Z` oder `…+02:00`).
 *
 * Ein `datetime-local`-Feld liefert „2026-08-07T14:30“ ohne Zone, und
 * `new Date()` liest das als Ortszeit des laufenden Prozesses — auf einem
 * UTC-Server also zwei Stunden neben dem, was der Creator gemeint hat. Der
 * Editor rechnet deshalb im Browser um und schickt den Zeitpunkt absolut
 * (siehe components/studio/schedule-fields.tsx). Kommt hier trotzdem etwas
 * ohne Zone an, wird es verworfen statt geraten.
 */
function parseDateTime(input: string): Date | null {
  if (!input) return null;
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(input)) return null;
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}
