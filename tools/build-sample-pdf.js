// Builds samples/sample-vcs-report.pdf from simulated results, using the same code as the page.
// Usage:  cd tools && npm install && node build-sample-pdf.js
const fs=require('fs'); const path=require('path');
const {jsPDF}=require('jspdf');
let src=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
src=src.replace(/^\(\(\) => \{\n'use strict';/,'').replace(/\n\}\)\(\);\s*$/,'');
src=src.split('// ---------- Wiring ----------')[0];
const logo='data:image/png;base64,'+fs.readFileSync(path.join(__dirname,'../assets/bhs-logo.png')).toString('base64');
src=src.replace(/function logoDataUri\(\)\{[\s\S]*?\n\}/,'function logoDataUri(){ return '+JSON.stringify(logo)+'; }');
const window={jspdf:{jsPDF},devicePixelRatio:1};
const document={getElementById:()=>({}),querySelector:()=>({clientWidth:500}),createElement:()=>({getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){},beginPath(){},arc(){},stroke(){}}),toDataURL:()=>''})};
const localStorage={getItem:()=>null,setItem(){}};
eval(src+`
S.distCm=50;S.pxPerCm=40;S.ppd=35;S.mode='full';
for(const eye of ['right','left']){S.results[eye]=FREQS.map((f,c)=>SENS.map((s,r)=>{const correct=eye==='right'?!((c===2||c===3)&&r>=6):r<7;return {row:r,contrast:CONTRAST[r],sens:s,orient:'left',answer:correct?'left':'right',correct};}));}
const A=analyse();
console.log('overall',A.overall,'total',A.total,'bio',A.bio);
buildPdf(A).arrayBuffer().then(b=>{const out=path.join(__dirname,'../samples/sample-vcs-report.pdf');fs.writeFileSync(out,Buffer.from(b));console.log('wrote',out,b.byteLength,'bytes');});
`);
