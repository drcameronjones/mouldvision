// Builds samples/report-{full,quick,unsaved}.pdf and samples/export-{...}.json from the fixture run records,
// using the page's own code (src/app.js) through the test harness. Validation status comes from tests/results.json.
const fs = require('fs'); const path = require('path');
const { load } = require('../tests/harness');
const root = path.join(__dirname, '..');
const out = path.join(root, 'samples'); fs.mkdirSync(out, { recursive: true });
const logo = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'assets/bhs-logo.png')).toString('base64');
let validation = null;
try { const r = JSON.parse(fs.readFileSync(path.join(root, 'tests/results.json'), 'utf8')); validation = { software: { status: r.failed === 0 && r.passed > 0 ? 'passed' : 'failed', suite: r.suite, version: r.version, runAt: r.runAt, passed: r.passed, total: r.passed + r.failed } }; } catch (e) {}
(async () => {
  for (const name of ['full', 'quick', 'unsaved']) {
    const run = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures', `run-${name}.json`), 'utf8'));
    const MV = load({ validation, logo, buildTarget: 'staging' });
    run.validation = MV.buildValidation();           // the report states the status of the build that renders it
    run.versions.buildTarget = 'staging';
    const blob = MV.buildPdf(run);
    fs.writeFileSync(path.join(out, `report-${name}.pdf`), Buffer.from(await blob.arrayBuffer()));
    fs.writeFileSync(path.join(out, `export-${name}.json`), MV.exportJson(run));
    console.log(name, run.status, `R ${run.scoring.right.correct}/${run.scoring.right.presented}`, `L ${run.scoring.left.correct}/${run.scoring.left.presented}`, 'validation', run.validation.software.status);
  }
})();
