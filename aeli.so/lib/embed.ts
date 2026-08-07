/**
 * Einbettungen laufen ueber eine Allowlist, nicht ueber „iframe mit der URL,
 * die drinsteht“.
 *
 * Ein Creator klebt eine beliebige Adresse in einen EMBED-Block. Wuerde die
 * ungeprueft in ein iframe wandern, waere jede Bio-Seite eine Buehne fuer
 * fremde Skripte im Namen ihres Besitzers. Stattdessen wird die URL erkannt,
 * in die offizielle Player-Adresse des Anbieters uebersetzt und nur die
 * eingebettet.
 *
 * Ein neuer Anbieter braucht zwei Aenderungen: hier UND in der `frame-src`-
 * Direktive in next.config.ts. Nur eine von beiden ergibt eine leere Flaeche.
 */

export interface ResolvedEmbed {
  provider: string;
  label: string;
  src: string;
  /** Seitenverhaeltnis als CSS-Wert — Videos 16/9, Player oft viel flacher. */
  aspect: string;
  /** Manche Player brauchen eine feste Hoehe statt eines Verhaeltnisses. */
  fixedHeight?: number;
  allow: string;
}

const VIDEO_ALLOW = "accelerometer; clipboard-write; encrypted-media; picture-in-picture; fullscreen";
const AUDIO_ALLOW = "encrypted-media; clipboard-write";

function youtubeId(url: URL): string | null {
  if (url.hostname.endsWith("youtu.be")) return url.pathname.slice(1).split("/")[0] || null;
  if (!/(^|\.)youtube(-nocookie)?\.com$/.test(url.hostname)) return null;
  if (url.pathname === "/watch") return url.searchParams.get("v");
  const match = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/);
  return match?.[1] ?? null;
}

const SAFE_ID = /^[\w-]{1,64}$/;

export function resolveEmbed(input: string): ResolvedEmbed | null {
  const raw = input.trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, "");

  // --- YouTube -------------------------------------------------------------
  const yt = youtubeId(url);
  if (yt && SAFE_ID.test(yt)) {
    // youtube-nocookie: der Player setzt erst beim Abspielen Cookies. Auf einer
    // Seite, die vor allem aus fremden Links besteht, ist das das Mindeste.
    return {
      provider: "youtube",
      label: "YouTube",
      src: `https://www.youtube-nocookie.com/embed/${yt}?rel=0`,
      aspect: "16 / 9",
      allow: VIDEO_ALLOW,
    };
  }

  // --- Spotify -------------------------------------------------------------
  if (host === "open.spotify.com") {
    const match = url.pathname.match(/^\/(?:intl-[a-z]{2}\/)?(track|album|playlist|artist|show|episode)\/([^/?#]+)/);
    if (match && SAFE_ID.test(match[2]!)) {
      const isTrack = match[1] === "track" || match[1] === "episode";
      return {
        provider: "spotify",
        label: "Spotify",
        src: `https://open.spotify.com/embed/${match[1]}/${match[2]}`,
        aspect: "auto",
        // Ein einzelner Titel ist eine Zeile, eine Playlist eine Liste. Ein
        // gemeinsames Seitenverhaeltnis waere fuer beide falsch.
        fixedHeight: isTrack ? 152 : 352,
        allow: AUDIO_ALLOW,
      };
    }
  }

  // --- SoundCloud ----------------------------------------------------------
  if (host === "soundcloud.com" || host === "m.soundcloud.com") {
    return {
      provider: "soundcloud",
      label: "SoundCloud",
      src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(
        `https://soundcloud.com${url.pathname}`,
      )}&color=%23ff5500&auto_play=false&show_user=true`,
      aspect: "auto",
      fixedHeight: 166,
      allow: AUDIO_ALLOW,
    };
  }

  // --- Vimeo ---------------------------------------------------------------
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = url.pathname.match(/(\d{6,})/)?.[1];
    if (id) {
      return {
        provider: "vimeo",
        label: "Vimeo",
        src: `https://player.vimeo.com/video/${id}`,
        aspect: "16 / 9",
        allow: VIDEO_ALLOW,
      };
    }
  }

  // --- Apple Music ---------------------------------------------------------
  if (host === "music.apple.com" || host === "embed.music.apple.com") {
    return {
      provider: "apple-music",
      label: "Apple Music",
      src: `https://embed.music.apple.com${url.pathname}${url.search}`,
      aspect: "auto",
      fixedHeight: url.searchParams.has("i") ? 175 : 450,
      allow: AUDIO_ALLOW,
    };
  }

  // --- Twitch --------------------------------------------------------------
  if (host === "twitch.tv" || host === "m.twitch.tv") {
    const channel = url.pathname.split("/").filter(Boolean)[0];
    if (channel && SAFE_ID.test(channel)) {
      // Twitch verlangt `parent` mit dem einbettenden Host, sonst verweigert
      // der Player den Dienst. Der Wert kommt aus der Konfiguration, nicht aus
      // dem Request-Host — sonst waere er faelschbar.
      const parent = (process.env.NEXT_PUBLIC_AELI_ROOT_DOMAIN ?? "localhost").replace(/^https?:\/\//, "");
      return {
        provider: "twitch",
        label: "Twitch",
        src: `https://player.twitch.tv/?channel=${channel}&parent=${parent}&autoplay=false`,
        aspect: "16 / 9",
        allow: VIDEO_ALLOW,
      };
    }
  }

  // --- Bandcamp ------------------------------------------------------------
  if (host.endsWith("bandcamp.com")) {
    // Bandcamp braucht die numerische Album-/Track-ID, die nur im Seitenquelltext
    // steht. Ohne serverseitigen Abruf koennen wir sie nicht kennen — also
    // lieber ehrlich kein Embed als ein kaputtes.
    return null;
  }

  return null;
}

/** Fuer die Oberflaeche: was hier ueberhaupt einbettbar ist. */
export const EMBED_PROVIDERS = [
  "YouTube",
  "Spotify",
  "SoundCloud",
  "Vimeo",
  "Apple Music",
  "Twitch",
] as const;
