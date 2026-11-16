#!/usr/bin/env bash
# Erzeugt die Hintergrund-Clips der Startseite (components/marketing/
# hero-frame-background.tsx) aus videos/{1,2,3,4}.mp4:
#   public/hero/<name>.av1.mp4   AV1, für Browser mit AV1-Decoder (Chrome, Firefox, Edge)
#   public/hero/<name>.mp4       H.264-Fallback (Safari ohne AV1-Hardware)
#   public/hero/{1,finale}-poster.webp  erstes Bild = Standbild/LCP-Bild
# Ohne Tonspur, 24 fps, Faststart (moov vorne), damit die Wiedergabe sofort startet.
#
# Voraussetzung: ffmpeg mit libsvtav1, libx264 und libwebp.
# Nutzung:  bash scripts/hero-videos.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/public/hero"
mkdir -p "$OUT"

# Format: "<video-nummer>:<name>". Hero = 3 Clips im Wechsel, Finale = 1 Clip.
JOBS="1:1 2:2 3:3 4:finale"

for job in $JOBS; do
  n="${job%%:*}"
  name="${job##*:}"
  src="$ROOT/videos/$n.mp4"
  echo "== videos/$n.mp4 → public/hero/$name.* =="
  ffmpeg -y -loglevel error -i "$src" -an -vf "fps=24,format=yuv420p" \
    -c:v libsvtav1 -preset 4 -crf 48 -g 240 -svtav1-params tune=0 \
    -movflags +faststart "$OUT/$name.av1.mp4"
  ffmpeg -y -loglevel error -i "$src" -an -vf "fps=24,format=yuv420p" \
    -c:v libx264 -preset veryslow -crf 30 -profile:v high -level 4.0 \
    -movflags +faststart "$OUT/$name.mp4"
  # Standbild nur für den jeweils ersten Clip eines Abschnitts.
  if [ "$name" = "1" ] || [ "$name" = "finale" ]; then
    ffmpeg -y -loglevel error -i "$src" -vframes 1 \
      -c:v libwebp -quality 60 -compression_level 6 "$OUT/$name-poster.webp"
  fi
  ls -la "$OUT/$name".* | awk '{print "   " $5 "  " $NF}'
done
