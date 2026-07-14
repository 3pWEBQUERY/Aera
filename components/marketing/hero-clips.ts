/**
 * Manifest der Hero-Hintergrund-Clips. Die WebP-Frames wurden mit FFmpeg aus
 * videos/{1,2,3}.mp4 extrahiert (fps=12) und liegen unter public/hero/<n>/.
 * frames/fps müssen zur tatsächlichen Extraktion passen, sonst läuft der Clip
 * zu schnell/langsam. Regeneriert per: siehe scripts/hero-frames.sh
 */
export interface HeroClip {
  /** Öffentlicher Pfad-Präfix (ohne abschließenden Slash). */
  dir: string;
  /** Anzahl extrahierter Frames (frame_0001 … frame_<count>). */
  frames: number;
  /** Bildrate der Extraktion = Abspielrate für Echtzeit-Wiedergabe. */
  fps: number;
}

export const HERO_CLIPS: HeroClip[] = [
  { dir: "/hero/1", frames: 120, fps: 12 },
  { dir: "/hero/2", frames: 120, fps: 12 },
  { dir: "/hero/3", frames: 120, fps: 12 },
];

/** Einzelner, ruhig loopender Clip für den Finale-Abschnitt (aus videos/4.mp4). */
export const FINALE_CLIPS: HeroClip[] = [{ dir: "/finale", frames: 120, fps: 12 }];

/** Baut die URL eines Frames (1-basiert, 4-stellig genullt) wie beim Export. */
export function heroFrameUrl(dir: string, frameIndex: number): string {
  return `${dir}/frame_${String(frameIndex + 1).padStart(4, "0")}.webp`;
}
