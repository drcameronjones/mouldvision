// D05–D06 (design release safeguard, approved 12 Oct 2026): the redesigned phone edition shows exactly the same test screen
// stimulus as rc10. Builds rc10 from its git tag in a temporary worktree, drives both builds through the same seeded trials
// under iPhone 13 emulation, and compares the screenshots of the grey field and the canvas pixel buffers byte for byte.
const { chromium, devices } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path'); const os = require('os'); const crypto = require('crypto'); const { execFileSync } = require('child_process');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const results = []; let failed = 0;
async function t(id, name, fn) { try { await fn(); results.push({ id, name, ok: true }); console.log('ok -', id, name); } catch (e) { failed++; results.push({ id, name, ok: false, error: String(e && e.stack || e) }); console.log('not ok -', id, name, '\n   ', String(e && e.message || e)); } }
const MIME = { html: 'text/html; charset=utf-8', js: 'application/javascript', mjs: 'application/javascript', css: 'text/css', png: 'image/png', wasm: 'application/wasm', woff2: 'font/woff2', ttf: 'font/ttf', webmanifest: 'application/manifest+json', json: 'application/json' };
function serve(dir) { return new Promise(res => { const srv = http.createServer((req, u) => { let p = req.url.split('?')[0].replace(/^\//, ''); if (p === '' || p.endsWith('/')) p += 'index.html'; const f = path.join(dir, p); fs.readFile(f, (e, d) => { if (e) { u.writeHead(404); return u.end(); } u.writeHead(200, { 'content-type': MIME[f.split('.').pop()] || 'application/octet-stream' }); u.end(d); }); }); srv.listen(0, () => res(srv)); }); }
function rc10Build() {
  const wt = path.join(os.tmpdir(), 'mouldvision-rc10');
  if (!fs.existsSync(path.join(wt, 'app', 'mobile', 'index.html'))) {
    if (!fs.existsSync(wt)) execFileSync('git', ['worktree', 'add', '--detach', wt, 'v0.8.0-rc10'], { cwd: root, stdio: 'ignore' });
    execFileSync('node', ['tools/build.js', 'mobile'], { cwd: wt, stdio: 'ignore' });
  }
  return path.join(wt, 'app', 'mobile');
}
const seedScript = () => { let s = 12345 >>> 0; Math.random = () => { s = (s + 0x6D2B79F5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  window.MV_BLANK_MS = 5; window.MV_NO_SW = true; try { localStorage.setItem('mv-ack-v1', JSON.stringify({ version: 'ack-v1-draft', acceptedAt: 'test' })); } catch (e) {} };

async function capture(browser, url, n) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'] }); await ctx.addInitScript(seedScript);
  const page = await ctx.newPage(); await page.goto(url);
  await page.click('#btnStart');
  await page.waitForFunction(() => !document.getElementById('btnHoldNext').disabled, null, { timeout: 15000 });
  await page.click('#btnHoldNext'); await page.click('#btnBegin');
  const out = [];
  for (let i = 0; i < n; i++) {
    await page.waitForFunction(() => window.MV.S.trial.state === 'ARMED');
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    const info = await page.evaluate(() => {
      const c = document.getElementById('stim'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let h = 0x811c9dc5; for (let k = 0; k < d.length; k++) { h ^= d[k]; h = Math.imul(h, 16777619) >>> 0; }
      const chain = []; for (let el = c; el && el !== document.documentElement; el = el.parentElement) { const cs = getComputedStyle(el); chain.push({ id: el.id || el.className, filter: cs.filter, opacity: cs.opacity, mix: cs.mixBlendMode, transform: cs.transform, animation: cs.animationName, backdrop: cs.backdropFilter || 'none' }); }
      const bg = el => getComputedStyle(document.querySelector(el)).backgroundColor;
      const r = c.getBoundingClientRect(); window.__rect = [r.x, r.y, r.width, r.height];
      return { rect: window.__rect, hash: h, w: c.width, h: c.height, cssW: r.width, cssH: r.height, chain, field: bg('#field'), screen: bg('#v-test'), t: { col: window.MV.S.col, row: window.MV.S.row, orient: window.MV.S.orient } };
    });
    // the swipe hint is an instruction label over the field (chrome, restyled by design); hide it in both builds for the field comparison
    await page.evaluate(() => { const h = document.getElementById('swipeHint'); if (h) h.style.visibility = 'hidden'; });
    const shot = await page.locator('#field').screenshot();
    await page.evaluate(() => { const h = document.getElementById('swipeHint'); if (h) h.style.visibility = ''; });
    const stim = await page.locator('#stim').screenshot();
    out.push({ ...info, fieldShot: crypto.createHash('sha256').update(shot).digest('hex'), stimShot: crypto.createHash('sha256').update(stim).digest('hex') });
    await page.evaluate(() => window.MV.submitAnswer('harness', 'up', null));
  }
  await ctx.close();
  return out;
}

(async () => {
  const oldDir = rc10Build(), newDir = path.join(root, 'app', 'mobile');
  const s1 = await serve(oldDir), s2 = await serve(newDir);
  const browser = await chromium.launch();
  let A, B;
  await t('D05', 'test screen: same seeded trials show byte-identical stimulus canvases and identical screenshots of the grey field in rc10 and the redesign', async () => {
    A = await capture(browser, `http://127.0.0.1:${s1.address().port}/`, 8);
    B = await capture(browser, `http://127.0.0.1:${s2.address().port}/test/`, 8);
    assert.equal(B.length, A.length);
    A.forEach((a, i) => {
      const b = B[i];
      assert.deepEqual(b.t, a.t, 'trial ' + i + ' parameters');
      assert.equal(b.hash, a.hash, 'canvas pixels, trial ' + i); assert.equal(b.w, a.w); assert.equal(b.cssW, a.cssW);
      assert.equal(b.stimShot, a.stimShot, 'on-screen stimulus, trial ' + i + ' rects ' + JSON.stringify([a.rect, b.rect]));
      assert.equal(b.fieldShot, a.fieldShot, 'on-screen grey field, trial ' + i);
    });
  });
  await t('D06', 'test screen: field and surround are rgb(128, 128, 128); no filter, opacity, blend, transform, backdrop or animation on the stimulus or its ancestors', async () => {
    for (const b of B) {
      assert.equal(b.field, 'rgb(128, 128, 128)'); assert.equal(b.screen, 'rgb(128, 128, 128)');
      for (const c of b.chain) { assert.equal(c.filter, 'none', c.id); assert.equal(c.opacity, '1', c.id); assert.equal(c.mix, 'normal', c.id); assert.equal(c.transform, 'none', c.id); assert.equal(c.animation, 'none', c.id); assert.equal(c.backdrop, 'none', c.id); }
    }
  });
  await browser.close(); s1.close(); s2.close();
  fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
  fs.writeFileSync(path.join(root, 'test-results', 'design-pixel.json'), JSON.stringify(results, null, 2));
  console.log(`\n# design pixel pass ${results.length - failed} fail ${failed}`);
  process.exit(failed ? 1 : 0);
})();
