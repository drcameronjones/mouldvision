// Guidance tests G01–G06 (guidance-v1-provisional). Software behaviour only.
const test = require('node:test'); const assert = require('node:assert/strict');
const { load, runTest, observer } = require('./harness');
const tag = (id, name) => `${id} ${name}`;
const j = x => JSON.parse(JSON.stringify(x));
const all = { A: 6, B: 6, C: 6, D: 5, E: 4 };
const FORBIDDEN = ['POSITIVE', 'NEGATIVE', 'PASS', 'FAIL', 'CLEAR', 'FLAGGED', 'ABNORMAL', 'BIOTOXIN', 'MOULD', 'MYCOTOXIN', 'CIRS'];

test(tag('G01', 'healthy-pattern run: tier none, computed at finalise, outside the integrity scope'), async () => {
  const MV = load(); const run = await runTest(MV, { mode: 'full', answerFn: observer(all) });
  assert.equal(run.guidance.tier, 'none'); assert.equal(run.guidance.version, 'guidance-v1-provisional');
  assert.ok(!MV.INTEGRITY_SCOPE.includes('guidance'));
  assert.match(run.guidance.why.at(-1), /first runs/);
  assert.equal(MV.storedRuns()[0].guidance.tier, 'none', 'stored with the record');
});

test(tag('G02', 'easy-patch rule: two or more misses in rows 1–3 of A–C in one eye → worth an eye check; names the patches'), async () => {
  const MV = load();
  const run = await runTest(MV, { mode: 'full', answerFn: observer((eye, col) => eye === 'left' && (col === 'A' || col === 'B') ? 1 : all[col]) });
  assert.equal(run.guidance.tier, 'eyecheck'); assert.ok(run.guidance.reasons.includes('easy_left'));
  assert.match(run.guidance.why.join(' '), /Left eye missed 4 of the 9 easiest patches \(A2, A3, B2, B3\)/);
  assert.equal(run.guidance.label, 'Worth an eye check');
});

test(tag('G03', 'unreliable conditions downgrade an eye-check to repeat, and say why'), async () => {
  const MV = load();
  const run = await runTest(MV, { mode: 'full', answerFn: observer((eye, col) => eye === 'left' && col === 'A' ? 1 : all[col]) });
  const r = j(run); r.device.zoomChangedDuringRun = true; r.geometry.driftEvents = 6;
  const g = MV.guidanceForRun(r, []);
  assert.equal(g.tier, 'repeat'); assert.ok(g.reasons.includes('conditions')); assert.match(g.why[0], /distance from the screen changed 6 times during the test; the screen zoom changed/);
  // camera lost the face on most patches
  const r2 = j(run); r2.device.zoomChangedDuringRun = false; r2.geometry.driftEvents = 0; r2.trials.forEach((t, i) => { t.distanceSource = 'camera-iris-assumedFov'; t.distanceSamples = i % 3 ? 0 : 4; });
  assert.equal(MV.guidanceForRun(r2, []).tier, 'repeat');
});

test(tag('G04', 'between the eyes: first time → repeat; reproduced in the previous run → eye check'), async () => {
  const MV = load();
  const lim = (eye, col) => eye === 'right' && (col === 'C' || col === 'D') ? 3 : 6;
  const first = await runTest(MV, { mode: 'full', answerFn: observer(lim) });
  assert.equal(first.guidance.tier, 'repeat'); assert.ok(first.guidance.reasons.includes('eyes_differ'));
  MV.S.run = null; MV.S.finalisePromise = null;
  const second = await runTest(MV, { mode: 'full', answerFn: observer(lim) });
  assert.equal(second.guidance.tier, 'eyecheck'); assert.ok(second.guidance.reasons.includes('eyes_differ_repeated'));
});

test(tag('G05', 'against own baseline: a two-step drop in two columns after two baseline runs → changed since your baseline'), async () => {
  const MV = load();
  for (let k = 0; k < 2; k++) { await runTest(MV, { mode: 'full', answerFn: observer(all) }); MV.S.run = null; MV.S.finalisePromise = null; }
  const steady = await runTest(MV, { mode: 'full', answerFn: observer(all) }); MV.S.run = null; MV.S.finalisePromise = null;
  assert.equal(steady.guidance.tier, 'none'); assert.equal(steady.guidance.baseline.length, 2); assert.match(steady.guidance.why.at(-1), /within two contrast steps of your baseline/);
  const drop = await runTest(MV, { mode: 'full', answerFn: observer({ A: 6, B: 4, C: 4, D: 5, E: 4 }) });
  assert.equal(drop.guidance.tier, 'repeat'); assert.equal(drop.guidance.label, 'Changed since your baseline: repeat to confirm');
  assert.ok(drop.guidance.reasons.includes('baseline_right') && drop.guidance.reasons.includes('baseline_left'));
});

test(tag('G06', 'context never changes the tier; exploratory rows never count; wording carries no result labels'), async () => {
  const MV = load();
  const run = await runTest(MV, { mode: 'full', answerFn: observer(all) });
  const base = MV.guidanceForRun(run, []);
  MV.setRunContext(run, { mouldSmell: 'substantial', waterDamage: 'yes', treatment: 'yes', eyeConditions: ['glaucoma'] });
  assert.equal(MV.guidanceForRun(run, []).tier, base.tier);
  // flip rows 7–9 correctness: no effect
  const r = j(run); r.trials.forEach(t => { if (t.row >= 7) { t.correct = !t.correct; } }); r.scoring = MV.scoreRun(r);
  assert.equal(MV.guidanceForRun(r, []).tier, base.tier);
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'src/app.js'), 'utf8');
  const fn = src.slice(src.indexOf('function guidanceForRun'), src.indexOf('function guidanceHistory'));
  assert.ok(!/context/.test(fn), 'guidance code never reads context');
  for (const tier of ['none', 'repeat', 'eyecheck']) {
    const text = [tier].map(() => '').join('');
    void text;
  }
  const words = src.slice(src.indexOf('const TIER_TEXT'), src.indexOf('function lowestRow'));
  FORBIDDEN.forEach(w => assert.ok(!new RegExp('\\b' + w + '\\b', 'i').test(words), 'tier text contains ' + w));
  const T = MV.reportText(run); assert.ok(T.guidance && T.guidanceNote.includes('guidance-v1-provisional')); assert.match(T.ident, /Guidance guidance-v1-provisional/);
  assert.ok(MV.buildPdf(run).size > 20000);
});
