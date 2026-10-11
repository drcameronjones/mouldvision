// Builds single-file pages from src/: app/index.html (live) and app/staging.html (staging).
// The software-verification status is injected ONLY from tests/results.json and only when every test passed;
// otherwise the page records "not_run" or "failed" (safeguard 1).
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const html = read('src/index.html'), css = read('src/styles.css'), js = read('src/app.js');
const logo = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'assets/bhs-logo.png')).toString('base64');
const { sourceHash, gitCommit } = require('./source-hash');
const currentHash = sourceHash(); const git = gitCommit();
let validation = null; let reason = 'no test results';
try {
  const r = JSON.parse(read('tests/results.json'));
  const pkgVersion = JSON.parse(read('package.json')).version;
  if (r.version !== pkgVersion) reason = 'results are for version ' + r.version;
  else if (r.sourceHash !== currentHash) reason = 'source changed since tests ran (' + String(r.sourceHash).slice(0, 12) + ' vs ' + currentHash.slice(0, 12) + ')';
  else if (r.sourceChangedDuringRun) reason = 'source changed during the test run';
  else validation = { software: { status: r.failed === 0 && r.passed > 0 ? 'passed' : 'failed', suite: r.suite, version: r.version, runAt: r.runAt, passed: r.passed, total: r.passed + r.failed, sourceHash: r.sourceHash, gitCommit: r.gitCommit } };
} catch (e) { reason = 'no test results'; }
const buildInfo = { sourceHash: currentHash, gitCommit: git.commit, gitDirty: git.dirty, builtAt: new Date().toISOString(), verificationReason: validation ? null : reason };

function build(target) {
  let out = html;
  out = out.replace(/<!doctype html>\s*<html[^>]*>\s*<head>[\s\S]*?<\/head>\s*<body>/i, '');   // artefact skeleton is added at publish
  out = out.replace(/<\/body>\s*<\/html>\s*$/i, '');
  out = out.replace('<link rel="stylesheet" href="styles.css">', '<style>\n' + css + '\n</style>');
  out = out.replace('src="../assets/bhs-logo.png"', 'src="' + logo + '"');
  const inject = `<script>window.MV_BUILD_TARGET=${JSON.stringify(target)};window.MV_VALIDATION=${JSON.stringify(validation)};window.MV_BUILD=${JSON.stringify(buildInfo)};</script>\n`;
  out = out.replace('<script src="app.js"></script>', inject + '<script>\n' + js + '\n</script>');
  const title = target === 'staging' ? '<title>VCS Screen (staging)</title>' : '<title>VCS Screen</title>';
  out = out.replace('<title>VCS Screen</title>', title);
  // keep the font link (it was in <head> of the split build)
  if (!/fonts\.googleapis/.test(out)) out = title + '\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=Manrope:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">\n' + out.replace(title, '');
  const file = target === 'staging' ? 'app/staging.html' : 'app/index.html';
  fs.writeFileSync(path.join(root, file), out.trim() + '\n');
  return file;
}
// Phase 1: the phone edition is a folder of files (service worker needs separate URLs), built into app/mobile/.
// `mobile` builds with target 'staging' (test copy, banner on); `mobile-live` with target 'live'. Nothing here touches app/index.html.
function buildMobile(target) {
  const outDir = path.join(root, 'app', 'mobile');
  fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(path.join(outDir, 'icons'), { recursive: true });
  const copy = (from, to) => fs.copyFileSync(path.join(root, from), path.join(outDir, to || path.basename(from)));
  ['src/mobile/index.html', 'src/mobile/mobile.css', 'src/mobile/mobile.js', 'src/mobile/devices.js', 'src/mobile/distance.js', 'src/mobile/manifest.webmanifest', 'src/styles.css', 'src/app.js', 'assets/bhs-logo.png'].forEach(f => copy(f));
  ['icon-192.png', 'icon-512.png'].forEach(f => copy('src/mobile/icons/' + f, 'icons/' + f));
  fs.writeFileSync(path.join(outDir, 'build-info.js'), `window.MV_BUILD_TARGET=${JSON.stringify(target)};window.MV_VALIDATION=${JSON.stringify(validation)};window.MV_BUILD=${JSON.stringify(buildInfo)};\n`);
  fs.writeFileSync(path.join(outDir, 'sw.js'), read('src/mobile/sw.js').replace('__MV_BUILD_ID__', currentHash.slice(0, 16) + '-' + target));
  fs.writeFileSync(path.join(outDir, '.nojekyll'), '');
  fs.writeFileSync(path.join(outDir, 'CNAME'), 'visualcontrastsensitivity.com\n');   // GitHub Pages custom domain (DNS at GoDaddy: A → 185.199.108-111.153, www CNAME → drcameronjones.github.io)
  return 'app/mobile/ (' + target + ')';
}
const targets = process.argv.slice(2).length ? process.argv.slice(2) : ['staging'];
targets.forEach(t => console.log('built', t === 'mobile' ? buildMobile('staging') : t === 'mobile-live' ? buildMobile('live') : build(t), 'validation:', validation ? validation.software.status : 'not_run (' + reason + ')', 'source', currentHash.slice(0, 12), 'commit', (git.commit || 'none').slice(0, 8)));
