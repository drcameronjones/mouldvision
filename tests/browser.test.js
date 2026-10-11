// Browser tests T01–T04, T13, T15, T17, T19, T26 and safeguard 3, in headless Chromium via Playwright.
// Serves the built single-file pages (app/staging.html, app/index.html) from a local static server.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..');
const results = []; let failed = 0;
async function t(id, name, fn) { try { await fn(); results.push({ id, name, ok: true }); console.log('ok -', id, name); } catch (e) { failed++; results.push({ id, name, ok: false, error: String(e && e.stack || e) }); console.log('not ok -', id, name, '\n   ', String(e && e.message || e)); } }
const assert = require('node:assert/strict');

function serve() {
  return new Promise(res => { const srv = http.createServer((req, u) => { const f = path.join(root, 'app', req.url === '/' ? 'staging.html' : req.url.split('?')[0].replace(/^\//, '')); fs.readFile(f, (e, d) => { if (e) { u.writeHead(404); return u.end(); } u.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); u.end(d); }); }); srv.listen(0, () => res(srv)); });
}
// Wrap the published page body in a full document for local serving (the artefact skeleton does this at publish)
function wrapped(file) { const body = fs.readFileSync(path.join(root, 'app', file), 'utf8'); return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' + body + '</body></html>'; }

(async () => {
  fs.writeFileSync(path.join(root, 'app', '_staging_test.html'), wrapped('staging.html'));
  fs.writeFileSync(path.join(root, 'app', '_live_test.html'), wrapped('index.html'));
  const srv = await serve(); const port = srv.address().port; const url = f => `http://127.0.0.1:${port}/${f}`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, acceptDownloads: true });
  await ctx.addInitScript(() => { window.MV_BLANK_MS = 5; });
  // the sandbox cannot reach cdnjs; serve the same pinned jsPDF build from node_modules
  const jspdfUmd = fs.readFileSync(require.resolve('jspdf/dist/jspdf.umd.min.js'));
  await ctx.route('**/jspdf.umd.min.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: jspdfUmd }));   // short inter-stimulus blank for speed; T04 uses a context with the 250 ms default
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await page.goto(url('_staging_test.html'));
  assert.equal(await page.evaluate(() => window.MV.BLANK_MS), 5);
  const start = async (mode = 'full') => {
    await page.click('#btnStart'); await page.fill('#dist', '50'); await page.selectOption('#mode', mode); await page.click('#btnToInstr'); await page.click('#btnBegin');
    await page.waitForFunction(() => window.MV.S.trial.state === 'ARMED');
  };
  const state = () => page.evaluate(() => ({ st: window.MV.S.trial.state, n: window.MV.S.run ? window.MV.S.run.trials.length : -1, seq: window.MV.S.seqIdx, disc: window.MV.S.trial.discarded, status: window.MV.S.run && window.MV.S.run.status }));
  const settle = () => page.waitForFunction(() => window.MV.S.trial.state === 'ARMED' || window.MV.S.trial.state === 'IDLE');

  await t('T01', 'two pointerup events within 100 ms record one trial', async () => {
    await start('full');
    const before = await state();
    const mid = await page.evaluate(() => { const b = document.querySelector('[data-ans="left"]'); const ev = () => new PointerEvent('pointerup', { bubbles: true, pointerId: 1, pointerType: 'mouse' }); b.dispatchEvent(ev()); b.dispatchEvent(ev()); const MV = window.MV; return { st: MV.S.trial.state, n: MV.S.run.trials.length, seq: MV.S.seqIdx, disabled: document.querySelector('[data-ans="up"]').disabled }; });
    assert.equal(mid.n, before.n + 1); assert.equal(mid.seq, before.seq + 1); assert.notEqual(mid.st, 'ARMED'); assert.equal(mid.disabled, true);
    await settle(); const after = await state(); assert.equal(after.n, before.n + 1);
  });
  await t('T02', 'ArrowLeft then ArrowRight within 100 ms, and held key repeats, record one trial', async () => {
    const before = await state();
    await page.evaluate(() => { for (const key of ['ArrowLeft', 'ArrowRight']) document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); });   // both inside one task: well within 100 ms (two keyboard.press calls can straddle the 5 ms test blank)
    await settle(); let s = await state(); assert.equal(s.n, before.n + 1);
    await page.evaluate(() => { for (let i = 0; i < 5; i++) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', repeat: i > 0, bubbles: true })); });
    await settle(); s = await state(); assert.equal(s.n, before.n + 2);
  });
  await t('T03', 'touch tap and mouse click from different pointers within 50 ms record one trial', async () => {
    const before = await state();
    await page.evaluate(() => { const l = document.querySelector('[data-ans="left"]'), r = document.querySelector('[data-ans="right"]'); l.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7, pointerType: 'touch' })); r.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, pointerType: 'mouse' })); });
    await settle(); const s = await state(); assert.equal(s.n, before.n + 1);
    const last = await page.evaluate(() => window.MV.S.run.trials.at(-1)); assert.equal(last.source, 'touch'); assert.equal(last.answer, 'left');
  });
  await t('T04', 'inputs during LOCKED/BLANK are ignored (default 250 ms blank)', async () => {
    const slow = await browser.newContext({ viewport: { width: 1200, height: 900 } }); const p2 = await slow.newPage();
    await p2.goto(url('_staging_test.html?blank=1'));
    assert.equal(await p2.evaluate(() => window.MV.BLANK_MS), 250);
    await p2.click('#btnStart'); await p2.fill('#dist', '50'); await p2.click('#btnToInstr'); await p2.click('#btnBegin');
    await p2.waitForFunction(() => window.MV.S.trial.state === 'ARMED');
    const before = await p2.evaluate(() => window.MV.S.run.trials.length);
    await p2.evaluate(() => { const b = document.querySelector('[data-ans="up"]'); b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 })); });
    const st = await p2.evaluate(() => window.MV.S.trial.state); assert.ok(st === 'LOCKED' || st === 'BLANK', st);
    await p2.evaluate(() => { for (const a of ['left', 'right', 'up']) document.querySelector(`[data-ans="${a}"]`).dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 2 })); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); });
    await p2.waitForFunction(() => window.MV.S.trial.state === 'ARMED');
    const after = await p2.evaluate(() => ({ n: window.MV.S.run.trials.length, disc: window.MV.S.trial.discarded }));
    assert.equal(after.n, before + 1); assert.ok(after.disc >= 4, 'discarded ' + after.disc);
    await slow.close();
  });

  const runFull = async (mode = 'full') => {
    await start(mode);
    await page.evaluate(async (mode) => {
      const MV = window.MV;
      for (const eye of ['right', 'left']) {
        if (eye === 'left') { await new Promise(r => setTimeout(r, 50)); document.getElementById('btnLeft').click(); await new Promise(r => setTimeout(r, 50)); }
        while (MV.S.trial.state === 'ARMED') { MV.submitAnswer('harness', MV.S.row < 5 ? MV.S.orient : 'up', null); await new Promise(r => setTimeout(r, 25)); }
      }
      await MV.finaliseRun();
    }, mode);
    await page.waitForSelector('#v-results:not([hidden])');
  };

  await t('T19', 'zoom/DPR change during a run is recorded and reported', async () => {
    await page.goto(url('_staging_test.html?z=1')); await start('full');
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 2, mobile: false });
    await page.evaluate(async () => { const MV = window.MV; MV.submitAnswer('harness', MV.S.orient, null); await new Promise(r => setTimeout(r, 40)); });
    const z = await page.evaluate(() => window.MV.S.run.device.zoomChangedDuringRun); assert.equal(z, true);
    await cdp.send('Emulation.clearDeviceMetricsOverride');
  });

  await t('T26', 'staging isolation: build target, banner, separate storage keys, live build reads neither', async () => {
    await page.goto(url('_staging_test.html?s=1'));
    assert.equal(await page.evaluate(() => window.MV.BUILD_TARGET), 'staging');
    assert.equal(await page.$eval('#stagingBanner', e => e.hidden), false);
    assert.equal(await page.evaluate(() => window.MV.STORE_KEY), 'mv-staging-runs-v1');
    await runFull('full');
    const keys = await page.evaluate(() => Object.keys(localStorage)); assert.ok(keys.includes('mv-staging-runs-v1')); assert.ok(!keys.includes('mv-runs-v1'));
    await page.goto(url('_live_test.html'));
    assert.equal(await page.evaluate(() => window.MV.BUILD_TARGET), 'live'); assert.equal(await page.$eval('#stagingBanner', e => e.hidden), true);
    assert.equal(await page.evaluate(() => window.MV.storedRuns().length), 0, 'live build sees no staging records');
    const liveV = JSON.parse(fs.readFileSync(path.join(root, 'app', 'live-artifact.json'), 'utf8')); assert.ok(liveV.version && liveV.url, 'live artefact pin recorded');
  });

  await t('T17b', 'storage limit in the browser: 100 records → run ends COMPLETE_UNSAVED, prominent notice, export-all offered, nothing deleted', async () => {
    await page.goto(url('_staging_test.html?l=1'));
    await page.evaluate(() => { const fake = Array.from({ length: 100 }, (_, i) => ({ id: 'f' + i, status: 'COMPLETE', startedAt: new Date().toISOString(), versions: { software: 'v0.7.0', protocol: 'full-5x9-v1' }, geometry: { distanceCm: 50, pxPerCm: 44.5 }, device: { devicePixelRatio: 1 }, scoring: { right: { correct: 1, presented: 1 }, left: { correct: 1, presented: 1 } } })); localStorage.setItem('mv-staging-runs-v1', JSON.stringify(fake)); });
    await page.goto(url('_staging_test.html?l=2'));
    await runFull('full');
    const status = await page.evaluate(() => window.MV.S.run.status); assert.equal(status, 'COMPLETE_UNSAVED');
    assert.equal(await page.$eval('#unsavedNotice', e => e.textContent.includes('has not been saved') && e.textContent.includes('Closing or reloading this page may lose it')), true);
    assert.ok(await page.$('#btnExportNow'));
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('mv-staging-runs-v1')).length), 100);
    await page.click('#v-results [data-go="home"]'); await page.click('#btnHistory');
    assert.equal(await page.$eval('#btnExportAll', e => e.hidden), false);
    await page.evaluate(() => localStorage.removeItem('mv-staging-runs-v1'));
  });

  await t('T13b+S3', 'storage disabled: COMPLETE_UNSAVED with immediate export and beforeunload warning', async () => {
    await page.goto(url('_staging_test.html?q=1'));
    await page.evaluate(() => { const o = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'mv-staging-runs-v1') { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; } return o.call(this, k, v); }; });
    await runFull('full');
    assert.equal(await page.evaluate(() => window.MV.S.run.status), 'COMPLETE_UNSAVED');
    assert.equal(await page.$eval('#unsavedNotice', e => e.getAttribute('role')), 'alert');
    // export now: intercept download
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnExportNow')]);
    assert.match(dl.suggestedFilename(), /^mouldvision-run-.*\.json$/);
    const txt = fs.readFileSync(await dl.path(), 'utf8'); const rec = JSON.parse(txt); assert.equal(rec.status, 'COMPLETE_UNSAVED'); assert.equal(rec.trials.length, 90);
    const blocks = await page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; }); assert.equal(blocks, true);
  });

  await t('T15b', 'interrupted run: reload mid-test shows banner; export is INCOMPLETE; discard clears; no report path', async () => {
    await page.goto(url('_staging_test.html?i=1')); await start('full');
    await page.evaluate(async () => { const MV = window.MV; for (let i = 0; i < 12; i++) { MV.submitAnswer('harness', MV.S.orient, null); await new Promise(r => setTimeout(r, 25)); } });
    await page.goto(url('_staging_test.html?i=2'));
    assert.equal(await page.$eval('#draftBanner', e => e.hidden), false);
    assert.match(await page.$eval('#draftBanner', e => e.textContent), /interrupted test/i);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnDraftExport')]);
    const rec = JSON.parse(fs.readFileSync(await dl.path(), 'utf8')); assert.equal(rec.status, 'INCOMPLETE'); assert.equal(rec.trials.length, 12); assert.equal(rec.scoring, null);
    await page.click('#btnDraftDiscard'); assert.equal(await page.$eval('#draftBanner', e => e.hidden), true);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('mv-staging-draft')), null);
  });

  await t('T18b', 'legacy vcs-history byte-identical after a run; shown read-only', async () => {
    await page.goto(url('_staging_test.html?h=1'));
    const legacy = JSON.stringify([{ t: '2026-10-08T07:00:00Z', total: 82, bio: 35, R: [200, 200, 44, 44, 200], L: [73, 73, 73, 73, 73], overall: 'POSITIVE' }]);
    await page.evaluate(l => localStorage.setItem('vcs-history', l), legacy);
    await runFull('quick');
    assert.equal(await page.evaluate(() => localStorage.getItem('vcs-history')), legacy);
    await page.click('#v-results [data-go="home"]'); await page.click('#btnHistory');
    assert.match(await page.$eval('#histTable', e => e.textContent), /Legacy \(v0\.6\.0/);
    assert.match(await page.$eval('#histTable', e => e.textContent), /quick-2miss-v1/);
  });

  await t('T24b', 'results view: heading, no forbidden labels, PDF download works', async () => {
    await page.goto(url('_staging_test.html?r=1')); await runFull('quick');
    const text = await page.$eval('#v-results', e => e.textContent);
    assert.match(text, /Visual contrast test results/);
    ['POSITIVE', 'NEGATIVE', 'BIOTOXIN', 'FLAGGED', 'CLEAR'].forEach(w => assert.ok(!text.includes(w), w));
    assert.match(text, /quick protocol stops a column/);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnPdf')]);
    assert.match(dl.suggestedFilename(), /^MouldVision-report-.*\.pdf$/);
    const buf = fs.readFileSync(await dl.path()); assert.equal(buf.slice(0, 4).toString(), '%PDF');
  });

  await browser.close(); srv.close();
  fs.unlinkSync(path.join(root, 'app', '_staging_test.html')); fs.unlinkSync(path.join(root, 'app', '_live_test.html'));
  fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
  fs.writeFileSync(path.join(root, 'test-results', 'browser.json'), JSON.stringify(results, null, 2));
  console.log(`\n# browser pass ${results.length - failed} fail ${failed}`);
  process.exit(failed ? 1 : 0);
})();
