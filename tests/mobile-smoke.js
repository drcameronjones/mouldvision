// Ad-hoc smoke run of the phone edition under iPhone emulation (no camera → typed distance path). Not part of the suite.
const { chromium, devices } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..');
const MIME = { html: 'text/html; charset=utf-8', js: 'application/javascript', css: 'text/css', png: 'image/png', webmanifest: 'application/manifest+json', json: 'application/json' };
function serve() { return new Promise(res => { const srv = http.createServer((req, u) => { let p = req.url.split('?')[0].replace(/^\//, ''); if (p === '' || p.endsWith('/')) p += 'index.html'; const f = path.join(root, 'app', 'mobile', p); fs.readFile(f, (e, d) => { if (e) { u.writeHead(404); return u.end(); } u.writeHead(200, { 'content-type': MIME[f.split('.').pop()] || 'application/octet-stream' }); u.end(d); }); }); srv.listen(0, () => res(srv)); }); }
(async () => {
  const srv = await serve(); const port = srv.address().port;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], acceptDownloads: true });
  await ctx.addInitScript(() => { window.MV_BLANK_MS = 5; });
  const jspdfUmd = fs.readFileSync(require.resolve('jspdf/dist/jspdf.umd.min.js'));
  await ctx.route('**/jspdf.umd.min.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: jspdfUmd }));
  await ctx.route(/fonts\.googleapis|cdn\.jsdelivr|storage\.googleapis/, r => r.abort());
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGE ERROR', e.message)); page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
  await page.goto(`http://127.0.0.1:${port}/`);
  console.log('density', await page.evaluate(() => window.MVM.devices.detect()));
  await page.click('#btnStart');
  await page.waitForFunction(() => !document.getElementById('camNotice').hidden || !document.getElementById('btnHoldNext').disabled, null, { timeout: 15000 });
  console.log('camNotice', await page.textContent('#camNotice'));
  console.log('dist', await page.textContent('#distLine'), '|', await page.textContent('#densityLine'), '|', await page.textContent('#geomWarn'));
  await page.screenshot({ path: path.join(root, 'test-results', 'm-hold.png') });
  await page.check('#chkBright'); await page.check('#chkNight'); await page.selectOption('#lighting', 'daylight');
  await page.click('#btnHoldNext');
  await page.screenshot({ path: path.join(root, 'test-results', 'm-cover.png') });
  await page.click('#btnBegin');
  await page.waitForFunction(() => window.MV.S.trial.state === 'ARMED');
  console.log('geometry', await page.evaluate(() => window.MV.S.run.geometry), 'sizePx', await page.evaluate(() => window.MV.S.trial.sizePx));
  await page.screenshot({ path: path.join(root, 'test-results', 'm-trial.png') });
  // swipe helper
  const swipe = async (angleDeg, len = 120) => {
    const box = await page.locator('#field').boundingBox(); const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const a = angleDeg * Math.PI / 180; const x2 = cx + len * Math.sin(a), y2 = cy - len * Math.cos(a);
    await page.evaluate(({ cx, cy, x2, y2 }) => { const f = document.getElementById('field'); f.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 3, pointerType: 'touch', clientX: cx, clientY: cy, isPrimary: true })); f.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 3, pointerType: 'touch', clientX: x2, clientY: y2, isPrimary: true })); }, { cx, cy, x2, y2 });
    await page.waitForFunction(() => window.MV.S.trial.state === 'ARMED' || window.MV.S.trial.state === 'IDLE');
  };
  const map = { left: -45, up: 0, right: 45 };
  for (let eye = 0; eye < 2; eye++) {
    for (let i = 0; i < 45; i++) {
      const st = await page.evaluate(() => ({ s: window.MV.S.trial.state, o: window.MV.S.orient, row: window.MV.S.row }));
      if (st.s !== 'ARMED') break;
      const correct = st.row < 5; await swipe(correct ? map[st.o] : map[st.o === 'left' ? 'right' : 'left']);
    }
    if (eye === 0) { await page.waitForSelector('#v-switch:not([hidden])'); await page.screenshot({ path: path.join(root, 'test-results', 'm-switch.png') }); await page.click('#btnLeft'); await page.click('#btnBegin'); await page.waitForFunction(() => window.MV.S.trial.state === 'ARMED'); }
  }
  await page.waitForSelector('#m-context:not([hidden])');
  await page.screenshot({ path: path.join(root, 'test-results', 'm-context.png'), fullPage: true });
  await page.check('[name="q-mouldSmell"][value="some"]'); await page.check('[name="q-eyeConditions"][value="none"]'); await page.check('[name="q-ageBand"][value="50–59"]'); await page.fill('[name="t-sampling"]', 'BHS 3590');
  await page.click('#btnCtxDone');
  await page.waitForSelector('#v-results:not([hidden])');
  const run = await page.evaluate(() => window.MV.S.run);
  console.log('status', run.status, 'trials', run.trials.length, 'ctx', run.context, 'swipeAngles', run.trials.slice(0, 3).map(t => [t.source, t.swipeAngle, t.distanceCm, t.distanceSource]));
  console.log('s2', (await page.evaluate(() => window.MV.reportText(window.MV.S.run).s2)).slice(0, 400));
  console.log('told', await page.evaluate(() => window.MV.reportText(window.MV.S.run).told));
  await page.screenshot({ path: path.join(root, 'test-results', 'm-results.png'), fullPage: true });
  const integ = await page.evaluate(async () => { const MV = window.MV; const r = MV.S.run; const h = await MV.computeIntegrity(r); return [h.hash, r.integrity.hash]; });
  console.log('integrity recomputed equals stored:', integ[0] === integ[1]);
  await browser.close(); srv.close();
})();
