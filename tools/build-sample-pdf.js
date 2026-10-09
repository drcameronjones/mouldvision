// Builds samples/report-{full,quick,unsaved}.pdf and samples/export-{...}.json from the fixture run records,
// using the page's own code (src/app.js) through the test harness. Validation status comes from tests/results.json.
const fs = require('fs'); const path = require('path');
const { load } = require('../tests/harness');
const root = path.join(__dirname, '..');
const out = path.join(root, 'samples'); fs.mkdirSync(out, { recursive: true });
const logo = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'assets/bhs-logo.png')).toString('base64');
const { sourceHash, gitCommit } = require('./source-hash');
const currentHash = sourceHash(), git = gitCommit();
let validation = null, build = { sourceHash: currentHash, gitCommit: git.commit, gitDirty: git.dirty, builtAt: new Date().toISOString(), verificationReason: 'no test results for this source' };
try { const r = JSON.parse(fs.readFileSync(path.join(root, 'tests/results.json'), 'utf8')); if (r.sourceHash === currentHash && !r.sourceChangedDuringRun) { validation = { software: { status: r.failed === 0 && r.passed > 0 ? 'passed' : 'failed', suite: r.suite, version: r.version, runAt: r.runAt, passed: r.passed, total: r.passed + r.failed, sourceHash: r.sourceHash, gitCommit: r.gitCommit } }; build.verificationReason = null; } } catch (e) {}
(async () => {
  for (const name of ['full', 'quick', 'unsaved']) {
    const run = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures', `run-${name}.json`), 'utf8'));
    const MV = load({ validation, logo, buildTarget: 'staging', build });
    run.validation = MV.buildValidation();           // the report states the status of the build that renders it
    run.versions.buildTarget = 'staging'; run.versions.sourceHash = build.sourceHash; run.versions.gitCommit = build.gitCommit; run.versions.builtAt = build.builtAt;
    const blob = MV.buildPdf(run);
    fs.writeFileSync(path.join(out, `report-${name}.pdf`), Buffer.from(await blob.arrayBuffer()));
    fs.writeFileSync(path.join(out, `export-${name}.json`), MV.exportJson(run));
    console.log(name, run.status, `R ${run.scoring.right.correct}/${run.scoring.right.presented}`, `L ${run.scoring.left.correct}/${run.scoring.left.presented}`, 'validation', run.validation.software.status);
  }
})();
