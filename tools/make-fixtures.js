// Produces tests/fixtures/run-{full,quick,unsaved}.json by driving the real state machine in Node.
// Deterministic orientations (seeded) so the fixtures are stable across runs.
const fs = require('fs'); const path = require('path');
const { load, runTest, observer } = require('../tests/harness');
const out = path.join(__dirname, '..', 'tests', 'fixtures'); fs.mkdirSync(out, { recursive: true });

function seeded(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const validation = { software: { status: 'not_run', suite: 'phase0-T01-T28', version: 'v0.7.0', runAt: null } };

(async () => {
  // Node vm shares the Math object with the host; patch globally for determinism during generation
  const realRandom = Math.random;
  let rnd = seeded(20261009); Math.random = () => rnd();
  const full = await runTest(load({ validation }), { mode: 'full', answerFn: ({ eye, col, row, orient }) => {
    const lim = { A: 9, B: 8, C: eye === 'right' ? 5 : 6, D: eye === 'right' ? 4 : 5, E: 3 }[col];
    if (col === 'C' && eye === 'left' && row === 8) return orient;           // one isolated correct response
    if (col === 'B' && eye === 'right' && row === 9) return 'none';           // one can't-see
    return row <= lim ? orient : (orient === 'left' ? 'right' : 'left');
  } });
  rnd = seeded(20261010);
  const quick = await runTest(load({ validation }), { mode: 'quick', answerFn: observer((eye, col) => ({ A: 9, B: 7, C: eye === 'right' ? 4 : 5, D: 4, E: eye === 'left' ? 0 : 2 }[col])) });
  rnd = seeded(20261011);
  const MVu = load({ validation }); MVu._ls.setItem = (k) => { if (k === MVu.STORE_KEY) { const e = new Error('The quota has been exceeded.'); e.name = 'QuotaExceededError'; throw e; } };
  const unsaved = await runTest(MVu, { mode: 'full', answerFn: observer({ A: 9, B: 9, C: 6, D: 5, E: 4 }) });
  Math.random = realRandom;
  for (const [n, r] of [['full', full], ['quick', quick], ['unsaved', unsaved]]) {
    fs.writeFileSync(path.join(out, `run-${n}.json`), JSON.stringify(r, null, 2));
    console.log(n, r.status, 'trials', r.trials.length, 'R', r.scoring.right.correct + '/' + r.scoring.right.presented, 'L', r.scoring.left.correct + '/' + r.scoring.left.presented, 'hash', (r.integrity.hash || '').slice(0, 12));
  }
})();
