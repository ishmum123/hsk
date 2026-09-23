// Node checks for src/pinyin_core.js against real (or stub) data.
// Run: /opt/homebrew/bin/node tests/pinyin_checks.js
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PC = require(path.join(ROOT, "src", "pinyin_core.js"));

function loadConst(file, name){
  const src = fs.readFileSync(file, "utf8");
  return new Function(src + `\nreturn ${name};`)();
}

let vocabFile = path.join(ROOT, "data", "hsk_vocab.js");
let lessonsFile = path.join(ROOT, "data", "pinyin_lessons.js");
const usingStubLessons = !fs.existsSync(lessonsFile);
if(usingStubLessons) lessonsFile = path.join(__dirname, "..", "..", "hsk", "STUB_MISSING");

const VOCAB = loadConst(vocabFile, "VOCAB");
console.log(`Loaded VOCAB: ${VOCAB.length} words from ${path.relative(ROOT, vocabFile)}`);

let LESSONS = null;
if(fs.existsSync(lessonsFile)){
  LESSONS = loadConst(lessonsFile, "LESSONS");
  console.log(`Loaded LESSONS: ${LESSONS.length} lessons from ${path.relative(ROOT, lessonsFile)}`);
} else {
  console.log("LESSONS file not found in data/ — skipping lesson-shape checks (using stub in app dev only).");
}

const sentencesFile = path.join(ROOT, "data", "hsk_sentences.js");
let SENTENCES = null, SENTENCE_EXTRA = null;
if(fs.existsSync(sentencesFile)){
  SENTENCES = loadConst(sentencesFile, "SENTENCES");
  SENTENCE_EXTRA = loadConst(sentencesFile, "SENTENCE_EXTRA");
  console.log(`Loaded SENTENCES: ${SENTENCES.length} sentences, ${Object.keys(SENTENCE_EXTRA).length} EXTRA compounds from ${path.relative(ROOT, sentencesFile)}`);
} else {
  console.log("SENTENCES file not found in data/ — skipping Phase 2 sentence checks.");
}

let fails = 0;
function check(name, cond){
  if(cond){ console.log(`PASS  ${name}`); }
  else { console.log(`FAIL  ${name}`); fails++; }
}

// ---------------------------------------------------------------- check 0
(function(){
  // Stale-build guard: every other check here runs against the real data/core
  // files directly, never against the shipped hsk_pinyin.html/index.html bundle
  // -- so a suite pass has previously coexisted with a stale bundle (an edit made
  // without a `sh build.sh` afterward). Rebuild to a scratch location via the
  // real build.sh (its OUT/INDEX are env-overridable for exactly this) and diff
  // byte-for-byte against what's actually shipped, so a stale bundle can never
  // pass the suite even if every other check does.
  const cp = require("child_process");
  const os = require("os");
  const tmpOut = path.join(os.tmpdir(), `hsk_pinyin_stalecheck_${process.pid}.html`);
  const tmpIndex = path.join(os.tmpdir(), `hsk_pinyin_stalecheck_index_${process.pid}.html`);
  try{
    cp.execSync("sh build.sh", { cwd: ROOT, env: Object.assign({}, process.env, { OUT: tmpOut, INDEX: tmpIndex }), stdio: "pipe" });
    const built = fs.readFileSync(tmpOut, "utf8");
    const shippedMainPath = path.join(ROOT, "hsk_pinyin.html");
    const shippedIndexPath = path.join(ROOT, "index.html");
    const shippedMain = fs.existsSync(shippedMainPath) ? fs.readFileSync(shippedMainPath, "utf8") : null;
    const shippedIndex = fs.existsSync(shippedIndexPath) ? fs.readFileSync(shippedIndexPath, "utf8") : null;
    console.log(`\n[0] stale-build guard: fresh build ${built.length} bytes; shipped hsk_pinyin.html ${shippedMain===null?"MISSING":shippedMain.length+" bytes"}, index.html ${shippedIndex===null?"MISSING":shippedIndex.length+" bytes"}`);
    check("hsk_pinyin.html matches a fresh build.sh output (not stale)", built === shippedMain);
    check("index.html matches a fresh build.sh output (not stale)", built === shippedIndex);
  } catch(e){
    console.log(`\n[0] stale-build guard: build.sh failed to run: ${e.message}`);
    check("build.sh runs cleanly for the stale-build guard", false);
  } finally {
    try{ fs.unlinkSync(tmpOut); }catch(e){}
    try{ fs.unlinkSync(tmpIndex); }catch(e){}
  }
})();

// ---------------------------------------------------------------- check 1
(function(){
  let mismatches = [];
  VOCAB.forEach(v=>{
    const got = PC.mark(v.n);
    if(got !== v.py) mismatches.push({w:v.w, n:v.n, py:v.py, got});
  });
  console.log(`\n[1] mark(n) round-trip: ${mismatches.length} / ${VOCAB.length} mismatches`);
  mismatches.slice(0,10).forEach(m=>console.log(`     ${m.w}  n=${m.n}  expected py=${m.py}  got=${m.got}`));
  check("mark() round-trips every VOCAB entry exactly (0 mismatches)", mismatches.length === 0);
})();

// ---------------------------------------------------------------- check 2
(function(){
  const N = 200;
  const sample = [];
  for(let i=0;i<N;i++) sample.push(VOCAB[Math.floor(Math.random()*VOCAB.length)]);
  let bad = 0; const badExamples = [];
  sample.forEach(entry=>{
    const ds = PC.distractors(entry, VOCAB);
    const chunks = PC.syll(entry.n);
    // A chunk whose letters are exactly "r" is the erhua suffix (e.g. 一会儿,
    // yi4hui4r5) — distractors() exempts it from the VALID_SYLLABLES check for the
    // same reason (see its comment), so this validity check must too, or it flakes
    // on every erhua word that gets sampled.
    const ok = ds.length===3 &&
      new Set(ds.map(d=>d.n)).size===3 &&
      ds.every(d=>d.n!==entry.n) &&
      ds.every(d=>PC.syll(d.n).length===chunks.length) &&
      ds.every(d=>PC.syll(d.n).every(c=>{
        const letters = c.slice(0,-1).toLowerCase();
        return letters==="r" || PC.VALID_SYLLABLES.has(letters);
      }));
    if(!ok){ bad++; if(badExamples.length<10) badExamples.push({entry:entry.n, ds}); }
  });
  console.log(`\n[2] distractor generation over ${N} random words: ${N-bad} clean, ${bad} bad`);
  badExamples.forEach(b=>console.log("    ", JSON.stringify(b)));
  check("distractors valid for every sampled word (0 bad)", bad === 0);
})();

// ---------------------------------------------------------------- check 3
(function(){
  const nuer = VOCAB.find(v=>v.w==="女儿");   // n: nü3er2
  const lv = VOCAB.find(v=>v.w==="绿");        // n: lü4
  const xuesheng = VOCAB.find(v=>v.w==="学生"); // n: xue2sheng5
  console.log("\n[3] normType acceptance", {nuer, lv, xuesheng});

  const cases = [];
  if(xuesheng){
    cases.push(["xue2sheng5", xuesheng, true]);
    cases.push(["xue2sheng", xuesheng, true]);
    cases.push(["xuésheng", xuesheng, true]);
    cases.push(["XUE2 SHENG", xuesheng, true]);
    cases.push(["xue2sheng2", xuesheng, false]);
  }
  if(nuer){
    cases.push(["nv3er2", nuer, true]);
    cases.push(["nǚ'ér", nuer, true]);
  }
  if(lv){
    cases.push(["lü4", lv, true]);
    cases.push(["lv4", lv, true]);
    cases.push(["lu4", lv, false]);
    cases.push(["lv2", lv, false]);
  }
  let ok = true;
  cases.forEach(([input, entry, expect])=>{
    const got = PC.acceptTypeAnswer(input, entry);
    const pass = got === expect;
    if(!pass) ok = false;
    console.log(`    ${pass?"ok ":"BAD"} acceptTypeAnswer(${JSON.stringify(input)}, ${entry.w}) = ${got} (expected ${expect})`);
  });
  check("normType/acceptTypeAnswer variants", ok && cases.length>0);
})();

// ---------------------------------------------------------------- check 4
(function(){
  // Placement strata: L1x3 L2x3 L3x4 L4x6 buckets = 16 buckets, 40 vocab items total.
  // v2 dropped the foundations block from placement (meaning, not sounds, decides
  // where a learner starts), so this checks the vocab bucket math only — the "8
  // foundation items" framing is gone from the app, not from PC.strata()'s shape.
  // Uses the app's real PC.strata() (shared with src/pinyin_app.html) rather than a re-derived copy.
  const st = PC.strata(VOCAB); // default bucketSpec: [[1,3],[2,3],[3,4],[4,6]]
  const nBuckets = st.length;
  // app assigns 2 items to even-index buckets, 3 to odd-index buckets: 8*2 + 8*3 = 40
  const bucketItemCounts = st.map((b,i)=> i%2===0 ? 2 : 3);
  const totalVocabItems = bucketItemCounts.reduce((s,n)=>s+n,0);
  console.log(`\n[4] Placement strata: ${nBuckets} vocab buckets, ${totalVocabItems} items total`);
  console.log("    bucket sizes (words available per bucket):", st.map(b=>b.words.length).join(","));
  check("16 vocab buckets totalling 40 items", nBuckets===16 && totalVocabItems===40);
  check("every vocab bucket has enough words for its item count", st.every((b,i)=>b.words.length >= bucketItemCounts[i]));
})();

// ---------------------------------------------------------------- check 5
(function(){
  // Erhua regression: a trailing bare "r" syllable (e.g. 一会儿, yi4hui4r5) must not
  // fall through to the rule-4 "different word" fallback just because "r" alone isn't
  // in VALID_SYLLABLES — it should still get real tone-swap distractors.
  const yihuir = VOCAB.find(v=>v.w==="一会儿");
  console.log(`\n[5] Erhua distractors (一会儿):`, yihuir);
  if(!yihuir){
    check("一会儿 present in VOCAB for the erhua regression check", false);
  } else {
    const ds = PC.distractors(yihuir, VOCAB);
    const origChunks = PC.syll(yihuir.n);
    const allToneVariants = ds.every(d=>{
      const dChunks = PC.syll(d.n);
      if(dChunks.length !== origChunks.length) return false;
      let toneDiffs = 0;
      for(let i=0;i<dChunks.length;i++){
        if(dChunks[i].slice(0,-1) !== origChunks[i].slice(0,-1)) return false; // letters must match exactly
        if(dChunks[i].slice(-1) !== origChunks[i].slice(-1)) toneDiffs++;
      }
      return toneDiffs === 1;
    });
    console.log("    distractors:", ds.map(d=>d.n));
    check("一会儿 gets 3 same-syllable-count tone-swap distractors (not rule-4 fallback)", ds.length===3 && allToneVariants);
  }
})();

// ---------------------------------------------------------------- check 6
(function(){
  // No distractor may offer tone 5 (neutral) on a word's first syllable, since no real
  // Mandarin word starts on a neutral tone. Checked across the FULL corpus (not a sample).
  let violations = 0; const examples = [];
  VOCAB.forEach(entry=>{
    const ds = PC.distractors(entry, VOCAB);
    const origFirstTone = PC.syll(entry.n)[0].slice(-1);
    if(origFirstTone === "5") return; // only relevant when the original wasn't already neutral
    ds.forEach(d=>{
      const dChunks = PC.syll(d.n);
      if(dChunks.length && dChunks[0].slice(-1)==="5"){ violations++; if(examples.length<10) examples.push({entry:entry.n, distractor:d.n}); }
    });
  });
  console.log(`\n[6] Tone-5-on-first-syllable distractors across full corpus: ${violations} violations`);
  examples.forEach(e=>console.log("    ", JSON.stringify(e)));
  check("no distractor puts a neutral tone on a word's first syllable (full corpus)", violations === 0);
})();

// ---------------------------------------------------------------- check 7
(function(){
  const badShapes = [{w:null}, {sets:null}, {lessons:null}, [1,2]];
  console.log("\n[7] validateProgShape");
  let allBadRejected = true;
  badShapes.forEach(shape=>{
    const v = PC.validateProgShape(shape);
    const rejected = v.ok === false;
    if(!rejected) allBadRejected = false;
    console.log(`    ${rejected?"ok ":"BAD"} rejects ${JSON.stringify(shape)} -> ${JSON.stringify(v)}`);
  });
  check("validateProgShape rejects null-valued w/sets/lessons and a bare array", allBadRejected);

  const goodShape = { v:1, w:{"学生":{r:2,w:1,s:1,prov:1}}, sets:{"1":3,"2":0,"3":0,"4":0}, lessons:{"tones":1}, sessions:4 };
  const goodResult = PC.validateProgShape(goodShape);
  console.log(`    ${goodResult.ok?"ok ":"BAD"} accepts a real export shape -> ${JSON.stringify(goodResult)}`);
  check("validateProgShape accepts a real export shape", goodResult.ok === true);
})();

// ---------------------------------------------------------------- check 8
(function(){
  console.log("\n[8] placementStopIndex (rolling-window placement pass rule)");
  const allRight = Array.from({length:6}, ()=>({r:3,n:3}));
  check("all buckets correct -> null (everything passes)", PC.placementStopIndex(allRight) === null);

  const bucket3Zero = [{r:3,n:3},{r:3,n:3},{r:3,n:3},{r:0,n:3},{r:3,n:3},{r:3,n:3}];
  check("bucket 3 entirely wrong -> stops at index 3", PC.placementStopIndex(bucket3Zero) === 3);

  // Bucket 0 has 4 items (bigger than the usual 2-3) with a single miss: 3/4 = 75%,
  // right at the rolling-window threshold, and the bucket still has >=1 right — passes.
  const singleMissBucket0 = [{r:3,n:4}, {r:3,n:3}, {r:3,n:3}, {r:3,n:3}];
  check("a single miss in a big-enough bucket 0 still passes", PC.placementStopIndex(singleMissBucket0) === null);
})();

// ---------------------------------------------------------------- check 9
(function(){
  // meaningOpts: the v2 meaning-distractor picker used by hear/read items. Over 200
  // random words: exactly 3 options, all real VOCAB entries, none equal to the answer's
  // gloss, none sharing the first two gloss words with the answer or each other.
  const N = 200;
  const sample = [];
  for(let i=0;i<N;i++) sample.push(VOCAB[Math.floor(Math.random()*VOCAB.length)]);
  let bad = 0; const badExamples = [];
  let sameLevelCount = 0, totalOpts = 0;
  sample.forEach(entry=>{
    const ds = PC.meaningOpts(entry, VOCAB);
    const ansKey = String(entry.en).trim().toLowerCase();
    const ansFirst2 = PC.firstTwoWords(entry.en);
    const first2s = ds.map(d=>PC.firstTwoWords(d.en));
    const ok = ds.length===3 &&
      ds.every(d=>VOCAB.includes(d)) &&
      ds.every(d=>String(d.en).trim().toLowerCase()!==ansKey) &&
      first2s.every(f2=>f2!==ansFirst2) &&
      new Set(first2s).size===first2s.length;
    if(!ok){ bad++; if(badExamples.length<10) badExamples.push({entry:entry.en, ds:ds.map(d=>d.en)}); }
    ds.forEach(d=>{ totalOpts++; if(d.lv===entry.lv) sameLevelCount++; });
  });
  console.log(`\n[9] meaningOpts over ${N} random words: ${N-bad} clean, ${bad} bad`);
  console.log(`    same-level ratio: ${totalOpts ? (sameLevelCount/totalOpts).toFixed(2) : "n/a"} (${sameLevelCount}/${totalOpts})`);
  badExamples.forEach(b=>console.log("    ", JSON.stringify(b)));
  check("meaningOpts valid for every sampled word (0 bad)", bad === 0);
})();

// --------------------------------------------------------------- check 10
(function(){
  // pinyinOpts: the v2 pinyin-distractor picker used by recall items. Over 200 random
  // words: exactly 3 options, all real VOCAB entries, same syllable count, never the
  // answer, never a gloss-twin of the answer (e.g. 经历/经验, both "experience; to
  // experience" — with the meaning shown, a gloss-twin's pinyin would be an equally
  // "correct" answer), and reports the same-level ratio.
  const N = 200;
  const sample = [];
  for(let i=0;i<N;i++) sample.push(VOCAB[Math.floor(Math.random()*VOCAB.length)]);
  let bad = 0; const badExamples = [];
  let sameLevelCount = 0, totalOpts = 0;
  sample.forEach(entry=>{
    const ds = PC.pinyinOpts(entry, VOCAB);
    const n = PC.syll(entry.n).length;
    const ansKey = String(entry.en).trim().toLowerCase();
    // The whole corpus has only 1 four-syllable word, so pinyinOpts widens to the
    // closest syllable count when the exact-count pool is too small (see its comment) —
    // only require an exact match when the corpus actually has 3+ other same-count,
    // non-gloss-twin words.
    const exactPoolSize = VOCAB.filter(v=>v.n!==entry.n && PC.syll(v.n).length===n && String(v.en).trim().toLowerCase()!==ansKey).length;
    const ok = ds.length===3 &&
      ds.every(d=>VOCAB.includes(d)) &&
      ds.every(d=>d.n!==entry.n) &&
      ds.every(d=>String(d.en).trim().toLowerCase()!==ansKey) &&
      (exactPoolSize<3 || ds.every(d=>PC.syll(d.n).length===n)) &&
      new Set(ds.map(d=>d.n)).size===3;
    if(!ok){ bad++; if(badExamples.length<10) badExamples.push({entry:entry.n, ds:ds.map(d=>d.n)}); }
    ds.forEach(d=>{ totalOpts++; if(d.lv===entry.lv) sameLevelCount++; });
  });
  console.log(`\n[10] pinyinOpts over ${N} random words: ${N-bad} clean, ${bad} bad`);
  console.log(`    same-level ratio: ${totalOpts ? (sameLevelCount/totalOpts).toFixed(2) : "n/a"} (${sameLevelCount}/${totalOpts})`);
  badExamples.forEach(b=>console.log("    ", JSON.stringify(b)));
  check("pinyinOpts valid for every sampled word (0 bad)", bad === 0);
})();

// --------------------------------------------------------------- check 11
(function(){
  console.log("\n[11] v1 -> v2 progress migration");
  const v1Export = { v:1, w:{"学生":{r:2,w:1,s:1,prov:1}}, sets:{"1":3,"2":0,"3":0,"4":0}, lessons:{"tones":1}, sessions:4, theme:"dark" };
  const v = PC.validateProgShape(v1Export);
  console.log(`    ${v.ok?"ok ":"BAD"} validateProgShape accepts a v1-shaped export -> ${JSON.stringify(v)}`);
  check("validateProgShape accepts a v1-shaped export", v.ok === true);

  // PC.migrateProg is the one function both the app's import handler and its boot-time
  // migration call — test it directly rather than re-deriving its merge here.
  const migrated = PC.migrateProg(v.data);
  console.log(`    migrateProg(v1 data) -> ${JSON.stringify(migrated)}`);
  check("migrateProg gives a v1 export v:2", migrated.v === 2);
  check("migrateProg defaults showChars to false", migrated.showChars === false);
  check("migrateProg keeps word/set/lesson data", migrated.w["学生"].s===1 && migrated.sets["1"]===3 && migrated.lessons.tones===1);

  const v2Export = Object.assign({}, v1Export, {v:2, showChars:true});
  const v2 = PC.validateProgShape(v2Export);
  console.log(`    ${v2.ok?"ok ":"BAD"} validateProgShape accepts a v2-shaped export -> ${JSON.stringify(v2)}`);
  check("validateProgShape accepts a v2-shaped export with showChars", v2.ok === true);

  const migratedV2 = PC.migrateProg(v2.data);
  check("migrateProg leaves an already-v2 export's showChars alone", migratedV2.showChars === true);

  check("migrateProg on a bare {} gives well-formed v2 defaults",
    migrateEmptyIsWellFormed(PC.migrateProg({})));
  function migrateEmptyIsWellFormed(m){
    return m.v===2 && m.showChars===false && typeof m.w==="object" &&
      typeof m.sets==="object" && typeof m.lessons==="object" && typeof m.sessions==="number";
  }
})();

// --------------------------------------------------------------- check 12
(function(){
  // Data category guard: an `en` gloss must never embed a raw Chinese character (10
  // real words did, e.g. 你's "you (informal, as opposed to courteous 您)", leaking
  // characters past the "show characters" toggle since the app only ever gated `w`),
  // and sanitizing that away must never leave a dangling cross-reference lead-in
  // (呀's "particle equivalent to after a vowel…" before the mid-clause excision fix).
  // tools/build_vocab.py's sanitize_gloss fixes both at the source; this checks the
  // shipped data directly, and PC.gloss() is the render-time guard checked alongside it.
  const leaked = VOCAB.filter(v => /[一-鿿]/.test(v.en));
  console.log(`\n[12a] VOCAB en fields containing a Chinese character: ${leaked.length} (should be 0)`);
  leaked.slice(0,10).forEach(v=>console.log(`    ${v.w}\t${JSON.stringify(v.en)}`));
  check("no VOCAB en contains a Chinese character", leaked.length === 0);

  // A lead-in word (equivalent/opposite/abbr/written/"same as"/variant) immediately
  // before a clause boundary means sanitize_gloss stripped the Chinese word it
  // pointed to but left the lead-in dangling. Two real glosses are legitimate,
  // CJK-free hits on this heuristic -- "opposite" IS the actual English meaning,
  // not a leftover cross-reference lead-in -- and are excluded by an explicit
  // allowlist (hand-verified to contain no Chinese character, see the Deviations doc).
  const DANGLING_LEADIN_RE = /(?:equivalent|opposite|abbr|written|same as|variant)\s*(?:to|of|for|:)?\s*(?:[,;)]|$)/i;
  const DANGLING_ALLOWLIST = new Set(["对面", "相反"]);
  const dangling = VOCAB.filter(v => DANGLING_LEADIN_RE.test(v.en) && !DANGLING_ALLOWLIST.has(v.w));
  console.log(`\n[12b] VOCAB en fields with a dangling cross-reference lead-in: ${dangling.length} (should be 0; ${DANGLING_ALLOWLIST.size} allowlisted)`);
  dangling.slice(0,10).forEach(v=>console.log(`    ${v.w}\t${JSON.stringify(v.en)}`));
  check("no VOCAB en has a dangling cross-reference lead-in (outside the allowlist)", dangling.length === 0);

  const withCjk = { en: "you (informal, as opposed to courteous 您)" };
  const cleaned = PC.gloss(withCjk);
  console.log(`    PC.gloss() guard: ${JSON.stringify(withCjk.en)} -> ${JSON.stringify(cleaned)}`);
  check("PC.gloss() strips a Chinese character from en", !/[一-鿿]/.test(cleaned) && cleaned.length > 0);
  check("PC.gloss() is a no-op on an already-clean en", PC.gloss({en:"you (informal)"}) === "you (informal)");
})();

if(SENTENCES){
  const VOCAB_BY_W = {}; VOCAB.forEach(v=>{ VOCAB_BY_W[v.w] = v; });

  // --------------------------------------------------------------- check 13
  (function(){
    // Every word in every sentence's `words` must resolve: either directly to a
    // VOCAB entry, or to a SENTENCE_EXTRA compound whose `base` is itself a VOCAB
    // entry (data/hsk_sentences.js's own contract; tools/check_sentences.py already
    // enforces this at data-generation time -- this re-checks the shipped data the
    // app actually loads, the same "trust but verify" as VOCAB's other checks).
    let bad = 0; const badExamples = [];
    SENTENCES.forEach(s=>{
      (s.words||[]).forEach(w=>{
        const direct = VOCAB_BY_W[w];
        const extra = SENTENCE_EXTRA[w];
        const ok = !!direct || (!!extra && !!VOCAB_BY_W[extra.base]);
        if(!ok){ bad++; if(badExamples.length<10) badExamples.push({zh:s.zh, word:w}); }
      });
    });
    console.log(`\n[13] every sentence word resolves (VOCAB or EXTRA-with-VOCAB-base): ${bad} unresolved (should be 0)`);
    badExamples.forEach(b=>console.log("    ", JSON.stringify(b)));
    check("every SENTENCES word token resolves to VOCAB or a valid EXTRA compound", bad === 0);
  })();

  // --------------------------------------------------------------- check 14
  (function(){
    // sentenceOpts: the hear/read sentence meaning-distractor picker. Full corpus
    // (882 sentences, not a sample -- cheap enough): exactly 3 options, all real
    // SENTENCES entries, none equal to the answer's English gloss.
    let bad = 0; const badExamples = [];
    let sameLevelCount = 0, sharedWordCount = 0, totalOpts = 0;
    SENTENCES.forEach(sentence=>{
      const ds = PC.sentenceOpts(sentence, SENTENCES);
      const ansKey = String(sentence.en).trim().toLowerCase();
      const wordSet = new Set(sentence.words||[]);
      const ok = ds.length===3 &&
        ds.every(d=>SENTENCES.includes(d)) &&
        ds.every(d=>d.zh!==sentence.zh) &&
        ds.every(d=>String(d.en).trim().toLowerCase()!==ansKey) &&
        new Set(ds.map(d=>d.zh)).size===3;
      if(!ok){ bad++; if(badExamples.length<10) badExamples.push({zh:sentence.zh, ds:ds.map(d=>d.en)}); }
      ds.forEach(d=>{
        totalOpts++;
        if(d.lv===sentence.lv) sameLevelCount++;
        if((d.words||[]).some(w=>wordSet.has(w))) sharedWordCount++;
      });
    });
    console.log(`\n[14] sentenceOpts over all ${SENTENCES.length} sentences: ${SENTENCES.length-bad} clean, ${bad} bad`);
    console.log(`    same-level ratio: ${totalOpts ? (sameLevelCount/totalOpts).toFixed(2) : "n/a"} (${sameLevelCount}/${totalOpts})`);
    console.log(`    shared-word ratio: ${totalOpts ? (sharedWordCount/totalOpts).toFixed(2) : "n/a"} (${sharedWordCount}/${totalOpts}) -- informational only (no threshold asserted): "shares a word" counts function words too (的/我/你/...), so most short sentences share at least one with most others -- this ratio mainly confirms the shared-word tier is actually being exercised, not that distractors are topically close`);
    badExamples.forEach(b=>console.log("    ", JSON.stringify(b)));
    check("sentenceOpts valid for every sentence (0 bad)", bad === 0);
    // Same-level is a hard filter in sentenceOpts (not just a preference, unlike
    // shared-word), so it should be at/near 100% across the corpus -- the only way
    // it drops is the documented small-pool fallback widening past level.
    check("sentenceOpts same-level ratio is high (>=0.9, the hard-filter case dominates)", totalOpts===0 || (sameLevelCount/totalOpts) >= 0.9);
  })();

  // --------------------------------------------------------------- check 15
  (function(){
    // gapCandidateIndices must never offer a function word as a blank -- checked
    // against the exact list the spec names, which must match PC.SENTENCE_FUNCTION_WORDS.
    const SPEC_FUNCTION_WORDS = ["的","了","吗","呢","是","我","你","他","她","我们","你们","他们","和","在","不","很","也","都"];
    const listsMatch = JSON.stringify([...PC.SENTENCE_FUNCTION_WORDS].sort()) === JSON.stringify([...SPEC_FUNCTION_WORDS].sort());
    check("PC.SENTENCE_FUNCTION_WORDS matches the spec's function-word list", listsMatch);

    let bad = 0; const badExamples = [];
    SENTENCES.forEach(sentence=>{
      const idxs = PC.gapCandidateIndices(sentence, VOCAB);
      idxs.forEach(i=>{
        const w = sentence.words[i];
        if(PC.SENTENCE_FUNCTION_WORDS.indexOf(w) >= 0){ bad++; if(badExamples.length<10) badExamples.push({zh:sentence.zh, word:w}); }
      });
    });
    console.log(`\n[15] gapCandidateIndices never offers a function word: ${bad} violations (should be 0)`);
    badExamples.forEach(b=>console.log("    ", JSON.stringify(b)));
    check("no gap candidate is a function word", bad === 0);

    // A candidate must also not be a word that recurs elsewhere in the same
    // sentence: blanking one occurrence would still leave the answer sitting in
    // plain sight at its other occurrence(s) (category fix from browser review).
    let dupBad = 0; const dupExamples = [];
    SENTENCES.forEach(sentence=>{
      const words = sentence.words||[];
      const counts = {}; words.forEach(w=>{ counts[w] = (counts[w]||0)+1; });
      PC.gapCandidateIndices(sentence, VOCAB).forEach(i=>{
        const w = words[i];
        if(counts[w] > 1){ dupBad++; if(dupExamples.length<10) dupExamples.push({zh:sentence.zh, word:w, count:counts[w]}); }
      });
    });
    console.log(`\n[15b] gapCandidateIndices never offers a word that recurs in the same sentence: ${dupBad} violations (should be 0)`);
    dupExamples.forEach(b=>console.log("    ", JSON.stringify(b)));
    check("no gap candidate is a repeated word within its own sentence", dupBad === 0);

    // Synthetic regression case: 喜欢 ("to like", HSK1, not a function word) repeats
    // twice in the same sentence -- both its indices must be excluded, even though
    // each individually (level match, not a function word) would otherwise be a
    // legal candidate. 你/我/也 are function words anyway (excluded by the other
    // rule), so this specifically exercises the new duplicate-word rule.
    const dupSentence = { zh:"我喜欢你，你也喜欢我。", py:"wǒ xǐhuan nǐ, nǐ yě xǐhuan wǒ.", en:"I like you, you like me too.", lv:1,
      words:["我","喜欢","你","你","也","喜欢","我"] };
    const dupIdxs = PC.gapCandidateIndices(dupSentence, VOCAB);
    const dupWords = dupIdxs.map(i=>dupSentence.words[i]);
    console.log(`\n[15c] synthetic duplicate-word sentence: candidate indices ${JSON.stringify(dupIdxs)} -> words ${JSON.stringify(dupWords)}`);
    check("synthetic case: a duplicated content word (喜欢) is excluded as a gap candidate", dupWords.indexOf("喜欢")<0);
  })();

  // --------------------------------------------------------------- check 16
  (function(){
    // gapOpts: for every sentence's eligible gap candidates, 3 options, all real
    // VOCAB entries, same syllable count as the blanked word, never the answer.
    let bad = 0; const badExamples = [], sampled = [];
    SENTENCES.forEach(sentence=>{
      PC.gapCandidateIndices(sentence, VOCAB).forEach(i=>{
        const entry = VOCAB_BY_W[sentence.words[i]];
        sampled.push(entry);
      });
    });
    sampled.forEach(entry=>{
      const ds = PC.gapOpts(entry, VOCAB);
      const n = PC.syll(entry.n).length;
      // Same corpus quirk as pinyinOpts' check 10: gapOpts widens past an exact
      // syllable-count (and eventually level) match when that pool is too small --
      // the whole HSK 1-4 corpus has only one 4-syllable word ("公共汽车") -- so
      // only require an exact match when the corpus actually has 3+ same-level,
      // same-count peers.
      const exactPoolSize = VOCAB.filter(v=>v.w!==entry.w && v.lv===entry.lv && PC.syll(v.n).length===n).length;
      const ok = ds.length===3 &&
        ds.every(d=>VOCAB.includes(d)) &&
        ds.every(d=>d.n!==entry.n) &&
        (exactPoolSize<3 || ds.every(d=>PC.syll(d.n).length===n)) &&
        new Set(ds.map(d=>d.n)).size===3;
      if(!ok){ bad++; if(badExamples.length<10) badExamples.push({entry:entry.n, ds:ds.map(d=>d.n)}); }
    });
    console.log(`\n[16] gapOpts over ${sampled.length} gap candidates (every sentence's eligible blanks): ${sampled.length-bad} clean, ${bad} bad`);
    badExamples.forEach(b=>console.log("    ", JSON.stringify(b)));
    check("gapOpts valid for every real gap candidate (0 bad)", bad === 0);
  })();

  // --------------------------------------------------------------- check 17
  (function(){
    // sentenceTokens: the py<->words alignment every rendering helper depends on
    // must hold for the whole shipped corpus (already spot-checked during
    // development; this is the permanent regression guard).
    let bad = 0; const badExamples = [];
    SENTENCES.forEach(s=>{
      const toks = PC.sentenceTokens(s);
      if(!toks || toks.length !== (s.words||[]).length){ bad++; if(badExamples.length<10) badExamples.push(s.zh); }
    });
    console.log(`\n[17] sentenceTokens py<->words alignment over all ${SENTENCES.length} sentences: ${bad} misaligned (should be 0)`);
    badExamples.forEach(b=>console.log("    ", JSON.stringify(b)));
    check("sentenceTokens aligns 1:1 with words for every sentence", bad === 0);
  })();

  // --------------------------------------------------------------- check 18
  (function(){
    // Regression guard for the capitalization bug found in browser review: the
    // app's sentencePyHTML capitalizes only the first sentence's first rendered
    // character via PC.capitalizeFirstSpan, anchored to the very start of the
    // HTML fragment (not a scan for the first ASCII letter anywhere in it, which
    // is what let 阿姨's "āyí" render as "āYí" -- the old regex skipped over the
    // un-matched tone-marked "ā" and capitalized the next span's "y" instead).
    // This mirrors the app's real render pipeline (PC.sentenceTokens + pyHTML/
    // guessTone + capitalizeFirstSpan) in plain Node, strips the HTML tags, and
    // checks the result equals the sentence's own stored `py` with its first
    // character uppercased -- over the full shipped corpus, not just 阿姨.
    function renderPlainText(sentence){
      const toks = PC.sentenceTokens(sentence);
      if(!toks) return null;
      const html = toks.map(t=>{
        const entry = VOCAB_BY_W[t.word];
        let inner = entry ? PC.pyHTML(entry.n) : `<span class="t${PC.guessTone(t.core)}">${t.core}</span>`;
        if(t.index === 0) inner = PC.capitalizeFirstSpan(inner);
        return `<span>${inner}</span>${t.punct}`;
      }).join(" ");
      return html.replace(/<[^>]+>/g, "");
    }
    let bad = 0; const badExamples = [];
    SENTENCES.forEach(s=>{
      const rendered = renderPlainText(s);
      const expected = s.py.charAt(0).toUpperCase() + s.py.slice(1);
      if(rendered !== expected){ bad++; if(badExamples.length<10) badExamples.push({zh:s.zh, py:s.py, rendered, expected}); }
    });
    console.log(`\n[18] sentence pinyin render (stripped of tags) matches data py, first letter capitalized: ${SENTENCES.length-bad} clean, ${bad} bad`);
    badExamples.forEach(b=>console.log("    ", JSON.stringify(b)));
    check("rendered sentence pinyin text equals stored py (capitalization-correct) for every sentence", bad === 0);

    // The specific reported regression: 阿姨 (āyí) must render "Āyí", not "āYí".
    const ayi = SENTENCES.find(s => (s.words||[])[0] === "阿姨");
    if(ayi){
      const rendered = renderPlainText(ayi);
      console.log(`    阿姨 regression case: ${JSON.stringify(ayi.py)} -> ${JSON.stringify(rendered)}`);
      check("阿姨-leading sentence capitalizes the first syllable, not the second", rendered.startsWith("Ā"));
    }
  })();

  // --------------------------------------------------------------- check 19
  (function(){
    // guessTone: reverse tone lookup used to colour a whole SENTENCE_EXTRA token
    // by its last toned syllable, right-to-left, so a neutral-tone suffix (the
    // common case: "-men", "-li", "-ge") doesn't win over the word's real tone.
    const cases = [
      ["nǐmen", 3],   // 你们: nǐ (t3) + neutral "men" -> scan right-to-left lands on ǐ
      ["tāmen", 1],   // 他们/她们: tā (t1) + neutral "men"
      ["chūntiān", 1],// 春天: chun1 tian1 -- last syllable's own tone (ā, t1)
      ["zhège", 4],   // 这个: zhè (t4) + neutral "ge"
      ["nàlǐ", 3],    // 那里: nà (t4) then lǐ (t3) -- rightmost toned vowel wins
      ["bu", 5],      // no tone mark anywhere -> falls through to neutral (5)
    ];
    let bad = 0;
    cases.forEach(([input, expected])=>{
      const got = PC.guessTone(input);
      const ok = got === expected;
      if(!ok) bad++;
      console.log(`    ${ok?"ok ":"BAD"} guessTone(${JSON.stringify(input)}) = ${got} (expected ${expected})`);
    });
    console.log(`\n[19] guessTone unit cases: ${cases.length-bad} / ${cases.length} correct`);
    check("guessTone matches expected tone for every case (including SENTENCE_EXTRA-shaped compounds)", bad === 0);
  })();
}

// =============================================================== Phase 3: characters
const util = require("util");
// --------------------------------------------------------------- check 20
(function(){
  // Existing users' progress must survive the Phase 3 migration untouched: every
  // pre-existing field deep-equal after migrateProg, only c/mixChars added.
  const v1 = { v:1, w:{"学生":{r:3,w:1,s:1,prov:1},"老师":{r:2,w:0,s:2,d:1}}, sets:{1:3,2:0,3:0,4:0}, lessons:{tones:1}, sessions:4, theme:"dark", dismissedSoundsHint:true };
  const v2noC = { v:2, w:{"你":{r:5,w:2,s:3}}, s:{"你好。":{r:2,w:0,s:2}}, sets:{1:15,2:15,3:30,4:2}, lessons:{tones:1,initials:1}, sessions:9, theme:null, showChars:true, placedOnce:true, soundsOpened:1 };
  const current = { v:2, w:{"你":{r:5,w:2,s:3}}, s:{}, c:{"你":{r:4,w:1,s:6}}, sets:{1:15,2:15,3:30,4:0}, lessons:{}, sessions:2, theme:"light", showChars:false, placedOnce:1, soundsOpened:true, mixChars:false };
  let bad = 0;
  [["v1", v1], ["v2 without c/mixChars", v2noC], ["current (with c/mixChars)", current]].forEach(([label, orig])=>{
    const snapshot = JSON.parse(JSON.stringify(orig));
    const val = PC.validateProgShape(snapshot);
    const m = PC.migrateProg(val.data);
    const keys = Object.keys(orig).filter(k=>k!=="v");
    const preserved = keys.every(k => util.isDeepStrictEqual(m[k], orig[k]));
    const defaulted = m.v === 2 && typeof m.c === "object" && m.c && typeof m.mixChars === "boolean"
      && (orig.c === undefined ? util.isDeepStrictEqual(m.c, {}) : true)
      && (orig.mixChars === undefined ? m.mixChars === true : m.mixChars === orig.mixChars)
      && (orig.showChars === undefined ? m.showChars === false : true) && typeof m.s === "object";
    // Round trip: the migrated object must itself validate and re-migrate to itself.
    const rt = PC.validateProgShape(JSON.parse(JSON.stringify(m)));
    const idempotent = rt.ok && util.isDeepStrictEqual(PC.migrateProg(rt.data), m);
    const ok = val.ok && preserved && defaulted && idempotent;
    if(!ok) bad++;
    console.log(`    ${ok?"ok ":"BAD"} ${label}: validated=${val.ok} oldFieldsPreserved=${preserved} defaults=${defaulted} roundTrip=${idempotent}`);
  });
  console.log(`\n[20] Phase 3 migration preserves existing progress: ${3-bad} / 3 shapes clean`);
  check("migrateProg preserves every existing field (v1, v2-without-c, current) and adds c:{} / mixChars:true defaults", bad === 0);
})();

// --------------------------------------------------------------- check 21
(function(){
  const good = [ {c:{}}, {c:{"你":{r:1,w:0,s:1}}}, {mixChars:true}, {mixChars:false}, {c:{"你":{}}} ];
  const badShapes = [ {c:null}, {c:[]}, {c:"x"}, {c:{"你":null}}, {c:{"你":[]}}, {c:{"你":{s:"3"}}}, {mixChars:1}, {mixChars:"true"}, {mixChars:null} ];
  const goodOk = good.every(d=>PC.validateProgShape(d).ok);
  const badRejected = badShapes.every(d=>!PC.validateProgShape(d).ok);
  console.log(`\n[21] validateProgShape c/mixChars: ${good.filter(d=>PC.validateProgShape(d).ok).length}/${good.length} good accepted, ${badShapes.filter(d=>!PC.validateProgShape(d).ok).length}/${badShapes.length} bad rejected`);
  check("validateProgShape accepts well-formed c/mixChars", goodOk);
  check("validateProgShape rejects malformed c/mixChars", badRejected);
})();

// --------------------------------------------------------------- check 22
(function(){
  const byW = new Set(VOCAB.map(v=>v.w));
  let bad = 0, total = 0, sameLv = 0, sameLen = 0; const badEx = [];
  for(let i=0;i<200;i++){
    const e = VOCAB[Math.floor(Math.random()*VOCAB.length)];
    const ds = PC.charOpts(e, VOCAB);
    const ws = [e.w, ...ds.map(d=>d.w)];
    const enKey = x => String(x.en).trim().toLowerCase();
    const ok = ds.length === 3 && new Set(ws).size === 4 && ds.every(d=>byW.has(d.w))
      && ds.every(d=>enKey(d) !== enKey(e)) && ds.every(d=>PC.pipeline(d.n) !== PC.pipeline(e.n));
    if(!ok){ bad++; if(badEx.length<5) badEx.push({w:e.w, ds:ds.map(d=>d.w)}); }
    ds.forEach(d=>{ total++; if(d.lv===e.lv) sameLv++; if([...d.w].length===[...e.w].length && d.lv===e.lv) sameLen++; });
  }
  console.log(`\n[22] charOpts over 200 random words: ${200-bad} clean, ${bad} bad; same-level ${total?(sameLv/total).toFixed(2):"n/a"}, same-level+same-length ${total?(sameLen/total).toFixed(2):"n/a"}`);
  badEx.forEach(b=>console.log("    ", JSON.stringify(b)));
  check("charOpts: 4 distinct w, all VOCAB, no distractor shares the answer's en or pinyin (200 words)", bad === 0);
  check("charOpts prefers same level (>=0.95 of distractors)", total && sameLv/total >= 0.95);
})();

// --------------------------------------------------------------- check 23
(function(){
  const cases = [];
  for(let st=0; st<=9; st++){
    const expectTier = st < 3 ? "py" : st < 6 ? "ruby" : "bare";
    cases.push([st, true, true, expectTier]);
    cases.push([st, true, false, "py"]);   // mixChars off
    cases.push([st, false, true, "py"]);   // not unlocked
    cases.push([st, false, false, "py"]);
  }
  let bad = 0;
  cases.forEach(([st, un, mix, exp])=>{ if(PC.sentenceTokenTier(st, un, mix) !== exp) bad++; });
  const tierOk = PC.charTier(0)==="py" && PC.charTier(2)==="py" && PC.charTier(3)==="ruby" && PC.charTier(5)==="ruby" && PC.charTier(6)==="bare" && PC.charTier(undefined)==="py";
  console.log(`\n[23] mixed-render tier decision: ${cases.length-bad}/${cases.length} sentenceTokenTier cases correct; charTier boundaries ${tierOk?"ok":"BAD"}`);
  check("sentenceTokenTier: py <3, ruby 3-5, bare >=6; py whenever locked or mixChars off", bad === 0);
  check("charTier boundary cases (0,2,3,5,6,undefined)", tierOk);
})();

// --------------------------------------------------------------- check 24
(function(){
  // Gate + placement: placement past HSK 3 must set sets[1..3] to their full set
  // counts (the last stratum of each level ends exactly at nSets), which is what
  // charsUnlocked reads.
  const nsets = {}; [1,2,3,4].forEach(lv=>{ nsets[lv] = Math.ceil(VOCAB.filter(v=>v.lv===lv).length/10); });
  const st = PC.strata(VOCAB);
  const lastEndsAtN = [1,2,3,4].every(lv => { const b = st.filter(x=>x.lv===lv); return b[b.length-1].s1 === nsets[lv]; });
  // Simulate placeResult passing every HSK 1-3 bucket.
  const sets = {1:0,2:0,3:0,4:0};
  st.forEach(b=>{ if(b.lv<=3) sets[b.lv] = Math.max(sets[b.lv], b.s1); });
  const unlockedAfterPlacement = PC.charsUnlocked(sets, nsets);
  const lockedPartial = !PC.charsUnlocked({1:nsets[1],2:nsets[2],3:nsets[3]-1,4:0}, nsets);
  const lockedEmpty = !PC.charsUnlocked({}, nsets);
  console.log(`\n[24] charsUnlocked gate: last stratum ends at nSets for every level=${lastEndsAtN}; placement past HSK3 unlocks=${unlockedAfterPlacement}; one HSK3 set short stays locked=${lockedPartial}`);
  check("placement strata end exactly at nSets per level (placement past HSK 3 sets the counters charsUnlocked reads)", lastEndsAtN);
  check("charsUnlocked: true after all HSK 1-3 sets, false one set short / empty", unlockedAfterPlacement && lockedPartial && lockedEmpty);
})();

// --------------------------------------------------------------- check 25
(function(){
  // newCharWords: learned words without a character record, HSK 1 first, VOCAB
  // (frequency) order within a level, capped at n.
  const l3 = VOCAB.filter(v=>v.lv===3).slice(0,3), l1 = VOCAB.filter(v=>v.lv===1).slice(0,5);
  const learned = [...l3, ...l1.slice().reverse()]; // deliberately out of order
  const c = {}; c[l1[0].w] = {r:1,w:0,s:1};
  const got = PC.newCharWords(learned, c, VOCAB, 6).map(v=>v.w);
  const expected = [l1[1].w, l1[2].w, l1[3].w, l1[4].w, l3[0].w, l3[1].w];
  console.log(`\n[25] newCharWords ordering: got ${JSON.stringify(got)}`);
  check("newCharWords skips recorded words, orders HSK 1 first then frequency, caps at n", util.isDeepStrictEqual(got, expected));
})();

console.log(`\n${fails===0?"ALL CHECKS PASSED":"FAILURES: "+fails}`);
process.exit(fails===0?0:1);
