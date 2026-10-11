// Phase 1 browser tests M02, M04, M09, M12 and M13 (integrity of a swiped run), headless Chromium under iPhone 13 emulation.
// Serves the built phone folder app/mobile/. The sandbox has no camera, so the typed-distance path is exercised; the camera
// path itself is checked by hand on a phone (acceptance item in the Phase 1 specification).
const { chromium, devices } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..');
const results = []; let failed = 0;
async function t(id, name, fn) { try { await fn(); results.push({ id, name, ok: true }); console.log('ok -', id, name); } catch (e) { failed++; results.push({ id, name, ok: false, error: String(e && e.stack || e) }); console.log('not ok -', id, name, '\n   ', String(e && e.message || e)); } }
const assert = require('node:assert/strict');
const MIME = { html: 'text/html; charset=utf-8', js: 'application/javascript', css: 'text/css', png: 'image/png', webmanifest: 'application/manifest+json', json: 'application/json' };
function serve() { return new Promise(res => { const srv = http.createServer((req, u) => { let p = req.url.split('?')[0].replace(/^\//, ''); if (p === '' || p.endsWith('/')) p += 'index.html'; const f = path.join(root, 'app', 'mobile', p); fs.readFile(f, (e, d) => { if (e) { u.writeHead(404); return u.end(); } u.writeHead(200, { 'content-type': MIME[f.split('.').pop()] || 'application/octet-stream' }); u.end(d); }); }); srv.listen(0, () => res(srv)); }); }

(async () => {
  const srv = await serve(); const port = srv.address().port; const base = `http://127.0.0.1:${port}/`;
  const browser = await chromium.launch();
  const jspdfUmd = fs.readFileSync(require.resolve('jspdf/dist/jspdf.umd.min.js'));
  const newCtx = async (opts = {}) => { const ctx = await browser.newContext({ ...devices['iPhone 13'], acceptDownloads: true, ...opts }); await ctx.addInitScript(() => { window.MV_BLANK_MS = 5; window.MV_NO_SW = true; try { Object.defineProperty(navigator, 'canShare', { value: undefined }); } catch (e) {} }); /* headless has no share sheet; the download path is exercised */ await ctx.route('**/jspdf.umd.min.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: jspdfUmd })); await ctx.route(/fonts\.googleapis|cdn\.jsdelivr|storage\.googleapis/, r => r.abort()); return ctx; };
  const ctx = await newCtx(); const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const toTrial = async (mode = 'full') => {
    await page.goto(base); if (mode === 'quick') await page.check('[name="mode"][value="quick"]');
    await page.click('#btnStart');
    await page.waitForFunction(() => !document.getElementById('btnHoldNext').disabled, null, { timeout: 15000 });
    await page.click('#btnHoldNext'); await page.click('#btnBegin');
    await page.waitForFunction(() => window.MV.S.trial.state === 'ARMED');
  };
  const swipe = async (angleDeg, len = 120, id = 3) => {
    const box = await page.locator('#field').boundingBox(); const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const a = angleDeg * Math.PI / 180; const x2 = cx + len * Math.sin(a), y2 = cy - len * Math.cos(a);
    await page.evaluate(({ cx, cy, x2, y2, id }) => { const f = document.getElementById('field'); const ev = (type, x, y) => new PointerEvent(type, { bubbles: true, pointerId: id, pointerType: 'touch', clientX: x, clientY: y, isPrimary: true }); f.dispatchEvent(ev('pointerdown', cx, cy)); f.dispatchEvent(ev('pointerup', x2, y2)); }, { cx, cy, x2, y2, id });
  };
  const settle = () => page.waitForFunction(() => window.MV.S.trial.state === 'ARMED' || window.MV.S.trial.state === 'IDLE');
  const state = () => page.evaluate(() => ({ st: window.MV.S.trial.state, n: window.MV.S.run.trials.length, last: window.MV.S.run.trials.at(-1) }));

  await t('M02', 'swipe recognition: −45/0/+45 and ±14° map to left/up/up/right; 20 px swipe ignored; two swipes in the blank record one trial', async () => {
    await toTrial('full');
    const expect = [[-45, 'left'], [0, 'up'], [14, 'up'], [-14, 'up'], [45, 'right']];
    for (const [ang, val] of expect) { const b = await state(); await swipe(ang); await settle(); const s = await state(); assert.equal(s.n, b.n + 1, 'one trial per swipe'); assert.equal(s.last.answer, val, `${ang}° → ${val}`); assert.equal(s.last.source, 'swipe'); assert.ok(Math.abs(s.last.swipeAngle - ang) < 1.5); }
    const b = await state(); await swipe(0, 20); await new Promise(r => setTimeout(r, 30)); let s = await state(); assert.equal(s.n, b.n, 'short swipe ignored'); assert.equal(s.st, 'ARMED');
    // two swipes back to back: the second lands in LOCKED/BLANK and is discarded (lifecycle unchanged)
    const disc = await page.evaluate(() => window.MV.S.trial.discarded);
    await page.evaluate(() => { const f = document.getElementById('field'); const box = f.getBoundingClientRect(); const cx = box.left + box.width / 2, cy = box.top + box.height / 2; const ev = (type, id, x, y) => new PointerEvent(type, { bubbles: true, pointerId: id, pointerType: 'touch', clientX: x, clientY: y, isPrimary: true }); f.dispatchEvent(ev('pointerdown', 3, cx, cy)); f.dispatchEvent(ev('pointerup', 3, cx - 85, cy - 85)); f.dispatchEvent(ev('pointerdown', 4, cx, cy)); f.dispatchEvent(ev('pointerup', 4, cx + 85, cy - 85)); });
    await settle(); s = await state(); assert.equal(s.n, b.n + 1); assert.equal(s.last.answer, 'left'); assert.equal(await page.evaluate(() => window.MV.S.trial.discarded), disc + 1);
    // downward swipe is not an answer
    const b2 = await state(); await swipe(180); await new Promise(r => setTimeout(r, 30)); assert.equal((await state()).n, b2.n);
    assert.deepEqual(errors, []);
  });

  await t('M04', 'camera refused: typed distance path, distanceSource typed, section 2 says entered', async () => {
    await page.goto(base); await page.click('#btnStart');
    await page.waitForFunction(() => !document.getElementById('camNotice').hidden, null, { timeout: 15000 });
    assert.match(await page.textContent('#camNotice'), /camera could not be used/);
    await page.evaluate(() => document.querySelectorAll('#m-hold details').forEach(d => { d.open = true; })); await page.fill('#typedDist', '45'); await page.click('#btnUseTyped');
    assert.match(await page.textContent('#distLine'), /Typed distance 45 cm/);
    await page.click('#btnHoldNext'); await page.click('#btnBegin'); await page.waitForFunction(() => window.MV.S.trial.state === 'ARMED');
    const g = await page.evaluate(() => window.MV.S.run.geometry);
    assert.equal(g.distanceSource, 'typed'); assert.equal(g.distanceCm, 45); assert.equal(g.pxPerCmSource, 'table-exact'); assert.equal(g.renderScale, 2);
    await swipe(0); await settle();
    const tr = await page.evaluate(() => window.MV.S.run.trials[0]); assert.equal(tr.distanceSource, 'typed'); assert.equal(tr.distanceCm, 45); assert.equal(tr.sizedForCm, 45);
    const s2 = await page.evaluate(() => { const r = JSON.parse(JSON.stringify(window.MV.S.run)); r.scoring = window.MV.scoreRun(r); return window.MV.reportText(r).s2; });
    assert.match(s2, /viewing distance entered as 45 cm/);
  });

  await t('M12', 'trial screen has no white element; patch is 5° at the recorded distance within 2 %', async () => {
    await toTrial('full');
    const check = await page.evaluate(() => {
      const vw = innerWidth, vh = innerHeight; const bright = [];
      document.querySelectorAll('#v-test, #v-test *').forEach(el => { const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > vh) return; const cs = getComputedStyle(el); const bg = cs.backgroundColor; const m = bg.match(/rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/); if (m && +(m[4] ?? 1) > 0.05 && (+m[1] + +m[2] + +m[3]) / 3 > 200) bright.push(el.id || el.className); });
      const banner = document.getElementById('stagingBanner'); const bannerShown = banner && !banner.hidden;
      const body = getComputedStyle(document.body).backgroundColor;
      const stim = document.getElementById('stim'); const r = stim.getBoundingClientRect();
      return { bright, bannerShown, body, sizeCss: r.width, sizePx: window.MV.S.trial.sizePx, ppd: window.MV.S.ppd };
    });
    assert.deepEqual(check.bright, []); assert.equal(check.bannerShown, false);
    assert.ok(Math.abs(check.sizeCss - check.ppd * 5) / (check.ppd * 5) < 0.02, `patch ${check.sizeCss}px vs 5° = ${check.ppd * 5}px`);
    assert.equal(check.sizePx, Math.round(check.ppd * 5));
  });

  await t('M13', 'a complete swiped quick run: questionnaire stored outside the hash, integrity recomputes, PDF and JSON export, record saved', async () => {
    await toTrial('quick');
    const map = { left: -45, up: 0, right: 45 };
    for (let eye = 0; eye < 2; eye++) {
      for (let i = 0; i < 45; i++) { const st = await page.evaluate(() => ({ s: window.MV.S.trial.state, o: window.MV.S.orient, row: window.MV.S.row })); if (st.s !== 'ARMED') break; await swipe(st.row < 4 ? map[st.o] : map[st.o === 'left' ? 'right' : 'left']); await settle(); }
      if (eye === 0) { await page.waitForSelector('#v-switch:not([hidden])'); await page.click('#btnLeft'); await page.click('#btnBegin'); await page.waitForFunction(() => window.MV.S.trial.state === 'ARMED'); }
    }
    await page.waitForSelector('#m-context:not([hidden])');
    assert.equal(await page.evaluate(() => window.MV.S.run.status), 'COMPLETE');
    const hashBefore = await page.evaluate(() => window.MV.S.run.integrity.hash);
    await page.check('[name="q-waterDamage"][value="yes"]'); await page.check('[name="q-ageBand"][value="40–49"]'); await page.click('#btnCtxDone');
    await page.waitForSelector('#v-results:not([hidden])');
    const r = await page.evaluate(async () => { const MV = window.MV, run = MV.S.run; const h = await MV.computeIntegrity(run); const stored = MV.storedRuns().find(x => x.id === run.id); return { status: run.status, hash: run.integrity.hash, recomputed: h.hash, ctx: run.context, storedCtx: stored && stored.context, notPresented: run.scoring.right.notPresented + run.scoring.left.notPresented, swipes: run.trials.filter(t => t.presented).every(t => t.source === 'swipe' && typeof t.swipeAngle === 'number'), text: document.getElementById('v-results').textContent }; });
    assert.equal(r.hash, hashBefore); assert.equal(r.recomputed, r.hash); assert.equal(r.ctx.answered, true); assert.deepEqual(r.storedCtx.answers, { waterDamage: 'yes', ageBand: '40–49' }); assert.ok(r.notPresented > 0); assert.equal(r.swipes, true);
    assert.match(r.text, /8\. Environmental context/); assert.ok(/Nothing in this result calls for action|Repeat to confirm|Worth an eye check/.test(r.text), 'guidance card shown'); assert.match(r.text, /What you told us/); assert.match(r.text, /Water damage.*: yes/);
    ['POSITIVE', 'NEGATIVE', 'FLAGGED'].forEach(w => assert.ok(!r.text.includes(w)));
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnPdf')]); assert.match(dl.suggestedFilename(), /\.pdf$/); assert.equal(fs.readFileSync(await dl.path()).slice(0, 4).toString(), '%PDF');
    const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#btnExport')]); const rec = JSON.parse(fs.readFileSync(await dl2.path(), 'utf8')); assert.equal(rec.context.answers.ageBand, '40–49'); assert.equal(rec.mobile.frontEnd, 'phone-pwa-v1');
    assert.deepEqual(errors, []);
  });

  // M09 runs last: once the service worker is registered it answers fetches itself, bypassing the test routes
  await t('M09', 'manifest valid and service worker registers and caches the shell', async () => {
    const man = await (await page.goto(base + 'manifest.webmanifest')).json();
    assert.equal(man.display, 'standalone'); assert.equal(man.orientation, 'portrait'); assert.ok(man.icons.length >= 2); assert.equal(man.start_url, './');
    for (const f of ['icons/icon-192.png', 'icons/icon-512.png', 'sw.js', 'build-info.js', 'app.js', 'mobile.js']) { const r = await page.goto(base + f); assert.equal(r.status(), 200, f); }
    const sw = await (await page.goto(base + 'sw.js')).text(); assert.ok(!sw.includes('__MV_BUILD_ID__'), 'build id injected'); assert.match(sw, /const BUILD = '[0-9a-f]{16}-staging'/);
    await page.goto(base);
    const reg = await page.evaluate(async () => { const r = await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready; await new Promise(res => setTimeout(res, 800)); const keys = await caches.keys(); const c = await caches.open(keys.find(k => k.startsWith('mv-shell-'))); const cached = await c.keys(); return { scope: r.scope, keys, cached: cached.map(x => x.url.replace(location.origin + '/', '')) }; });
    assert.ok(reg.keys.some(k => k.startsWith('mv-shell-'))); ['index.html', 'app.js', 'mobile.js', 'styles.css', 'mobile.css', 'manifest.webmanifest', 'icons/icon-192.png'].forEach(f => assert.ok(reg.cached.includes(f), 'cached ' + f));
  });

  await browser.close(); srv.close();
  fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
  fs.writeFileSync(path.join(root, 'test-results', 'mobile-browser.json'), JSON.stringify(results, null, 2));
  console.log(`\n# mobile browser pass ${results.length - failed} fail ${failed}`);
  process.exit(failed ? 1 : 0);
})();
