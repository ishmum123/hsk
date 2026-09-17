#!/usr/bin/env python3
"""Validate data/hsk_sentences.js against data/hsk_vocab.json.

Checks:
1. Segmentation: "".join(words) (punctuation stripped) == zh (punctuation stripped),
   and every word exists in VOCAB (or EXTRA, see below) with level <= lv, and
   max(word levels) == lv.
2. Pinyin cross-check: py (lowercased, punctuation stripped) must equal the vocab
   pinyin for each word joined with spaces (lowercased, punctuation stripped),
   modulo a small set of documented tone-sandhi exceptions for 不/一, and any
   context-dependent-reading exceptions listed in ALLOWED below.
3. No duplicate zh strings.
4. Length limits: lv 1-2 sentences 3-12 characters (excluding punctuation),
   lv 3-4 sentences up to 16 characters.
5. Vocabulary coverage: >= 70% of VOCAB words must appear in at least one sentence.

EXTRA compound whitelist
------------------------
data/hsk_vocab.json is a curated subset of HSK 1-4 that is missing several
extremely common transparent compounds built from a single-morpheme VOCAB
word plus a bound suffix that is NOT itself a separate VOCAB entry (e.g. 春
"spring" is in VOCAB but 天 "day" is not, so 春天 "spring[time]" can't be
built by concatenating two VOCAB words the way 打+电话 can). Rather than
write awkward, telegraphic sentences to dodge this gap (e.g. "现在是春"
instead of "现在是春天"), a `words` entry may be one of the whitelisted
compounds in EXTRA below. Each EXTRA entry names its own pinyin (since it
isn't derivable by joining VOCAB pinyin) and its `base` VOCAB word, which is
what counts toward vocabulary coverage and toward the sentence's `lv` (an
EXTRA token contributes its base word's level, not a new one, since it is
not new vocabulary being taught, just a natural surface form of a taught
morpheme). Every EXTRA base is validated against VOCAB at check time.
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VOCAB_PATH = ROOT / "data" / "hsk_vocab.json"
SENTENCES_PATH = ROOT / "data" / "hsk_sentences.js"

PUNCT_CHARS = "，。？！：；、,.?!:;\"'“”‘’"
PUNCT_RE = re.compile("[" + re.escape(PUNCT_CHARS) + "]")

# Words whose vocab-listed pinyin is a dictionary/citation-form reading that
# legitimately differs from how the word surfaces in a natural sentence.
# Map: word -> reason (kept for documentation; the checker currently has none
# needed because 了/着/地/得-type words each have a single fixed vocab reading
# that is used consistently). Empty by design; extend here if a future word
# needs a documented exception.
ALLOWED = {
    # "word": "reason this word's sentence pinyin may differ from vocab py",
}

# Transparent compound whitelist: token -> {"py": ..., "base": <VOCAB word>}.
# `base` must exist in VOCAB (validated in main()). This is also exported
# verbatim into data/hsk_sentences.js as `SENTENCE_EXTRA` so the app can
# resolve per-word audio/availability for these tokens.
EXTRA = {
    "春天": {"py": "chūntiān", "base": "春"},
    "夏天": {"py": "xiàtiān", "base": "夏"},
    "秋天": {"py": "qiūtiān", "base": "秋"},
    "冬天": {"py": "dōngtiān", "base": "冬"},
    "哪儿": {"py": "nǎr", "base": "哪"},
    "这儿": {"py": "zhèr", "base": "这"},
    "那儿": {"py": "nàr", "base": "那"},
    "这里": {"py": "zhèlǐ", "base": "这"},
    "那里": {"py": "nàlǐ", "base": "那"},
    "哪里": {"py": "nǎlǐ", "base": "哪"},
    "你们": {"py": "nǐmen", "base": "你"},
    "他们": {"py": "tāmen", "base": "他"},
    "她们": {"py": "tāmen", "base": "她"},
    "这个": {"py": "zhège", "base": "这"},
    "那个": {"py": "nàge", "base": "那"},
    "哪个": {"py": "nǎge", "base": "哪"},
    "这些": {"py": "zhèxiē", "base": "这"},
    "那些": {"py": "nàxiē", "base": "那"},
}


def strip_punct(s):
    return PUNCT_RE.sub("", s)


def load_vocab():
    data = json.loads(VOCAB_PATH.read_text(encoding="utf-8"))
    by_word = {}
    for item in data:
        by_word[item["w"]] = item
    return by_word


def load_sentences():
    text = SENTENCES_PATH.read_text(encoding="utf-8")
    # file is `const SENTENCES=[...];`
    start = text.index("[")
    end = text.rindex("]") + 1
    return json.loads(text[start:end])


def main():
    vocab = load_vocab()
    sentences = load_sentences()

    errors = []
    warnings = []
    zh_seen = set()
    used_words = set()
    lv_counts = Counter()

    # Validate EXTRA bases up front: an EXTRA entry whose base isn't in
    # VOCAB would silently break level/coverage accounting, so treat it as
    # a hard error rather than a per-sentence surprise.
    for token, info in EXTRA.items():
        if info["base"] not in vocab:
            errors.append(
                f"EXTRA[{token!r}]: base {info['base']!r} not in VOCAB"
            )

    def resolve(w):
        """Return (pinyin, level) for a word, checking VOCAB then EXTRA.
        Returns None if the word is not recognized anywhere."""
        entry = vocab.get(w)
        if entry is not None:
            return entry["py"], entry["lv"], w  # w itself counts for coverage
        extra = EXTRA.get(w)
        if extra is not None and extra["base"] in vocab:
            base_entry = vocab[extra["base"]]
            return extra["py"], base_entry["lv"], extra["base"]  # base counts
        return None

    # Tone-sandhi tolerant compare for 不 (bu4->bu2 before 4th tone) and
    # 一 (yi1 -> yi2/yi4 depending on following tone) is handled by simply
    # allowing the written pinyin to differ from the dictionary tone ONLY for
    # these two characters; all other words must match the vocab pinyin
    # exactly (case-insensitive, punctuation-insensitive).
    SANDHI_CHARS = {"不", "一"}

    for idx, s in enumerate(sentences):
        zh = s["zh"]
        py = s["py"]
        en = s.get("en", "")
        lv = s["lv"]
        words = s["words"]
        label = f"#{idx} {zh!r}"

        # duplicate check
        if zh in zh_seen:
            errors.append(f"{label}: duplicate zh")
        zh_seen.add(zh)

        # segmentation check
        joined = "".join(words)
        if strip_punct(joined) != strip_punct(zh):
            errors.append(
                f"{label}: segmentation mismatch: words join to {joined!r}"
            )

        # vocab membership + level check (VOCAB word, or EXTRA compound
        # whose base is a VOCAB word)
        max_lv = 0
        word_pinyins = []
        bad_word = False
        for w in words:
            resolved = resolve(w)
            if resolved is None:
                errors.append(f"{label}: word {w!r} not in VOCAB or EXTRA")
                bad_word = True
                continue
            wpy, wlv, coverage_word = resolved
            used_words.add(coverage_word)
            max_lv = max(max_lv, wlv)
            word_pinyins.append((w, wpy))

        if not bad_word:
            if max_lv != lv:
                errors.append(
                    f"{label}: lv={lv} but max word level is {max_lv}"
                )

        lv_counts[lv] += 1

        # pinyin cross-check
        if not bad_word:
            expected = []
            for w, wpy in word_pinyins:
                if w in ALLOWED:
                    continue
                expected.append(wpy)
            expected_str = strip_punct(" ".join(expected)).lower()
            # allow sandhi variance: strip 不/一 tone marks by normalizing
            # bu2/bu4 and yi1/yi2/yi4 to a neutral form before compare, but
            # ONLY for those characters' syllables.
            def normalize_sandhi(py_str, word_list):
                # crude: for each occurrence of a sandhi word, allow any of
                # its known tone variants. We just check exact match first;
                # if not exact, retry allowing tone digit-free compare for
                # syllables corresponding to 不/一.
                return py_str

            actual_str = strip_punct(py).lower()
            if expected_str != actual_str:
                # retry with sandhi tolerance: rebuild expected allowing
                # bu/yi tone variants by stripping diacritics only on those
                # syllables is complex; simplest robust approach: if the
                # only differing tokens correspond to 不 or 一, accept it.
                exp_tokens = expected_str.split()
                act_tokens = actual_str.split()
                if len(exp_tokens) == len(act_tokens):
                    ok = True
                    for w, et, at in zip(words, exp_tokens, act_tokens):
                        if et == at:
                            continue
                        if w in SANDHI_CHARS:
                            continue  # tolerate tone-sandhi variance
                        ok = False
                        break
                    if not ok:
                        errors.append(
                            f"{label}: pinyin mismatch: expected {expected_str!r} got {actual_str!r}"
                        )
                else:
                    errors.append(
                        f"{label}: pinyin token count mismatch: expected {expected_str!r} got {actual_str!r}"
                    )

        # length limits (character count, punctuation excluded)
        zh_len = len(strip_punct(zh))
        if lv in (1, 2):
            if not (3 <= zh_len <= 12):
                errors.append(f"{label}: length {zh_len} out of range 3-12 for lv{lv}")
        else:
            if not (3 <= zh_len <= 16):
                errors.append(f"{label}: length {zh_len} out of range 3-16 for lv{lv}")

    # coverage
    total_vocab = len(vocab)
    covered = len(used_words & set(vocab.keys()))
    coverage_pct = 100.0 * covered / total_vocab
    uncovered = sorted(set(vocab.keys()) - used_words)

    print(f"Total sentences: {len(sentences)}")
    print(f"Level counts: {dict(sorted(lv_counts.items()))}")
    print(f"Vocab coverage: {covered}/{total_vocab} = {coverage_pct:.1f}%")
    if coverage_pct < 70.0:
        print(f"Uncovered words ({len(uncovered)}):")
        print(" ".join(uncovered))

    print(f"\nErrors: {len(errors)}")
    for e in errors[:500]:
        print(" -", e)

    if errors or coverage_pct < 70.0:
        sys.exit(1)
    print("\nAll checks passed.")


if __name__ == "__main__":
    main()
