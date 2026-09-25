#!/bin/sh
# PRE-SWITCH BUILDER (legacy). Kept only so rollback (reset main to 3aeecc4) and the
# history of src/, data/, tools/, tests/ stay readable. The live site is now built by
# ./build.sh from pack/ with the vocab-engine submodule. Running this with the default
# OUT/INDEX would overwrite the hsk_pinyin.html redirect stub and the engine-built
# index.html; point OUT/INDEX at a scratch location if you run it at all.
#
# Builds the self-contained hsk_pinyin.html from src/pinyin_app.html + data/*.js + src/pinyin_core.js,
# and copies it to index.html so GitHub Pages serves it at the site root.
# Usage: ./build.sh   (or: sh build.sh)
set -e
cd "$(dirname "$0")"

SRC=src/pinyin_app.html
# OUT/INDEX can be overridden via env (e.g. OUT=/tmp/x.html INDEX=/tmp/y.html sh
# build.sh) so tests/pinyin_checks.js's stale-build guard can rebuild to a scratch
# location and diff it against the real shipped files, without ever overwriting
# them itself as a side effect of just running the check suite.
OUT="${OUT:-hsk_pinyin.html}"
INDEX="${INDEX:-index.html}"
VOCAB=data/hsk_vocab.js
LESSONS=data/pinyin_lessons.js
SENTENCES=data/hsk_sentences.js
CORE=src/pinyin_core.js

for f in "$SRC" "$VOCAB" "$LESSONS" "$SENTENCES" "$CORE"; do
  if [ ! -f "$f" ]; then echo "build.sh: missing $f" >&2; exit 1; fi
done

awk -v vocab="$VOCAB" -v lessons="$LESSONS" -v sentences="$SENTENCES" -v core="$CORE" '
  /<script src="\.\.\/data\/hsk_vocab\.js"><\/script>/ { print "<script>"; while ((getline line < vocab) > 0) print line; close(vocab); print "</script>"; next }
  /<script src="\.\.\/data\/pinyin_lessons\.js"><\/script>/ { print "<script>"; while ((getline line < lessons) > 0) print line; close(lessons); print "</script>"; next }
  /<script src="\.\.\/data\/hsk_sentences\.js"><\/script>/ { print "<script>"; while ((getline line < sentences) > 0) print line; close(sentences); print "</script>"; next }
  /<script src="pinyin_core\.js"><\/script>/ { print "<script>"; while ((getline line < core) > 0) print line; close(core); print "</script>"; next }
  { print }
' "$SRC" > "$OUT"

cp "$OUT" "$INDEX"

echo "Built $OUT ($(wc -c < "$OUT" | tr -d ' ') bytes) and copied to $INDEX for GitHub Pages"
