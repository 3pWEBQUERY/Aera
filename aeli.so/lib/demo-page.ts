import { resolveTheme } from "./themes";
import { EMPTY_AERA_CONTENT, type PageData } from "@/components/page/types";

/**
 * Die Beispielseite im Hero.
 *
 * Sie wird mit denselben Komponenten gerendert wie eine echte Seite — kein
 * Screenshot, keine nachgebaute Attrappe. Das hat einen praktischen Grund: ein
 * Marketingbild veraltet in dem Moment, in dem sich das Produkt ändert. Diese
 * Vorschau kann das nicht, weil sie das Produkt IST.
 */
export function demoPage(): PageData {
  return {
    profileId: "demo",
    handle: "marie",
    displayName: "Marie Lang",
    bio: "Fotografin in Leipzig. Workshops, Prints und ein Newsletter, der wirklich nur einmal im Monat kommt.",
    avatarUrl: null,
    bannerUrl: null,
    socials: [
      { platform: "instagram", url: "https://instagram.com/example" },
      { platform: "youtube", url: "https://youtube.com/@example" },
      { platform: "spotify", url: "https://open.spotify.com/artist/example" },
    ],
    theme: resolveTheme({ preset: "mitternacht" }),
    blocks: [
      {
        id: "demo-1",
        type: "LINK",
        title: "Workshop: Available Light",
        subtitle: "14. September · noch 3 Plätze",
        href: "https://example.com",
        mediaUrl: null,
        icon: "📷",
        config: { highlight: true, badge: "fast voll" },
      },
      {
        id: "demo-2",
        type: "COMMUNITY_CTA",
        title: "Community beitreten",
        subtitle: "Feedback-Runden, Presets, monatlicher Call",
        href: null,
        mediaUrl: null,
        icon: null,
        config: {},
      },
      {
        id: "demo-3",
        type: "LINK",
        title: "Prints im Shop",
        subtitle: null,
        href: "https://example.com",
        mediaUrl: null,
        icon: "🖼",
        config: {},
      },
      {
        id: "demo-5",
        type: "AERA_EVENTS",
        title: "Nächste Termine",
        subtitle: null,
        href: null,
        mediaUrl: null,
        icon: null,
        config: { limit: 2 },
      },
      {
        id: "demo-4",
        type: "NEWSLETTER",
        title: "Einmal im Monat",
        subtitle: "Ein Bild, ein Gedanke, kein Werbeblock.",
        href: null,
        mediaUrl: null,
        icon: null,
        config: {},
      },
    ],
    showBranding: true,
    gate: "NONE",
    community: {
      name: "Lichtwerk",
      url: "https://example.com",
      logoUrl: null,
      tagline: "Die Community hinter den Workshops",
    },
    isLive: false,
    tipsEnabled: false,
    // Auf einer echten Seite stünde hier, was gerade in Aera steht. Im Hero
    // sind es feste Werte — das Bild soll morgen dasselbe zeigen wie heute.
    aera: {
      ...EMPTY_AERA_CONTENT,
      events: [
        {
          id: "demo-event-1",
          title: "Available Light — Abendworkshop",
          dayLabel: "14",
          monthLabel: "Sep",
          timeLabel: "19:00",
          dateLabel: "Do, 14. Sep 2026, 19:00",
          startsAt: "2026-09-14T17:00:00.000Z",
          location: "Leipzig, Spinnerei",
          isOnline: false,
          url: "https://example.com",
        },
        {
          id: "demo-event-2",
          title: "Portfolio-Runde",
          dayLabel: "30",
          monthLabel: "Sep",
          timeLabel: "20:00",
          dateLabel: "Di, 30. Sep 2026, 20:00",
          startsAt: "2026-09-30T18:00:00.000Z",
          location: null,
          isOnline: true,
          url: "https://example.com",
        },
      ],
    },
    publicUrl: "https://marie.aeli.so",
  };
}
