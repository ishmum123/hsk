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

let fails = 0;
function check(name, cond){
  if(cond){ console.log(`PASS  ${name}`); }
  else { console.log(`FAIL  ${name}`); fails++; }
}

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
    const ok = ds.length===3 &&
      new Set(ds.map(d=>d.n)).size===3 &&
      ds.every(d=>d.n!==entry.n) &&
      ds.every(d=>PC.syll(d.n).length===chunks.length) &&
      ds.every(d=>PC.syll(d.n).every(c=>PC.VALID_SYLLABLES.has(c.slice(0,-1).toLowerCase())));
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
  // Placement strata: 8 foundation items + 40 vocab items across L1x3 L2x3 L3x4 L4x6 buckets = 16 buckets, sum 48.
  // Uses the app's real PC.strata() (shared with src/pinyin_app.html) rather than a re-derived copy.
  const st = PC.strata(VOCAB); // default bucketSpec: [[1,3],[2,3],[3,4],[4,6]]
  const nBuckets = st.length;
  // app assigns 2 items to even-index buckets, 3 to odd-index buckets: 8*2 + 8*3 = 40
  const bucketItemCounts = st.map((b,i)=> i%2===0 ? 2 : 3);
  const totalVocabItems = bucketItemCounts.reduce((s,n)=>s+n,0);
  console.log(`\n[4] Placement strata: ${nBuckets} vocab buckets (${totalVocabItems} items) + 8 foundation items = ${8+totalVocabItems} total`);
  console.log("    bucket sizes (words available per bucket):", st.map(b=>b.words.length).join(","));
  check("16 vocab buckets + 8 foundations = 48", nBuckets===16 && totalVocabItems+8===48);
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

console.log(`\n${fails===0?"ALL CHECKS PASSED":"FAILURES: "+fails}`);
process.exit(fails===0?0:1);
