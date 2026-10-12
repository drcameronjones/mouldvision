// Loads src/app.js into an isolated VM context with a minimal DOM-less environment.
// Node's own crypto (randomUUID, subtle) and a memory localStorage/sessionStorage are supplied.
const fs = require('fs'); const path = require('path'); const vm = require('vm');
const { jsPDF } = require('jspdf');

function memStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, clear: () => m.clear(), _map: m };
}
function load(opts = {}) {
  const src = fs.readFileSync(path.join(__dirname, '..', opts.appPath || 'src/app.js'), 'utf8');
  const ls = opts.localStorage || memStorage(), ss = opts.sessionStorage || memStorage();
  const cryptoObj = opts.crypto === null ? undefined : (opts.crypto || globalThis.crypto);
  const ctx = {
    console, setTimeout, clearTimeout, TextEncoder, Blob: globalThis.Blob, URL: globalThis.URL, performance,
    localStorage: ls, sessionStorage: ss, crypto: cryptoObj,
    MV_BUILD_TARGET: opts.buildTarget || 'live', MV_BLANK_MS: opts.blankMs || 1, MV_VALIDATION: opts.validation || null, MV_BUILD: opts.build || { sourceHash: 'testhash0000000000000000', gitCommit: 'deadbeef', gitDirty: false, builtAt: '2026-10-09T00:00:00Z', verificationReason: null }, MV_LOGO: opts.logo || null,
    jspdf: { jsPDF },
    navigator: { userAgent: 'HarnessUA Chrome/130 Linux', maxTouchPoints: 0 },
    Math: opts.math || Math, JSON, Date, Array, Object, Number, String, Promise, Error, Uint8Array, Map, Set, RegExp,
  };
  ctx.globalThis = ctx; ctx.window = undefined; // no DOM: HAS_DOM false
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'app.js' });
  const MV = ctx.MV;
  MV._ctx = ctx; MV._ls = ls; MV._ss = ss;
  return MV;
}

/** Drive a whole run through the real state machine. answerFn(trialContext) -> 'left'|'up'|'right'|'none' */
async function runTest(MV, { mode = 'full', answerFn, pxPerCm = 44.5, distCm = 50 } = {}) {
  MV.S.pxPerCm = pxPerCm; MV.S.distCm = distCm; MV.updateCal();
  MV.startRun(mode);
  for (const eye of ['right', 'left']) {
    MV.startEye(eye);
    let guard = 0;
    while (MV.S.trial.state === 'ARMED' && guard++ < 200) {
      const a = answerFn({ eye, col: MV.COLS[MV.S.col], row: MV.S.row + 1, orient: MV.S.orient });
      MV.submitAnswer('harness', a, null);
      if (MV.S.trial.state === 'BLANK') { await new Promise(r => setTimeout(r, (MV.BLANK_MS||1) + 5)); }
    }
  }
  return MV.finaliseRun();
}
/** Observer that identifies correctly when row <= limit for the column (1-based), else guesses wrong. */
const observer = (limits) => ({ eye, col, row, orient }) => {
  const lim = typeof limits === 'function' ? limits(eye, col) : limits[col];
  if (row <= lim) return orient;
  return orient === 'left' ? 'right' : 'left';
};
module.exports = { load, runTest, observer, memStorage };
