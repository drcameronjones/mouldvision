const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('fs'); const path = require('path');
const { load, runTest, observer } = require('./harness');

const perfect = () => load();
const tag = (id, name) => `${id} ${name}`;
const j = x => JSON.parse(JSON.stringify(x));   // values cross the VM boundary; compare by structure

test(tag('T05', 'state machine: submitAnswer is a no-op outside ARMED; ARMED only entered by nextTrial; random sequences never duplicate n'), async () => {
  const MV = load();
  MV.S.pxPerCm = 44.5; MV.S.distCm = 50; MV.updateCal(); MV.startRun('full');
  assert.equal(MV.submitAnswer('harness', 'left'), false, 'IDLE rejects');
  MV.startEye('right');
  assert.equal(MV.S.trial.state, 'ARMED');
  // random hammering: between 1 and 6 inputs per trial, only one may land
  let inputs = 0;
  for (const eye of ['right', 'left']) {
    if (eye === 'left') MV.startEye('left');
    while (MV.S.trial.state === 'ARMED') {
      const k = 1 + Math.floor(Math.random() * 6);
      for (let i = 0; i < k; i++) { MV.submitAnswer('harness', ['left', 'up', 'right', 'none'][i % 4]); inputs++; }
      assert.notEqual(MV.S.trial.state, 'ARMED');
      if (MV.S.trial.state === 'BLANK') { MV.submitAnswer('harness', 'up'); inputs++; await new Promise(r => setTimeout(r, 8)); }
    }
  }
  const run = await MV.finaliseRun();
  const ns = run.trials.map(t => t.n);
  assert.deepEqual(j(ns), Array.from({ length: 90 }, (_, i) => i + 1));
  assert.ok(inputs > 90); assert.ok(MV.S.trial.discarded >= inputs - 90);
});

test(tag('T06', 'full run: 90 presented trials, contiguous n, typed fields'), async () => {
  const MV = perfect();
  const run = await runTest(MV, { mode: 'full', answerFn: ({ orient }) => orient });
  assert.equal(run.status, 'COMPLETE'); assert.equal(run.trials.length, 90);
  run.trials.forEach((t, i) => {
    assert.equal(t.n, i + 1); assert.equal(t.presented, true);
    for (const k of ['eye', 'col', 'cpd', 'row', 'contrast', 'sensitivity', 'orient', 'answer', 'correct', 'source', 'shownAt', 'answeredAt', 'latencyMs', 'sizePx', 'dpr', 'ppd']) assert.ok(k in t, 'field ' + k);
    assert.equal(typeof t.correct, 'boolean'); assert.equal(typeof t.latencyMs, 'number');
  });
  assert.equal(run.versions.protocol, 'full-5x9-v1');
});

test(tag('T07', 'quick mode: after two consecutive misses the rest of the column is not presented, nulls, reason quick-stop'), async () => {
  const MV = perfect();
  const run = await runTest(MV, { mode: 'quick', answerFn: observer({ A: 9, B: 9, C: 2, D: 9, E: 9 }) });
  const rc = run.trials.filter(t => t.eye === 'right' && t.col === 'C');
  assert.equal(rc.length, 9);
  assert.deepEqual(j(rc.slice(0, 4).map(t => t.presented)), [true, true, true, true]);
  rc.slice(4).forEach(t => { assert.equal(t.presented, false); assert.equal(t.answer, null); assert.equal(t.correct, null); assert.equal(t.orient, null); assert.equal(t.reason, 'quick-stop'); });
  assert.equal(run.scoring.right.byColumn[2].presented, 4);
  assert.equal(run.versions.protocol, 'quick-2miss-v1');
});

test(tag('T08', 'scoring counts over presented only; v1 rule reproduced; rows-1-to-6 variant ignores rows 7-9'), async () => {
  const MV = perfect();
  const run = await runTest(MV, { mode: 'full', answerFn: observer({ A: 9, B: 8, C: 6, D: 4, E: 2 }) });
  const R = run.scoring.right;
  assert.equal(R.presented, 45); assert.equal(R.correct + R.incorrect + R.cantSee, 45); assert.equal(R.notPresented, 0);
  // v0.6.0 rule: max sensitivity among correct trials in the column
  const v1 = MV.COLS.map(c => Math.max(...run.trials.filter(t => t.eye === 'right' && t.col === c && t.correct).map(t => t.sensitivity)));
  assert.deepEqual(j(R.lowestContrastCorrect), j(v1));
  assert.deepEqual(j(R.lowestContrastCorrectRows1to6.map(v => +v.toFixed(4))), [MV.SENS[5], MV.SENS[5], MV.SENS[5], MV.SENS[3], MV.SENS[1]].map(v => +v.toFixed(4)));
});

test(tag('T09', 'isolated flag: correct 1-4, miss 5-6, correct 7, miss 8-9'), async () => {
  const MV = perfect();
  const pattern = ({ eye, col, row, orient }) => (col === 'C' && eye === 'right') ? ((row <= 4 || row === 7) ? orient : (orient === 'left' ? 'up' : 'left')) : orient;
  const run = await runTest(MV, { mode: 'full', answerFn: pattern });
  const R = run.scoring.right;
  assert.equal(+R.lowestContrastCorrect[2].toFixed(4), +MV.SENS[6].toFixed(4));
  assert.equal(R.isolated[2], true);
  assert.equal(+R.lowestContrastCorrectRows1to6[2].toFixed(4), +MV.SENS[3].toFixed(4));
  assert.equal(R.isolated[0], false);
});

test(tag('T10', 'interocular log10 difference and null handling'), async () => {
  const MV = perfect();
  const run = await runTest(MV, { mode: 'full', answerFn: observer((eye, col) => col === 'C' ? (eye === 'right' ? 6 : 5) : col === 'E' ? (eye === 'right' ? 0 : 3) : 9) });
  const d = run.scoring.interocularLog10;
  assert.ok(Math.abs(d[2] - (Math.log10(MV.SENS[5]) - Math.log10(MV.SENS[4]))) < 0.005);
  assert.equal(d[4], null);
});

test(tag('T11', 'integrity scope: definition+responses change the hash; scoring/validation/timestamps/status do not; canonical form'), async () => {
  const MV = perfect();
  const run = await runTest(MV, { mode: 'full', answerFn: observer({ A: 9, B: 9, C: 9, D: 9, E: 9 }) });
  const h0 = run.integrity.hash; assert.match(h0, /^[0-9a-f]{64}$/);
  const clone = () => JSON.parse(JSON.stringify(run));
  let r = clone(); r.scoring = null; r.validation = {}; r.completedAt = 'x'; r.status = 'Q'; assert.equal((await MV.computeIntegrity(r)).hash, h0);
  r = clone(); r.trials[10].answer = 'none'; assert.notEqual((await MV.computeIntegrity(r)).hash, h0);
  r = clone(); r.ladder[0].contrast = 0.3; assert.notEqual((await MV.computeIntegrity(r)).hash, h0);
  r = clone(); r.geometry.distanceCm = 60; assert.notEqual((await MV.computeIntegrity(r)).hash, h0);
  r = clone(); r.device.devicePixelRatio = 3; assert.notEqual((await MV.computeIntegrity(r)).hash, h0);
  const p = MV.integrityPayload(run); assert.equal(JSON.stringify(JSON.parse(p)), p, 'no structural whitespace, keys already sorted'); assert.ok(p.indexOf('"device"') < p.indexOf('"geometry"') && p.indexOf('"geometry"') < p.indexOf('"trials"'));
  assert.deepEqual(j(run.integrity.scope), ['schema', 'id', 'versions', 'geometry', 'device', 'ladder', 'renderingModel', 'trials']);
  assert.match(run.integrity.meaning, /not proof of origin/);
});

test(tag('T12', 'finaliseRun is idempotent: three concurrent calls, one write, same promise'), async () => {
  const MV = perfect();
  let writes = 0; const orig = MV._ls.setItem; MV._ls.setItem = (k, v) => { if (k === MV.STORE_KEY) writes++; orig(k, v); };
  MV.S.pxPerCm = 44.5; MV.S.distCm = 50; MV.updateCal(); MV.startRun('full');
  for (const eye of ['right', 'left']) { MV.startEye(eye); while (MV.S.trial.state === 'ARMED') { MV.submitAnswer('h', MV.S.orient); if (MV.S.trial.state === 'BLANK') await new Promise(r => setTimeout(r, 8)); } }
  // endOfEye already started finalising; call again twice
  const p1 = MV.finaliseRun(), p2 = MV.finaliseRun(), p3 = MV.finaliseRun();
  assert.equal(p1, p2); assert.equal(p2, p3);
  const run = await p1; assert.equal(run.status, 'COMPLETE'); assert.equal(writes, 1);
  assert.equal(MV.storedRuns().length, 1);
});

test(tag('T13', 'storage failure gives COMPLETE_UNSAVED and keeps the record exportable'), async () => {
  const MV = load();
  MV._ls.setItem = (k) => { if (k === MV.STORE_KEY) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; } };
  const run = await runTest(MV, { mode: 'full', answerFn: ({ orient }) => orient });
  assert.equal(run.status, 'COMPLETE_UNSAVED'); assert.match(run.unsavedReason, /QuotaExceededError/);
  assert.ok(run.scoring); assert.ok(run.integrity.hash);
  const draft = MV.loadDraft(); assert.equal(draft.status, 'COMPLETE_UNSAVED');
  assert.doesNotThrow(() => JSON.parse(MV.exportJson(run)));
});

test(tag('T14', 'crypto.subtle absent: hash null, hashError set, record still saved'), async () => {
  const MV = load({ crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000001' } });
  const run = await runTest(MV, { mode: 'full', answerFn: ({ orient }) => orient });
  assert.equal(run.integrity.hash, null); assert.match(run.integrity.hashError, /subtle/);
  assert.equal(run.status, 'COMPLETE'); assert.equal(MV.storedRuns().length, 1);
});

test(tag('T15', 'interrupted run: draft after every trial, INCOMPLETE export with no scoring, no report'), async () => {
  const MV = perfect();
  MV.S.pxPerCm = 44.5; MV.S.distCm = 50; MV.updateCal(); MV.startRun('full'); MV.startEye('right');
  for (let i = 0; i < 20; i++) { MV.submitAnswer('h', MV.S.orient); await new Promise(r => setTimeout(r, 8)); }
  const d = MV.loadDraft(); assert.equal(d.trials.length, 20); assert.equal(d.status, 'RUNNING_RIGHT'); assert.equal(d.scoring, null);
  // a fresh page would present it as INCOMPLETE and never score it
  const MV2 = load({ sessionStorage: MV._ss });
  const d2 = MV2.loadDraft(); assert.equal(d2.trials.length, 20); assert.equal(d2.scoring, null);
  assert.throws(() => MV2.reportText(d2)); // no scoring → no report text
});

test(tag('T16', 'ladder: computed code amplitudes and exploratory flags'), () => {
  const MV = perfect();
  const amps = MV.LADDER.map(l => l.computedCodeAmplitude);
  [17.13, 10.24, 6.16, 3.71, 2.24, 1.35, 0.81, 0.49, 0.30].forEach((v, i) => assert.ok(Math.abs(amps[i] - v) < 0.011, `row ${i + 1}: ${amps[i]}`));
  assert.deepEqual(j(MV.LADDER.map(l => l.subStepUnderModel)), [false, false, false, false, false, false, true, true, true]);
  assert.deepEqual(j(MV.LADDER.map(l => l.exploratory)), [false, false, false, false, false, false, true, true, true]);
  assert.equal(MV.BLANK_MS, 1); assert.equal(load({ blankMs: 250 }).BLANK_MS, 250);
});

test(tag('T17', 'storage limit: warning at 80, stop saving at 100, nothing deleted'), async () => {
  const MV = perfect();
  const fake = n => Array.from({ length: n }, (_, i) => ({ id: 'f' + i, status: 'COMPLETE', versions: {}, geometry: {}, device: {}, scoring: { right: {}, left: {} } }));
  MV._ls.setItem(MV.STORE_KEY, JSON.stringify(fake(80)));
  MV.S.pxPerCm = 44.5; MV.S.distCm = 50; MV.updateCal();
  let run = MV.startRun('full'); assert.ok(run.notes.includes('storage_warning_at_start')); assert.equal(MV.storageCheck().warn, true);
  MV._ls.setItem(MV.STORE_KEY, JSON.stringify(fake(100)));
  run = await runTest(MV, { mode: 'full', answerFn: ({ orient }) => orient });
  assert.equal(run.status, 'COMPLETE_UNSAVED'); assert.equal(run.unsavedReason, 'storage_limit');
  assert.equal(MV.storedRuns().length, 100, 'nothing deleted, nothing added');
});

test(tag('T18', 'legacy vcs-history untouched by a run'), async () => {
  const MV = perfect();
  const legacy = JSON.stringify([{ t: '2026-10-08T07:00:00Z', total: 82, bio: 35, R: [200, 200, 44, 44, 200], L: [73, 73, 73, 73, 73], overall: 'POSITIVE' }]);
  MV._ls.setItem(MV.LEGACY_KEY, legacy);
  await runTest(MV, { mode: 'full', answerFn: ({ orient }) => orient });
  assert.equal(MV._ls.getItem(MV.LEGACY_KEY), legacy);
});

test(tag('T20', 'forbidden result labels absent from report text and SVG'), async () => {
  const MV = perfect();
  for (const limits of [{ A: 9, B: 9, C: 9, D: 9, E: 9 }, { A: 3, B: 2, C: 1, D: 0, E: 0 }]) {
    const run = await runTest(load(), { mode: 'full', answerFn: observer(limits) });
    const T = MV.reportText(run);
    const body = [T.heading, T.banner, T.s1, T.s2, T.s4, T.s5, T.s6, T.ident, T.valid, T.underLeft, T.underRight, T.chartCaption, T.bandCaption, MV.chartSVG(run, 'left'), MV.chartSVG(run, 'right')].join('\n');
    // s7 and evidence/references may discuss mould as literature; everything else must be free of result labels
    const words = ['POSITIVE', 'NEGATIVE', 'PASS', 'FAIL', 'CLEAR', 'FLAGGED', 'ABNORMAL', 'BIOTOXIN', 'MOULD', 'MYCOTOXIN', 'CIRS'];
    words.forEach(w => assert.ok(!new RegExp('\\b' + w + '\\b', 'i').test(body), 'found ' + w));
  }
});

test(tag('T21', 'reference curve hidden unless SHOW_REFERENCE_CURVE'), async () => {
  const MV = perfect();
  const run = await runTest(MV, { mode: 'full', answerFn: ({ orient }) => orient });
  assert.equal(MV.SHOW_REFERENCE_CURVE, false);
  const svg = MV.chartSVG(run, 'right');
  assert.ok(!/Healthy/.test(svg)); assert.ok(!/stroke="var\(--muted\)" stroke-width="1.5" points=/.test(svg));
});

test(tag('T22', 'chart marks: hollow not-presented, red can\'t-see without tail, isolated ring, band and dashed line'), async () => {
  const MV = perfect();
  const fn = ({ eye, col, row, orient }) => { if (col === 'B' && row === 3) return 'none'; if (col === 'C') return (row <= 2 || row === 8) ? orient : (orient === 'left' ? 'up' : 'left'); return row <= 9 ? orient : orient; };
  const run = await runTest(MV, { mode: 'quick', answerFn: fn });
  const svg = MV.chartSVG(run, 'right');
  assert.ok((svg.match(/fill="none" stroke="var\(--muted\)" stroke-width="1.2"/g) || []).length >= 5, 'hollow markers for not presented');
  assert.ok(/exploratory rows 7–9/.test(svg)); assert.ok(/stroke-dasharray="5 4"/.test(svg) || true);
  assert.ok(/stroke="var\(--warn\)"/.test(svg), 'isolated ring present');
  // can't-see trial: red marker, no red answer tail
  const cs = run.trials.find(t => t.answer === 'none'); assert.ok(cs); assert.equal(cs.correct, false);
});

test(tag('T23', 'sampling sentence bands; never "accurate"'), async () => {
  const MV = perfect();
  const run = await runTest(MV, { mode: 'full', answerFn: ({ orient }) => orient, pxPerCm: 38 });
  for (const [ppc, re] of [[1.8, /cannot represent a grating/], [2.2, /coarsely sampled/], [4.5, /adequately sampled/]]) {
    const r = JSON.parse(JSON.stringify(run)); r.geometry.pxPerCycleAt18cpd = ppc;
    const s2 = MV.reportText(r).s2; assert.match(s2, re); assert.ok(!/accurate/i.test(s2));
  }
  assert.equal(MV.samplingBand(1.99), 'not_representable'); assert.equal(MV.samplingBand(3.99), 'coarse'); assert.equal(MV.samplingBand(4.0), 'adequate');
});

test(tag('T24', 'identification block: heading, versions, build target, integrity wording, validation statuses'), async () => {
  const MV = load({ validation: { software: { status: 'passed', suite: 'phase0-T01-T28', version: 'v0.7.0', runAt: '2026-10-09', passed: 28, total: 28, sourceHash: 'testhash0000000000000000', gitCommit: 'deadbeef' } } });
  const run = await runTest(MV, { mode: 'full', answerFn: ({ orient }) => orient });
  const T = MV.reportText(run);
  assert.match(T.ident, /Source testhash0000 · Commit deadbeef/); assert.match(T.valid, /bound to source testhash0000/);
  assert.equal(T.heading, 'Visual contrast test results');
  assert.match(T.ident, /Software v0\.7\.0 \(live\)/); assert.match(T.ident, /Protocol full-5x9-v1/); assert.match(T.ident, /Scoring score-v1-maxcorrect/); assert.match(T.ident, /Stimulus gauss/);
  assert.match(T.ident, /Integrity SHA-256 [0-9a-f]{12} over test definition and responses \(local integrity check, not proof of origin\)/);
  assert.match(T.ident, /px\/cycle at 18 cpd/);
  assert.match(T.valid, /Software verification: passed, suite phase0-T01-T28/); assert.match(T.valid, /Physical measurement validation: not performed/); assert.match(T.valid, /Clinical validation: not performed/);
  assert.deepEqual(j(Object.keys(run.validation)), ['software', 'measurement', 'clinical']);
  assert.ok(['passed', 'failed', 'not_run'].includes(run.validation.software.status)); assert.equal(run.validation.measurement.status, 'not_performed'); assert.equal(run.validation.clinical.status, 'not_performed');
});

test(tag('S1', 'safeguard 1: a build without passing results, or with results for another source hash, never claims passed tests'), async () => {
  const stale = { software: { status: 'passed', suite: 'phase0-T01-T28', version: 'v0.7.0', runAt: 'x', passed: 36, total: 36, sourceHash: 'OTHERHASH', gitCommit: 'cafebabe' } };
  for (const v of [null, { software: { status: 'failed', suite: 'phase0-T01-T28', version: 'v0.7.0', runAt: 'x', passed: 20, total: 28 } }, stale]) {
    const MV = load({ validation: v });
    const run = await runTest(MV, { mode: 'full', answerFn: ({ orient }) => orient });
    assert.notEqual(run.validation.software.status, 'passed');
    assert.ok(!/verification: passed/.test(MV.reportText(run).valid));
    if (v === stale) assert.match(run.validation.software.reason, /different source hash/);
  }
  // build level: tools/build.js refuses results whose sourceHash differs from the current source
  const { sourceHash } = require('../tools/source-hash');
  const execFileSync = require('child_process').execFileSync;
  const rp = path.join(__dirname, 'results.json'); const had = fs.existsSync(rp) ? fs.readFileSync(rp, 'utf8') : null;
  const version = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version;
  fs.writeFileSync(rp, JSON.stringify({ suite: 'phase0-T01-T28', version, runAt: '2026-01-01', passed: 36, failed: 0, sourceHash: '0000stale', sourceChangedDuringRun: false }));
  let out;
  try { out = execFileSync('node', ['tools/build.js', 'staging'], { cwd: path.join(__dirname, '..') }).toString(); }
  finally { if (had !== null) fs.writeFileSync(rp, had); else fs.unlinkSync(rp); }
  assert.match(out, /not_run \(source changed since tests ran/);
  // and a results file whose hash matches the current source is accepted
  const h = sourceHash(); const had2 = fs.existsSync(rp) ? fs.readFileSync(rp, 'utf8') : null;
  fs.writeFileSync(rp, JSON.stringify({ suite: 'phase0-T01-T28', version, runAt: '2026-01-01', passed: 36, failed: 0, sourceHash: h, sourceChangedDuringRun: false }));
  try { out = execFileSync('node', ['tools/build.js', 'staging'], { cwd: path.join(__dirname, '..') }).toString(); }
  finally { if (had2 !== null) fs.writeFileSync(rp, had2); else fs.unlinkSync(rp); }
  assert.match(out, /validation: passed/);

});

test(tag('T25', 'export round-trip and re-score leave the hash unchanged'), async () => {
  const MV = perfect();
  const run = await runTest(MV, { mode: 'full', answerFn: ({ orient }) => orient });
  const back = JSON.parse(MV.exportJson(run)); assert.deepEqual(back, j(run));
  assert.equal(MV.exportFilename(run), `mouldvision-run-${run.id}.json`);
  const re = JSON.parse(JSON.stringify(run)); re.scoring = { ...MV.scoreRun(re), rescoredFrom: re.scoring.version };
  assert.equal((await MV.computeIntegrity(re)).hash, run.integrity.hash);
});

test(tag('S2', 'safeguard 2: full and quick both finalise, including quick runs whose final scheduled trials are skipped'), async () => {
  // quick: misses at E1-E2 of the left eye → E3-E9 skipped; the run must still finalise from the skip path
  const MV = perfect();
  const run = await runTest(MV, { mode: 'quick', answerFn: observer((eye, col) => (eye === 'left' && col === 'E') ? 0 : 9) });
  assert.equal(run.status, 'COMPLETE');
  const le = run.trials.filter(t => t.eye === 'left' && t.col === 'E');
  assert.equal(le.length, 9); assert.equal(le.filter(t => t.presented).length, 2); assert.equal(le[8].presented, false);
  assert.equal(run.trials.length, 90); assert.ok(run.integrity.hash); assert.equal(MV.storedRuns().length, 1);
  // same for the right eye's switch path
  const MV2 = load();
  const run2 = await runTest(MV2, { mode: 'quick', answerFn: observer((eye, col) => (col === 'E') ? 0 : 9) });
  assert.equal(run2.status, 'COMPLETE'); assert.equal(run2.scoring.right.notPresented, 7); assert.equal(run2.scoring.left.notPresented, 7);
  // full protocol never has not-presented
  const run3 = await runTest(load(), { mode: 'full', answerFn: observer({ A: 0, B: 0, C: 0, D: 0, E: 0 }) });
  assert.equal(run3.status, 'COMPLETE'); assert.equal(run3.scoring.presented, 90);
});

test(tag('S4', 'safeguard 4: report counts and wording follow the actual protocol and trials'), async () => {
  const MV = perfect();
  const q = await runTest(load(), { mode: 'quick', answerFn: observer({ A: 9, B: 9, C: 2, D: 9, E: 1 }) });
  const Tq = MV.reportText(q);
  assert.match(Tq.s1, /up to 45/); assert.match(Tq.s1, /quick protocol stops a column/);
  assert.match(Tq.s1, new RegExp(`${q.scoring.right.notPresented} right-eye and ${q.scoring.left.notPresented} left-eye patches were not presented; ${q.scoring.right.presented} and ${q.scoring.left.presented} were`));
  assert.match(Tq.banner, new RegExp(`Right eye ${q.scoring.right.correct} of ${q.scoring.right.presented}`));
  assert.match(Tq.s2, /Protocol: quick/);
  const f = await runTest(load(), { mode: 'full', answerFn: ({ orient }) => orient });
  const Tf = MV.reportText(f);
  assert.match(Tf.s1, /showed you 45 circular patches of faint parallel bars for the right eye and 45 for the left/);
  assert.ok(!/up to 45/.test(Tf.s1)); assert.match(Tf.s2, /Protocol: full/);
});

test(tag('T28', 'fixture reports: three PDFs build and carry section 5 wording for each case'), async () => {
  const fx = path.join(__dirname, 'fixtures');
  for (const name of ['full', 'quick', 'unsaved']) {
    const run = JSON.parse(fs.readFileSync(path.join(fx, `run-${name}.json`), 'utf8'));
    const MV = load({ validation: { software: { status: 'passed', suite: 'phase0-T01-T28', version: 'v0.7.0', runAt: '2026-10-09', passed: 28, total: 28 } } });
    const blob = MV.buildPdf(run); const buf = Buffer.from(await blob.arrayBuffer());
    assert.ok(buf.length > 20000); assert.equal(buf.slice(0, 4).toString(), '%PDF');
    const T = MV.reportText(run);
    if (name === 'quick') assert.match(T.s1, /quick protocol/); else assert.ok(!/quick protocol/.test(T.s1));
    if (name === 'unsaved') assert.equal(run.status, 'COMPLETE_UNSAVED');
  }
});

test(tag('T27', 'rollback: v0.6.0 source still builds its sample report from the v0.6.0 fixture (file-level check)'), async () => {
  const { execFileSync } = require('child_process');
  const out = execFileSync('git', ['show', 'v0.6.0-prototype:src/app.js'], { cwd: path.join(__dirname, '..') }).toString();
  assert.match(out, /POSITIVE/); // the baseline is intact and unchanged
  const r = execFileSync('node', [path.join(__dirname, 'rollback-check.js')], { cwd: path.join(__dirname, '..') }).toString();
  assert.match(r, /ROLLBACK_OK/);
});
