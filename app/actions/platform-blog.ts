"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/guards";
import { writeAudit } from "@/lib/audit";
import { tErr } from "@/lib/action-errors";
import { normalizeLocale } from "@/i18n/locales";
import type { PlatformPostStatus } from "@/app/generated/prisma/client";
import { sanitizeRichHtml, htmlToPlainText } from "@/lib/rich-text";
import {
  MAX_EXCERPT_LENGTH,
  blogSlug,
  excerptFrom,
  freeBlogSlug,
  parseCategory,
  readingMinutes,
} from "@/lib/blog";

/**
 * Der Blog der Plattform, geschrieben im Admin-Bereich.
 *
 * Jede Aktion hier verlangt `requirePlatformAdmin()` — das wirft fuer alle
 * anderen einen 404, nicht einen 403: wer keinen Admin-Bereich hat, soll auch
 * nicht erfahren, dass es einen gibt.
 *
 * Geschrieben wird ueber den normalen `prisma`-Zugang. Das ist hier richtig und
 * nicht nachlaessig: `PlatformPost` traegt keine `tenantId`, faellt damit nicht
 * unter die Tenant-RLS und ist der Rolle `aera_app` gar nicht erst zugeteilt.
 * Es gibt keinen Mandanten, gegen den isoliert werden koennte.
 */

export interface BlogState {
  error?: string;
  ok?: boolean;
  /** Nach dem Anlegen: die Kennung des frisch gespeicherten Beitrags. */
  id?: string;
  /**
   * Der tatsaechlich gespeicherte Stand.
   *
   * Der Editor haelt Status und Datum in einem eigenen Zustand, damit die
   * Oberflaeche beim Tippen reagiert. Nach dem Speichern entscheidet aber der
   * Server — er setzt beim Veroeffentlichen etwa ein fehlendes Datum. Ohne
   * diese Rueckmeldung stuende oben weiter „Entwurf", obwohl der Beitrag
   * bereits oeffentlich ist: ein stiller Widerspruch, und der ist schlimmer
   * als eine Fehlermeldung.
   */
  status?: PlatformPostStatus;
  publishedAt?: string;
}

const MAX_BODY_LENGTH = 200_000;

function field(form: FormData, name: string, max: number): string {
  return String(form.get(name) ?? "").trim().slice(0, max);
}

/**
 * Alles auffrischen, was diesen Beitrag zeigt.
 *
 * Auch die alte Adresse, wenn sie sich geaendert hat — sonst liegt unter der
 * bisherigen URL noch der zwischengespeicherte Beitrag, obwohl er dort nicht
 * mehr existiert.
 */
function revalidateBlog(slugs: Array<string | null | undefined>): void {
  revalidatePath("/admin/blog");
  // Auch die Bearbeitungsseite: sonst zeigt sie nach einem Wechsel aus der
  // Liste heraus (veroeffentlichen, hervorheben) noch den alten Stand.
  revalidatePath("/admin/blog/[id]", "page");
  revalidatePath("/blog");
  revalidatePath("/blog/rss.xml");
  for (const slug of new Set(slugs.filter(Boolean))) {
    revalidatePath(`/blog/${slug}`);
  }
}

/**
 * Nur ein Aufmacher pro Sprache.
 *
 * Die Datenbank erlaubt mehrere — ein partieller Unique-Index waere hier
 * strenger, als der Redaktion lieb ist (zwei Beitraege kurz gleichzeitig
 * hervorheben zu wollen ist kein Datenfehler). Stattdessen raeumt das Setzen
 * die anderen ab, was genau das tut, was man erwartet, wenn man einen zweiten
 * Beitrag nach oben holt.
 */
async function clearOtherFeatured(locale: string, keepId: string): Promise<void> {
  await prisma.platformPost.updateMany({
    where: { locale, isFeatured: true, id: { not: keepId } },
    data: { isFeatured: false },
  });
}

/**
 * Das Bild eines Beitrags.
 *
 * Erlaubt sind nur die eigenen Ablagepfade und https. Das Feld wird zwar von
 * unserem eigenen Upload gefuellt, aber es kommt trotzdem aus dem Browser —
 * und ein `javascript:` im `src` eines Titelbildes waere ein gefundenes
 * Fressen.
 */
function safeCoverUrl(value: string): string | null {
  if (!value) return null;
  if (value.startsWith("/api/platform-media/") || value.startsWith("/api/media/")) return value;
  if (/^https:\/\//i.test(value)) return value.slice(0, 500);
  return null;
}

/**
 * Anlegen und Speichern in einer Aktion.
 *
 * Zwei getrennte Aktionen haetten dieselben zwanzig Felder zweimal geprueft.
 * Ob angelegt oder gespeichert wird, entscheidet ein einziges verstecktes Feld.
 */
export async function savePostAction(_prev: BlogState, form: FormData): Promise<BlogState> {
  const admin = await requirePlatformAdmin();

  const id = field(form, "id", 40);
  const existing = id
    ? await prisma.platformPost.findUnique({ where: { id } })
    : null;
  if (id && !existing) return { error: await tErr("postNotFound") };

  const title = field(form, "title", 200);
  if (!title) return { error: await tErr("titleRequired") };
  if (title.length > 160) return { error: await tErr("titleTooLong160") };

  // Erst bereinigen, dann pruefen, ob etwas uebrig bleibt. Ein Beitrag, der nur
  // aus einem <script> besteht, ist leer — und die Meldung dazu soll "kein
  // Text" heissen und nicht "gespeichert".
  const bodyHtml = sanitizeRichHtml(field(form, "bodyHtml", MAX_BODY_LENGTH));
  const plain = htmlToPlainText(bodyHtml);
  const hasMedia = /<(img|video)/i.test(bodyHtml);
  if (!plain && !hasMedia) return { error: await tErr("blogBodyRequired") };

  const locale = normalizeLocale(field(form, "locale", 12));

  // Die Adresse folgt dem Titel nur, solange niemand sie selbst angefasst hat.
  // Sonst zerbricht jedes Umbenennen einen geteilten Link — und das ist eine
  // Entscheidung, die man treffen koennen muss, keine, die nebenbei passiert.
  const wished = blogSlug(field(form, "slug", 120));
  let slug: string;
  if (existing) {
    slug = wished || existing.slug;
    if (slug !== existing.slug) {
      const taken = await prisma.platformPost.findFirst({
        where: { locale, slug, id: { not: existing.id } },
        select: { id: true },
      });
      if (taken) return { error: await tErr("blogSlugTaken") };
    }
  } else {
    const used = await prisma.platformPost.findMany({
      where: { locale },
      select: { slug: true },
    });
    slug = freeBlogSlug(used.map((entry) => entry.slug), wished || title);
  }

  const status: PlatformPostStatus =
    field(form, "status", 20) === "PUBLISHED" ? "PUBLISHED" : "DRAFT";

  // Ein Datum in der Zukunft heisst "geplant"; leer beim Veroeffentlichen
  // heisst "jetzt". Beim Zurueckziehen bleibt das Datum stehen, damit ein
  // erneutes Veroeffentlichen nicht so tut, als sei der Beitrag neu.
  const dateRaw = field(form, "publishedAt", 40);
  const parsed = dateRaw ? new Date(dateRaw) : null;
  const chosen = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
  const publishedAt =
    chosen ??
    (status === "PUBLISHED"
      ? (existing?.publishedAt ?? new Date())
      : (existing?.publishedAt ?? null));

  const excerptInput = field(form, "excerpt", MAX_EXCERPT_LENGTH);
  const data = {
    locale,
    slug,
    title,
    // Leer heisst "leite ihn ab" — ein Beitrag ohne Anriss saehe in der
    // Uebersicht aus wie ein Fehler.
    excerpt: excerptInput || excerptFrom(plain) || null,
    bodyHtml,
    coverUrl: safeCoverUrl(field(form, "coverUrl", 500)),
    coverAlt: field(form, "coverAlt", 200) || null,
    category: parseCategory(form.get("category")),
    status,
    publishedAt,
    isFeatured: form.get("isFeatured") === "on",
    readingMinutes: readingMinutes(plain),
    seoTitle: field(form, "seoTitle", 160) || null,
    seoDescription: field(form, "seoDescription", 320) || null,
    noindex: form.get("noindex") === "on",
  };

  let saved;
  try {
    saved = existing
      ? await prisma.platformPost.update({ where: { id: existing.id }, data })
      : await prisma.platformPost.create({ data: { ...data, authorId: admin.id } });
  } catch (e) {
    // Der eindeutige Index entscheidet, nicht die Pruefung oben: dazwischen
    // liegt Zeit, in der ein zweites Fenster denselben Slug belegen kann.
    if ((e as { code?: string }).code === "P2002") {
      return { error: await tErr("blogSlugTaken") };
    }
    throw e;
  }

  if (saved.isFeatured) await clearOtherFeatured(locale, saved.id);

  await writeAudit({
    actorUserId: admin.id,
    action: existing ? "admin.blog.update" : "admin.blog.create",
    targetType: "PlatformPost",
    targetId: saved.id,
    metadata: { slug: saved.slug, status: saved.status },
  });
  revalidateBlog([saved.slug, existing?.slug]);

  // Beim Anlegen fuehrt der Weg auf die Bearbeitungsseite: die Adresse enthaelt
  // ab jetzt die Kennung, damit ein Neuladen nicht einen zweiten Beitrag
  // anlegt.
  if (!existing) redirect(`/admin/blog/${saved.id}?neu=1`);
  return {
    ok: true,
    id: saved.id,
    status: saved.status,
    publishedAt: saved.publishedAt?.toISOString() ?? "",
  };
}

/** Veroeffentlichen oder zurueckziehen — der Schalter aus der Liste. */
export async function setPostStatusAction(form: FormData): Promise<void> {
  const admin = await requirePlatformAdmin();
  const id = field(form, "id", 40);
  const publish = form.get("publish") === "1";

  const post = await prisma.platformPost.findUnique({ where: { id } });
  if (!post) return;

  const updated = await prisma.platformPost.update({
    where: { id },
    data: {
      status: publish ? "PUBLISHED" : "DRAFT",
      publishedAt: publish ? (post.publishedAt ?? new Date()) : post.publishedAt,
    },
  });

  await writeAudit({
    actorUserId: admin.id,
    action: publish ? "admin.blog.publish" : "admin.blog.unpublish",
    targetType: "PlatformPost",
    targetId: id,
    metadata: { slug: updated.slug },
  });
  revalidateBlog([updated.slug]);
}

/** Einen Beitrag nach oben holen — oder den Aufmacher wieder freigeben. */
export async function toggleFeaturedAction(form: FormData): Promise<void> {
  const admin = await requirePlatformAdmin();
  const id = field(form, "id", 40);

  const post = await prisma.platformPost.findUnique({ where: { id } });
  if (!post) return;

  const updated = await prisma.platformPost.update({
    where: { id },
    data: { isFeatured: !post.isFeatured },
  });
  if (updated.isFeatured) await clearOtherFeatured(updated.locale, updated.id);

  await writeAudit({
    actorUserId: admin.id,
    action: "admin.blog.feature",
    targetType: "PlatformPost",
    targetId: id,
    metadata: { featured: updated.isFeatured },
  });
  revalidateBlog([updated.slug]);
}

/**
 * Eine Kopie als Entwurf.
 *
 * Nuetzlich fuer wiederkehrende Formate ("Was ist neu im August") und fuer die
 * Uebersetzung: kopieren, Sprache umstellen, Text ersetzen. Die Kopie ist immer
 * ein Entwurf und nie der Aufmacher — sonst stuende sie sofort oeffentlich da.
 */
export async function duplicatePostAction(form: FormData): Promise<void> {
  const admin = await requirePlatformAdmin();
  const id = field(form, "id", 40);

  const post = await prisma.platformPost.findUnique({ where: { id } });
  if (!post) return;

  const used = await prisma.platformPost.findMany({
    where: { locale: post.locale },
    select: { slug: true },
  });
  const copy = await prisma.platformPost.create({
    data: {
      locale: post.locale,
      slug: freeBlogSlug(used.map((entry) => entry.slug), post.slug),
      title: post.title,
      excerpt: post.excerpt,
      bodyHtml: post.bodyHtml,
      coverUrl: post.coverUrl,
      coverAlt: post.coverAlt,
      category: post.category,
      status: "DRAFT",
      publishedAt: null,
      isFeatured: false,
      readingMinutes: post.readingMinutes,
      seoTitle: post.seoTitle,
      seoDescription: post.seoDescription,
      noindex: post.noindex,
      authorId: admin.id,
    },
  });

  await writeAudit({
    actorUserId: admin.id,
    action: "admin.blog.duplicate",
    targetType: "PlatformPost",
    targetId: copy.id,
    metadata: { from: id },
  });
  revalidateBlog([]);
  redirect(`/admin/blog/${copy.id}`);
}

export async function deletePostAction(form: FormData): Promise<void> {
  const admin = await requirePlatformAdmin();
  const id = field(form, "id", 40);

  const post = await prisma.platformPost.delete({ where: { id } }).catch(() => null);
  if (!post) return;

  await writeAudit({
    actorUserId: admin.id,
    action: "admin.blog.delete",
    targetType: "PlatformPost",
    targetId: id,
    metadata: { slug: post.slug, title: post.title },
  });
  revalidateBlog([post.slug]);
  redirect("/admin/blog");
}
