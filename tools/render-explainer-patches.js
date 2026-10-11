const { chromium } = require('/home/claude/mouldvision/node_modules/playwright'); const fs=require('fs'); const path=require('path');
const out=process.argv[2]; fs.mkdirSync(out,{recursive:true});
(async()=>{ const b=await chromium.launch(); const p=await b.newPage({deviceScaleFactor:1}); const src=fs.readFileSync('/home/claude/mouldvision/src/app.js','utf8');
 await p.setContent('<body style="margin:0;background:#808080"><div id="w" style="padding:10px;display:inline-block;background:#808080"><canvas id="c"></canvas></div></body>'); await p.addScriptTag({content: src});
 const shot=async(name,cpd,contrast,orient)=>{ await p.evaluate(({cpd,contrast,orient})=>{ const c=document.getElementById('c'); window.MV.drawGrating(c,cpd/4,contrast,orient,400/5,400); },{cpd,contrast,orient}); await p.locator('#w').screenshot({path:path.join(out,name)}); };
 for(const [i,f] of [1.5,3,6,12,18].entries()) await shot(`col-${i}.png`, f, 0.6, 'up');
 for(let r=0;r<6;r++) await shot(`row-${r}.png`, 6, [0.285714,0.17231,0.103918,0.062672,0.037796,0.022795][r], 'up');
 for(const o of ['left','up','right']) await shot(`key-${o}.png`, 12, 0.9, o);
 await b.close(); console.log(fs.readdirSync(out).length); })();
