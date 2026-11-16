/**
 * Was alles als "Inhalt" eines Space zählt.
 *
 * Der Space-Typ entscheidet, welche Tabelle die Space-Seite liest: Ein Feed
 * zeigt Beiträge, ein Kurs-Space Kurse, ein Shop Produkte. Wechselt der Typ,
 * bleiben die alten Zeilen zwar in der Datenbank, aber keine Seite zeigt sie
 * mehr an. Deshalb ist der Typ gesperrt, sobald hier irgendetwas gezählt wird.
 *
 * Reine Daten (kein "server-only"), damit Seite und Action dieselbe Liste
 * benutzen.
 */
export const SPACE_CONTENT_COUNT_SELECT = {
  posts: true,
  courses: true,
  events: true,
  products: true,
  articles: true,
  liveSessions: true,
  mediaPackages: true,
  chatMessages: true,
  memberRequests: true,
  bookingSlots: true,
  stories: true,
  tips: true,
} as const;

export type SpaceContentCounts = Record<keyof typeof SPACE_CONTENT_COUNT_SELECT, number>;

export function sumSpaceContent(counts: SpaceContentCounts): number {
  return Object.values(counts).reduce((sum, n) => sum + n, 0);
}
