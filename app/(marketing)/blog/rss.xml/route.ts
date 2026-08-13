import prisma from "@/lib/prisma";
import { FEED_LIMIT, publicPostWhere } from "@/lib/blog";
import { env } from "@/lib/env";

/**
 * Der Feed.
 *
 * Ein Blog ohne Feed ist eine Sackgasse: wer Aera verfolgen will, muss sonst
 * regelmaessig von sich aus nachschauen. Der Feed kostet diese vierzig Zeilen
 * und wird von Readern, von Zapier und von so ziemlich jedem Werkzeug
 * verstanden, das Neuigkeiten weiterreicht.
 *
 * Alle Sprachen in einem Feed — getrennte Feeds je Sprache waeren die reinere
 * Loesung, aber solange fast alles auf Deutsch erscheint, waeren achtzehn davon
 * leer. Jeder Eintrag traegt seine Sprache, das reicht.
 */
export const dynamic = "force-dynamic";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const base = env.APP_URL.replace(/\/+$/, "");
  const posts = await prisma.platformPost.findMany({
    // Dieselbe Bedingung wie ueberall — ein geplanter Beitrag darf auch hier
    // nicht vorzeitig herausfallen.
    where: { ...publicPostWhere(), noindex: false },
    orderBy: { publishedAt: "desc" },
    take: FEED_LIMIT,
    select: {
      slug: true,
      title: true,
      excerpt: true,
      locale: true,
      publishedAt: true,
      category: true,
    },
  });

  const items = posts
    .map((post) => {
      const url = `${base}/blog/${post.slug}`;
      return [
        "    <item>",
        `      <title>${escapeXml(post.title)}</title>`,
        `      <link>${escapeXml(url)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
        post.publishedAt
          ? `      <pubDate>${post.publishedAt.toUTCString()}</pubDate>`
          : "",
        post.excerpt ? `      <description>${escapeXml(post.excerpt)}</description>` : "",
        post.category ? `      <category>${escapeXml(post.category)}</category>` : "",
        `      <dc:language>${escapeXml(post.locale)}</dc:language>`,
        "    </item>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    "  <channel>",
    "    <title>Aera</title>",
    `    <link>${escapeXml(`${base}/blog`)}</link>`,
    "    <description>Neuigkeiten über Aera</description>",
    `    <atom:link href="${escapeXml(`${base}/blog/rss.xml`)}" rel="self" type="application/rss+xml" />`,
    ...(posts[0]?.publishedAt
      ? [`    <lastBuildDate>${posts[0].publishedAt.toUTCString()}</lastBuildDate>`]
      : []),
    items,
    "  </channel>",
    "</rss>",
  ]
    .filter(Boolean)
    .join("\n");

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=600, s-maxage=600",
    },
  });
}
