/**
 * Manifest der Hintergrund-Clips der Startseite. Die Dateien entstehen mit
 * `bash scripts/hero-videos.sh` aus videos/{1,2,3,4}.mp4 und liegen unter
 * public/hero/: je Clip `<src>.av1.mp4` (AV1) und `<src>.mp4` (H.264-Fallback),
 * für den ersten Clip eines Abschnitts zusätzlich `<src>-poster.webp`.
 */
export interface HeroClip {
  /** Öffentlicher Pfad ohne Endung, z. B. "/hero/1". */
  src: string;
  /** Standbild (erstes Bild des Clips). Nur der erste Clip braucht eines. */
  poster?: string;
}

export const HERO_CLIPS: HeroClip[] = [
  { src: "/hero/1", poster: "/hero/1-poster.webp" },
  { src: "/hero/2" },
  { src: "/hero/3" },
];

/** Einzelner, ruhig loopender Clip für den Finale-Abschnitt (aus videos/4.mp4). */
export const FINALE_CLIPS: HeroClip[] = [
  { src: "/hero/finale", poster: "/hero/finale-poster.webp" },
];

/** AV1 in MP4, Main-Profil, Level 3.1, 8 bit — so wie scripts/hero-videos.sh kodiert. */
export const AV1_TYPE = 'video/mp4; codecs="av01.0.05M.08"';

/** Video-URL für den Browser: AV1, wenn er es abspielen kann, sonst H.264. */
export function heroClipUrl(clip: HeroClip, av1: boolean): string {
  return `${clip.src}${av1 ? ".av1" : ""}.mp4`;
}
