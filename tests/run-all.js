// Runs the Node suite and the browser suite, then writes tests/results.json.
// tools/build.js reads that file; the page claims "software verification: passed" only when every test passed
// for the current package version (safeguard 1).
const { spawnSync } = require('child_process'); const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const { sourceHash, gitCommit, FILES } = require('../tools/source-hash');
const hashBefore = sourceHash();
const unit = spawnSync('node', ['--test', 'tests/unit.test.js', 'tests/mobile.test.js'], { cwd: root, encoding: 'utf8' });   // Phase 0 T-tests + Phase 1 M-tests
const unitOut = unit.stdout + unit.stderr;
const unitPass = +(unitOut.match(/^# pass (\d+)/m) || [0, 0])[1], unitFail = +(unitOut.match(/^# fail (\d+)/m) || [0, 0])[1];
const unitTests = [...unitOut.matchAll(/^(not ok|ok) \d+ - (\S+) (.*)$/gm)].map(m => ({ id: m[2], name: m[3], ok: m[1] === 'ok' }));
const br = spawnSync('node', ['tests/browser.test.js'], { cwd: root, encoding: 'utf8' });
const brOut = br.stdout + br.stderr;
spawnSync('node', ['tools/build.js', 'mobile'], { cwd: root, encoding: 'utf8' });   // the phone suite runs against the built folder
const mbr = spawnSync('node', ['tests/mobile-browser.test.js'], { cwd: root, encoding: 'utf8' });
let browserTests = []; try { browserTests = JSON.parse(fs.readFileSync(path.join(root, 'test-results', 'browser.json'), 'utf8')); } catch (e) {}
try { browserTests = browserTests.concat(JSON.parse(fs.readFileSync(path.join(root, 'test-results', 'mobile-browser.json'), 'utf8'))); } catch (e) {}
const brPass = browserTests.filter(t => t.ok).length, brFail = browserTests.length - brPass;
const hashAfter = sourceHash(); const sourceChangedDuringRun = hashBefore !== hashAfter; const git = gitCommit();
const results = {
  sourceHash: hashAfter, sourceFiles: FILES, gitCommit: git.commit, gitDirty: git.dirty, sourceChangedDuringRun,
  suite: 'phase0-T01-T28+phase1-M01-M13', version, runAt: new Date().toISOString().slice(0, 10), runAtFull: new Date().toISOString(),
  node: process.version, platform: process.platform,
  passed: unitPass + brPass, failed: unitFail + brFail + (sourceChangedDuringRun ? 1 : 0),
  statement: 'Passing these tests establishes software behaviour only. It establishes nothing about measurement accuracy or clinical meaning.',
  tests: [...unitTests.map(t => ({ ...t, kind: 'node' })), ...browserTests.map(t => ({ id: t.id, name: t.name, ok: t.ok, kind: 'browser', error: t.error }))]
};
fs.writeFileSync(path.join(root, 'tests', 'results.json'), JSON.stringify(results, null, 2));
fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
fs.writeFileSync(path.join(root, 'test-results', 'unit.tap'), unitOut); fs.writeFileSync(path.join(root, 'test-results', 'browser.log'), brOut + '\n' + mbr.stdout + mbr.stderr);
console.log(`source ${hashAfter.slice(0,12)} commit ${(git.commit||'none').slice(0,8)}${git.dirty?' (uncommitted changes)':''}${sourceChangedDuringRun?' SOURCE CHANGED DURING RUN':''}`);
console.log(`${results.statement}\nnode: ${unitPass} passed, ${unitFail} failed · browser: ${brPass} passed, ${brFail} failed · total ${results.passed}/${results.passed + results.failed}`);
process.exit(results.failed ? 1 : 0);
