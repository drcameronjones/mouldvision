// Capture phone-edition screens for the explainer PDF (iPhone 13 emulation, staging banner hidden for the captures).
const { chromium, devices } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..'); const out = process.argv[2] || path.join(root, 'docs/explainer-shots');
fs.mkdirSync(out, { recursive: true });
const MIME = { html: 'text/html; charset=utf-8', js: 'application/javascript', css: 'text/css', png: 'image/png', webmanifest: 'application/manifest+json' };
const srv = http.createServer((req, u) => { let p = req.url.split('?')[0].replace(/^\//, ''); if (p === '' || p.endsWith('/')) p += 'index.html'; fs.readFile(path.join(root, 'app/mobile', p), (e, d) => { if (e) { u.writeHead(404); return u.end(); } u.writeHead(200, { 'content-type': MIME[p.split('.').pop()] || 'application/octet-stream' }); u.end(d); }); }).listen(0);
(async () => {
  await new Promise(r => setTimeout(r, 200)); const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 3 });
  await ctx.addInitScript(() => { window.MV_NO_SW = true; });
  const jspdf = fs.readFileSync(require.resolve('jspdf/dist/jspdf.umd.min.js'));
  await ctx.route('**/jspdf.umd.min.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: jspdf }));
  await ctx.route(/fonts\.googleapis|cdn\.jsdelivr|storage\.googleapis/, r => r.abort());
  const page = await ctx.newPage();
  await page.goto(base);
  const hideBanner = () => page.evaluate(() => { const b = document.getElementById('stagingBanner'); if (b) b.hidden = true; document.getElementById('installCard').hidden = true; });
  await hideBanner();
  await page.screenshot({ path: path.join(out, 's1-start.png') });
  // hold screen with a simulated camera reading
  await page.click('#btnStart');
  await page.waitForFunction(() => !document.getElementById('camNotice').hidden, null, { timeout: 15000 });
  await page.evaluate(() => {
    document.getElementById('camNotice').hidden = true; document.getElementById('ring').className = 'ring ok'; document.getElementById('ringText').textContent = '41 cm — hold';
    document.getElementById('distLine').textContent = 'Distance 41 cm ± 0.6 · assumed camera focal length (±20 %)';
    document.getElementById('camwrap').style.background = 'radial-gradient(circle at 50% 42%, #c9a58a 0 22%, #6b4f3a 23% 40%, #2b2b2b 41%)';
    document.getElementById('btnHoldNext').disabled = false;
    document.getElementById('chkBright').checked = true; document.getElementById('chkNight').checked = true; document.getElementById('lighting').value = 'daylight';
  });
  await hideBanner();
  await page.screenshot({ path: path.join(out, 's2-hold.png') });
  await page.click('#btnHoldNext'); await hideBanner();
  await page.screenshot({ path: path.join(out, 's3-cover.png') });
  await page.click('#btnBegin'); await page.waitForFunction(() => window.MV.S.trial.state === 'ARMED');
  // force a visible mid-contrast patch for the capture (column B row 3, tilted left)
  await page.evaluate(() => { const MV = window.MV, S = MV.S; S.col = 1; S.row = 2; S.orient = 'left'; const stim = document.getElementById('stim'); MV.drawGrating(stim, MV.FREQS[1], MV.CONTRAST[2], 'left', S.ppd, S.trial.sizePx); document.getElementById('trialLabel').textContent = 'B3 · 3 cpd · 10.4% contrast · 12/45'; document.getElementById('prog').style.width = '26%'; document.getElementById('swipeHint').hidden = true; document.getElementById('liveDist').textContent = '41 cm'; });
  await page.screenshot({ path: path.join(out, 's4-trial.png') });
  // questionnaire and results from the fixture full run
  const fixture = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/run-full.json'), 'utf8'));
  await page.evaluate((run) => { const MV = window.MV; MV.S.run = run; MV.S.run.status = 'COMPLETE'; window.MVM.app.mscreen('v-results'); document.getElementById('m-context').hidden = false; window.scrollTo(0, 0); }, fixture);
  await page.evaluate(() => { document.querySelector('[name="q-mouldSmell"][value="some"]').checked = true; document.querySelector('[name="q-waterDamage"][value="yes"]').checked = true; document.querySelector('[name="q-correction"][value="yes"]').checked = true; });
  await page.screenshot({ path: path.join(out, 's5-context.png') });
  await page.evaluate(() => { document.getElementById('m-context').hidden = true; window.MV.setRunContext(window.MV.S.run, { mouldSmell: 'some', waterDamage: 'yes', correction: 'yes', nightDriving: 'some', ageBand: '50–59' }); window.MV.S.run.guidance = window.MV.guidanceForRun(window.MV.S.run, []); window.MVM.app.renderMobileResults(); document.getElementById('stagingBanner').hidden = true; window.scrollTo(0, 0); });
  await page.screenshot({ path: path.join(out, 's6-results.png') });
  await page.screenshot({ path: path.join(out, 's6-results-full.png'), fullPage: true });
  // isolated chart SVGs (both eyes) from the fixture, plus the report text, for the document
  const svgs = await page.evaluate(() => ({ guidance: window.MV.S.run.guidance, left: window.MV.chartSVG(window.MV.S.run, 'left'), right: window.MV.chartSVG(window.MV.S.run, 'right'), T: window.MV.reportText(window.MV.S.run), sc: window.MV.S.run.scoring }));
  fs.writeFileSync(path.join(out, 'charts.json'), JSON.stringify(svgs));
  await browser.close(); srv.close(); console.log('done', fs.readdirSync(out));
})();
