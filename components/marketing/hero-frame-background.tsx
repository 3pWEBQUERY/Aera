"use client";

import { useEffect, useRef, useState } from "react";
import { HERO_CLIPS, heroFrameUrl, type HeroClip } from "./hero-clips";

/**
 * Spielt die mit FFmpeg extrahierten WebP-Frame-Sequenzen als bewegten
 * Hero-Hintergrund ab. Jeder Clip läuft einmal in Echtzeit durch, danach wird
 * per Überblendung automatisch auf den nächsten Clip gewechselt (Endlosschleife).
 *
 * Umsetzung ohne <video>: Frames werden vorab geladen/dekodiert und die
 * sichtbare <img>-Quelle wird pro Tick auf ein bereits gecachtes Bild gesetzt —
 * das vermeidet Ruckler. Zwei gestapelte Ebenen ermöglichen die Überblendung.
 * Respektiert `prefers-reduced-motion`: dann nur ein statisches Standbild.
 */
export function HeroFrameBackground({
  className,
  clips = HERO_CLIPS,
}: {
  className?: string;
  /** Abzuspielende Clips (Default: Hero-Clips). Ein einzelner Clip loopt sanft. */
  clips?: HeroClip[];
}) {
  const layer0 = useRef<HTMLImageElement>(null);
  const layer1 = useRef<HTMLImageElement>(null);
  const [activeLayer, setActiveLayer] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (clips.length === 0) return;
    const layers = [layer0, layer1];
    const cache = new Map<number, HTMLImageElement[]>();
    let raf = 0;
    let cancelled = false;

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function preloadClip(index: number): Promise<HTMLImageElement[]> {
      const hit = cache.get(index);
      if (hit) return Promise.resolve(hit);
      const clip = clips[index];
      const imgs = Array.from({ length: clip.frames }, (_, i) => {
        const img = new Image();
        img.decoding = "async";
        img.src = heroFrameUrl(clip.dir, i);
        return img;
      });
      cache.set(index, imgs);
      return Promise.all(
        imgs.map((im) => im.decode().catch(() => undefined)),
      ).then(() => imgs);
    }

    function paint(layerIndex: number, imgs: HTMLImageElement[], frame: number) {
      const el = layers[layerIndex].current;
      const src = imgs[frame]?.src;
      if (el && src) el.src = src;
    }

    // Laufzeit-Zustand außerhalb von React, um 12 Re-Renders/s zu vermeiden.
    const st = { active: 0, clip: 0, frame: 0, last: 0, nextRequested: false };

    function loop(ts: number) {
      if (cancelled) return;
      const clip = clips[st.clip];
      const imgs = cache.get(st.clip);
      if (imgs) {
        const step = 1000 / clip.fps;
        if (st.last === 0) st.last = ts;
        if (ts - st.last >= step) {
          st.last = ts;
          st.frame += 1;

          // Nächsten Clip laden, sobald der aktuelle zur Hälfte gelaufen ist.
          if (
            !st.nextRequested &&
            clips.length > 1 &&
            st.frame >= clip.frames / 2
          ) {
            st.nextRequested = true;
            void preloadClip((st.clip + 1) % clips.length);
          }

          if (st.frame >= clip.frames) {
            const nextClip = (st.clip + 1) % clips.length;
            const nextImgs = cache.get(nextClip);
            if (nextImgs) {
              // Nächsten Clip auf der inaktiven Ebene starten und überblenden.
              const nextLayer = 1 - st.active;
              paint(nextLayer, nextImgs, 0);
              st.active = nextLayer;
              st.clip = nextClip;
              st.frame = 0;
              st.nextRequested = false;
              setActiveLayer(nextLayer);
            } else {
              // Noch nicht bereit: auf letztem Frame halten, nächster Tick prüft erneut.
              st.frame = clip.frames - 1;
            }
          } else {
            paint(st.active, imgs, st.frame);
          }
        }
      }
      raf = requestAnimationFrame(loop);
    }

    void preloadClip(0).then((imgs) => {
      if (cancelled) return;
      paint(0, imgs, 0);
      setReady(true);
      if (reduceMotion) return; // Nur Standbild, keine Bewegung/Wechsel.
      raf = requestAnimationFrame(loop);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [clips]);

  return (
    <div className={className} aria-hidden="true">
      <img
        ref={layer0}
        alt=""
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ease-out ${
          ready && activeLayer === 0 ? "opacity-100" : "opacity-0"
        }`}
      />
      <img
        ref={layer1}
        alt=""
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ease-out ${
          ready && activeLayer === 1 ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}
