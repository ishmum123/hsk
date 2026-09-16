# HSK Pinyin trainer — spec

Sibling of `hsk_characters.html` (HSK 1–3 characters). This app teaches **only pinyin** (sounds, tones, spelling) and drills the pronunciation of the **HSK 2.0 vocabulary, levels 1–4** (~1200 words). Same product strategy: placement → teach → drill → test → review, run as short daily sessions.

Output: `hsk_pinyin.html`, one self-contained file (data inlined at build; sources live in `data/`). Phone-first, no backend, works offline after first load (the only network reference is the Google Fonts `<link>`, which has a system-font fallback). Progress in localStorage (`window.storage` shim first, like the character app).

## Assumptions
- Audio = browser `speechSynthesis` with a `zh-CN` voice (same approach as the character app). No audio files.
- Learner may know zero characters. Characters are always shown *with* meaning, never as the only cue.
- HSK 2.0 (old 6-level system), not HSK 3.0.

## Data

### `data/hsk_vocab.js` → `const VOCAB=[...]`
```
{"w":"学生","py":"xuésheng","n":"xue2sheng5","en":"student","lv":1}
```
- `py` tone-marked; `n` numbered (digits 1–5 after each syllable, 5 = neutral, ü written `v`); `lv` 1–4.
- Order within a level = source order (≈ frequency). Sets = consecutive chunks of 10 within a level.

### `data/pinyin_lessons.js` → `const LESSONS=[...]`
Foundations curriculum (the "Sounds" tab). Each lesson:
```
{ id:"tones", title:"The four tones", blurb:"one-line why",
  cards:[ {h:"heading", body:"short prose (HTML ok)", rows:[["mā","妈","mother"],...], say:["mā","má","mǎ","mà"]} ],
  items:[ {t:"mc", q:"Which tone?", say:"mā", opts:["1","2","3","4"], a:"1", rv:"mā — 妈 mother · tone 1, high and flat"},
          {t:"mc", q:"Which is written correctly?", opts:["jü","ju"], a:"ju", rv:"After j q x, ü is written u"} ] }
```
- `cards` = teach screen (read + tap to hear). `items` = drill after the cards. `t` is always `"mc"`; `say` optional (spoken on mount, replay button shown). Option strings may be pinyin or tone digits.
- Example words in lessons should be HSK 1–2 vocabulary where possible.

Suggested lesson order (~12 lessons, 5–8 items each):
1. Tones 1–4 + neutral (pitch contours, tone-mark placement rule)
2. Simple finals a o e i u ü
3. Initials b p m f · d t n l (aspiration)
4. Initials g k h · the three sibilant rows contrasted: z c s · zh ch sh r · j q x
5. Compound finals ai ei ao ou · ia ie ua uo üe
6. Nasal finals an en ang eng ong · -n vs -ng
7. i-row finals ian in iang ing iong iao iu
8. u/ü-row finals uai ui uan un uang üan ün · spelling rules (y/w, ü after j q x, iou/uei/uen)
9. Special syllables: zhi chi shi ri zi ci si, er, erhua
10. Tone sandhi: 3rd+3rd, 不, 一
11. Neutral tone in words (妈妈, 学生, 我们)
12. Reading whole words: two-syllable tone patterns (tone pairs)

## Engine (port from `hsk_characters.html`, keep what works)
- Generic drill runner: queue of items, wrong items re-queued to the end, running score, summary of misses, keyboard 1–4 / Enter.
- Progress `prog = {v:1, w:{word:{r,w,s,prov}}, sets:{1:0,2:0,3:0,4:0}, lessons:{id:1}, sessions:n, theme}`. `mastered` = streak ≥ 3. Weakest-first ordering = `w*3 - s + jitter`. Provisional (placed, unverified) items get priority in review; a miss clears `prov`.
- Export / import progress as JSON (new).

### Vocab item types (generated from VOCAB)
Helpers needed: `syll(n)` split numbered pinyin into syllables; `mark(n)` numbered → tone-marked; `tones(n)` → e.g. "2-5"; a valid-syllable table (standard Mandarin initial × final grid) so distractors are real syllables.
- **read** — characters + meaning shown → pick the pinyin (4 options).
- **listen** — TTS plays the word, nothing shown but meaning → pick the pinyin (4 options). Characters revealed after answering.
- **tone** — characters (+ toneless pinyin) → pick the tone pattern (e.g. `3-1`, 4 options).
- **type** — characters + meaning (+ replay audio) → type pinyin. Accept numbered (`xue2sheng5`, `xue2sheng`, neutral as 5/0/omitted), or marked; case-insensitive; spaces/apostrophes ignored; `v`/`u:`/`ü` equivalent. Show per-syllable diff when wrong.

Distractor generation (in priority order, dedupe, must be valid syllables, never equal the answer): (1) same syllables, one tone changed; (2) one initial swapped from a confusable pair (b/p d/t g/k j/q zh/ch z/c zh/z ch/c sh/s j/zh q/ch x/sh n/l r/l f/h); (3) one final swapped (an/ang en/eng in/ing ian/iang uan/uang ao/ou ai/ei e/o u/ü-after-n,l); (4) another VOCAB word with the same syllable count.

### Modes / screens (bottom tab bar, 5 tabs)
1. **Today** — session plan + "Start session". Steps: Review (15, weakest first, mixed read/listen/tone) → Learn (next Sounds lesson if any undone, else next vocab set: teach list with tap-to-hear, then drill 10 × read+tone) → Listen (10 listen items from learned) → Type (8 type items from learned) → summary. First-time nudge to Placement. Path strip shows Sounds → HSK1 → HSK2 → HSK3 → HSK4 with fill.
2. **Sounds** — lesson list with done marks; lesson screen = cards then "Drill". Reference chart of all initials/finals with tap-to-hear (a pinyin table).
3. **Words** — level chips, set pager (‹ n/N ›, next new, review), word list with tone-coloured pinyin + tap to hear; "Drill this set".
4. **Test** — Placement (48 items: 8 foundations + 40 vocab across strata L1×3 L2×3 L3×4 L4×6 buckets; stop at first bucket < 85 %; passed sets marked learned+provisional; foundations ≥ 7/8 marks all lessons done) and free tests: Listen 20 / Type 20 / Tones 20 from learned words.
5. **Progress** — per-level learned/mastered, lessons done, sessions, weak words list, export/import, reset.

## UI direction
- The memorable element: **tone**. Pinyin is always rendered with tone colour per syllable (T1 T2 T3 T4 neutral) and the drill stimulus shows a small pitch-contour glyph next to the answer reveal. Everything else stays quiet.
- Bottom tab bar (thumb reach) replaces the scrolling top pills. Full-width primary action pinned at the bottom of the card. Large tap targets (≥ 48 px). Keyboard shortcuts on desktop.
- One type family with excellent diacritics (IBM Plex Sans via Google Fonts, system fallback); Chinese falls to PingFang / Noto Sans SC. No all-caps labels, no eyebrows, no gradients, no card-kit shadows.
- Light + dark via `prefers-color-scheme` and a toggle; tone colours tuned for both.
- Copy: plain, short, sentence case. Empty states tell the learner what to do next.

## Acceptance
- Opens from `file://` on desktop and phone with no console errors; all 5 tabs render; a full session can be run start to finish.
- Placement places into a level/set and marks provisional words; review pulls them first.
- Every distractor is a valid syllable string and never equals the answer; `mark()` round-trips every `n` in VOCAB to its `py` (report mismatches).
- Type mode accepts the documented input variants.
- Progress survives reload; export → reset → import restores it.

## Deviations

- **`n` field spells ü as `ü`, not `v`.** The real `data/hsk_vocab.js` (produced by the parallel vocab worker) uses the literal `ü` character in the numbered field (e.g. `n:"nü3er2"`, `n:"lü4"`), not the `v` substitute this spec's Data section describes. `normType`/`acceptTypeAnswer` treat `ü`, `v`, and `u:` as equivalent on both sides of the comparison, so this has no user-visible effect — "nv3er2", "nü3er2" and "nu:3er2"-style input all work — but code reading `n` directly (rather than through the helpers) should not assume `v`.
- **Placement vocab strata bucket sizes**: the spec's "8 + 40 = 48 items" is implemented as 16 buckets (L1×3, L2×3, L3×4, L4×6) alternating 2/3 items per bucket (8 buckets × 2 + 8 buckets × 3 = 40), rather than a fixed per-bucket count, since level sizes aren't evenly divisible.
- **Placement pass rule uses a rolling 3-bucket accuracy window, not a flat 85% (or fixed-misses) cutoff per bucket.** With only 2–3 items per bucket, judging each bucket in isolation makes a single lucky or unlucky guess decide the whole bucket (a flat 85% cutoff requires a perfect score at that size; a bare "misses ≤ 1" rule lets a 1-of-2 lucky guess pass). The final rule (`PC.placementStopIndex`): walking buckets in order, bucket *i* passes if the combined accuracy over buckets `max(0, i-2)..i` is ≥ 75% **and** bucket *i* itself has at least 1 right answer. Placement stops at the first failing bucket. This smooths out single-item noise while still requiring sustained performance, and a bucket can't pass purely on a good window if it personally got everything wrong.
- **`learnedWords()` unions completed-set words with words explicitly flagged `d` (drilled ahead of position), not "any word with a `prog.w` entry."** Drilling a Words-tab set ahead of the learner's current position (via the set pager) doesn't advance `prog.sets` for the skipped range, but the drilled words should still count as learned — so they're stamped `prog.w[word].d = 1` and `learnedWords()` includes them via that flag specifically. This matters for placement retakes: taking Placement again deletes every `prog.w` entry that is either placement-only-provisional-and-unreviewed (`prov && s <= 1`) or flagged `d`, before re-seeding from the new result — otherwise those leftover entries would resurrect words outside the freshly placed range through the union and the retake wouldn't actually reset anything.
- **Type-mode answer checking doesn't do general pinyin segmentation.** Rather than parsing arbitrary concatenated pinyin into syllables (ambiguous for neutral-tone runs, e.g. "zenmeyang"), `acceptTypeAnswer` builds the small set of acceptable normalized strings directly from the known-correct `n`/`py` fields (numbered form with every neutral-tone digit tried as `5`/`0`/omitted, plus the marked `py` form) and checks the user's normalized input against that set. This satisfies all documented variants without needing a dictionary-based segmenter, but means it cannot give partial credit or a smart per-syllable diff for input that's segmented differently than expected — the "type" drill's wrong-answer reveal just shows what was typed next to the correct marked pinyin, not a computed diff.
- **Valid-syllable table is hand-authored (~408 entries), not sourced from an external dataset.** It's a full initial×final combinatorial table built from standard Mandarin phonotactics (used only to validate that generated distractors are phonotactically plausible spellings — not that they're real dictionary words). A handful of very rare real syllables may be missing and it may accept a small number of implausible-but-well-formed strings; this doesn't affect correctness of the answer-checking (which is based on the real VOCAB data), only the quality of generated distractors.
- **Lesson/vocab drill counts are close-but-not-literal to the spec's session-step prose** (e.g. "drill 10 × read+tone" is implemented as 10 words × 2 item types = 20 drill items; Review mixes read/listen/tone roughly 40/30/30 rather than a fixed split).
