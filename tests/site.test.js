// Information pages: W01 references are complete and every citation resolves; W02 links resolve and pages carry the scope statement.
const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('fs'); const path = require('path');
const src = f => fs.readFileSync(path.join(__dirname, '..', 'src/site', f), 'utf8');

test('W01 evidence page: every [n] citation has a reference and every reference is cited', () => {
  const html = src('evidence.html');
  const refs = (html.split('<ol class="refs-list">')[1].split('</ol>')[0].match(/<li>/g) || []).length;
  const body = html.split('<h2 id="refs">')[0];
  const cited = new Set();
  for (const m of body.matchAll(/\[(\d+(?:[–,]\s?\d+)*)\]/g)) m[1].split(/,\s?/).forEach(p => { const [a, b] = p.split('–').map(Number); for (let i = a; i <= (b || a); i++) cited.add(i); });
  assert.ok(refs >= 20, 'reference count ' + refs);
  for (const n of cited) assert.ok(n >= 1 && n <= refs, 'citation [' + n + '] has no reference');
  for (let i = 1; i <= refs; i++) assert.ok(cited.has(i), 'reference ' + i + ' is never cited');
});

test('W02 pages: internal links resolve to built files; scope statement present; no result labels used as claims', () => {
  for (const f of ['faq.html', 'evidence.html']) {
    const html = src(f);
    for (const m of html.matchAll(/href="([^"#:]+)(#[^"]*)?"/g)) {
      const target = m[1];
      if (target === './') continue;
      const ok = ['faq.html', 'evidence.html', 'styles.css', 'site.css', 'MouldVision-Method.pdf', 'vendor/fonts/fonts.css'].includes(target) || target.startsWith('icons/');
      assert.ok(ok, f + ' links to unknown ' + target);
    }
    assert.match(html, /does not diagnose any condition/);
    assert.match(html, /not a substitute for an eye examination/);
    assert.ok(!/\b(you have|diagnosed with) (mould|mold|CIRS|biotoxin)/i.test(html));
  }
  const build = fs.readFileSync(path.join(__dirname, '..', 'tools/build.js'), 'utf8');
  for (const f of ['faq.html', 'evidence.html', 'site.css']) assert.ok(build.includes('src/site/' + f), 'build copies ' + f);
  const sw = fs.readFileSync(path.join(__dirname, '..', 'src/mobile/sw.js'), 'utf8');
  for (const f of ['faq.html', 'evidence.html', 'site.css']) assert.ok(sw.includes("'" + f + "'"), 'service worker caches ' + f);
});

test('W03 phone edition and pages load nothing from third-party origins; vendored files match VENDOR.md checksums', () => {
  const crypto = require('crypto');
  const root = path.join(__dirname, '..');
  for (const f of ['src/mobile/index.html', 'src/site/faq.html', 'src/site/evidence.html']) {
    const html = fs.readFileSync(path.join(root, f), 'utf8');
    for (const m of html.matchAll(/<(?:script|link)[^>]+(?:src|href)="(https?:[^"]+)"/g)) assert.fail(f + ' loads ' + m[1]);
  }
  const dist = fs.readFileSync(path.join(root, 'src/mobile/distance.js'), 'utf8');
  assert.ok(!/https?:\/\//.test(dist.split('// ---------- Browser sensor')[1].split('class DistanceSensor')[0]), 'model and wasm URLs are same-origin');
  const md = fs.readFileSync(path.join(root, 'src/mobile/vendor/VENDOR.md'), 'utf8');
  const lines = [...md.matchAll(/^([0-9a-f]{64})  \.\/(.+)$/gm)];
  assert.ok(lines.length >= 13);
  for (const [, h, f] of lines) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'src/mobile/vendor', f))).digest('hex'), h, f);
});
