import type { ReactNode } from "react";

export interface SocialPlatform {
  key: string;
  label: string;
  color: string; // brand background
  /** URL template with `{u}`; null = freeform website URL. */
  base: string | null;
  /** Shown before the username field (e.g. "instagram.com/"). */
  prefix: string;
  placeholder: string;
}

export const SOCIAL_PLATFORMS: SocialPlatform[] = [
  { key: "instagram", label: "Instagram", color: "#E4405F", base: "https://instagram.com/{u}", prefix: "instagram.com/", placeholder: "benutzername" },
  { key: "x", label: "X", color: "#000000", base: "https://x.com/{u}", prefix: "x.com/", placeholder: "benutzername" },
  { key: "tiktok", label: "TikTok", color: "#000000", base: "https://tiktok.com/@{u}", prefix: "tiktok.com/@", placeholder: "benutzername" },
  { key: "youtube", label: "YouTube", color: "#FF0000", base: "https://youtube.com/@{u}", prefix: "youtube.com/@", placeholder: "kanal" },
  { key: "facebook", label: "Facebook", color: "#1877F2", base: "https://facebook.com/{u}", prefix: "facebook.com/", placeholder: "seite" },
  { key: "threads", label: "Threads", color: "#000000", base: "https://threads.net/@{u}", prefix: "threads.net/@", placeholder: "benutzername" },
  { key: "snapchat", label: "Snapchat", color: "#FFFC00", base: "https://snapchat.com/add/{u}", prefix: "snapchat.com/add/", placeholder: "benutzername" },
  { key: "reddit", label: "Reddit", color: "#FF4500", base: "https://reddit.com/user/{u}", prefix: "reddit.com/user/", placeholder: "benutzername" },
  { key: "pinterest", label: "Pinterest", color: "#E60023", base: "https://pinterest.com/{u}", prefix: "pinterest.com/", placeholder: "benutzername" },
  { key: "telegram", label: "Telegram", color: "#26A5E4", base: "https://t.me/{u}", prefix: "t.me/", placeholder: "benutzername" },
  { key: "website", label: "Website", color: "#0F172A", base: null, prefix: "", placeholder: "https://deine-seite.de" },
];

export const SOCIAL_BY_KEY: Record<string, SocialPlatform> = Object.fromEntries(
  SOCIAL_PLATFORMS.map((p) => [p.key, p]),
);

/** Build a full profile URL from a raw username/handle. */
export function buildSocialUrl(key: string, raw: string): string {
  const p = SOCIAL_BY_KEY[key];
  const v = raw.trim();
  if (!v) return "";
  if (!p || !p.base) return /^https?:\/\//i.test(v) ? v : `https://${v}`;
  const handle = v.replace(/^@+/, "").replace(/\s+/g, "");
  return handle ? p.base.replace("{u}", handle) : "";
}

/** Extract the editable handle back out of a stored URL. */
export function socialHandle(key: string, url: string): string {
  const p = SOCIAL_BY_KEY[key];
  if (!p || !p.base) return url;
  const prefix = p.base.replace("{u}", "");
  if (url.startsWith(prefix)) return url.slice(prefix.length);
  return url.replace(/^https?:\/\/[^/]+\/(?:@|user\/|add\/)?/i, "");
}

// ---------------------------------------------------------------- Brand glyphs
function glyph(key: string, fg: string): ReactNode {
  switch (key) {
    case "instagram":
      return (
        <>
          <rect x="6" y="6" width="12" height="12" rx="3.6" fill="none" stroke={fg} strokeWidth="1.6" />
          <circle cx="12" cy="12" r="3" fill="none" stroke={fg} strokeWidth="1.6" />
          <circle cx="15.6" cy="8.4" r="0.95" fill={fg} />
        </>
      );
    case "x":
      return (
        <path
          d="M7.2 6.5h2.3l2.6 3.6 3-3.6h1.7l-3.9 4.6L17 17.5h-2.3l-2.8-3.9-3.3 3.9H6.9l4.2-5z"
          fill={fg}
        />
      );
    case "facebook":
      return (
        <path
          d="M13.2 18v-5.4h1.8l.3-2.2h-2.1V8.98c0-.64.18-1.07 1.1-1.07h1.17V5.94c-.2-.03-.9-.09-1.7-.09-1.69 0-2.85 1.03-2.85 2.93v1.63H9.1v2.2h1.82V18h2.28z"
          fill={fg}
        />
      );
    case "threads":
      return (
        <path
          d="M15.6 11.6c-.1-.05-.2-.1-.3-.14-.18-3.2-1.96-5-4.9-5.02h-.04c-1.76 0-3.22.75-4.12 2.12l1.4.96c.67-1.02 1.72-1.24 2.72-1.24h.03c.75 0 1.31.22 1.68.65.27.31.45.75.54 1.3-.66-.11-1.37-.14-2.13-.09-2.14.12-3.51 1.37-3.42 3.11.05.88.49 1.64 1.24 2.14.63.42 1.45.63 2.3.58 1.12-.06 2-.49 2.62-1.27.47-.6.77-1.37.9-2.35.53.32.92.74 1.14 1.25.37.87.4 2.3-.77 3.46-1.02 1.02-2.25 1.46-4.1 1.47-2.05-.02-3.6-.68-4.61-1.97-.94-1.2-1.43-2.94-1.45-5.16.02-2.22.51-3.95 1.45-5.16 1-1.29 2.56-1.95 4.6-1.97 2.06.02 3.64.69 4.69 1.99.52.64.9 1.44 1.16 2.38l1.5-.4c-.31-1.15-.8-2.15-1.47-2.98-1.35-1.67-3.33-2.52-5.87-2.54h-.01c-2.54.02-4.5.88-5.81 2.55C4.71 7.42 4.1 9.53 4.08 12v.01c.02 2.47.63 4.58 1.83 6.09 1.32 1.67 3.28 2.53 5.82 2.55h.01c2.26-.02 3.85-.61 5.16-1.92 1.72-1.71 1.66-3.86 1.1-5.18-.4-.95-1.17-1.72-2.2-2.24l-.2-.71zm-4.06 3.4c-.94.05-1.92-.37-1.97-1.3-.03-.68.49-1.44 2.02-1.53.18-.01.35-.02.51-.02.56 0 1.08.05 1.55.16-.18 2.19-1.2 2.64-2.11 2.69z"
          fill={fg}
        />
      );
    case "snapchat":
      return (
        <path
          d="M12 5.4c1.9 0 3.05 1.4 3.13 3.32.03.6-.02 1.1.03 1.36.1.5.85.35 1.32.6.3.16.42.5.15.86-.32.44-1.4.5-1.6.98-.1.24.13.62.5 1 .5.52 1.2.9 1.86 1.05.3.07.36.28.32.47-.1.5-1.2.62-1.68.75-.2.05-.28.16-.32.4-.05.28-.1.55-.5.55-.4 0-.9-.28-1.62-.16-.7.12-1.28.94-2.62.94s-1.92-.82-2.62-.94c-.72-.12-1.22.16-1.62.16-.4 0-.45-.27-.5-.55-.04-.24-.12-.35-.32-.4-.48-.13-1.58-.25-1.68-.75-.04-.19.02-.4.32-.47.66-.15 1.36-.53 1.86-1.05.37-.38.6-.76.5-1-.2-.48-1.28-.54-1.6-.98-.27-.36-.15-.7.15-.86.47-.25 1.22-.1 1.32-.6.05-.26 0-.76.03-1.36C8.95 6.8 10.1 5.4 12 5.4z"
          fill={fg}
        />
      );
    case "reddit":
      return (
        <>
          <circle cx="12" cy="13.5" r="5.5" fill={fg} />
          <circle cx="17.4" cy="7.4" r="1.15" fill={fg} />
          <path d="M12 8.6l.9-3 2.9.7" fill="none" stroke={fg} strokeWidth="1.1" strokeLinecap="round" />
          <circle cx="10" cy="13.2" r="0.95" fill="#FF4500" />
          <circle cx="14" cy="13.2" r="0.95" fill="#FF4500" />
          <path d="M9.8 15.5c1.3.9 3.1.9 4.4 0" fill="none" stroke="#FF4500" strokeWidth="1" strokeLinecap="round" />
        </>
      );
    case "pinterest":
      return (
        <path
          d="M12.2 6c-3.1 0-4.8 2-4.8 4.2 0 1 .55 2.2 1.44 2.6.14.06.2.03.24-.1l.16-.7c.05-.16.03-.22-.1-.36-.3-.36-.53-.9-.53-1.6 0-1.9 1.4-3.5 3.6-3.5 1.96 0 3.03 1.2 3.03 2.8 0 2.1-.93 3.9-2.3 3.9-.76 0-1.32-.63-1.14-1.4.22-.9.63-1.9.63-2.55 0-.6-.32-1.08-.98-1.08-.78 0-1.4.8-1.4 1.88 0 .68.23 1.14.23 1.14l-.94 3.94c-.28 1.16-.04 2.6-.02 2.74 0 .08.1.1.15.04.06-.09.9-1.1 1.18-2.2l.45-1.75c.22.43.88.8 1.58.8 2.08 0 3.5-1.9 3.5-4.44C15.6 8.1 13.95 6 12.2 6z"
          fill={fg}
        />
      );
    case "tiktok":
      return (
        <path
          d="M14.2 5.5c.25 1.55 1.15 2.6 2.8 2.72v1.86c-.98.1-1.84-.22-2.84-.82v3.94c0 3.9-4.25 5.12-5.96 2.33-1.1-1.8-.42-4.96 3.1-5.09v1.96c-.27.04-.56.11-.82.2-.79.27-1.24.77-1.11 1.65.24 1.68 3.3 2.18 3.05-1.11V5.5h1.78z"
          fill={fg}
        />
      );
    case "telegram":
      return (
        <path
          d="M18.4 6.6l-2.2 10.4c-.16.72-.6.9-1.2.56l-3.3-2.44-1.6 1.54c-.18.18-.33.33-.67.33l.24-3.38 6.15-5.56c.27-.24-.06-.37-.42-.13l-7.6 4.78-3.27-1.02c-.71-.22-.72-.71.15-1.05l12.8-4.94c.6-.22 1.12.13.92 1z"
          fill={fg}
        />
      );
    case "youtube":
      return (
        <>
          <rect x="4.5" y="7.5" width="15" height="9" rx="2.6" fill={fg} />
          <path d="M11 10.2l3.6 1.8-3.6 1.8z" fill="#FF0000" />
        </>
      );
    default: // website
      return (
        <>
          <circle cx="12" cy="12" r="6" fill="none" stroke={fg} strokeWidth="1.5" />
          <path d="M6 12h12M12 6c2.3 2.4 2.3 9.6 0 12M12 6c-2.3 2.4-2.3 9.6 0 12" fill="none" stroke={fg} strokeWidth="1.3" />
        </>
      );
  }
}

export function SocialGlyph({
  platform,
  size = 22,
}: {
  platform: string;
  size?: number;
}) {
  const p = SOCIAL_BY_KEY[platform] ?? SOCIAL_BY_KEY.website;
  const gradient = platform === "instagram";
  const fg = platform === "snapchat" ? "#111827" : "#ffffff";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {gradient && (
        <defs>
          <linearGradient id="ig-grad" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#FEDA75" />
            <stop offset="35%" stopColor="#FA7E1E" />
            <stop offset="60%" stopColor="#D62976" />
            <stop offset="100%" stopColor="#4F5BD5" />
          </linearGradient>
        </defs>
      )}
      <rect width="24" height="24" rx={size * 0.28} fill={gradient ? "url(#ig-grad)" : p.color} />
      {glyph(platform, fg)}
    </svg>
  );
}
