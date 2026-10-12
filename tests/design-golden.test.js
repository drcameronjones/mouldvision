// Design release safeguard (approved by Dr Cameron Jones, 12 Oct 2026): the redesign changes presentation only.
// These tests run the frozen rc10 engine (tests/fixtures/app-rc10.js, sha256 580c59ed…) and the current engine side by side
// and require identical stimuli, trial sequences, scores, guidance, report text, data files and PDF wording.
// The only permitted difference is the software version stamp (and, in the PDF, layout and the labels listed in PDF_ADDED_LABELS).
const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('fs'); const path = require('path'); const os = require('os'); const crypto = require('crypto'); const { execFileSync } = require('child_process');
const { load, runTest, observer } = require('./harness');

const OLD = 'tests/fixtures/app-rc10.js', NEW = 'src/app.js';
const tag = (id, name) => `${id} ${name}`;
const j = x => JSON.parse(JSON.stringify(x));
function seeded(seed) { let s = seed >>> 0; const m = Object.create(Math); m.random = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; return m; }
const TIME_KEYS = new Set(['shownAt', 'answeredAt', 'latencyMs', 'startedAt', 'completedAt', 'computedAt', 'answeredAt', 'builtAt']);
function strip(o) { if (Array.isArray(o)) return o.map(strip); if (o && typeof o === 'object') { const r = {}; for (const k of Object.keys(o)) { if (TIME_KEYS.has(k) || k === 'id' || k === 'integrity') continue; r[k] = strip(o[k]); } return r; } return o; }
const normVersion = (s, v) => [].concat(v).reduce((acc, x) => acc.split(x).join('<SOFTWARE>'), String(s));

async function seededRun(appPath, seed, mode, limits) {
  const MV = load({ appPath, math: seeded(seed) });
  const run = await runTest(MV, { mode, answerFn: observer(limits) });
  return { MV, run };
}
// a phone-edition style record: camera distance, display confirmations, context answers and guidance with history
function enrich(MV, run, history) {
  run.mobile = { display: { brightnessMaxConfirmed: true, nightShiftOffConfirmed: false, lighting: 'artificial' }, acknowledgement: { version: 'ack-v1-draft' } };
  MV.setRunContext(run, { mouldSmell: 'some', waterDamage: 'yes', sampling: 'BHS kit', samplingText: 'K-1234', eyeConditions: ['none'], ageBand: '50–59', nightDriving: 'some' });
  run.guidance = MV.guidanceForRun(run, history);
  return run;
}

test(tag('D01', 'same seed and answers: identical trial sequence, stimulus parameters, geometry, ladder and scores in rc10 and current engines'), async () => {
  for (const [seed, mode, limits] of [[11, 'full', { A: 6, B: 7, C: 7, D: 5, E: 3 }], [12, 'quick', { A: 5, B: 6, C: 2, D: 4, E: 1 }], [13, 'full', { A: 9, B: 9, C: 9, D: 9, E: 9 }]]) {
    const a = await seededRun(OLD, seed, mode, limits), b = await seededRun(NEW, seed, mode, limits);
    assert.deepEqual(j(strip(b.run.trials)), j(strip(a.run.trials)), 'trials ' + mode);
    for (const k of ['geometry', 'ladder', 'renderingModel', 'scoring', 'status', 'schema']) assert.deepEqual(j(b.run[k]), j(a.run[k]), k);
    const va = { ...a.run.versions, software: '<S>' }, vb = { ...b.run.versions, software: '<S>' };
    assert.deepEqual(j(vb), j(va), 'version stamps other than software');
    assert.deepEqual(j(b.MV.LADDER), j(a.MV.LADDER)); assert.deepEqual(j(b.MV.SENS), j(a.MV.SENS)); assert.deepEqual(j(b.MV.FREQS), j(a.MV.FREQS));
    assert.equal(b.MV.SCORING_VERSION, a.MV.SCORING_VERSION); assert.equal(b.MV.STIMULUS_VERSION, a.MV.STIMULUS_VERSION); assert.equal(b.MV.GUIDANCE_VERSION, a.MV.GUIDANCE_VERSION); assert.equal(b.MV.CONTEXT_VERSION, a.MV.CONTEXT_VERSION);
    assert.deepEqual(j(b.MV.INTEGRITY_SCOPE), j(a.MV.INTEGRITY_SCOPE)); assert.deepEqual(j(b.MV.CONTEXT_ITEMS), j(a.MV.CONTEXT_ITEMS)); assert.equal(b.MV.CONTEXT_PARAGRAPH, a.MV.CONTEXT_PARAGRAPH);
    assert.deepEqual(j(b.MV.GUIDANCE_RULES), j(a.MV.GUIDANCE_RULES)); assert.deepEqual(j(b.MV.REFS), j(a.MV.REFS)); assert.deepEqual(j(b.MV.FORBIDDEN_LABELS), j(a.MV.FORBIDDEN_LABELS));
  }
});

test(tag('D02', 'stimulus pixels: drawGrating output is byte-identical in rc10 and current engines (dpr 1 and 2, all columns, rows, tilts)'), () => {
  const stub = () => { const c = { style: {}, width: 0, height: 0, _img: null }; c.getContext = () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }), putImageData: (img) => { c._img = img; } }); return c; };
  for (const dpr of [1, 2]) {
    const A = load({ appPath: OLD }), B = load({ appPath: NEW });
    A._ctx.window = { devicePixelRatio: dpr }; B._ctx.window = { devicePixelRatio: dpr };
    const h = (MV, args) => { const c = stub(); MV.drawGrating(c, ...args); return crypto.createHash('sha256').update(Buffer.from(c._img.data.buffer)).digest('hex') + c.width; };
    for (const cpd of [1.5, 3, 6, 12, 18]) for (const row of [0, 4, 8]) for (const o of ['left', 'up', 'right']) {
      const args = [cpd, A.CONTRAST[row], o, 38.84, 120];
      assert.equal(h(B, args), h(A, args), `dpr ${dpr} cpd ${cpd} row ${row + 1} ${o}`);
    }
  }
});

test(tag('D03', 'guidance, report text, data file and integrity payload identical for a phone-edition record (only the software stamp may differ)'), async () => {
  const hist = [];
  for (const s of [21, 22]) { const h = await seededRun(OLD, s, 'full', { A: 7, B: 7, C: 7, D: 6, E: 4 }); hist.push(h.run); }
  for (const [seed, limits] of [[31, { A: 6, B: 7, C: 7, D: 5, E: 3 }], [32, { A: 2, B: 1, C: 6, D: 4, E: 2 }], [33, { A: 4, B: 4, C: 4, D: 3, E: 2 }]]) {
    const a = await seededRun(OLD, seed, 'full', limits);
    const B = load({ appPath: NEW });
    const runA = enrich(a.MV, a.run, hist);
    const runB = JSON.parse(JSON.stringify(runA));            // the same stored record, read by the new engine
    const gA = j(a.MV.guidanceForRun(runA, hist)), gB = j(B.guidanceForRun(runB, hist)); delete gA.computedAt; delete gB.computedAt;
    assert.deepEqual(gB, gA, 'guidance ' + seed);
    assert.deepEqual(j(B.scoreRun(runB)), j(a.MV.scoreRun(runA)), 'scores');
    const tA = a.MV.reportText(runA), tB = B.reportText(runB);
    assert.deepEqual(j(tB), j(tA), 'report text ' + seed);
    assert.equal(B.exportJson(runB), a.MV.exportJson(runA), 'data file');
    assert.equal(B.integrityPayload(runB), a.MV.integrityPayload(runA), 'integrity payload');
    assert.deepEqual(j(B.contextToldLines(runB)), j(a.MV.contextToldLines(runA)));
  }
});

// Labels the new PDF layout adds around unchanged content (approved layout elements, not report content).
const PDF_ADDED_LABELS = ['PROVISIONAL GUIDANCE', 'FIGURE 1'];
const FOOTER_RE = [/Biological Health Services/, /Level 1, 459 Toorak Road/, /www\.biologicalhealthservices\.com\.au\s+·\s+Concept/, /MouldVision v[\d.]+\S* · [0-9a-f]{8} · page \d+ of \d+/];
function pdfWords(blobBuf, version) {
  const f = path.join(os.tmpdir(), 'mv-golden-' + crypto.randomUUID() + '.pdf'); fs.writeFileSync(f, blobBuf);
  const txt = execFileSync('pdftotext', ['-raw', '-enc', 'UTF-8', f, '-'], { encoding: 'utf8' }); fs.unlinkSync(f);
  let lines = txt.split(/\n|\f/).map(l => l.trim()).filter(Boolean).filter(l => !FOOTER_RE.some(r => r.test(l)));
  let s = normVersion(lines.join(' '), version).replace(/\s+/g, ' ');
  for (const l of PDF_ADDED_LABELS) s = s.split(l).join(' ');
  return s.replace(/-\s+/g, '-').replace(/\s+/g, ' ').trim().split(' ');
}
async function pdfBuf(MV, run) { const blob = MV.buildPdf(run); return Buffer.from(await blob.arrayBuffer()); }

test(tag('D04', 'PDF wording: every word of the rc10 report appears in the same order in the new layout, with standard and embedded fonts'), async () => {
  const hist = [];
  for (const s of [41, 42]) { const h = await seededRun(OLD, s, 'full', { A: 7, B: 7, C: 7, D: 6, E: 4 }); hist.push(h.run); }
  const a = await seededRun(OLD, 43, 'full', { A: 6, B: 7, C: 7, D: 5, E: 3 });
  const run = enrich(a.MV, a.run, hist); run.integrity = { hash: 'a'.repeat(64) };
  const VERS = [a.MV.SOFTWARE_VERSION, load({ appPath: NEW }).SOFTWARE_VERSION];
  const old = pdfWords(await pdfBuf(a.MV, run), VERS);
  const fonts = loadPdfFonts();
  for (const withFonts of [false, true]) {
    const B = load({ appPath: NEW }); if (withFonts) B._ctx.MV_PDF_FONTS = fonts;
    const runB = JSON.parse(JSON.stringify(run));
    const neu = pdfWords(await pdfBuf(B, runB), VERS);
    const firstDiff = old.findIndex((w, i) => w !== neu[i]);
    assert.equal(firstDiff === -1 && old.length === neu.length, true, `fonts ${withFonts}: first difference at word ${firstDiff}: rc10 «${old.slice(Math.max(0, firstDiff - 6), firstDiff + 6).join(' ')}» vs new «${neu.slice(Math.max(0, firstDiff - 6), firstDiff + 6).join(' ')}» (lengths ${old.length}/${neu.length})`);
  }
});
function loadPdfFonts() {
  const dir = path.join(__dirname, '..', 'src', 'mobile', 'vendor', 'fonts', 'pdf');
  if (!fs.existsSync(dir)) return null;
  const out = {}; for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.ttf'))) out[f] = fs.readFileSync(path.join(dir, f)).toString('base64');
  return out;
}
module.exports = { seeded, PDF_ADDED_LABELS };
