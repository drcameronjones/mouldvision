// T27 (file level): extract src/app.js at tag v0.6.0-prototype, run it through the v0.6.0 harness technique
// with the v0.6.0 simulated fixture, and compare the resulting PDF text (minus id/timestamps) to the stored baseline.
const { execFileSync } = require('child_process'); const fs = require('fs'); const path = require('path');
const { jsPDF } = require('jspdf');
const root = path.join(__dirname, '..');
let src = execFileSync('git', ['show', 'v0.6.0-prototype:src/app.js'], { cwd: root }).toString();
src = src.replace(/^\(\(\) => \{\n'use strict';/, '').replace(/\n\}\)\(\);\s*$/, '');
src = src.split('// ---------- Wiring ----------')[0];
src = src.replace(/function logoDataUri\(\)\{[\s\S]*?\n\}/, 'function logoDataUri(){ return null; }');
const window = { jspdf: { jsPDF }, devicePixelRatio: 1 };
const document = { getElementById: () => ({}), querySelector: () => ({ clientWidth: 500 }), createElement: () => ({ getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {}, beginPath() {}, arc() {}, stroke() {} }), toDataURL: () => '' }) };
const localStorage = { getItem: () => null, setItem() {} };
const RealDate = Date; // pin the date so the text is reproducible
global.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [1791400000000])); } static now() { return 1791400000000; } };
eval(src + `
S.distCm=50;S.pxPerCm=40;S.ppd=35;S.mode='full';
for(const eye of ['right','left']){S.results[eye]=FREQS.map((f,c)=>SENS.map((s,r)=>{const correct=eye==='right'?!((c===2||c===3)&&r>=6):r<7;return {row:r,contrast:CONTRAST[r],sens:s,orient:'left',answer:correct?'left':'right',correct};}));}
const A=analyse();
buildPdf(A).arrayBuffer().then(b=>{
  const txt = Buffer.from(b);
  const basePath = path.join(root,'tests','fixtures','v0.6.0-sample.pdf');
  if(!fs.existsSync(basePath)){ fs.writeFileSync(basePath, txt); console.log('BASELINE_WRITTEN'); }
  const base = fs.readFileSync(basePath);
  // jsPDF embeds a creation date and a random-looking id; compare sizes and the deterministic text streams
  const strip = s => s.toString('latin1').replace(/\\/CreationDate \\(D:[^)]*\\)/g,'').replace(/\\/ID \\[[^\\]]*\\]/g,'').replace(/muz[0-9a-z]+/g,'ID');
  console.log(strip(txt)===strip(base) ? 'ROLLBACK_OK' : 'ROLLBACK_DIFF '+txt.length+' vs '+base.length);
});
`);
