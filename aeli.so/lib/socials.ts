import { z } from "zod";
import { normalizeExternalUrl } from "./url";

/**
 * Social-Profile hängen am Profil, nicht an einem Block.
 *
 * Der Grund ist redaktionell: dieselben fünf Adressen erscheinen im Kopf der
 * Seite, in der SOCIAL_ROW und später in der Freigabe-Karte. Läge jede Kopie
 * in ihrem eigenen Block, müsste man einen Umzug von Instagram dreimal
 * nachtragen.
 */

export const SOCIAL_PLATFORMS = [
  { key: "instagram", label: "Instagram", placeholder: "instagram.com/deinname" },
  { key: "tiktok", label: "TikTok", placeholder: "tiktok.com/@deinname" },
  { key: "youtube", label: "YouTube", placeholder: "youtube.com/@deinkanal" },
  { key: "x", label: "X", placeholder: "x.com/deinname" },
  { key: "threads", label: "Threads", placeholder: "threads.net/@deinname" },
  { key: "facebook", label: "Facebook", placeholder: "facebook.com/deineseite" },
  { key: "linkedin", label: "LinkedIn", placeholder: "linkedin.com/in/deinname" },
  { key: "pinterest", label: "Pinterest", placeholder: "pinterest.de/deinname" },
  { key: "twitch", label: "Twitch", placeholder: "twitch.tv/deinkanal" },
  { key: "discord", label: "Discord", placeholder: "discord.gg/einladung" },
  { key: "spotify", label: "Spotify", placeholder: "open.spotify.com/artist/…" },
  { key: "applemusic", label: "Apple Music", placeholder: "music.apple.com/…" },
  { key: "soundcloud", label: "SoundCloud", placeholder: "soundcloud.com/deinname" },
  { key: "github", label: "GitHub", placeholder: "github.com/deinname" },
  { key: "telegram", label: "Telegram", placeholder: "t.me/deinname" },
  { key: "whatsapp", label: "WhatsApp", placeholder: "wa.me/491701234567" },
  { key: "patreon", label: "Patreon", placeholder: "patreon.com/deinname" },
  { key: "email", label: "E-Mail", placeholder: "mailto:hallo@example.com" },
  { key: "website", label: "Website", placeholder: "example.com" },
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number]["key"];

const PLATFORM_KEYS = SOCIAL_PLATFORMS.map((p) => p.key) as [SocialPlatform, ...SocialPlatform[]];

export const socialLinkSchema = z.object({
  platform: z.enum(PLATFORM_KEYS),
  url: z.string().min(1).max(2000),
});

export type SocialLink = z.infer<typeof socialLinkSchema>;

export function socialLabel(platform: SocialPlatform): string {
  return SOCIAL_PLATFORMS.find((entry) => entry.key === platform)?.label ?? platform;
}

/**
 * Liest `AeliProfile.socials`. Ungültige Einträge fallen still raus statt die
 * ganze Seite zu kippen — ein kaputter Link ist ein fehlender Link, kein
 * Grund für einen Fehler.
 */
export function parseSocials(raw: unknown): SocialLink[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const result: SocialLink[] = [];
  for (const entry of raw) {
    const parsed = socialLinkSchema.safeParse(entry);
    if (!parsed.success) continue;
    const url = normalizeExternalUrl(parsed.data.url);
    if (!url || seen.has(parsed.data.platform)) continue;
    seen.add(parsed.data.platform);
    result.push({ platform: parsed.data.platform, url });
  }
  return result.slice(0, SOCIAL_PLATFORMS.length);
}
