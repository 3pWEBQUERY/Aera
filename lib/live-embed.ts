// Client-safe helpers around live-stream URLs: platform detection for the
// dashboard form and conversion of ordinary channel/video links into proper
// embeddable player URLs for the member-facing live room.

export type LivePlatform =
  | "twitch"
  | "youtube"
  | "tiktok"
  | "kick"
  | "instagram"
  | "chaturbate"
  | "vimeo"
  | "custom";

export interface LivePlatformInfo {
  key: LivePlatform;
  /** Brand name — not translated. */
  label: string;
  domains: string[];
  placeholder: string;
}

export const LIVE_PLATFORMS: LivePlatformInfo[] = [
  { key: "twitch", label: "Twitch", domains: ["twitch.tv"], placeholder: "https://twitch.tv/deinkanal" },
  { key: "youtube", label: "YouTube", domains: ["youtube.com", "youtu.be"], placeholder: "https://youtube.com/watch?v=…" },
  { key: "tiktok", label: "TikTok", domains: ["tiktok.com"], placeholder: "https://tiktok.com/@deinname/live" },
  { key: "kick", label: "Kick", domains: ["kick.com"], placeholder: "https://kick.com/deinkanal" },
  { key: "instagram", label: "Instagram", domains: ["instagram.com"], placeholder: "https://instagram.com/deinname/live" },
  { key: "chaturbate", label: "Chaturbate", domains: ["chaturbate.com"], placeholder: "https://chaturbate.com/deinname" },
  { key: "vimeo", label: "Vimeo", domains: ["vimeo.com"], placeholder: "https://vimeo.com/123456789" },
  { key: "custom", label: "", domains: [], placeholder: "https://…" },
];

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/** Best-effort platform detection from an arbitrary URL. */
export function detectLivePlatform(url: string): LivePlatform | null {
  const host = hostnameOf(url);
  if (!host) return null;
  for (const p of LIVE_PLATFORMS) {
    if (p.domains.some((d) => host === d || host.endsWith(`.${d}`))) return p.key;
  }
  return "custom";
}

/**
 * Converts ordinary channel/video URLs into embeddable player URLs.
 * Unknown URLs pass through unchanged. `parentHost` is required by the
 * Twitch player and should be the embedding page's hostname.
 */
export function toLiveEmbedUrl(url: string, parentHost?: string): string {
  const host = hostnameOf(url);
  if (!host) return url;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  const seg = u.pathname.split("/").filter(Boolean);

  // Twitch: channel page -> player.twitch.tv (parent required by Twitch).
  if (host === "twitch.tv" || host.endsWith(".twitch.tv")) {
    if (host === "player.twitch.tv") {
      if (parentHost && !u.searchParams.has("parent")) u.searchParams.set("parent", parentHost);
      return u.toString();
    }
    if (seg[0] === "videos" && seg[1]) {
      const p = new URL("https://player.twitch.tv/");
      p.searchParams.set("video", seg[1]);
      if (parentHost) p.searchParams.set("parent", parentHost);
      return p.toString();
    }
    if (seg[0]) {
      const p = new URL("https://player.twitch.tv/");
      p.searchParams.set("channel", seg[0]);
      if (parentHost) p.searchParams.set("parent", parentHost);
      return p.toString();
    }
  }

  // YouTube: watch/short/live links -> /embed/.
  if (host === "youtu.be" && seg[0]) return `https://www.youtube.com/embed/${seg[0]}`;
  if (host === "youtube.com" || host.endsWith(".youtube.com")) {
    if (seg[0] === "embed") return url;
    const v = u.searchParams.get("v");
    if (v) return `https://www.youtube.com/embed/${v}`;
    if (seg[0] === "live" && seg[1]) return `https://www.youtube.com/embed/${seg[1]}`;
    if (seg[0] === "shorts" && seg[1]) return `https://www.youtube.com/embed/${seg[1]}`;
  }

  // Kick: channel page -> player.kick.com.
  if (host === "kick.com" && seg[0] && seg[0] !== "video") {
    return `https://player.kick.com/${seg[0]}`;
  }

  // Vimeo: video page -> player.vimeo.com.
  if (host === "vimeo.com" && seg[0] && /^\d+$/.test(seg[0])) {
    return `https://player.vimeo.com/video/${seg[0]}`;
  }

  // Chaturbate: room page -> /embed/<room>/.
  if (host === "chaturbate.com" && seg[0] && seg[0] !== "embed") {
    return `https://chaturbate.com/embed/${seg[0]}/`;
  }

  return url;
}
