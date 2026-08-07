import type { SocialPlatform } from "@/lib/socials";

/**
 * Ein eigener, durchgezeichneter Monoline-Satz statt zusammengesuchter
 * Marken-SVGs.
 *
 * Zusammengesuchte Logos sind auf einer Seite wie dieser der sichtbarste
 * Bruch: unterschiedliche Strichstärken, mal Fläche, mal Kontur, mal ein
 * eingebauter Rand. Alle Icons hier liegen auf demselben 24er-Raster, haben
 * dieselbe Strichstärke und dieselben runden Enden — nebeneinander sehen sie
 * deshalb aus wie eine Reihe und nicht wie eine Sammlung.
 */

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Glyph({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" role="img" aria-label={title} {...STROKE}>
      {children}
    </svg>
  );
}

export function SocialIcon({ platform }: { platform: SocialPlatform }) {
  switch (platform) {
    case "instagram":
      return (
        <Glyph title="Instagram">
          <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17" cy="7" r="0.9" fill="currentColor" stroke="none" />
        </Glyph>
      );
    case "tiktok":
      return (
        <Glyph title="TikTok">
          <path d="M14 3.5v10.2a3.6 3.6 0 1 1-3-3.55" />
          <path d="M14 3.5c.5 2.6 2.1 4 4.6 4.2" />
        </Glyph>
      );
    case "youtube":
      return (
        <Glyph title="YouTube">
          <rect x="2.5" y="5.5" width="19" height="13" rx="4" />
          <path d="M10.3 9.4 15 12l-4.7 2.6z" />
        </Glyph>
      );
    case "x":
      return (
        <Glyph title="X">
          <path d="M4.5 4.5 19.5 19.5" />
          <path d="M19.5 4.5 4.5 19.5" />
        </Glyph>
      );
    case "threads":
      return (
        <Glyph title="Threads">
          <circle cx="12" cy="12" r="3.6" />
          <path d="M15.6 12v1.2a3 3 0 0 0 3 3c1.6-1.4 2.4-3.2 2.4-5.3C21 6.7 17.3 3.2 12.4 3.2 7.4 3.2 3.6 6.9 3.6 12s3.6 8.8 8.6 8.8c1.9 0 3.4-.4 4.7-1.2" />
        </Glyph>
      );
    case "facebook":
      return (
        <Glyph title="Facebook">
          <path d="M14.8 4.2h-1.6a3.2 3.2 0 0 0-3.2 3.2V20" />
          <path d="M8 11.4h6.4" />
        </Glyph>
      );
    case "linkedin":
      return (
        <Glyph title="LinkedIn">
          <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" />
          <path d="M8 10.5V16" />
          <circle cx="8" cy="7.8" r="0.9" fill="currentColor" stroke="none" />
          <path d="M11.6 16v-3.1a2.2 2.2 0 0 1 4.4 0V16" />
          <path d="M11.6 10.5V16" />
        </Glyph>
      );
    case "pinterest":
      return (
        <Glyph title="Pinterest">
          <path d="M9.5 20.5 12 9.8" />
          <path d="M8.6 14.2a4.6 4.6 0 1 1 6.6-4.4c0 3-1.7 5-3.7 5a2 2 0 0 1-2-2.3" />
        </Glyph>
      );
    case "twitch":
      return (
        <Glyph title="Twitch">
          <path d="M4.5 4.5h15v9l-4 4h-3l-3 3h-1.5v-3H4.5z" />
          <path d="M11 8.2v3.6" />
          <path d="M15 8.2v3.6" />
        </Glyph>
      );
    case "discord":
      return (
        <Glyph title="Discord">
          <path d="M8.4 6.2A13 13 0 0 1 12 5.8c1.3 0 2.5.15 3.6.4 2.2 1 3.6 3.6 3.9 8.1a11 11 0 0 1-3.4 1.9l-.9-1.4" />
          <path d="M8.8 14.8l-.9 1.4a11 11 0 0 1-3.4-1.9c.3-4.5 1.7-7.1 3.9-8.1" />
          <circle cx="9.6" cy="12.2" r="1.1" fill="currentColor" stroke="none" />
          <circle cx="14.4" cy="12.2" r="1.1" fill="currentColor" stroke="none" />
        </Glyph>
      );
    case "spotify":
      return (
        <Glyph title="Spotify">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M7.6 9.4c2.9-.8 6-.5 8.6.9" />
          <path d="M8.2 12.4c2.4-.6 4.9-.4 7.1.8" />
          <path d="M8.8 15.2c1.9-.5 3.9-.3 5.6.6" />
        </Glyph>
      );
    case "applemusic":
      return (
        <Glyph title="Apple Music">
          <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
          <path d="M11 15.5V8.8l4.2-1v6" />
          <circle cx="9.6" cy="15.6" r="1.5" />
          <circle cx="13.8" cy="14.2" r="1.5" />
        </Glyph>
      );
    case "soundcloud":
      return (
        <Glyph title="SoundCloud">
          <path d="M4 15.5v-3" />
          <path d="M6.8 16.5v-5" />
          <path d="M9.6 16.5v-7" />
          <path d="M12.4 16.5V8" />
          <path d="M12.4 16.5h5.2a2.9 2.9 0 0 0 0-5.8c-.3 0-.6 0-.9.1A4 4 0 0 0 12.4 8" />
        </Glyph>
      );
    case "github":
      return (
        <Glyph title="GitHub">
          <path d="M9.5 8 6 12l3.5 4" />
          <path d="M14.5 8 18 12l-3.5 4" />
        </Glyph>
      );
    case "telegram":
      return (
        <Glyph title="Telegram">
          <path d="M20.5 4.5 3.8 11.2l4.7 1.6z" />
          <path d="M20.5 4.5 8.5 12.8l.5 5.4 2.9-3.3z" />
        </Glyph>
      );
    case "whatsapp":
      return (
        <Glyph title="WhatsApp">
          <path d="M3.8 20.2 5.1 16a7.6 7.6 0 1 1 3 2.9z" />
          <path d="M9 9.4c.4 2.6 2.6 4.6 5.2 5l1-1.4 1.6.9c-.4 1-1.4 1.5-2.5 1.3-3-.5-5.4-2.9-5.9-5.9-.2-1 .3-2 1.3-2.4z" />
        </Glyph>
      );
    case "patreon":
      return (
        <Glyph title="Patreon">
          <circle cx="14.6" cy="9.8" r="5.3" />
          <path d="M4.6 4.5v15" />
        </Glyph>
      );
    case "email":
      return (
        <Glyph title="E-Mail">
          <rect x="3" y="5.5" width="18" height="13" rx="3" />
          <path d="m4.5 8.5 6.4 4.4a2 2 0 0 0 2.2 0l6.4-4.4" />
        </Glyph>
      );
    case "website":
    default:
      return (
        <Glyph title="Website">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M3.5 12h17" />
          <path d="M12 3.5c2.2 2.3 3.3 5.1 3.3 8.5s-1.1 6.2-3.3 8.5c-2.2-2.3-3.3-5.1-3.3-8.5S9.8 5.8 12 3.5z" />
        </Glyph>
      );
  }
}
