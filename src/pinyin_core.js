// pinyin_core.js — pinyin helpers shared by the trainer app and the node checks.
// No DOM dependency (works under Node for tests); exports via window or module.exports.
(function(root){
"use strict";

// ---------------------------------------------------------------- tone marks
const TONE_CHARS = {
  a: ["a","ā","á","ǎ","à"],
  e: ["e","ē","é","ě","è"],
  i: ["i","ī","í","ǐ","ì"],
  o: ["o","ō","ó","ǒ","ò"],
  u: ["u","ū","ú","ǔ","ù"],
  "ü": ["ü","ǖ","ǘ","ǚ","ǜ"]
};
const BASE_OF = {};
Object.keys(TONE_CHARS).forEach(base=>{ TONE_CHARS[base].forEach(ch=>{ BASE_OF[ch]=base; }); });

function toneMarkChar(baseLetter, tone){
  const arr = TONE_CHARS[baseLetter];
  if(!arr) return baseLetter;
  if(!tone || tone===0 || tone===5) return baseLetter;
  return arr[tone] || baseLetter;
}

// Standard placement rule: a > e > o > last of i/u/ü.
function markVowelIndex(letters){
  const lower = letters.toLowerCase();
  let idx = lower.indexOf("a"); if(idx>=0) return idx;
  idx = lower.indexOf("e"); if(idx>=0) return idx;
  idx = lower.indexOf("o"); if(idx>=0) return idx;
  for(let i=lower.length-1;i>=0;i--){ if("iuü".indexOf(lower[i])>=0) return i; }
  return -1;
}

function markSyllable(letters, tone){
  const idx = markVowelIndex(letters);
  if(idx<0) return letters;
  const ch = letters[idx];
  const base = BASE_OF[ch.toLowerCase()] || ch.toLowerCase();
  const marked = toneMarkChar(base, +tone);
  const isUpper = ch === ch.toUpperCase() && ch !== ch.toLowerCase();
  const out = isUpper ? marked.toUpperCase() : marked;
  return letters.slice(0,idx) + out + letters.slice(idx+1);
}

// ------------------------------------------------------------- syllable split
const SYLL_RE = /[a-zA-Zü]+[0-5]/g;
function syll(n){ return String(n).match(SYLL_RE) || []; }
function tones(n){ return syll(n).map(s=>s.slice(-1)).join("-"); }
function startsAOE(chunk){ return /^[aeoüAEOÜ]/.test(chunk); }

function markOne(chunk){ return markSyllable(chunk.slice(0,-1), chunk.slice(-1)); }

// numbered -> marked, with the a/o/e syllable-boundary apostrophe rule (Xi'an, nǚ'ér)
function mark(n){
  const chunks = syll(n);
  let out = "";
  chunks.forEach((c,i)=>{
    if(i>0 && startsAOE(c)) out += "'";
    out += markOne(c);
  });
  return out;
}

function escapeHtml(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

// Render-time guard: an `en` gloss should never contain a Chinese character (the
// data pipeline's sanitize_gloss in tools/build_vocab.py handles this at the
// source), but every render site that shows a word's meaning goes through this one
// function, so a future data regression can't leak a character past the "show
// characters" toggle the way a handful of un-sanitized glosses did before.
const CJK_TEST_RE = /[一-鿿㐀-䶿]/;
function gloss(entry){
  const en = String((entry && entry.en) || "");
  if(!CJK_TEST_RE.test(en)) return en;
  return en.replace(/[一-鿿㐀-䶿]+/g, "").replace(/\s+/g, " ").replace(/\(\s*\)/g, "").trim();
}

// tone-coloured pinyin renderer: each syllable in <span class="t1".."t5">
function pyHTML(n){
  const chunks = syll(n);
  let out = "";
  chunks.forEach((c,i)=>{
    const tone = +c.slice(-1) || 5;
    if(i>0 && startsAOE(c)) out += "'";
    out += `<span class="t${tone}">${escapeHtml(markOne(c))}</span>`;
  });
  return out;
}

// marked pinyin -> toneless (keeps apostrophes/case/ü, only strips tone diacritics)
function strip(py){
  let out = "";
  for(const ch of String(py)){
    const lower = ch.toLowerCase();
    if(BASE_OF[lower] !== undefined){
      const base = BASE_OF[lower];
      const isUpper = ch === ch.toUpperCase() && ch !== ch.toLowerCase();
      out += isUpper ? base.toUpperCase() : base;
    } else out += ch;
  }
  return out;
}

// ------------------------------------------------------- valid syllable table
// Standard Mandarin initial x final grid, spelled as actually written
// (zero-initial uses y/w forms; j/q/x drop the ü dots).
const INITIAL_FINALS = {
  "b": ["a","ai","an","ang","ao","o","ei","en","eng","i","ie","iao","ian","in","iang","ing","u"],
  "p": ["a","ai","an","ang","ao","o","ei","en","eng","ou","i","ie","iao","ian","in","iang","ing","u"],
  "m": ["a","ai","an","ang","ao","o","ei","en","eng","ou","i","ie","iao","iu","ian","in","iang","ing","u"],
  "f": ["a","an","ang","ei","en","eng","ou","u","o"],
  "d": ["a","ai","an","ang","ao","e","ei","en","eng","ong","i","ia","ie","iao","iu","ian","ing","ou","u","uo","ui","uan","un"],
  "t": ["a","ai","an","ang","ao","e","eng","ong","i","ian","iao","ie","ing","ou","u","uo","ui","uan","un"],
  "n": ["a","ai","an","ang","ao","e","ei","en","eng","i","ian","iang","iao","ie","in","ing","iu","ong","ou","u","uan","uo","ü","üe"],
  "l": ["a","ai","an","ang","ao","e","ei","eng","i","ia","ian","iang","iao","ie","in","ing","iu","ong","ou","u","uan","un","uo","ü","üe","o"],
  "g": ["a","ai","an","ang","ao","e","ei","en","eng","ong","ou","u","ua","uai","uan","uang","ui","un","uo"],
  "k": ["a","ai","an","ang","ao","e","ei","en","eng","ong","ou","u","ua","uai","uan","uang","ui","un","uo"],
  "h": ["a","ai","an","ang","ao","e","ei","en","eng","ong","ou","u","ua","uai","uan","uang","ui","un","uo"],
  "j": ["i","ia","ian","iang","iao","ie","in","ing","iong","iu","u","uan","ue","un"],
  "q": ["i","ia","ian","iang","iao","ie","in","ing","iong","iu","u","uan","ue","un"],
  "x": ["i","ia","ian","iang","iao","ie","in","ing","iong","iu","u","uan","ue","un"],
  "zh":["a","ai","an","ang","ao","e","ei","en","eng","i","ong","ou","u","ua","uai","uan","uang","ui","un","uo"],
  "ch":["a","ai","an","ang","ao","e","en","eng","i","ong","ou","u","ua","uai","uan","uang","ui","un","uo"],
  "sh":["a","ai","an","ang","ao","e","ei","en","eng","i","ou","u","ua","uai","uan","uang","ui","un","uo"],
  "r": ["an","ang","ao","e","en","eng","i","ong","ou","u","ua","uan","ui","un","uo"],
  "z": ["a","ai","an","ang","ao","e","ei","en","eng","i","ong","ou","u","uan","ui","un","uo"],
  "c": ["a","ai","an","ang","ao","e","en","eng","i","ong","ou","u","uan","ui","un","uo"],
  "s": ["a","ai","an","ang","ao","e","en","eng","i","ong","ou","u","uan","ui","un","uo"],
  "": ["a","o","e","ai","ei","ao","ou","an","en","ang","eng","er",
       "yi","ya","ye","yao","you","yan","yin","yang","ying","yong",
       "wu","wa","wo","wai","wei","wan","wen","wang","weng",
       "yu","yue","yuan","yun","yo"]
};
const INITIALS_BY_LEN = Object.keys(INITIAL_FINALS).filter(k=>k).sort((a,b)=>b.length-a.length);

const VALID_SYLLABLES = new Set();
Object.keys(INITIAL_FINALS).forEach(init=>{
  INITIAL_FINALS[init].forEach(fin=>VALID_SYLLABLES.add(init+fin));
});

function splitSyllable(toneless){
  const s = toneless.toLowerCase();
  for(const init of INITIALS_BY_LEN){
    if(s.indexOf(init)===0){
      const rest = s.slice(init.length);
      if(INITIAL_FINALS[init].indexOf(rest)>=0) return {initial:init, final:rest};
    }
  }
  if(INITIAL_FINALS[""].indexOf(s)>=0) return {initial:"", final:s};
  return null;
}

// ------------------------------------------------------------- type checking
function pipeline(s){
  return String(s).toLowerCase()
    .replace(/u:/g,"v")
    .replace(/ü/g,"v")
    .replace(/['\-\s]/g,"");
}

// all numbered forms a learner might legitimately type: the exact number
// string, plus neutral tone (digit "5") written as "0" or omitted per syllable.
function numberedCandidates(n){
  const chunks = syll(n);
  const perChunk = chunks.map(c=>{
    const letters = c.slice(0,-1), digit = c.slice(-1);
    return digit==="5" ? [letters+"5", letters+"0", letters] : [c];
  });
  let combos = [""];
  perChunk.forEach(opts=>{
    const next = [];
    combos.forEach(prefix=>opts.forEach(o=>next.push(prefix+o)));
    combos = next;
  });
  return combos.map(pipeline);
}

function normType(input){ return pipeline(input); }

function acceptTypeAnswer(input, entry){
  const target = new Set(numberedCandidates(entry.n));
  target.add(pipeline(entry.py));
  return target.has(normType(input));
}

// ------------------------------------------------------------- distractors
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

const INITIAL_PAIRS = [["b","p"],["d","t"],["g","k"],["j","q"],["zh","ch"],["z","c"],["zh","z"],["ch","c"],["sh","s"],["j","zh"],["q","ch"],["x","sh"],["n","l"],["r","l"],["f","h"]];
const FINAL_PAIRS = [["an","ang"],["en","eng"],["in","ing"],["ian","iang"],["uan","uang"],["ao","ou"],["ai","ei"],["e","o"]];

function confusablesFor(list, item){
  const out = [];
  list.forEach(p=>{ if(p[0]===item) out.push(p[1]); if(p[1]===item) out.push(p[0]); });
  return out;
}

// entry: {n,...}; pool: VOCAB array (for the same-syllable-count fallback).
function distractors(entry, pool){
  const chunks = syll(entry.n);
  const results = [];
  const seen = new Set([pipeline(entry.n)]);

  function tryAdd(candChunks){
    if(results.length>=3) return;
    const candN = candChunks.join("");
    const key = pipeline(candN);
    if(seen.has(key)) return;
    const ok = candChunks.every(c=>{
      const letters = c.slice(0,-1).toLowerCase();
      // A chunk whose letters are exactly "r" (e.g. the last syllable of yi4hui4r5,
      // 一会儿) is the retroflex erhua suffix on the preceding syllable, not a
      // standalone syllable — it will never appear in VALID_SYLLABLES, so it's
      // exempted from that check here rather than always sitting at the end.
      return letters==="r" || VALID_SYLLABLES.has(letters);
    });
    if(!ok) return;
    seen.add(key);
    results.push({n:candN, py:mark(candN)});
  }

  // 1. same syllables, one tone changed
  for(let i=0;i<chunks.length && results.length<3;i++){
    const letters = chunks[i].slice(0,-1), origTone = chunks[i].slice(-1);
    // neutral tone (5) never occurs on the first syllable of a word in real Mandarin,
    // so it's a trivially-eliminable distractor there — exclude it.
    const toneChoices = ["1","2","3","4","5"].filter(t=>t!==origTone && !(i===0 && t==="5"));
    shuffle(toneChoices).forEach(t=>{
      if(results.length<3) tryAdd(chunks.map((c,j)=>j===i?letters+t:c));
    });
  }
  // 2. confusable initial swap
  for(let i=0;i<chunks.length && results.length<3;i++){
    const letters = chunks[i].slice(0,-1), tone = chunks[i].slice(-1);
    const sp = splitSyllable(letters);
    if(!sp || !sp.initial) continue;
    shuffle(confusablesFor(INITIAL_PAIRS, sp.initial)).forEach(alt=>{
      if(results.length>=3) return;
      if(INITIAL_FINALS[alt] && INITIAL_FINALS[alt].indexOf(sp.final)>=0){
        tryAdd(chunks.map((c,j)=>j===i?(alt+sp.final+tone):c));
      }
    });
  }
  // 3. confusable final swap
  for(let i=0;i<chunks.length && results.length<3;i++){
    const letters = chunks[i].slice(0,-1), tone = chunks[i].slice(-1);
    const sp = splitSyllable(letters);
    if(!sp) continue;
    const alts = confusablesFor(FINAL_PAIRS, sp.final);
    if(sp.final==="u" && (sp.initial==="n"||sp.initial==="l")) alts.push("ü");
    if(sp.final==="ü" && (sp.initial==="n"||sp.initial==="l")) alts.push("u");
    shuffle(alts).forEach(alt=>{
      if(results.length>=3) return;
      if(INITIAL_FINALS[sp.initial] && INITIAL_FINALS[sp.initial].indexOf(alt)>=0){
        tryAdd(chunks.map((c,j)=>j===i?(sp.initial+alt+tone):c));
      }
    });
  }
  // 4. another vocab word, same syllable count
  if(results.length<3 && pool && pool.length){
    shuffle(pool.filter(v=>v.n!==entry.n && syll(v.n).length===chunks.length)).forEach(v=>{
      if(results.length<3) tryAdd(syll(v.n));
    });
  }
  return results.slice(0,3);
}

// ------------------------------------------------- meaning-centred distractors
// first two whitespace-separated words of a gloss, lowercased and stripped of
// punctuation — used to reject near-synonym distractors (two "to eat"-ish glosses).
function firstTwoWords(en){
  return String(en).toLowerCase().replace(/[^a-z\s]/g,"").trim().split(/\s+/).slice(0,2).join(" ");
}

// entry: {en,lv,w,...}; pool: VOCAB array. Returns up to 3 other VOCAB entries whose
// gloss is a plausible wrong answer: never the same gloss, never sharing the first two
// gloss words with the answer or with each other, same level preferred over other levels.
function meaningOpts(entry, pool){
  const ansKey = String(entry.en).trim().toLowerCase();
  const ansFirst2 = firstTwoWords(entry.en);
  const candidates = (pool||[]).filter(v=>v.w!==entry.w && String(v.en).trim().toLowerCase()!==ansKey);
  const bySame = shuffle(candidates.filter(v=>v.lv===entry.lv));
  const byOther = shuffle(candidates.filter(v=>v.lv!==entry.lv));
  const ordered = [...bySame, ...byOther];

  function pass(strict){
    const chosen = []; const usedFirst2 = new Set([ansFirst2]);
    ordered.forEach(v=>{
      if(chosen.length>=3) return;
      const f2 = firstTwoWords(v.en);
      if(strict && usedFirst2.has(f2)) return;
      chosen.push(v); usedFirst2.add(f2);
    });
    return chosen;
  }
  let chosen = pass(true);
  if(chosen.length<3) chosen = pass(false); // small-pool fallback: keep "not the answer" only
  return chosen.slice(0,3);
}

// entry: {n,lv,...}; pool: VOCAB array. Returns up to 3 other VOCAB entries with the
// same syllable count as entry, same level preferred. Not phonetic near-misses (that
// generator is `distractors()` above, kept only for the Extras tone/type items) —
// meaning-recall distractors should be plausible words, not confusable spellings.
function pinyinOpts(entry, pool){
  const n = syll(entry.n).length;
  const ansKey = String(entry.en).trim().toLowerCase();
  const seen = new Set([pipeline(entry.n)]);
  const rank = v => Math.abs(syll(v.n).length - n);
  // Exclude gloss-twins (e.g. 经历/经验, both "experience; to experience") — with the
  // meaning shown and two pinyin options for words that mean the same thing, either
  // would be a "correct" answer, so the item would be ambiguous rather than hard.
  const candidates = (pool||[]).filter(v=>pipeline(v.n)!==pipeline(entry.n) && String(v.en).trim().toLowerCase()!==ansKey);
  const exact = candidates.filter(v=>rank(v)===0);
  const bySame = shuffle(exact.filter(v=>v.lv===entry.lv));
  const byOther = shuffle(exact.filter(v=>v.lv!==entry.lv));
  const chosen = [];
  function addFrom(list){
    list.forEach(v=>{
      if(chosen.length>=3) return;
      const key = pipeline(v.n);
      if(seen.has(key)) return;
      seen.add(key); chosen.push(v);
    });
  }
  addFrom(bySame); addFrom(byOther);
  if(chosen.length<3){
    // Extremely rare (a syllable count with fewer than 3 other words in the whole
    // corpus — e.g. "公共汽车" is the only 4-syllable HSK 1-4 word) — widen to the
    // closest syllable counts rather than leaving the drill item short of 4 options.
    const rest = shuffle(candidates.filter(v=>rank(v)>0)).sort((a,b)=>rank(a)-rank(b));
    addFrom(rest);
  }
  return chosen.slice(0,3);
}

// --------------------------------------------------------------- placement
// Splits a vocab pool into placement buckets: bucketSpec = [[level, bucketCount], ...].
// Default matches the spec: HSK1x3, HSK2x3, HSK3x4, HSK4x6 (16 buckets).
function strata(pool, bucketSpec){
  const spec = bucketSpec || [[1,3],[2,3],[3,4],[4,6]];
  const out = [];
  spec.forEach(([lv,nb])=>{
    const list = pool.filter(v=>v.lv===lv);
    const nsets = Math.ceil(list.length/10);
    const per = nsets/nb;
    for(let b=0;b<nb;b++){
      const s0 = Math.floor(b*per), s1 = Math.max(s0+1, Math.floor((b+1)*per));
      out.push({lv, s0, s1, words: list.slice(s0*10, s1*10)});
    }
  });
  return out;
}

// Decides where placement stops, given per-bucket results res=[{r,n},...] in bucket order.
// A single bucket's raw accuracy is noisy at 2-3 items (1 miss = 50-67%), so passing is
// judged on a rolling window of up to 3 buckets (the current one plus its two predecessors):
// bucket i passes if that window's combined accuracy is >=75% AND bucket i itself has
// at least 1 right answer (so an all-wrong bucket can never pass on a good window alone).
// Returns the index of the first failing bucket, or null if every bucket passed.
function placementStopIndex(res){
  for(let i=0;i<res.length;i++){
    const lo = Math.max(0, i-2);
    let wr = 0, wn = 0;
    for(let j=lo;j<=i;j++){ wr += res[j].r; wn += res[j].n; }
    const windowAcc = wn ? wr/wn : 1;
    const bucketOk = res[i].r >= 1;
    if(!(windowAcc >= 0.75 && bucketOk)) return i;
  }
  return null;
}

// Validates the shape of imported progress JSON before it replaces the live prog object.
// Returns {ok:true, data} or {ok:false, reason}.
function validateProgShape(data){
  if(!data || typeof data !== "object" || Array.isArray(data)) return {ok:false, reason:"not a JSON object"};
  if(data.v !== undefined && data.v !== 1 && data.v !== 2) return {ok:false, reason:`unknown progress version ${data.v}`};
  if(data.w !== undefined){
    if(!data.w || typeof data.w !== "object" || Array.isArray(data.w)) return {ok:false, reason:"w must be an object"};
    for(const k of Object.keys(data.w)){
      const p = data.w[k];
      if(!p || typeof p !== "object" || Array.isArray(p)) return {ok:false, reason:`w.${k} must be an object`};
      for(const f of ["r","w","s"]) if(p[f] !== undefined && typeof p[f] !== "number") return {ok:false, reason:`w.${k}.${f} must be a number`};
      if(p.prov !== undefined && typeof p.prov !== "number" && typeof p.prov !== "boolean") return {ok:false, reason:`w.${k}.prov must be a number or boolean`};
      if(p.d !== undefined && typeof p.d !== "number" && typeof p.d !== "boolean") return {ok:false, reason:`w.${k}.d must be a number or boolean`};
    }
  }
  if(data.sets !== undefined){
    if(!data.sets || typeof data.sets !== "object" || Array.isArray(data.sets)) return {ok:false, reason:"sets must be an object"};
    for(const k of Object.keys(data.sets)){
      if(!["1","2","3","4"].includes(k)) return {ok:false, reason:`sets has unknown level "${k}"`};
      if(typeof data.sets[k] !== "number") return {ok:false, reason:`sets.${k} must be a number`};
    }
  }
  if(data.lessons !== undefined && (!data.lessons || typeof data.lessons !== "object" || Array.isArray(data.lessons))) return {ok:false, reason:"lessons must be an object"};
  if(data.sessions !== undefined && typeof data.sessions !== "number") return {ok:false, reason:"sessions must be a number"};
  if(data.showChars !== undefined && typeof data.showChars !== "boolean") return {ok:false, reason:"showChars must be a boolean"};
  if(data.dismissedSoundsHint !== undefined && typeof data.dismissedSoundsHint !== "boolean" && typeof data.dismissedSoundsHint !== "number") return {ok:false, reason:"dismissedSoundsHint must be a boolean or number"};
  return {ok:true, data};
}

// Merges any validated progress data (v1 or v2 shaped) onto full v2 defaults and forces
// v:2, so a v1 export (or a v1 localStorage record at boot) migrates to a well-formed v2
// progress object. Word/set/lesson data is unchanged between versions — only `v` and the
// new `showChars` field (default false) differ. Shared by the app's import handler and
// its boot-time migration so there is exactly one place that knows the v1->v2 shape.
function migrateProg(data){
  const base = { v:2, w:{}, sets:{1:0,2:0,3:0,4:0}, lessons:{}, sessions:0, theme:null, showChars:false };
  const merged = Object.assign({}, base, data||{}, {v:2});
  if(merged.showChars === undefined) merged.showChars = false;
  return merged;
}

// ------------------------------------------------------------------- export
const API = { syll, mark, tones, strip, pyHTML, normType, acceptTypeAnswer, distractors, strata,
  placementStopIndex, validateProgShape, migrateProg, meaningOpts, pinyinOpts, firstTwoWords, gloss, escapeHtml,
  VALID_SYLLABLES, INITIAL_FINALS, splitSyllable, pipeline, numberedCandidates, markSyllable };
if(typeof module!=="undefined" && module.exports) module.exports = API;
if(root) root.PinyinCore = API;
})(typeof window!=="undefined" ? window : (typeof globalThis!=="undefined" ? globalThis : null));
