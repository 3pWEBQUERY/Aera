#!/usr/bin/env bash
# Extrahiert web-optimierte WebP-Frames aus den Hero-Videos für den bewegten
# Hintergrund der Startseite (components/marketing/hero-frame-background.tsx).
#
# Voraussetzungen (siehe README/Anleitung):
#   macOS:   brew install ffmpeg webp
#   Windows: winget install ffmpeg  +  libwebp (cwebp)
#
# Nutzung:  bash scripts/hero-frames.sh [FPS] [QUALITÄT]
#   FPS       Frames pro Sekunde der Extraktion (Default 12; muss dem Wert in
#             components/marketing/hero-clips.ts entsprechen).
#   QUALITÄT  WebP-Qualität 0–100 (Default 70).
#
# Hinweis: Manche ffmpeg-Builds bringen keinen libwebp-Encoder mit. Daher
# extrahieren wir zuerst verlustfreie PNGs und konvertieren sie mit cwebp.
set -euo pipefail

FPS="${1:-12}"
QUALITY="${2:-70}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Format: "<video-nummer>:<ziel-ordner>". Hero-Marquee = 3 Clips (auto-Wechsel),
# Finale-Abschnitt = 1 ruhiger Clip (videos/4.mp4).
JOBS="1:public/hero/1 2:public/hero/2 3:public/hero/3 4:public/finale"

for job in $JOBS; do
  n="${job%%:*}"
  out="$ROOT/${job##*:}"
  tmp="$ROOT/.hero-tmp/$n"
  src="$ROOT/videos/$n.mp4"

  echo "== videos/$n.mp4 → ${job##*:} (fps=$FPS, q=$QUALITY) =="
  rm -rf "$out" "$tmp"
  mkdir -p "$out" "$tmp"

  ffmpeg -y -loglevel error -i "$src" -vf "fps=$FPS" "$tmp/frame_%04d.png"
  for p in "$tmp"/frame_*.png; do
    base="$(basename "$p" .png)"
    cwebp -quiet -q "$QUALITY" "$p" -o "$out/$base.webp"
  done

  echo "   $(ls "$out" | wc -l | tr -d ' ') Frames · $(du -sh "$out" | cut -f1)"
done

rm -rf "$ROOT/.hero-tmp"
echo "Fertig. Frame-Anzahl/fps ggf. in components/marketing/hero-clips.ts anpassen."
