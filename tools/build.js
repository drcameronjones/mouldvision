// Builds single-file pages from src/: app/index.html (live) and app/staging.html (staging).
// The software-verification status is injected ONLY from tests/results.json and only when every test passed;
// otherwise the page records "not_run" or "failed" (safeguard 1).
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const html = read('src/index.html'), css = read('src/styles.css'), js = read('src/app.js');
const logo = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'assets/bhs-logo.png')).toString('base64');
let validation = null;
try {
  const r = JSON.parse(read('tests/results.json'));
  validation = { software: { status: r.failed === 0 && r.passed > 0 ? 'passed' : 'failed', suite: r.suite, version: r.version, runAt: r.runAt, passed: r.passed, total: r.passed + r.failed } };
  if (validation.software.version !== JSON.parse(read('package.json')).version) validation = null; // results from another version never count
} catch (e) { validation = null; }

function build(target) {
  let out = html;
  out = out.replace(/<!doctype html>\s*<html[^>]*>\s*<head>[\s\S]*?<\/head>\s*<body>/i, '');   // artefact skeleton is added at publish
  out = out.replace(/<\/body>\s*<\/html>\s*$/i, '');
  out = out.replace('<link rel="stylesheet" href="styles.css">', '<style>\n' + css + '\n</style>');
  out = out.replace('src="../assets/bhs-logo.png"', 'src="' + logo + '"');
  const inject = `<script>window.MV_BUILD_TARGET=${JSON.stringify(target)};window.MV_VALIDATION=${JSON.stringify(validation)};</script>\n`;
  out = out.replace('<script src="app.js"></script>', inject + '<script>\n' + js + '\n</script>');
  const title = target === 'staging' ? '<title>VCS Screen (staging)</title>' : '<title>VCS Screen</title>';
  out = out.replace('<title>VCS Screen</title>', title);
  // keep the font link (it was in <head> of the split build)
  if (!/fonts\.googleapis/.test(out)) out = title + '\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=Manrope:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">\n' + out.replace(title, '');
  const file = target === 'staging' ? 'app/staging.html' : 'app/index.html';
  fs.writeFileSync(path.join(root, file), out.trim() + '\n');
  return file;
}
const targets = process.argv.slice(2).length ? process.argv.slice(2) : ['staging'];
targets.forEach(t => console.log('built', build(t), 'validation:', validation ? validation.software.status : 'not_run'));
