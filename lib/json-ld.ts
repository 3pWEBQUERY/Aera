/**
 * schema.org-Bausteine fuer JSON-LD. Reine Funktionen ohne Server-Importe —
 * die Komponente dazu ist components/seo/json-ld.tsx.
 */

export type JsonLdValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | JsonLdValue[]
  | { [key: string]: JsonLdValue };
export type JsonLdObject = { [key: string]: JsonLdValue };

/**
 * JSON fuer einen `<script>`-Datenblock. JSON.stringify allein laesst `<` stehen,
 * und `</script>` in einem Beitragstitel beendete sonst den Block. U+2028/2029
 * sind in JSON erlaubt, in aelteren JS-Parsern aber Zeilenenden.
 */
export function serializeJsonLd(data: JsonLdObject | JsonLdObject[]): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** Plain text for a description: no tags, collapsed whitespace, cut on a word. */
export function plainText(value: string | null | undefined, max = 300): string {
  const text = (value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
}

export function organizationJsonLd(opts: {
  name: string;
  url: string;
  logo: string;
  description?: string;
}): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${opts.url}/#organization`,
    name: opts.name,
    url: opts.url,
    logo: opts.logo,
    ...(opts.description ? { description: opts.description } : {}),
  };
}

export function websiteJsonLd(opts: {
  name: string;
  url: string;
  inLanguage: string;
  description?: string;
}): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${opts.url}/#website`,
    name: opts.name,
    url: opts.url,
    inLanguage: opts.inLanguage,
    publisher: { "@id": `${opts.url}/#organization` },
    ...(opts.description ? { description: opts.description } : {}),
  };
}

export function blogPostingJsonLd(opts: {
  url: string;
  headline: string;
  description?: string | null;
  image?: string | null;
  datePublished?: Date | null;
  dateModified?: Date | null;
  authorName?: string | null;
  inLanguage: string;
  publisher: { name: string; url: string; logo: string };
}): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    mainEntityOfPage: opts.url,
    url: opts.url,
    headline: opts.headline.slice(0, 110),
    ...(opts.description ? { description: opts.description } : {}),
    ...(opts.image ? { image: [opts.image] } : {}),
    ...(opts.datePublished ? { datePublished: opts.datePublished.toISOString() } : {}),
    ...(opts.dateModified ? { dateModified: opts.dateModified.toISOString() } : {}),
    inLanguage: opts.inLanguage,
    author: opts.authorName
      ? { "@type": "Person", name: opts.authorName }
      : { "@type": "Organization", name: opts.publisher.name, url: opts.publisher.url },
    publisher: {
      "@type": "Organization",
      name: opts.publisher.name,
      url: opts.publisher.url,
      logo: { "@type": "ImageObject", url: opts.publisher.logo },
    },
  };
}

export function discussionForumPostingJsonLd(opts: {
  url: string;
  headline: string;
  text: string;
  authorName: string;
  datePublished: Date;
  dateModified?: Date | null;
  image?: string | null;
  commentCount: number;
  upvotes?: number;
}): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "DiscussionForumPosting",
    mainEntityOfPage: opts.url,
    url: opts.url,
    headline: opts.headline.slice(0, 110),
    text: opts.text,
    author: { "@type": "Person", name: opts.authorName },
    datePublished: opts.datePublished.toISOString(),
    ...(opts.dateModified ? { dateModified: opts.dateModified.toISOString() } : {}),
    ...(opts.image ? { image: opts.image } : {}),
    commentCount: opts.commentCount,
    interactionStatistic: [
      {
        "@type": "InteractionCounter",
        interactionType: "https://schema.org/CommentAction",
        userInteractionCount: opts.commentCount,
      },
      ...(opts.upvotes !== undefined
        ? [
            {
              "@type": "InteractionCounter",
              interactionType: "https://schema.org/LikeAction",
              userInteractionCount: Math.max(0, opts.upvotes),
            },
          ]
        : []),
    ],
  };
}

/**
 * Ein Event. Der Zugangslink (meetingUrl) gehoert NICHT hierher — er ist den
 * Teilnehmenden vorbehalten; als Ort eines Online-Events steht die Seite.
 */
export function eventJsonLd(opts: {
  name: string;
  description?: string | null;
  startDate: Date;
  endDate?: Date | null;
  isOnline: boolean;
  location?: string | null;
  pageUrl: string;
  image?: string | null;
  organizer: { name: string; url: string };
}): JsonLdObject {
  const place = opts.location?.trim();
  const physical = place ? { "@type": "Place", name: place, address: place } : null;
  const virtual = { "@type": "VirtualLocation", url: opts.pageUrl };
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: opts.name,
    url: opts.pageUrl,
    ...(opts.description ? { description: opts.description } : {}),
    startDate: opts.startDate.toISOString(),
    ...(opts.endDate ? { endDate: opts.endDate.toISOString() } : {}),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: opts.isOnline
      ? physical
        ? "https://schema.org/MixedEventAttendanceMode"
        : "https://schema.org/OnlineEventAttendanceMode"
      : "https://schema.org/OfflineEventAttendanceMode",
    location: opts.isOnline ? (physical ? [virtual, physical] : virtual) : (physical ?? virtual),
    ...(opts.image ? { image: [opts.image] } : {}),
    organizer: { "@type": "Organization", name: opts.organizer.name, url: opts.organizer.url },
  };
}
