// Phase 1 Node tests M01, M03, M05, M06 (Fourier check of the engine's own grating maths), M07, M08.
// These establish software behaviour only; nothing here measures a display or a person.
const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('fs'); const path = require('path'); const vm = require('vm');
const { load, runTest, observer } = require('./harness');
const tag = (id, name) => `${id} ${name}`;
const j = x => JSON.parse(JSON.stringify(x));
function loadMobileLibs() {
  const ctx = { console, Math, JSON, Array, Object, Number, String, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, navigator: { userAgent: 'iPhone', maxTouchPoints: 5 }, screen: { width: 390, height: 844 }, devicePixelRatio: 3, performance };
  ctx.globalThis = ctx; vm.createContext(ctx);
  for (const f of ['devices.js', 'distance.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src/mobile', f), 'utf8'), ctx, { filename: f });
  return ctx.MVM;
}

test(tag('M01', 'density table: every entry complete; exact lookups for listed models; class fallback otherwise'), () => {
  const { devices } = loadMobileLibs();
  for (const r of devices.TABLE) { assert.equal(r.length, 5); assert.ok(r[0] < r[1]); assert.ok(r[2] >= 1.5 && r[2] <= 4); assert.ok(r[3] > 40 && r[3] < 80, r[4]); assert.ok(typeof r[4] === 'string' && r[4].length); }
  const a = devices.lookup(390, 844, 3, 'iPhone'); assert.equal(a.source, 'table-exact'); assert.equal(a.pxPerCm, 60.4);
  const b = devices.lookup(844, 390, 3, 'iPhone'); assert.equal(b.pxPerCm, a.pxPerCm, 'orientation-independent');
  const c = devices.lookup(375, 812, 3, 'iPhone'); assert.equal(c.source, 'table-exact'); assert.ok(c.uncertainty >= 0.05, 'ambiguous models widen the uncertainty'); assert.ok(Math.abs(c.pxPerCm - 62.6) < 0.2);
  const d = devices.lookup(411, 823, 2.75, 'Android'); assert.equal(d.source, 'table-class'); assert.equal(d.uncertainty, 0.10); assert.equal(d.pxPerCm, 63.0);
  const e = devices.lookup(1440, 900, 2, 'Macintosh'); assert.equal(e.source, 'table-class'); assert.equal(e.pxPerCm, 64.2);
  const det = devices.detect(); assert.equal(det.source, 'table-exact'); assert.equal(det.isMobile, true);
});

test(tag('M03', 'iris distance: synthetic landmarks recover distance within 5 %; missing face gives null; calibration solves the focal length'), () => {
  const { distance: DS } = loadMobileLibs();
  const w = 640, h = 480, f = DS.focalFromFov(640, 70);
  for (const d of [25, 35, 40, 55, 70]) {
    const lm = DS.syntheticLandmarks(d, f, w, h);
    const iris = DS.irisDiameterPx(lm, w, h); const est = DS.distanceCm(iris, f);
    assert.ok(Math.abs(est - d) / d < 0.05, `${d} cm → ${est}`);
  }
  assert.equal(DS.irisDiameterPx(null, w, h), null); assert.equal(DS.irisDiameterPx([], w, h), null);
  // calibration: a wrong assumed focal length is corrected by one reading at a known distance
  const trueF = f * 1.25, lm40 = DS.syntheticLandmarks(40, trueF, w, h), iris40 = DS.irisDiameterPx(lm40, w, h);
  assert.ok(Math.abs(DS.distanceCm(iris40, f) - 40) / 40 > 0.15, 'assumed focal length is off by design');
  const fCal = DS.focalFromKnownDistance(iris40, 40); assert.ok(Math.abs(fCal - trueF) / trueF < 1e-6);
  const lm55 = DS.syntheticLandmarks(55, trueF, w, h); assert.ok(Math.abs(DS.distanceCm(DS.irisDiameterPx(lm55, w, h), fCal) - 55) < 0.01);
  assert.equal(DS.IRIS_MM, 11.7);
});

test(tag('M05', 'drift rule: more than 15 % change flags drift; summaries are medians with SD'), () => {
  const { distance: DS } = loadMobileLibs();
  assert.equal(DS.drifted(40, 45), false); assert.equal(DS.drifted(40, 46.1), true); assert.equal(DS.drifted(40, 33.9), true); assert.equal(DS.drifted(40, null), false);
  const s = DS.summarise([40, 41, 39, 200, 40]); assert.equal(s.medianCm, 40); assert.equal(s.n, 5); assert.ok(s.stdCm > 50);
  assert.deepEqual(j(DS.summarise([])), { medianCm: null, stdCm: null, n: 0 });
  // resize guard (added after the first phone run, where single wild frames at 71, 117 and 131 cm resized the patch)
  assert.equal(DS.wellSupported(DS.summarise([71.1, 72])), false, 'two frames are not enough');
  assert.equal(DS.wellSupported(DS.summarise([40, 41, 39, 40, 95])), false, 'a wild frame inflates the SD');
  assert.equal(DS.wellSupported(DS.summarise([38.4, 38.6, 38.1, 38.9, 38.5])), true);
  assert.ok(DS.MIN_CM <= 25 && DS.MAX_CM >= 80);
});

test(tag('M06', 'stimulus self-check: the grating maths yields the nominal cycles per degree and tilt at three phone densities'), () => {
  // Reproduces drawGrating's pixel formula (unchanged engine) for a patch and measures the dominant frequency by projecting
  // the luminance profile along the bar direction and taking a DFT across it. Checks cpd within 3 % and tilt within 1°.
  const src = fs.readFileSync(path.join(__dirname, '..', 'src/app.js'), 'utf8');
  const body = src.match(/function drawGrating\(canvas, cpd, contrast, orient, ppd, sizePx\)\{[\s\S]*?\n\}/)[0];
  assert.ok(body.includes('sigma = R*0.42') && body.includes('Math.min((typeof window'), 'drawGrating is the Phase 0 renderer');
  const srgb = lin => lin <= 0.0031308 ? 12.92 * lin : 1.055 * Math.pow(lin, 1 / 2.4) - 0.055;
  const render = (cpd, orient, ppdCss, sizePx, dpr) => {
    const px = Math.round(sizePx * dpr), cyclesPerPx = cpd / (ppdCss * dpr), TILT = 15 * Math.PI / 180;
    const theta = orient === 'left' ? -TILT : orient === 'right' ? TILT : 0, cx = px / 2, cy = px / 2, R = px / 2, sigma = R * 0.42, meanLin = 0.2140, ct = Math.cos(theta), st = Math.sin(theta);
    const img = new Float64Array(px * px);
    for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) { const dx = x - cx, dy = y - cy, r2 = dx * dx + dy * dy; if (r2 > R * R) { img[y * px + x] = 128; continue; } const u = dx * ct + dy * st; const env = Math.exp(-r2 / (2 * sigma * sigma)); const lin = meanLin * (1 + 0.9 * env * Math.sin(2 * Math.PI * cyclesPerPx * u)); const dith = (((x * 7 + y * 13) % 17) / 17 - 0.5); img[y * px + x] = Math.max(0, Math.min(255, Math.round(srgb(lin) * 255 + dith))); }
    return { img, px, dpr };
  };
  const measure = ({ img, px, dpr }, ppdCss) => {
    let best = { power: -1, cpd: 0, tiltDeg: 0 };
    for (let tdeg = -20; tdeg <= 20; tdeg += 0.5) {               // search tilt; project along the bars
      const th = tdeg * Math.PI / 180, ct = Math.cos(th), st = Math.sin(th), n = px, prof = new Float64Array(n), cnt = new Float64Array(n);
      for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) { const u = Math.round((x - px / 2) * ct + (y - px / 2) * st + px / 2); if (u >= 0 && u < n) { prof[u] += img[y * px + x] - 128; cnt[u]++; } }
      for (let i = 0; i < n; i++) prof[i] = cnt[i] ? prof[i] / cnt[i] : 0;
      for (let k = 1; k < n / 2; k++) { let re = 0, im = 0; for (let i = 0; i < n; i++) { const a = 2 * Math.PI * k * i / n; re += prof[i] * Math.cos(a); im -= prof[i] * Math.sin(a); } const p = re * re + im * im; if (p > best.power) best = { power: p, cpd: (k / n) * ppdCss * dpr, tiltDeg: tdeg }; }
    }
    return best;
  };
  const cases = [[60.4, 40, 2], [64.2, 40, 2], [56.8, 45, 2]];           // px/cm, cm, render scale (drawGrating caps DPR at 2)
  for (const [pxcm, cm, dpr] of cases) {
    const ppd = pxcm * cm * Math.tan(Math.PI / 180), sizePx = Math.round(ppd * 5);
    for (const [cpd, orient, tilt] of [[1.5, 'up', 0], [3, 'left', -15], [6, 'right', 15], [12, 'up', 0], [18, 'left', -15]]) {
      const m = measure(render(cpd, orient, ppd, sizePx, dpr), ppd);
      const ppc = ppd * dpr / cpd;
      assert.ok(Math.abs(m.cpd - cpd) / cpd < 0.03 + 0.5 / (sizePx * dpr / (ppd * dpr / cpd)), `${pxcm} px/cm ${cm} cm: ${cpd} cpd measured ${m.cpd.toFixed(2)} (${ppc.toFixed(2)} px/cycle)`);
      assert.ok(Math.abs(m.tiltDeg - tilt) <= 1, `${cpd} cpd ${orient}: tilt ${m.tiltDeg}`);
    }
  }
});

test(tag('M07', 'questionnaire: twelve items validated and stored in context; scoring and integrity ignore it'), async () => {
  const MV = load();
  assert.equal(MV.CONTEXT_ITEMS.length, 12);
  const ids = MV.CONTEXT_ITEMS.map(i => i.id); assert.equal(new Set(ids).size, 12);
  MV.CONTEXT_ITEMS.forEach(i => { assert.ok(['choice', 'multi'].includes(i.type)); assert.ok(i.options.length >= 2); assert.ok(i.q.length > 5); });
  const run = await runTest(MV, { mode: 'quick', answerFn: observer({ A: 7, B: 6, C: 5, D: 3, E: 2 }) });
  const before = j(run.scoring), hash = run.integrity.hash;
  const v = MV.validateContext({ mouldSmell: 'some', eyeConditions: ['cataract', 'other'], ageBand: '40–49', sampling: 'BHS kit', samplingText: 'kit 1234', bogus: 'x', smoking: 'maybe' });
  assert.equal(v.ok, false); assert.deepEqual(j(v.errors).sort(), ['bogus: unknown item', 'smoking: not an option']);
  assert.deepEqual(j(v.answers), { mouldSmell: 'some', eyeConditions: ['cataract', 'other'], ageBand: '40–49', sampling: 'BHS kit', samplingText: 'kit 1234' });
  const ctx = MV.setRunContext(run, { mouldSmell: 'substantial', treatment: 'yes', ageBand: '60–69' });
  assert.equal(ctx.version, 'context-v1'); assert.equal(ctx.answered, true);
  assert.ok(!MV.INTEGRITY_SCOPE.includes('context'), 'context is outside the integrity scope by design');
  // mutation test: changing answers leaves the scoring and the integrity hash identical
  for (const ans of [{}, { mouldSmell: 'none' }, { eyeConditions: ['glaucoma'], smoking: 'yes', alcohol24h: 'yes' }]) {
    MV.setRunContext(run, ans);
    assert.deepEqual(j(MV.scoreRun(run)), before);
    assert.equal((await MV.computeIntegrity(run)).hash, hash);
  }
  const stored = MV.storedRuns().find(r => r.id === run.id); assert.ok(stored && stored.context, 'stored copy carries the context');
  // scoring source never references the context
  const src = fs.readFileSync(path.join(__dirname, '..', 'src/app.js'), 'utf8');
  const scoring = src.slice(src.indexOf('function scoreEye'), src.indexOf('// ---------- Toxin-context module'));
  assert.ok(!/context/i.test(scoring), 'scoring code does not mention context');
});

test(tag('M08', 'report: context section after section 7 only for runs with a context block; "What you told us" only when answered; result labels still absent'), async () => {
  const MV = load();
  const plain = await runTest(MV, { mode: 'full', answerFn: ({ orient }) => orient });
  let T = MV.reportText(plain); assert.equal(T.s8, null); assert.deepEqual(j(T.told), []);
  const run = await runTest(load(), { mode: 'full', answerFn: observer({ A: 5, B: 5, C: 4, D: 3, E: 1 }) });
  MV.setRunContext(run, {}); T = MV.reportText(run);
  assert.ok(T.s8 && T.s8.startsWith('Why environmental toxin exposure matters')); assert.deepEqual(j(T.told), []); assert.equal(T.s8Heading, '8. Environmental context');
  MV.setRunContext(run, { waterDamage: 'yes', correction: 'none needed', ageBand: '30–39' }); T = MV.reportText(run);
  assert.equal(T.told.length, 3); assert.match(T.told[0], /^Water damage.*: yes$/);
  const words = ['POSITIVE', 'NEGATIVE', 'PASS', 'FAIL', 'CLEAR', 'FLAGGED', 'ABNORMAL', 'BIOTOXIN', 'MOULD', 'MYCOTOXIN', 'CIRS'];
  const body = [T.heading, T.banner, T.s1, T.s2, T.s4, T.s5, T.s6, T.ident, T.valid, ...T.told].join('\n');
  words.forEach(w => assert.ok(!new RegExp('\\b' + w + '\\b', 'i').test(body), 'found ' + w));
  assert.match(T.ident, /Context context-v1 /);
  // PDF builds with the section
  const blob = MV.buildPdf(run); assert.ok(blob.size > 20000);
  // phone geometry wording
  const g = run.geometry; g.pxPerCmSource = 'table-exact'; g.deviceModel = 'iPhone 15'; g.distanceSource = 'camera-iris-assumedFov'; g.distanceStdCm = 1.4; g.renderScale = 2; g.pxPerCycleAt18cpdRendered = 4.69; g.pxPerCycleAt18cpd = 2.34; run.device.devicePixelRatio = 3;
  T = MV.reportText(run);
  assert.match(T.s2, /device table \(iPhone 15/); assert.match(T.s2, /front camera from the apparent size of the iris, using an assumed camera focal length/); assert.match(T.s2, /±1\.4 cm/); assert.match(T.s2, /enlarged the drawn patch by 1\.50×/); assert.match(T.s2, /adequately sampled/);
  g.distanceSource = 'typed'; T = MV.reportText(run); assert.match(T.s2, /viewing distance entered as/);
  run.mobile = { display: { brightnessMaxConfirmed: true, nightShiftOffConfirmed: false, lighting: 'dim' } }; T = MV.reportText(run);
  assert.match(T.s2, /you confirmed that brightness was at maximum and did not confirm that colour filters were off, and reported dim light/);
});
