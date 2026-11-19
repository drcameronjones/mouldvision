// Prints the evidence guide (src/site/guide.html, as built into app/mobile) to samples/VCS-Evidence-Guide.pdf (A4).
// Run after `node tools/build.js mobile`; then build again so the PDF is copied into the site.
const fs = require('fs'); const path = require('path'); const http = require('http');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..'), site = path.join(root, 'app', 'mobile');
const MIME = { html: 'text/html; charset=utf-8', css: 'text/css', js: 'application/javascript', png: 'image/png', woff2: 'font/woff2' };
const srv = http.createServer((q, u) => { let p = q.url.split('?')[0].replace(/^\//, ''); if (!p || p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join(site, p), (e, d) => { if (e) { u.writeHead(404); return u.end(); } u.writeHead(200, { 'content-type': MIME[p.split('.').pop()] || 'application/octet-stream' }); u.end(d); }); });
srv.listen(0, async () => {
  const b = await chromium.launch(); const page = await b.newPage();
  await page.emulateMedia({ media: 'print', colorScheme: 'light' });
  await page.goto(`http://127.0.0.1:${srv.address().port}/guide.html`, { waitUntil: 'load' }); await page.evaluate(() => document.fonts.ready);
  const out = path.join(root, 'samples', 'VCS-Evidence-Guide.pdf');
  await page.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: '<div style="width:100%;font-family:sans-serif;font-size:7px;color:#55554f;padding:0 16mm;display:flex;justify-content:space-between"><span>Visual contrast sensitivity and the indoor mould exposome · Dr Cameron Jones, PhD · visualcontrastsensitivity.com</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>' });
  await b.close(); srv.close(); console.log('wrote', out, fs.statSync(out).size);
});
