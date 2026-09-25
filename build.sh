#!/bin/sh
# Builds the self-contained Chinese (HSK 1-4) trainer from pack/ with the
# vocab-engine submodule, writing index.html and sw.js at the repo root so
# GitHub Pages serves it at https://ishmum123.github.io/hsk/
# hsk_pinyin.html is a hand-written redirect stub to ./ and is not built.
# The pre-switch builder is build_legacy.sh.
# Usage: ./build.sh   (or: sh build.sh)
set -e
cd "$(dirname "$0")"

OUT="${1:-index.html}"
engine/build.sh pack "$OUT"
