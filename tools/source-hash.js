// SHA-256 over the exact source that becomes the page: src/app.js, src/index.html, src/styles.css, tools/build.js.
// Used by the test runner (recorded in tests/results.json) and by the build (must match, or the build is marked not verified).
const fs = require('fs'); const path = require('path'); const crypto = require('crypto'); const { execSync } = require('child_process');
const root = path.join(__dirname, '..');
const FILES = ['src/app.js', 'src/index.html', 'src/styles.css', 'tools/build.js'];
function sourceHash() {
  const h = crypto.createHash('sha256');
  for (const f of FILES) { h.update(f + '\0'); h.update(fs.readFileSync(path.join(root, f))); h.update('\0'); }
  return h.digest('hex');
}
function gitCommit() { try { const c = execSync('git rev-parse HEAD', { cwd: root }).toString().trim(); const dirty = execSync('git status --porcelain -- ' + FILES.join(' '), { cwd: root }).toString().trim().length > 0; return { commit: c, dirty }; } catch (e) { return { commit: null, dirty: null }; } }
module.exports = { sourceHash, gitCommit, FILES };
if (require.main === module) console.log(JSON.stringify({ sourceHash: sourceHash(), ...gitCommit() }));
