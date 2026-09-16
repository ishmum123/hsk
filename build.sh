#!/bin/sh
# Builds the self-contained hsk_pinyin.html from src/pinyin_app.html + data/*.js + src/pinyin_core.js,
# and copies it to index.html so GitHub Pages serves it at the site root.
# Usage: ./build.sh   (or: sh build.sh)
set -e
cd "$(dirname "$0")"

SRC=src/pinyin_app.html
OUT=hsk_pinyin.html
INDEX=index.html
VOCAB=data/hsk_vocab.js
LESSONS=data/pinyin_lessons.js
CORE=src/pinyin_core.js

for f in "$SRC" "$VOCAB" "$LESSONS" "$CORE"; do
  if [ ! -f "$f" ]; then echo "build.sh: missing $f" >&2; exit 1; fi
done

awk -v vocab="$VOCAB" -v lessons="$LESSONS" -v core="$CORE" '
  /<script src="\.\.\/data\/hsk_vocab\.js"><\/script>/ { print "<script>"; while ((getline line < vocab) > 0) print line; close(vocab); print "</script>"; next }
  /<script src="\.\.\/data\/pinyin_lessons\.js"><\/script>/ { print "<script>"; while ((getline line < lessons) > 0) print line; close(lessons); print "</script>"; next }
  /<script src="pinyin_core\.js"><\/script>/ { print "<script>"; while ((getline line < core) > 0) print line; close(core); print "</script>"; next }
  { print }
' "$SRC" > "$OUT"

cp "$OUT" "$INDEX"

echo "Built $OUT ($(wc -c < "$OUT" | tr -d ' ') bytes) and copied to $INDEX for GitHub Pages"
