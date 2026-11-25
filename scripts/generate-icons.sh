#!/usr/bin/env bash
# Makes the PNG app icons from src/app/icon.svg. The PNGs are committed, so this
# only needs to run again when the icon changes. Needs rsvg-convert (librsvg).
#
# - icon-192.png, icon-512.png: the kitten on a transparent background.
# - maskable-512.png: the kitten smaller, on the page color. Android crops
#   icons into circles or rounded squares and keeps only the middle 80%, so a
#   "maskable" icon needs padding and a full background.
# - src/app/apple-icon.png: iOS fills transparency with black, so it gets the
#   padded version too. Next.js links it automatically (file convention).
set -euo pipefail
cd "$(dirname "$0")/.."

SOURCE=src/app/icon.svg
OUT=public/icons
BACKGROUND="#fbf3e6" # --bg in globals.css
mkdir -p "$OUT"

rsvg-convert -w 192 -h 192 "$SOURCE" -o "$OUT/icon-192.png"
rsvg-convert -w 512 -h 512 "$SOURCE" -o "$OUT/icon-512.png"

# The kitten at 64% of the size, centered, inside the 80% safe zone.
padded=$(mktemp --suffix=.svg)
trap 'rm -f "$padded"' EXIT
inner=$(sed -e '1d' -e '$d' "$SOURCE")
cat > "$padded" <<EOF
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="$BACKGROUND"/>
  <g transform="translate(11.52 11.52) scale(0.64)">
$inner
  </g>
</svg>
EOF
rsvg-convert -w 512 -h 512 "$padded" -o "$OUT/maskable-512.png"
rsvg-convert -w 180 -h 180 "$padded" -o src/app/apple-icon.png

echo "Icons written to $OUT and src/app/apple-icon.png"
