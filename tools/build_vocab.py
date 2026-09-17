#!/usr/bin/env python3
"""
build_vocab.py -- regenerates data/hsk_vocab.json and data/hsk_vocab.js
(the HSK 1-4 vocabulary used by both trainer apps) from the community
"complete-hsk-vocabulary" dataset.

SOURCE
    https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/main/complete.json
    Each entry has a `level` array tagging it with old-HSK-2.0 levels as
    "old-1".."old-6"; this script keeps only old-1..old-4 (the HSK 2.0 levels
    this project targets) and, for a word tagged at more than one level,
    keeps the lowest. Each entry also has one or more `forms` (distinct
    pronunciations), each form carrying its own `transcriptions` (pinyin,
    numeric pinyin, etc.) and `meanings` (an ordered list of English senses).

HOW TO RUN
    python3 tools/build_vocab.py
        Downloads the source JSON fresh (~10 MB) and regenerates
        data/hsk_vocab.json + data/hsk_vocab.js in place. Prints per-level
        counts, validation stats, and a diff against the previous
        data/hsk_vocab.json (py/en changes), then exits.

    python3 tools/build_vocab.py --source /path/to/complete.json
        Use an already-downloaded copy instead of fetching (useful offline,
        or to pin a specific snapshot of the upstream dataset).

    After running, rebuild the shipped HTML and re-run the test suite:
        sh build.sh
        /opt/homebrew/bin/node tests/pinyin_checks.js
    (or whatever `node` is on your PATH -- the checks are pure JS/Node,
    no npm deps.) Check [1] mark(n) round-trip must read 0 mismatches.

OUTPUT SCHEMA
    One object per word: {"w": "学生", "py": "xuésheng", "n": "xue2sheng5",
    "en": "student; schoolchild", "lv": 1}
    - w:  simplified Chinese.
    - py: tone-marked pinyin, syllables joined with no separator (apostrophe
          inserted before a syllable starting with a/e/o if ambiguous, e.g.
          Xī'ān-style); neutral tone unmarked; ü kept as ü. Only the entry's
          very first letter may be capitalized (proper nouns like Zhōngguó);
          every later syllable is forced lowercase even if the source
          capitalized it as its own word (e.g. "Cháng Jiāng" -> "Chángjiāng").
    - n:  numbered pinyin, same joining rule, tone digit per syllable
          (5 = neutral), same lone-leading-capital rule.
    - en: an English gloss, <=60 chars, at most 2 senses joined with "; ".
    - lv: 1-4 (old HSK 2.0 level).

SENSE-SELECTION RULES (why this script is more than a straight JSON dump)
    The source lists every attested pronunciation of a character as a
    separate "form", ordered ~alphabetically by pinyin rather than by
    frequency. Taking forms[0] blindly (the original, naive approach) picks
    up surnames, abbreviations, and rare/variant readings far too often
    (e.g. 三 -> "Sān, surname San" instead of "sān, three"). The pipeline is:

    1. Categorical filter (select_form): for a word's candidate forms, drop
       any form whose pinyin is capitalized *unless every form is*
       (that carve-out keeps true proper nouns like 中国/北京 capitalized),
       and drop any form whose first meaning matches
       SKIP_GLOSS_RE (surname / used in / abbr. / old variant / see ...) or
       VARIANT_RE ("(one optional qualifying word) variant of ..." -- the
       qualifier allows phrasings like "euphemistic variant of X").
    2. Sense-tag ranking: among the forms that survive step 1, forms whose
       first meaning is tagged "(bound form)" are ranked after untagged
       forms (a "(bound form)" sense is reliably a rarer/technical one).
       NOTE: "(loanword)" is deliberately *not* included in this ranking --
       for a lot of basic HSK words (沙发, 咖啡, 幽默) the loanword-tagged
       sense IS the correct, primary one, so deprioritizing it does more
       harm than good. Where a loanword-vs-other-reading ambiguity needed
       resolving (吧: "bar (loanword)" vs the sentence particle), it's
       handled with an explicit OVERRIDE entry instead.
    3. OVERRIDE table: even after 1-2, ~99 words still had 2+ remaining
       candidate forms -- these are genuine homograph pairs with no marker
       word to disambiguate (e.g. 教 jiāo "to teach" vs jiào "religion,
       teaching, to make/cause"; 长 cháng "long" vs zhǎng "to grow/chief").
       Every one of the 99 was checked by hand against the source's own
       `meanings` text and standard Mandarin/HSK usage; ~40 needed an
       explicit override to land on the common HSK reading (documented
       inline per word below), the rest were already correct by default
       order. A handful (啊/得/弹/精神/为) were genuinely ambiguous even by
       hand -- both readings are real, common Mandarin -- and were
       resolved by an explicit team decision rather than a guess (see the
       comments on those entries).
       OVERRIDE maps a word to either {"numeric": "<exact source numeric
       pinyin>"} (used when the two readings have different tones/syllables)
       or {"gloss_substr": "<substring>"} (used when two candidate forms
       share the same numeric reading but differ in meaning, e.g. 云 yun2
       = "cloud" vs yun2 = "(classical) to say").
    4. Gloss assembly (build_en): within the chosen form's `meanings` list,
       drop any sense matching the same skip/variant patterns as step 1,
       then rank untagged senses ahead of "(bound form)"-tagged ones (e.g.
       上's "to climb; to get onto" over "(bound form) up; upper"), then
       join the top 1-2 senses with "; ". If that's <=60 chars, done. Else
       if there were 2 senses picked, try just the first sense alone (a lot
       of the raw >60-char joins are simply "sense1; sense2" where sense1
       alone already fits). If still >60 (i.e. even a single sense is too
       long, e.g. 个's "(classifier used before a noun that has no specific
       classifier)"), hard-cut at the last space before character 57,
       back off past any now-unmatched "(" so no truncated gloss ever ends
       with a dangling open paren, and append an ellipsis ("…") so a
       truncated gloss is visually distinguishable from a complete one.
       NOTE: an earlier version of this step tried "prefer whichever
       candidate sense is already <=60 chars" instead of the "first sense
       alone, then hard-cut" order above -- that regressed ~15 common
       words (e.g. 咱们 "we or us" -> "(dialect) I or me", 奶奶 "grandma" ->
       "(respectful) mistress of the house") by jumping to a short but far
       less central secondary sense whenever the primary sense was long.
       Do not reintroduce that without re-checking those regressions.
    5. Dedup: if the same simplified word appears more than once (distinct
       dataset entries, not just distinct forms), keep the occurrence at
       the lowest HSK level.

VALIDATION
    This script prints, every run: per-level + total counts; any fallback
    selections (no candidate form survived filtering, so forms[0] was used
    -- should be empty); forms picked with only one meaning where
    alternatives existed (a heuristic flag for "maybe still wrong", worth a
    human skim after touching the filters); the count of words with 2+
    eligible candidates and how many were overridden vs. left at default;
    remaining capitalized py entries (should be exactly the proper nouns);
    any gloss with an unmatched "(" (should be zero); and, since the
    previous data/hsk_vocab.json is read before being overwritten, a full
    py/en diff against the previous run.

    A second, independent check lives in tests/pinyin_checks.js -- run it
    after this script (see "HOW TO RUN" above). It round-trips every `n`
    back through the tone-marking algorithm and asserts it reproduces `py`
    exactly; this is the strongest sanity check that `py`/`n` are mutually
    consistent (it would have caught the "Chang2Jiang1" vs "Chángjiāng"
    capitalization mismatch that motivated the join_pinyin/join_numeric
    lowercasing rule above).
"""

import argparse
import json
import re
import sys
import urllib.request
from collections import Counter
from pathlib import Path

SOURCE_URL = "https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/main/complete.json"
ROOT = Path(__file__).resolve().parent.parent
OUT_JSON = ROOT / "data" / "hsk_vocab.json"
OUT_JS = ROOT / "data" / "hsk_vocab.js"

VOWEL_START = set("aeoAEOāáǎàēéěèōóǒò")
CAP_RE = re.compile(r'^[A-Z]')
SKIP_GLOSS_RE = re.compile(r'^(surname|used in |abbr\.|old variant|see )', re.I)
# allow at most one qualifying adjective before "variant of" (e.g. "euphemistic variant of X")
VARIANT_RE = re.compile(r'^(\w+\s+)?variant of\b', re.I)

fallback_log = []       # (w, chosen_py, chosen_meaning0)
single_meaning_log = [] # (w, chosen_py, meaning0) for manual review
tie_log = []            # (w, [(py, meaning0), ...]) 2+ eligible candidates


def join_pinyin(py):
    syll = py.split(' ')
    out = syll[0]
    for s in syll[1:]:
        if s and s[0] in VOWEL_START:
            out += "'" + s
        else:
            out += s
    # Only the very first letter of the joined word may stay capitalized (true
    # proper nouns like Zhōngguó); a later syllable that was capitalized in the
    # source purely because it started its own word (e.g. "Cháng Jiāng" -> the
    # place name Chang Jiang) must not leave a mid-word capital once joined.
    if len(out) > 1:
        out = out[0] + out[1:].lower()
    return out


def join_numeric(num):
    out = num.replace(' ', '')
    # keep in sync with join_pinyin: only the first letter of the entry may stay
    # capitalized, so mark()/py stay consistent for compound proper nouns.
    if len(out) > 1:
        out = out[0] + out[1:].lower()
    return out


def is_capitalized(py):
    return bool(CAP_RE.match(py))


def gloss_is_skip(meanings):
    if not meanings:
        return True
    m0 = meanings[0].strip()
    return bool(SKIP_GLOSS_RE.match(m0)) or bool(VARIANT_RE.match(m0))


# NOTE: "(loanword)" is deliberately excluded here. Unlike "(bound form)" (which
# reliably marks a rarer/technical sense), "(loanword)" often tags the CORRECT,
# primary HSK meaning (e.g. 沙发 "sofa (loanword)" vs its obscure "(Internet
# slang) first reply" sense, 咖啡 "coffee (loanword)"). Deprioritizing it broke
# 沙发/幽默/etc. 吧's loanword-vs-particle case is handled by an explicit
# OVERRIDE entry below instead.
TAGGED_RE = re.compile(r'\(bound form\)', re.I)


def is_tagged_sense(s):
    return bool(TAGGED_RE.search(s))


# A sense that OPENS with one of these register tags is a real but rare/technical/
# dated reading -- fine to show as the gloss when it's the only sense a word has,
# but not worth joining onto a perfectly good plain sense just because it happened
# to fit under the 60-char budget (see build_en).
REGISTER_TAG_RE = re.compile(r'^\((?:bound form|literary|dialect|archaic|old|coll\.)\)', re.I)


# ---------------------------------------------------------- gloss sanitiser (v2)
# The source's `meanings` occasionally embed a Chinese cross-reference inside an
# otherwise-English gloss, e.g. "you (informal, as opposed to courteous 您)" or
# "old; opposite: new 新" -- these leaked raw characters into `en` even with the
# trainer's "show characters" toggle off, since the app only ever gates the `w`
# field, not `en`. Every one of these is, structurally, a short lead-in phrase
# ("opposite:", "abbr. for", "as opposed to", "also written", "...equivalent
# of/to") immediately followed by the Chinese word it's pointing at -- that whole
# clause (or parenthetical, or ";"-joined sense) carries no meaning without the
# character it references, so it gets dropped entirely rather than left as a
# dangling "opposite:" or "abbr. for" with the Chinese word silently removed.
CJK_RE = re.compile(r'[一-鿿㐀-䶿]+')
LEADIN_ALT = (
    r'as opposed to|opposite\s+of|opposite:?|abbr\.?\s+for|short for|see|'
    r'also written|also called|same as|variant of|'
    r'colloquial equivalent of|literary equivalent of|equivalent (?:of|to)'
)
CROSSREF_ONLY_RE = re.compile(r'^(?:' + LEADIN_ALT + r')[\s:]*[\w\s]*$', re.I)
# Same lead-in phrases, but matched wherever one sits directly against a Chinese run
# -- not just when it's the *whole* clause (see LEADIN_CJK_RE below).
LEADIN_CJK_RE = re.compile(r'\b(?:' + LEADIN_ALT + r')\b[\s:]*[一-鿿㐀-䶿]+', re.I)
# Post-sanitize validation: a lead-in word immediately followed by a clause
# boundary (or end of string) with nothing in between means sanitize_gloss left it
# dangling after removing the Chinese word it used to point at -- should never match.
DANGLING_LEADIN_RE = re.compile(r'(?:equivalent|opposite|abbr|written|same as|variant)\s*(?:to|of|for|:)?\s*(?:[,;)]|$)', re.I)


def _clean_subclause(text):
    """A single comma-delimited fragment (no surrounding delimiters). Returns ''
    if, once its Chinese run is removed, all that's left is a cross-reference
    lead-in with nothing else -- i.e. the whole fragment only existed to point at
    that Chinese word. Otherwise, if a lead-in phrase sits directly against a
    Chinese run *within* a larger fragment (e.g. "particle equivalent to 啊 after
    a vowel"), excises that lead-in+CJK span together rather than leaving the
    lead-in dangling with nothing to point at once the character is stripped.
    If a Chinese run remains even after that (the source embedded it without one
    of our recognised lead-in phrases, e.g. "often used correlatively with 或
    etc"), the whole fragment is dropped rather than excising just the character
    in place -- that would leave nonsense residue like "with or etc" where "or"
    reads as the English word, not the stripped translation of 或."""
    if not CJK_RE.search(text):
        return text
    without_cjk = CJK_RE.sub('', text)
    if CROSSREF_ONLY_RE.match(without_cjk.strip(' :')):
        return ''
    text = LEADIN_CJK_RE.sub('', text)
    if CJK_RE.search(text):
        return ''
    return re.sub(r'\s+', ' ', text).strip()


def _clean_commalist(text):
    parts = [p for p in (_clean_subclause(p) for p in re.split(r',\s*', text)) if p]
    return ', '.join(parts)


def _clean_paren(m):
    inner = _clean_commalist(m.group(1))
    return f'({inner})' if inner else ''


def sanitize_gloss(en):
    """Removes Chinese characters from an English gloss. A clause (parenthetical,
    comma-fragment, or ";"-joined sense) that is nothing but a cross-reference lead-in
    plus the Chinese word it points to (e.g. "abbr. for 超级市场", "opposite: new 新")
    is dropped whole; any other Chinese run found is stripped in place, with leftover
    whitespace/empty-parens collapsed. May return '' if the entire gloss was a
    cross-reference -- callers should fall back to the next candidate sense."""
    if not CJK_RE.search(en):
        return en
    en = re.sub(r'\(([^()]*)\)', _clean_paren, en)
    senses = [_clean_commalist(s) for s in re.split(r';\s*', en)]
    en = '; '.join(s for s in senses if s)
    en = CJK_RE.sub('', en)  # safety net for any Chinese run the lead-in list missed
    en = re.sub(r'\(\s*\)', '', en)
    en = re.sub(r'\s+', ' ', en)
    en = re.sub(r'\s*([;,])\s*', r'\1 ', en)
    return en.strip(' ,;')


# Manual overrides for words where, after the categorical cap/gloss-pattern filter,
# 2+ eligible forms remain and the raw dataset order does not land on the common HSK
# reading. Each was verified by hand against the source's own meanings text (below)
# and standard Mandarin usage -- these are not guesses, they resolve real homograph
# ambiguity the regex rule structurally cannot see (both readings are "real" senses,
# neither flagged as surname/variant/abbr).
# "numeric": exact numeric-pinyin match. "gloss_substr": substring match on the
# candidate's first meaning, used when both candidates share the same numeric reading.
OVERRIDE = {
    "便宜": {"numeric": "pian2 yi5"},    # "cheap", not "convenient" (bian4 yi2)
    "差":   {"numeric": "cha4"},         # "poor; lacking", not "difference" (cha1)
    "场":   {"numeric": "chang3"},       # "place/classifier for events", not "threshing floor" (chang2)
    "大夫": {"numeric": "dai4 fu5"},     # "doctor", not "senior official" (da4 fu1)
    "当":   {"gloss_substr": "to be"},   # "to be/act as", not the onomatopoeia "dong" reading
    "地方": {"numeric": "di4 fang5"},    # "place", not "region" (di4 fang1)
    "底":   {"numeric": "di3"},          # "bottom/end", not "(equiv. to 的)" (de5)
    "东西": {"numeric": "dong1 xi5"},    # "thing", not "east and west" (dong1 xi1)
    "读":   {"numeric": "du2"},          # "to read", not "comma" (dou4)
    "干":   {"numeric": "gan4"},         # "to do", not "dry" (gan1)
    "更":   {"numeric": "geng4"},        # "more", not "to change" (geng1)
    "告诉": {"numeric": "gao4 su5"},     # "to tell; to inform", not "to press charges" (gao4 su4)
    "故事": {"numeric": "gu4 shi5"},     # "story", not "old practice" (gu4 shi4)
    "号":   {"numeric": "hao4"},         # "number", not "roar" (hao2)
    "好处": {"numeric": "hao3 chu5"},    # "benefit", not "easy to get along with" (hao3 chu3)
    "几":   {"numeric": "ji3"},          # "how many", not "small table" (ji1)
    "结果": {"numeric": "jie2 guo3"},    # "result", not "to bear fruit" (jie1 guo3)
    "看":   {"numeric": "kan4"},         # "to see/look", not "to look after" (kan1)
    "累":   {"numeric": "lei4"},         # "tired", not "to accumulate" (lei3)
    "离":   {"numeric": "li2"},          # "to leave", not "mythical beast" (chi1)
    "吗":   {"numeric": "ma5"},          # sentence-final particle, not "má (coll.) what?"
    "弄":   {"numeric": "nong4"},        # "to do/handle", not "lane/alley" (long4)
    "胖":   {"numeric": "pang4"},        # "fat", not "healthy" (pan2)
    "妻子": {"numeric": "qi1 zi5"},      # "wife", not "wife and children" (qi1 zi3)
    "骑":   {"numeric": "qi2"},          # "to ride", not "(Tw) saddle horse" (ji4)
    "台":   {"gloss_substr": "platform"},# "platform/stage/counter", not "(classical) you in letters"
    "汤":   {"numeric": "tang1"},        # "soup", not "rushing current" (shang1)
    "趟":   {"numeric": "tang4"},        # classifier for trips, not "to wade" (tang1)
    "听":   {"numeric": "ting1"},        # "to listen", not "smile (archaic)" (yin3)
    "行":   {"numeric": "xing2"},        # "to walk/OK", not "row/profession" (hang2)
    "药":   {"gloss_substr": "medicine"},# "medicine", not "leaf of the iris"
    "要":   {"numeric": "yao4"},         # "to want", not "(bound form) to demand" (yao1)
    "页":   {"numeric": "ye4"},          # "page", not "head" (xie2)
    "云":   {"gloss_substr": "cloud"},   # "cloud", not "(classical) to say"
    "脏":   {"numeric": "zang1"},        # "dirty", not "viscera" (zang4)
    "着":   {"numeric": "zhe5"},         # aspect particle, not "chess move" (zhao1)
    "重点": {"numeric": "zhong4 dian3"}, # "key point/focus", not "to recount an election" (chong2 dian3)
    "多少": {"numeric": "duo1 shao5"},   # "how much/many", not "number" (duo1 shao3)
    "吧":   {"numeric": "ba5"},          # sentence-final suggestion particle, not "bar (loanword)"
    # The following 5 were genuinely ambiguous (both readings real Mandarin, no
    # confident call from the source data alone) -- resolved per team decision:
    "啊":   {"numeric": "a5"},           # neutral "a", sentence particle
    "得":   {"numeric": "de5"},          # structural particle (the HSK 2 sense)
    "弹":   {"numeric": "tan2"},         # tán, "to play (an instrument)" (HSK 4)
    "精神": {"numeric": "jing1 shen2"},  # jīngshén, "spirit; mind"
    "为":   {"numeric": "wei4"},         # wèi, "for; because of" (为什么)
}


def select_form(w, forms):
    usable = [f for f in forms
              if f.get('transcriptions', {}).get('pinyin') and f.get('meanings')]
    if not usable:
        return None, False
    all_cap = all(is_capitalized(f['transcriptions']['pinyin']) for f in usable)
    eligible = []
    for f in usable:
        py = f['transcriptions']['pinyin']
        meanings = f['meanings']
        if is_capitalized(py) and not all_cap:
            continue
        if gloss_is_skip(meanings):
            continue
        eligible.append(f)
    if not eligible:
        chosen = usable[0]
        fallback_log.append((w, chosen['transcriptions']['pinyin'], chosen['meanings'][0] if chosen['meanings'] else ''))
        return chosen, True

    # rank forms whose first meaning is untagged ahead of "(bound form)"-tagged
    # ones -- e.g. preferring a common verb sense over a technical/bound one.
    # Stable sort: relative order within each group is preserved.
    eligible = sorted(eligible, key=lambda f: 1 if is_tagged_sense(f['meanings'][0]) else 0)

    chosen = eligible[0]
    ov = OVERRIDE.get(w)
    if ov:
        match = None
        if "numeric" in ov:
            match = next((f for f in eligible if f['transcriptions'].get('numeric') == ov["numeric"]), None)
        elif "gloss_substr" in ov:
            match = next((f for f in eligible if ov["gloss_substr"].lower() in f['meanings'][0].lower()), None)
        if match:
            chosen = match

    if len(eligible) > 1:
        tie_log.append((w, [(f['transcriptions']['pinyin'], f['meanings'][0]) for f in eligible]))
    if len(chosen['meanings']) == 1 and len(eligible) > 1:
        single_meaning_log.append((w, chosen['transcriptions']['pinyin'], chosen['meanings'][0]))
    return chosen, False


def truncate_hard(s, limit=57):
    s = s.strip()
    cut = s[:limit]
    last_space = cut.rfind(' ')
    candidate = cut[:last_space] if last_space > 10 else cut
    # if unmatched '(' remains, back off to before that paren
    while candidate.count('(') > candidate.count(')'):
        idx = candidate.rfind('(')
        if idx <= 0:
            candidate = candidate.replace('(', '')
            break
        candidate = candidate[:idx].rstrip()
    return candidate.rstrip(' ,;').strip() + '…'


# Hand-picked gloss text overrides: build_en's automatic sense-selection/joining
# rules pick a plausible sense, but occasionally the source dataset's own wording
# doesn't read as the simplest, most idiomatic gloss for that word once its second
# (register-tagged) sense is correctly excluded from joining. Each entry is a
# targeted correction, not a rule change, with the reason it's needed recorded here.
GLOSS_OVERRIDE = {
    # Source meanings are ["no; not so", "(bound form) not; un-"]. The register-tag
    # join fix (see docs/PINYIN_SPEC.md Deviations) correctly stops joining the
    # bound-form sense onto the first, leaving just "no; not so" -- grammatically
    # fine but "not so" is an awkward, over-literal gloss for HSK 1's basic negation
    # particle. The bound-form sense's own core word ("not") is the simpler, more
    # standard English gloss learners expect, so it replaces "not so" here.
    "不": "no; not",
}


def build_en(meanings):
    filtered = [m for m in meanings if not (SKIP_GLOSS_RE.match(m.strip()) or VARIANT_RE.match(m.strip()))]
    if not filtered:
        filtered = meanings[:]
    # rank untagged senses ahead of "(bound form)"-tagged ones, e.g. 上's
    # "to climb; to get onto" over "(bound form) up; upper".
    ranked = sorted((m.strip() for m in filtered), key=lambda m: 1 if is_tagged_sense(m) else 0)
    # Sanitize every candidate sense (strips an embedded Chinese cross-reference, or
    # drops the sense entirely if it's nothing but one -- see sanitize_gloss). A sense
    # that sanitizes to empty is skipped so the next-ranked sense is used instead,
    # rather than ever shipping an empty or CJK-leaking gloss.
    sanitized = [s for s in (sanitize_gloss(m) for m in ranked) if s]
    if not sanitized:
        # Every candidate sense was pure cross-reference text -- not expected on the
        # real corpus (checked: it doesn't happen), but better a raw sense than none.
        sanitized = [ranked[0]] if ranked else ['']
    # Never join a register-tagged sense onto another one -- only show it when it's
    # the sole sense available (e.g. 有's real-but-rare "(bound form) having; with;
    # -ful; -ed; -al" shouldn't get joined onto "to have; there is" just because it
    # fit under the 60-char budget once its unrelated worked example was sanitized away).
    if len(sanitized) > 1:
        untagged = [s for s in sanitized if not REGISTER_TAG_RE.match(s)]
        picked = (untagged or sanitized)[:2]
    else:
        picked = sanitized[:1]
    en = "; ".join(picked)
    if len(en) <= 60:
        return en
    if len(picked) > 1:
        en1 = picked[0]
        if len(en1) <= 60:
            return en1
        return truncate_hard(en1, 57)
    return truncate_hard(picked[0], 57)


def load_source(source_arg):
    if source_arg:
        return json.loads(Path(source_arg).read_text(encoding='utf-8'))
    print(f"Fetching {SOURCE_URL} ...", file=sys.stderr)
    with urllib.request.urlopen(SOURCE_URL, timeout=60) as resp:
        return json.loads(resp.read().decode('utf-8'))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--source', help='local complete.json to use instead of downloading')
    args = ap.parse_args()

    data = load_source(args.source)

    entries = {}  # w -> record
    for e in data:
        levels = e.get('level', [])
        old_levels = []
        for lv in levels:
            m = re.match(r'^old-(\d+)$', lv)
            if m:
                n = int(m.group(1))
                if 1 <= n <= 4:
                    old_levels.append(n)
        if not old_levels:
            continue
        lv = min(old_levels)
        w = e['simplified']
        forms = e.get('forms', [])
        if not forms:
            continue
        f, used_fallback = select_form(w, forms)
        if f is None:
            continue
        t = f.get('transcriptions', {})
        pinyin = t.get('pinyin', '')
        numeric = t.get('numeric', '')
        meanings = f.get('meanings', [])
        if not pinyin or not numeric or not meanings:
            continue
        py = join_pinyin(pinyin)
        n = join_numeric(numeric)
        en = GLOSS_OVERRIDE.get(w) or build_en(meanings)
        rec = {"w": w, "py": py, "n": n, "en": en, "lv": lv}
        if w in entries:
            if lv < entries[w]['lv']:
                entries[w] = rec
        else:
            entries[w] = rec

    result = list(entries.values())
    result.sort(key=lambda r: (r['lv'], r['w']))

    # snapshot the previous output (if any) before overwriting, for the diff report
    old_by_w = {}
    if OUT_JSON.exists():
        try:
            old_by_w = {r['w']: r for r in json.loads(OUT_JSON.read_text(encoding='utf-8'))}
        except Exception:
            old_by_w = {}

    OUT_JSON.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding='utf-8')
    OUT_JS.write_text("const VOCAB=" + json.dumps(result, ensure_ascii=False) + ";\n", encoding='utf-8')

    c = Counter(r['lv'] for r in result)
    print("counts:", dict(sorted(c.items())))
    print("total:", len(result))

    print("\nfallback entries (nothing survived filtering, used first form):", len(fallback_log))
    for w, py, m0 in fallback_log:
        print(f"  {w}\t{py}\t{m0}")

    print(f"\nselected forms with only 1 meaning where other forms existed (manual-review candidates): {len(single_meaning_log)}")
    for w, py, m0 in single_meaning_log:
        print(f"  {w}\t{py}\t{m0}")

    print(f"\nwords with 2+ eligible candidate forms after cap/gloss-pattern filtering: {len(tie_log)}")
    print(f"  of these, {len(OVERRIDE)} have a verified manual override (see OVERRIDE dict)")
    resolved_by_default = [w for w, _ in tie_log if w not in OVERRIDE]
    print(f"  remaining {len(resolved_by_default)} kept default order (first eligible judged correct on manual check): {resolved_by_default}")

    cap_entries = [r for r in result if CAP_RE.match(r['py'])]
    print(f"\nremaining capitalized-initial py entries: {len(cap_entries)}")
    for r in cap_entries:
        print(f"  {r['w']}\t{r['py']}\t{r['en']}")

    unmatched = [r for r in result if r['en'].count('(') != r['en'].count(')')]
    print(f"\nentries with unmatched '(' in en: {len(unmatched)}")
    for r in unmatched[:20]:
        print(f"  {r['w']}\t{r['en']}")

    cjk_leaked = [r for r in result if CJK_RE.search(r['en'])]
    print(f"\nentries with a Chinese character still in en after sanitize_gloss: {len(cjk_leaked)} (should be 0)")
    for r in cjk_leaked[:20]:
        print(f"  {r['w']}\t{r['en']!r}")

    # 对面/相反 are known false positives on this heuristic -- "opposite" is their
    # genuine, CJK-free English gloss, not a leftover cross-reference lead-in (hand
    # -verified; kept in sync with tests/pinyin_checks.js's DANGLING_ALLOWLIST and
    # documented in docs/PINYIN_SPEC.md's Deviations).
    DANGLING_ALLOWLIST = {"对面", "相反"}
    dangling_hits = [r for r in result if DANGLING_LEADIN_RE.search(r['en'])]
    dangling_real = [r for r in dangling_hits if r['w'] not in DANGLING_ALLOWLIST]
    dangling_allowlisted = [r for r in dangling_hits if r['w'] in DANGLING_ALLOWLIST]
    print(f"\nentries with a dangling cross-reference lead-in (e.g. \"equivalent to,\") in en: {len(dangling_real)} real (should be 0), {len(dangling_allowlisted)} allowlisted")
    for r in dangling_real[:20]:
        print(f"  {r['w']}\t{r['en']!r}")
    for r in dangling_allowlisted:
        print(f"  (allowlisted) {r['w']}\t{r['en']!r}")

    if old_by_w:
        py_changed, en_changed = [], []
        for r in result:
            o = old_by_w.get(r['w'])
            if o is None:
                continue
            if o['py'] != r['py']:
                py_changed.append((r['w'], o['py'], r['py']))
            if o['en'] != r['en']:
                en_changed.append((r['w'], o['en'], r['en']))
        print(f"\npy changed vs. previous data/hsk_vocab.json: {len(py_changed)} entries")
        for w, old_py, new_py in py_changed:
            print(f"  {w}\t{old_py} -> {new_py}")
        print(f"\nen changed vs. previous data/hsk_vocab.json: {len(en_changed)} entries")
        for w, old_en, new_en in en_changed:
            print(f"  {w}\t{old_en!r} -> {new_en!r}")


if __name__ == '__main__':
    main()
