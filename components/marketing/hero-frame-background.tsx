"use client";

import { useEffect, useRef, useState } from "react";
import { AV1_TYPE, HERO_CLIPS, heroClipUrl, type HeroClip } from "./hero-clips";

type NetworkInfo = { saveData?: boolean };

/**
 * Bewegter Hintergrund der Startseite: Jeder Clip läuft einmal in Echtzeit
 * durch, danach wird auf den nächsten Clip überblendet (Endlosschleife; ein
 * einzelner Clip überblendet in sich selbst).
 *
 * Ablauf, damit die Seite schnell steht:
 * 1. Sofort sichtbar ist nur das Standbild (erstes Bild des ersten Clips). Im
 *    Hero ist es das LCP-Bild und wird mit hoher Priorität geladen, im Finale
 *    lazy.
 * 2. Erst nach dem `load`-Event (und im Leerlauf) kommen zwei `<video>`-Ebenen
 *    dazu. Der erste Clip lädt, sobald der Abschnitt im Bild ist; der nächste,
 *    wenn der laufende zur Hälfte durch ist. Außerhalb des Bildes pausiert die
 *    Wiedergabe.
 * 3. Bei `prefers-reduced-motion` oder Save-Data bleibt es beim Standbild —
 *    dann wird kein Video geladen.
 *
 * Die Clips sind AV1 (Chrome, Firefox, Edge) mit H.264-Fallback; erzeugt von
 * scripts/hero-videos.sh.
 */
export function HeroFrameBackground({
  className,
  clips = HERO_CLIPS,
  priority = clips === HERO_CLIPS,
}: {
  className?: string;
  /** Abzuspielende Clips (Default: Hero-Clips). Ein einzelner Clip loopt sanft. */
  clips?: HeroClip[];
  /** Standbild ist das LCP-Bild (Hero): sofort und mit hoher Priorität laden. */
  priority?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const layer0 = useRef<HTMLVideoElement>(null);
  const layer1 = useRef<HTMLVideoElement>(null);
  const [motion, setMotion] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [activeLayer, setActiveLayer] = useState(0);
  const poster = clips[0]?.poster;

  // Ob überhaupt bewegt wird — und erst nach dem Laden der Seite.
  useEffect(() => {
    if (clips.length === 0) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (navigator as Navigator & { connection?: NetworkInfo }).connection;
    if (reduce.matches || connection?.saveData) return;

    let idle = 0;
    let timer = 0;
    const start = () => {
      if (typeof window.requestIdleCallback === "function") {
        idle = window.requestIdleCallback(() => setMotion(true), { timeout: 2000 });
      } else {
        timer = window.setTimeout(() => setMotion(true), 300);
      }
    };
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });

    const onReduce = () => {
      if (!reduce.matches) return;
      setMotion(false);
      setPlaying(false);
      setActiveLayer(0);
    };
    reduce.addEventListener("change", onReduce);
    return () => {
      window.removeEventListener("load", start);
      reduce.removeEventListener("change", onReduce);
      if (idle) window.cancelIdleCallback(idle);
      window.clearTimeout(timer);
    };
  }, [clips]);

  // Wiedergabe mit zwei Ebenen: aktive Ebene spielt, die andere lädt den
  // nächsten Clip vor. Am Clip-Ende hält die alte Ebene ihr letztes Bild und
  // wird per CSS-Übergang ausgeblendet.
  useEffect(() => {
    const a = layer0.current;
    const b = layer1.current;
    if (!motion || !a || !b) return;
    const layers = [a, b] as const;
    const av1 = a.canPlayType(AV1_TYPE) === "probably";
    const url = (i: number) => new URL(heroClipUrl(clips[i]!, av1), location.href).href;
    const st = { active: 0, clip: 0, nextRequested: false, visible: false, started: false };
    let cancelled = false;

    for (const v of layers) {
      v.muted = true;
      v.defaultMuted = true;
      v.playsInline = true;
    }

    const play = (v: HTMLVideoElement) => {
      if (st.visible) v.play().catch(() => undefined); // Autoplay blockiert → Standbild bleibt.
    };
    const nextIndex = () => (st.clip + 1) % clips.length;

    function prepareNext() {
      if (st.nextRequested) return;
      st.nextRequested = true;
      const v = layers[1 - st.active]!;
      const src = url(nextIndex());
      if (v.src === src) {
        v.currentTime = 0; // Einzelner Clip: schon geladen, nur zurückspulen.
      } else {
        v.preload = "auto";
        v.src = src;
        v.load();
      }
    }

    function swap() {
      if (cancelled) return;
      prepareNext();
      const next = layers[1 - st.active]!;
      const go = () => {
        if (cancelled) return;
        next.currentTime = 0;
        play(next);
        st.active = 1 - st.active;
        st.clip = nextIndex();
        st.nextRequested = false;
        setActiveLayer(st.active);
      };
      // Noch nicht bereit: auf dem letzten Bild halten, bis der Clip da ist.
      if (next.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) go();
      else next.addEventListener("canplay", go, { once: true });
    }

    const handlers = layers.map((v, i) => {
      const onPlaying = () => {
        if (i === st.active) setPlaying(true);
      };
      const onTime = () => {
        if (i === st.active && v.duration && v.currentTime >= v.duration / 2) prepareNext();
      };
      const onEnded = () => {
        if (i === st.active) swap();
      };
      v.addEventListener("playing", onPlaying);
      v.addEventListener("timeupdate", onTime);
      v.addEventListener("ended", onEnded);
      return () => {
        v.removeEventListener("playing", onPlaying);
        v.removeEventListener("timeupdate", onTime);
        v.removeEventListener("ended", onEnded);
      };
    });

    // Erst laden, wenn der Abschnitt sichtbar ist; außerhalb pausieren.
    const io = new IntersectionObserver(
      ([entry]) => {
        st.visible = !!entry?.isIntersecting;
        const v = layers[st.active]!;
        if (st.visible) {
          if (!st.started) {
            st.started = true;
            v.preload = "auto";
            v.src = url(0);
          }
          if (!v.ended) play(v);
        } else {
          v.pause();
        }
      },
      { rootMargin: "200px 0px" },
    );
    if (root.current) io.observe(root.current);

    return () => {
      cancelled = true;
      io.disconnect();
      handlers.forEach((off) => off());
      for (const v of layers) {
        v.pause();
        v.removeAttribute("src");
        v.load();
      }
    };
  }, [motion, clips]);

  return (
    <div ref={root} className={className} aria-hidden="true">
      {poster && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={poster}
          alt=""
          width={1280}
          height={720}
          fetchPriority={priority ? "high" : "low"}
          loading={priority ? "eager" : "lazy"}
          decoding={priority ? undefined : "async"}
          // Sobald das Video eingeblendet ist, weg damit: sonst schiene es bei
          // den Überblendungen zwischen den Clips durch.
          className={`absolute inset-0 h-full w-full object-cover ${
            playing ? "opacity-0 transition-opacity delay-700 duration-0" : ""
          }`}
        />
      )}
      {motion &&
        [layer0, layer1].map((ref, i) => (
          <video
            key={i}
            ref={ref}
            muted
            playsInline
            preload="none"
            disablePictureInPicture
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ease-out ${
              playing && activeLayer === i ? "opacity-100" : "opacity-0"
            }`}
          />
        ))}
    </div>
  );
}
