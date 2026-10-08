(() => {
'use strict';
let lastAnalysis = null;
function logoDataUri(){
  const img=document.getElementById('bhsLogo'); if(!img) return null;
  const src=img.getAttribute('src')||''; if(src.startsWith('data:')) return src;
  try{ const c=document.createElement('canvas'); c.width=img.naturalWidth; c.height=img.naturalHeight; c.getContext('2d').drawImage(img,0,0); return c.toDataURL('image/png'); }catch(e){ return null; }
}
// ---------- Test definition ----------
const FREQS = [1.5, 3, 6, 12, 18];                      // columns A–E, cycles/degree
const COLS = ['A','B','C','D','E'];
// 9 rows: contrast sensitivity ladder, geometric 3.5 → 200 (contrast 28% → 0.5%)
const SENS = Array.from({length:9}, (_,i) => 3.5 * Math.pow(200/3.5, i/8));
const CONTRAST = SENS.map(s => 1/s);
// Typical healthy curve (approximate FACT norms, both eyes) in sensitivity units
const HEALTHY = [75, 115, 110, 65, 30];
const REFS = [
  'Ginsburg AP. A new contrast sensitivity vision test chart. Am J Optom Physiol Opt. 1984;61(6):403-407.',
  'Ginsburg AP. Contrast sensitivity, drivers\' visibility, and vision standards. Transportation Research Record. 1987;1149:32-39.',
  'Ginsburg AP. Contrast sensitivity and functional vision. Int Ophthalmol Clin. 2003;43(2):5-15.',
  'Hudnell HK, House D, Schmid J, Koltai D, Stopford W, Wilkins J, Savitz DA, Swinker M, Music S. Human visual function in the North Carolina clinical study on possible estuary-associated syndrome. J Toxicol Environ Health A. 2001;62(8):575-594. doi:10.1080/15287390151079633',
  'Shoemaker RC, Hudnell HK. Possible estuary-associated syndrome: symptoms, vision, and treatment. Environ Health Perspect. 2001;109(5):539-545.',
  'Hudnell HK. Chronic biotoxin-associated illness: multiple-system symptoms, a vision deficit, and effect of cholestyramine. Neurotoxicol Teratol. 2005;27(5):733-743.',
  'Shoemaker RC, House DE. A time-series study of sick building syndrome: chronic, biotoxin-associated illness from exposure to water-damaged buildings. Neurotoxicol Teratol. 2005;27(1):29-46.',
  'Shoemaker RC, House DE. Sick building syndrome (SBS) and exposure to water-damaged buildings: time series study, clinical trial and mechanisms. Neurotoxicol Teratol. 2006;28(5):573-588.',
  'McMahon SW, Kundomal KA, Yangalasetty S. Pediatrics norms for visual contrast sensitivity using an APT VCS tester. Med Res Arch. 2017;5(5).',
  'Pelli DG, Bex P. Measuring contrast sensitivity. Vision Res. 2013;90:10-14.',
  'Owsley C. Contrast sensitivity. Ophthalmol Clin North Am. 2003;16(2):171-177.',
  'Thomas G, Burton NC, Mueller C, Page E, Vesper S. Comparison of work-related symptoms and visual contrast sensitivity between employees at a severely water-damaged school and a school without significant water damage. Am J Ind Med. 2012;55(9):844-854. doi:10.1002/ajim.22059',
  'Jimenez-Barbosa IA, Di Lizio S, Ahn SB, et al. Assessment of visual contrast sensitivity in biotoxin-exposed individuals using four testing methods. Ann Med. 2026;58(1):2646821. doi:10.1080/07853890.2026.2646821',
  'American College of Medical Toxicology. Position statement: medical toxicology considerations in the diagnosis and treatment of patients with concerns about mold-related inhalation exposures. 2025.',
  'Denning DW, Chakrabarti A. Pulmonary and sinus fungal diseases in non-immunocompromised patients. Lancet Infect Dis. 2017;17(11):e357-e366. doi:10.1016/S1473-3099(17)30309-2',
  'Valtonen V. Clinical diagnosis of the dampness and mold hypersensitivity syndrome: review of the literature and suggested diagnostic criteria. Front Immunol. 2017;8:951. doi:10.3389/fimmu.2017.00951'
];
const TILT = 15 * Math.PI/180;
const ORIENTS = ['left','up','right'];

// ---------- State ----------
const S = {
  pxPerCm: 40/8.56, distCm: 50, ppd: 0, mode:'full',
  eye:'right', col:0, row:0, orient:'up',
  results: { right: [], left: [] },   // per eye: array of 5 arrays of {row, contrast, orient, answer, correct}
  seq: [], seqIdx: 0,
  columnMisses: 0
};
const $ = id => document.getElementById(id);
const views = ['home','cal','instr','test','switch','results'];
function show(v){ views.forEach(x => $('v-'+x).hidden = (x!==v)); renderSteps(v); window.scrollTo({top:0}); }
function renderSteps(v){
  const map = {home:0,cal:1,instr:2,test:3,switch:3,results:4};
  $('steps').innerHTML = ['Start','Calibrate','Instructions','Test','Results'].map((t,i)=>`<span class="${i===map[v]?'on':''}">${t}</span>`).join('');
}

// ---------- Grating renderer ----------
function srgb(lin){ return lin<=0.0031308 ? 12.92*lin : 1.055*Math.pow(lin,1/2.4)-0.055; }
function drawGrating(canvas, cpd, contrast, orient, ppd, sizePx){
  const dpr = Math.min(window.devicePixelRatio||1, 2);
  const px = Math.round(sizePx*dpr);
  canvas.width = px; canvas.height = px;
  canvas.style.width = sizePx+'px'; canvas.style.height = sizePx+'px';
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(px, px);
  const d = img.data;
  const cyclesPerPx = cpd / (ppd*dpr);
  const theta = orient==='left' ? -TILT : orient==='right' ? TILT : 0;
  const cx = px/2, cy = px/2, R = px/2;
  const sigma = R*0.42;
  const meanLin = 0.2140; // linear luminance of sRGB 128/255
  const ct = Math.cos(theta), st = Math.sin(theta);
  for(let y=0;y<px;y++){
    for(let x=0;x<px;x++){
      const dx = x-cx, dy = y-cy;
      const r2 = dx*dx+dy*dy;
      const i = (y*px+x)*4;
      if(r2 > R*R){ d[i]=d[i+1]=d[i+2]=128; d[i+3]=0; continue; }
      // bars tilted from vertical: modulate along the axis perpendicular to the bars
      const u = dx*ct + dy*st;
      const env = Math.exp(-r2/(2*sigma*sigma));
      const lin = meanLin*(1 + contrast*env*Math.sin(2*Math.PI*cyclesPerPx*u));
      // ordered dither so sub-step contrasts survive 8-bit quantisation
      const dith = (((x*7 + y*13) % 17) / 17 - 0.5);
      const v = Math.max(0, Math.min(255, Math.round(srgb(lin)*255 + dith)));
      d[i]=d[i+1]=d[i+2]=v; d[i+3]=255;
    }
  }
  ctx.putImageData(img,0,0);
}

// ---------- Calibration ----------
function updateCal(){
  const mm = parseFloat($('pxcm').value);          // slider = px per 10mm? no: px per cm
  S.pxPerCm = mm;
  S.distCm = Math.max(20, parseFloat($('dist').value)||50);
  $('sizer').style.transform = `scale(${S.pxPerCm/ (96/2.54)})`; // CSS mm assumes 96dpi; rescale to measured
  $('pxcmOut').textContent = `${S.pxPerCm.toFixed(1)} px/cm  ·  ${(S.pxPerCm*2.54).toFixed(0)} px/inch`;
  S.ppd = S.pxPerCm * S.distCm * Math.tan(Math.PI/180);
  const maxCpd = S.ppd/2;
  $('calOut').textContent = `pixels per degree: ${S.ppd.toFixed(1)}   ·   patch: 5.0° ≈ ${(S.ppd*5).toFixed(0)} px   ·   max renderable: ${maxCpd.toFixed(1)} cpd`;
  const w = $('calWarn');
  if(maxCpd < 18*1.5){ w.hidden=false; w.textContent = `At ${S.distCm} cm this screen gives only ${S.ppd.toFixed(0)} px per degree. Column E (18 cpd) needs more than one pixel per bar to be rendered faithfully. Move back to at least ${Math.ceil(18*1.5*2/(S.pxPerCm*Math.tan(Math.PI/180)))} cm or use a higher-resolution screen.`; }
  else w.hidden=true;
  try{ localStorage.setItem('vcs-cal', JSON.stringify({pxPerCm:S.pxPerCm, distCm:S.distCm})); }catch(e){}
}

// ---------- Sequence ----------
function buildSequence(){
  const seq=[];
  for(let c=0;c<5;c++) for(let r=0;r<9;r++) seq.push({c,r});
  return seq;
}
function startEye(eye){
  S.eye = eye; S.seq = buildSequence(); S.seqIdx = 0; S.columnMisses = 0;
  S.results[eye] = FREQS.map(()=>[]);
  $('eyeTitle').textContent = eye==='right' ? 'Right eye' : 'Left eye';
  $('coverPill').textContent = eye==='right' ? 'Cover your left eye' : 'Cover your right eye';
  show('test');
  nextTrial();
}
function nextTrial(){
  if(S.seqIdx >= S.seq.length){ return finishEye(); }
  const t = S.seq[S.seqIdx];
  if(t.r===0) S.columnMisses = 0;
  S.col = t.c; S.row = t.r;
  S.orient = ORIENTS[Math.floor(Math.random()*3)];
  const field = document.querySelector('.field');
  const sizePx = Math.min(field.clientWidth-24, Math.max(160, Math.round(S.ppd*5)));
  drawGrating($('stim'), FREQS[S.col], CONTRAST[S.row], S.orient, S.ppd, sizePx);
  const done = S.seqIdx + (S.eye==='left'?45:0);
  $('prog').style.width = (100*done/90)+'%';
  $('trialLabel').textContent = `${COLS[S.col]}${S.row+1} · ${FREQS[S.col]} cpd · ${(CONTRAST[S.row]*100).toFixed(1)}% contrast · ${S.seqIdx+1}/45`;
}
function answer(a){
  if($('v-test').hidden) return;
  const correct = a===S.orient;
  S.results[S.eye][S.col].push({row:S.row, contrast:CONTRAST[S.row], sens:SENS[S.row], orient:S.orient, answer:a, correct});
  S.columnMisses = correct ? 0 : S.columnMisses+1;
  S.seqIdx++;
  if(S.mode==='quick' && S.columnMisses>=2){
    // mark remaining rows in this column as not seen, jump to next column
    while(S.seqIdx < S.seq.length && S.seq[S.seqIdx].c===S.col){
      const r = S.seq[S.seqIdx].r;
      S.results[S.eye][S.col].push({row:r, contrast:CONTRAST[r], sens:SENS[r], orient:'up', answer:'skipped', correct:false});
      S.seqIdx++;
    }
  }
  // brief blank so successive patches don't blend
  $('fix').hidden=false; $('stim').style.visibility='hidden';
  setTimeout(()=>{ $('fix').hidden=true; $('stim').style.visibility='visible'; nextTrial(); }, 250);
}
function finishEye(){
  if(S.eye==='right'){ show('switch'); }
  else { renderResults(); show('results'); }
}

// ---------- Scoring ----------
function scoreEye(eye){
  const cols = S.results[eye];
  const thresholds = cols.map(col => { const ok = col.filter(t=>t.correct); return ok.length ? Math.max(...ok.map(t=>t.sens)) : null; });
  const correct = cols.reduce((a,c)=>a+c.filter(t=>t.correct).length,0);
  const bio = cols[2].filter(t=>t.correct).length + cols[3].filter(t=>t.correct).length;
  return { thresholds, correct, total:45, bio, bioTotal:18 };
}
function analyse(){
  const R = scoreEye('right'), L = scoreEye('left');
  const total = R.correct+L.correct, bio = R.bio+L.bio;
  // Below-healthy check in biotoxin columns: threshold under ~half the healthy value, either eye
  const bioLow = [R,L].some(e => [2,3].some(c => (e.thresholds[c]||0) < HEALTHY[c]*0.5));
  const bioFlag = bio < 36 || bioLow;
  const eLow = [R,L].some(e => (e.thresholds[4]||0) < HEALTHY[4]*0.5);
  const lowFreqLow = [R,L].some(e => [0,1].some(c => (e.thresholds[c]||0) < HEALTHY[c]*0.5));
  return { R, L, total, bio, overall: total < 90 ? 'POSITIVE':'NEGATIVE', bioFlag, eLow, lowFreqLow };
}

// ---------- Results rendering ----------
function chartSVG(eye, score){
  const W=360, H=330, left=48, right=48, top=18, bottom=50;
  const pw = W-left-right, ph = H-top-bottom;
  const ymin=Math.log10(3), ymax=Math.log10(250);
  const Y = s => top + ph*(1-(Math.log10(s)-ymin)/(ymax-ymin));
  const X = c => left + pw*(c+0.5)/5;
  let g='';
  // biotoxin column shading
  g += `<rect x="${X(2)-pw/10}" y="${top}" width="${pw/5*2}" height="${ph}" fill="var(--bio-soft)" stroke="var(--bio)" stroke-width="1.5" rx="4"/>`;
  // y gridlines
  [5,10,20,50,100,200].forEach(s=>{ g+=`<line x1="${left}" x2="${W-right}" y1="${Y(s)}" y2="${Y(s)}" stroke="var(--line)"/><text x="${left-6}" y="${Y(s)+4}" text-anchor="end" font-size="10" fill="var(--muted)">${s}</text>`; });
  [0.5,1,2,5,10,20].forEach(p=>{ const s=100/p; g+=`<text x="${W-right+6}" y="${Y(s)+4}" font-size="10" fill="var(--muted)">${p}</text>`; });
  g += `<text transform="translate(12 ${top+ph/2}) rotate(-90)" text-anchor="middle" font-size="10" fill="var(--muted)">Contrast sensitivity</text>`;
  g += `<text transform="translate(${W-10} ${top+ph/2}) rotate(90)" text-anchor="middle" font-size="10" fill="var(--muted)">Percent contrast</text>`;
  // x labels
  COLS.forEach((c,i)=>{ g+=`<text x="${X(i)}" y="${H-bottom+16}" text-anchor="middle" font-size="11" font-weight="700" fill="var(--fg)">${c}</text><text x="${X(i)}" y="${H-bottom+29}" text-anchor="middle" font-size="9" fill="var(--muted)">(${FREQS[i]})</text>`; });
  g += `<text x="${left+pw/2}" y="${H-6}" text-anchor="middle" font-size="10" fill="var(--muted)">Cycles per degree (cpd)</text>`;
  // healthy line
  g += `<polyline fill="none" stroke="var(--muted)" stroke-width="1.5" points="${HEALTHY.map((h,i)=>`${X(i)},${Y(h)}`).join(' ')}"/>`;
  // dots with tails
  S.results[eye].forEach((col,i)=> col.forEach(t=>{
    const x=X(i), y=Y(t.sens);
    const ang = t.orient==='left'? -TILT : t.orient==='right'? TILT : 0;
    const tx = x + 9*Math.sin(ang), ty = y - 9*Math.cos(ang);
    g += `<line x1="${x}" y1="${y}" x2="${tx}" y2="${ty}" stroke="var(--fg)" stroke-width="1.5"/>`;
    if(!t.correct && t.answer!=='none' && t.answer!=='skipped'){
      const a2 = t.answer==='left'? -TILT : t.answer==='right'? TILT : 0;
      g += `<line x1="${x}" y1="${y}" x2="${x+9*Math.sin(a2)}" y2="${y-9*Math.cos(a2)}" stroke="var(--bad)" stroke-width="1.5"/>`;
    }
    g += `<circle cx="${x}" cy="${y}" r="4.2" fill="${t.correct?'var(--good)':'var(--bad)'}" stroke="var(--surface)" stroke-width="1"/>`;
  }));
  // user curve
  const pts = score.thresholds.map((s,i)=> s? `${X(i)},${Y(s)}` : null).filter(Boolean);
  if(pts.length>1) g += `<polyline fill="none" stroke="var(--bad)" stroke-width="2.5" points="${pts.join(' ')}"/>`;
  // legend
  g += `<line x1="${left}" y1="${H-bottom+42}" x2="${left+18}" y2="${H-bottom+42}" stroke="var(--bad)" stroke-width="2.5"/><text x="${left+22}" y="${H-bottom+45}" font-size="10" fill="var(--fg)">Your score</text>`;
  g += `<line x1="${left+95}" y1="${H-bottom+42}" x2="${left+113}" y2="${H-bottom+42}" stroke="var(--muted)" stroke-width="1.5"/><text x="${left+117}" y="${H-bottom+45}" font-size="10" fill="var(--fg)">Healthy (typical)</text>`;
  return `<div class="chart card"><h3 style="text-align:center">${eye==='right'?'Right':'Left'} eye</h3><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${eye} eye contrast sensitivity">${g}</svg><div class="cap">Score ${score.correct}/45 (${Math.round(100*score.correct/45)}%) · Biotoxin columns ${score.bio}/18 (${Math.round(100*score.bio/18)}%)</div></div>`;
}

function renderResults(){
  const A = analyse();
  lastAnalysis = A;
  const pct = n=> Math.round(100*n);
  const b = $('banner');
  b.className = 'banner ' + (A.overall==='POSITIVE'?'pos':'neg');
  b.innerHTML = `<span>RESULTS: ${A.overall}</span><span>TOTAL SCORE: ${A.total}/90 (${pct(A.total/90)}%)</span><span>BIOTOXIN SCORE: ${A.bio}/36 (${pct(A.bio/36)}%)</span>`;
  const tag = f => `<span class="tag ${f?'pos':'neg'}">${f?'FLAGGED':'CLEAR'}</span>`;
  $('tiles').innerHTML = `
    <div class="tile bio"><div class="eyebrow">Biotoxin columns C–D</div><div class="v">${A.bio}/36</div>${tag(A.bioFlag)}<div class="small muted">6 and 12 cpd, both eyes</div></div>
    <div class="tile"><div class="eyebrow">Column E (18 cpd)</div><div class="v">${(A.R.thresholds[4]||0).toFixed(0)} / ${(A.L.thresholds[4]||0).toFixed(0)}</div>${tag(A.eLow)}<div class="small muted">threshold sensitivity R / L</div></div>
    <div class="tile"><div class="eyebrow">Columns A–B</div><div class="v">${colCorrect('right',0)+colCorrect('right',1)+colCorrect('left',0)+colCorrect('left',1)}/36</div>${tag(A.lowFreqLow)}<div class="small muted">1.5 and 3 cpd, often linked to nutrition and lens clarity</div></div>
    <div class="tile"><div class="eyebrow">Calibration</div><div class="v">${S.ppd.toFixed(0)} px/°</div><div class="small muted">${S.distCm} cm · ${S.pxPerCm.toFixed(1)} px/cm · ${S.mode} mode</div></div>`;
  $('charts').innerHTML = chartSVG('left', A.L) + chartSVG('right', A.R);
  const date = new Date();
  const lines = [
    `VCS Screen · ${date.toLocaleString()}`,
    `Calibration: ${S.distCm} cm, ${S.pxPerCm.toFixed(1)} px/cm, ${S.ppd.toFixed(1)} px/deg, ${S.mode} mode`,
    `Overall: ${A.overall} · Total ${A.total}/90 (${pct(A.total/90)}%) · Biotoxin ${A.bio}/36 (${pct(A.bio/36)}%)`,
    `Right eye: ${A.R.correct}/45 · thresholds (A–E, sensitivity): ${A.R.thresholds.map(t=>t?t.toFixed(0):'–').join(' / ')}`,
    `Left eye:  ${A.L.correct}/45 · thresholds (A–E, sensitivity): ${A.L.thresholds.map(t=>t?t.toFixed(0):'–').join(' / ')}`,
    `Healthy reference (A–E): ${HEALTHY.join(' / ')}`,
    `Screening tool only; not a diagnosis.`,
    `Biological Health Services · Level 1, 459 Toorak Road, Toorak VIC 3142 · www.biologicalhealthservices.com.au`,
    `Concept: Dr Cameron Jones, PhD`
  ];
  $('summaryText').textContent = lines.join('\n');
  saveHistory({ t:date.toISOString(), total:A.total, bio:A.bio, R:A.R.thresholds, L:A.L.thresholds, overall:A.overall, dist:S.distCm, ppd:+S.ppd.toFixed(1) });
}
function colCorrect(eye,c){ return S.results[eye][c].filter(t=>t.correct).length; }

// ---------- PDF report ----------
function pdfChart(doc, eye, score, x0, y0, w, h){
  const left=x0+12, right=x0+w-12, top=y0+8, bottom=y0+h-16;
  const pw=right-left, ph=bottom-top;
  const ymin=Math.log10(3), ymax=Math.log10(250);
  const Y = s => top + ph*(1-(Math.log10(s)-ymin)/(ymax-ymin));
  const X = c => left + pw*(c+0.5)/5;
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(20);
  doc.text(eye==='right'?'Right Eye':'Left Eye', x0+w/2, y0+3, {align:'center'});
  // biotoxin shading
  doc.setFillColor(231,238,251); doc.setDrawColor(47,95,179); doc.setLineWidth(0.4);
  doc.roundedRect(X(2)-pw/10, top, pw/5*2, ph, 1, 1, 'FD');
  // grid + axes
  doc.setDrawColor(215,222,227); doc.setLineWidth(0.2); doc.setFontSize(7); doc.setFont('helvetica','normal'); doc.setTextColor(90);
  [5,10,20,50,100,200].forEach(s=>{ doc.line(left, Y(s), right, Y(s)); doc.text(String(s), left-1.5, Y(s)+1, {align:'right'}); });
  [0.5,1,2,5,10,20].forEach(p=>{ doc.text(String(p), right+1.5, Y(100/p)+1); });
  doc.text('Contrast sensitivity', x0+3, top+ph/2, {angle:90, align:'center'});
  doc.text('Percent contrast', x0+w-2, top+ph/2, {angle:-90, align:'center'});
  COLS.forEach((c,i)=>{ doc.setFont('helvetica','bold'); doc.setTextColor(20); doc.text(c, X(i), bottom+4, {align:'center'}); doc.setFont('helvetica','normal'); doc.setTextColor(90); doc.text(`(${FREQS[i]})`, X(i), bottom+7.5, {align:'center'}); });
  doc.text('Cycles Per Degree (CPD)', left+pw/2, bottom+12, {align:'center'});
  // healthy line
  doc.setDrawColor(128); doc.setLineWidth(0.4);
  for(let i=0;i<4;i++) doc.line(X(i),Y(HEALTHY[i]),X(i+1),Y(HEALTHY[i+1]));
  // user line
  const th = score.thresholds;
  doc.setDrawColor(196,60,47); doc.setLineWidth(0.7);
  for(let i=0;i<4;i++) if(th[i]&&th[i+1]) doc.line(X(i),Y(th[i]),X(i+1),Y(th[i+1]));
  // dots with tails
  S.results[eye].forEach((col,i)=> col.forEach(t=>{
    const x=X(i), y=Y(t.sens);
    const ang = t.orient==='left'? -TILT : t.orient==='right'? TILT : 0;
    doc.setDrawColor(20); doc.setLineWidth(0.35);
    doc.line(x, y, x+2.6*Math.sin(ang), y-2.6*Math.cos(ang));
    if(!t.correct && t.answer!=='none' && t.answer!=='skipped'){
      const a2 = t.answer==='left'? -TILT : t.answer==='right'? TILT : 0;
      doc.setDrawColor(196,60,47); doc.line(x, y, x+2.6*Math.sin(a2), y-2.6*Math.cos(a2));
    }
    if(t.correct) doc.setFillColor(31,138,76); else doc.setFillColor(196,60,47);
    doc.setDrawColor(255); doc.setLineWidth(0.2);
    doc.circle(x, y, 1.2, 'FD');
  }));
  // legend + score
  doc.setDrawColor(196,60,47); doc.setLineWidth(0.7); doc.line(left, bottom+16, left+6, bottom+16);
  doc.setTextColor(20); doc.setFontSize(7); doc.text('Your Score', left+8, bottom+17);
  doc.setDrawColor(128); doc.setLineWidth(0.4); doc.line(left+28, bottom+16, left+34, bottom+16);
  doc.text('Healthy', left+36, bottom+17);
  doc.setFont('helvetica','bold'); doc.setFontSize(9);
  doc.text(`Total Score: ${score.correct}/45 (${Math.round(100*score.correct/45)}%)`, x0+w/2, bottom+23, {align:'center'});
  doc.text(`Biotoxin Score: ${score.bio}/18 (${Math.round(100*score.bio/18)}%)`, x0+w/2, bottom+27.5, {align:'center'});
}
function buildPdf(A){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({unit:'mm', format:'a4', compress:true});
  const W=210, M=14;
  const now = new Date();
  const id = now.getTime().toString(36);
  // header
  const LOGO_URI = logoDataUri();
  if(LOGO_URI){ try{ doc.addImage(LOGO_URI, 'PNG', M, 10, 52, 52*875/3405, undefined, 'FAST'); }catch(e){} }
  doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.setTextColor(11,110,142);
  doc.text('VCS Screen', M+57, 15.5);
  doc.setFontSize(8.5); doc.setFont('helvetica','normal'); doc.setTextColor(90);
  doc.text('Visual Contrast Sensitivity Screening Report', M+57, 20);
  doc.text('Concept: Dr Cameron Jones, PhD  ·  www.biologicalhealthservices.com.au', M+57, 24.5);
  doc.setFontSize(13); doc.setFont('helvetica','bold'); doc.setTextColor(20);
  doc.text('VCS Test Results', W-M, 15.5, {align:'right'});
  doc.setFontSize(8.5); doc.setFont('helvetica','normal');
  const meta = [
    ['Test Identifier:', id, 'Test Date:', now.toLocaleString()],
    ['Test Type:', `Sine-wave grating, 5 × 9, ${S.mode} mode`, 'Name:', '______________________'],
    ['Calibration:', `${S.distCm} cm · ${S.pxPerCm.toFixed(1)} px/cm · ${S.ppd.toFixed(1)} px/deg`, '', '']
  ];
  let y=34;
  meta.forEach(r=>{ doc.setFont('helvetica','bold'); doc.text(r[0], M, y); doc.setFont('helvetica','normal'); doc.text(r[1], M+26, y); if(r[2]){ doc.setFont('helvetica','bold'); doc.text(r[2], 128, y); doc.setFont('helvetica','normal'); doc.text(r[3], 150, y);} y+=4.5; });
  doc.setDrawColor(196,60,47); doc.setLineWidth(0.5); doc.line(M, y, W-M, y);
  // banner
  y+=3;
  const pos = A.overall==='POSITIVE';
  if(pos) doc.setFillColor(196,60,47); else doc.setFillColor(31,138,76);
  doc.rect(M, y, W-2*M, 8, 'F');
  doc.setTextColor(255); doc.setFont('helvetica','bold'); doc.setFontSize(9.5);
  doc.text(`RESULTS: ${A.overall}   ·   TOTAL SCORE: ${A.total}/90 (${Math.round(100*A.total/90)}%)   ·   BIOTOXIN SCORE: ${A.bio}/36 (${Math.round(100*A.bio/36)}%)`, W/2, y+5.4, {align:'center'});
  y+=12;
  // charts
  pdfChart(doc, 'left', A.L, M, y, (W-2*M)/2-2, 96);
  pdfChart(doc, 'right', A.R, W/2+2, y, (W-2*M)/2-2, 96);
  y+=130;
  // explanatory text
  const PAGE_BOTTOM = 276;
  const footer = () => { const n=doc.getNumberOfPages(); for(let i=1;i<=n;i++){ doc.setPage(i); doc.setDrawColor(215,222,227); doc.setLineWidth(0.2); doc.line(M, 283, W-M, 283); doc.setFontSize(7); doc.setTextColor(90); doc.setFont('helvetica','bold'); doc.text('Biological Health Services', M, 287); doc.setFont('helvetica','normal'); doc.text('Level 1, 459 Toorak Road, Toorak VIC 3142  ·  Laboratory: 7/4 Weddel Court, Laverton North VIC 3026', M, 290.3); doc.text('www.biologicalhealthservices.com.au  ·  Concept: Dr Cameron Jones, PhD', M, 293.6); doc.setTextColor(120); doc.text(`VCS Screen · ${id} · page ${i} of ${n}`, W-M, 287, {align:'right'}); } };
  const ensure = (h) => { if(y + h > PAGE_BOTTOM){ doc.addPage(); y = 20; } };
  const para = (text, size=8.2, color=20, gapAfter=2.5) => { doc.setFont('helvetica','normal'); doc.setFontSize(size); doc.setTextColor(color); const lines=doc.splitTextToSize(text, W-2*M); const lh=size*0.44; ensure(lines.length*lh); doc.text(lines, M, y); y += lines.length*lh + gapAfter; };
  const heading = (text, size=9.5) => { ensure(size*0.5+6); doc.setFont('helvetica','bold'); doc.setFontSize(size); doc.setTextColor(20); doc.text(text, M, y); y += size*0.5+1.5; };
  para('The charts above plot the results of your contrast sensitivity screen for each eye. The left axes show contrast sensitivity, the right axes percent contrast, and the bottom axes the spatial frequency of the bars in cycles per degree (CPD); the closer the bars, the higher the spatial frequency.');
  para('Each circle is one test image, placed by its contrast level and spatial frequency. Columns C and D (6 and 12 CPD) are outlined in blue. A green circle means you identified the tilt correctly; a red circle means you did not. Black tails show the tilt the image actually had; red tails show the tilt you chose.');
  para('The grey line is a typical contrast sensitivity curve for healthy adults on FACT-style charts. The red line joins the faintest image you identified correctly in each column. Higher is better; a red line that dips well below the grey line at any point is worth discussing with your healthcare provider.', 8.2, 20, 5);
  // interpretation
  heading(`RESULTS - OVERALL: ${A.overall}`);
  const better = A.R.correct>A.L.correct ? 'right' : A.L.correct>A.R.correct ? 'left' : 'neither';
  let t1 = `You identified the tilt of the bars ${A.total} times out of 90, for a Total Score of ${A.total} (${Math.round(100*A.total/90)}%).` + (better==='neither' ? ' Both eyes scored the same.' : ` Your ${better} eye performed better than the other.`);
  t1 += pos ? ' A score below 100% means at least one image was missed; look at where the misses fall before drawing any conclusion.' : ' You identified every image; no deficit was detected on this screen.';
  para(t1, 8.2, 20, 4);
  heading(`RESULTS - BIOTOXIN COLUMNS (C and D): ${A.bioFlag?'FLAGGED':'CLEAR'}`);
  para(`In columns C and D (6 and 12 CPD), the columns most often reported as affected in biotoxin-associated illness, you answered correctly ${A.bio} times out of 36 (${Math.round(100*A.bio/36)}%). ` + (A.bioFlag ? 'A deficit here is consistent with, but not specific to, biotoxin exposure; it is also produced by refractive error, cataract, other eye disease, alcohol, tobacco and certain medications. Consider an environmental assessment of your home or workplace and discuss these results with a clinician familiar with contrast sensitivity testing.' : 'No deficit was detected in the biotoxin columns on this screen.'), 8.2, 20, 4);
  heading(`RESULTS - COLUMN E (18 CPD): ${A.eLow?'BELOW REFERENCE':'CLEAR'}`);
  para(`Threshold sensitivity at 18 CPD was ${(A.R.thresholds[4]||0).toFixed(0)} (right) and ${(A.L.thresholds[4]||0).toFixed(0)} (left), against a typical healthy value of about ${HEALTHY[4]}. Contrast function at 18 CPD is often used to track progress during treatment because it tends to recover first.`, 8.2, 20, 4);
  // thresholds table
  ensure(26);
  heading('Threshold sensitivity by column', 8.5);
  doc.setFontSize(8); doc.setFont('helvetica','bold'); const cw=(W-2*M)/7;
  const hdr=['', 'A (1.5)','B (3)','C (6)','D (12)','E (18)','Score'];
  hdr.forEach((h,i)=> doc.text(h, M+cw*i+1, y)); y+=1.5; doc.setDrawColor(200); doc.setLineWidth(0.2); doc.line(M,y,W-M,y); y+=4;
  doc.setFont('helvetica','normal');
  [['Right eye',A.R],['Left eye',A.L]].forEach(([n,s])=>{ doc.text(n, M+1, y); s.thresholds.forEach((t,i)=> doc.text(t?t.toFixed(0):'-', M+cw*(i+1)+1, y)); doc.text(`${s.correct}/45`, M+cw*6+1, y); y+=4.5; });
  doc.text('Healthy (typical)', M+1, y); HEALTHY.forEach((h,i)=> doc.text(String(h), M+cw*(i+1)+1, y)); y+=7;
  // disclaimer
  para('Screening only. This report is generated by a web page and is not a diagnosis. Results depend on the display, its brightness setting, viewing distance and ambient light; the lowest one or two contrast rows exceed what most 8-bit displays can render precisely. Compare repeat tests taken on the same screen and settings. Chart layout and interpretation follow the sources listed under References.', 7.5, 90, 6);
  // references
  heading('References', 9.5);
  REFS.forEach((r,i)=> para(`${i+1}. ${r}`, 7.6, 40, 1.4));
  heading('Evidence status', 9.5);
  para('VCS measures contrast discrimination across spatial frequencies, reflecting visual processing in the central nervous system rather than the optics of the eye. Shoemaker popularised it as a bedside marker of biotoxin-related illness after exposure to water-damaged buildings. The evidence is mixed and the test is not validated as a diagnostic tool for mould-related illness.', 7.6, 40, 1.8);
  para('A NIOSH study (ref 12) found lower VCS values at every spatial frequency among employees of a severely water-damaged school than at a comparison school, with more rash, respiratory and constitutional symptoms, yet advised against recommending VCS for mould-exposed people because earlier studies used non-representative samples, lacked comparison groups, characterised exposure poorly and were confounded by conditions such as fibromyalgia and chronic fatigue. A 2026 four-method comparison (ref 13) found the handheld Shoemaker chart did not separate exposed people from controls while digital tests did (best: 100% sensitivity, 60-80% specificity); the digital tools remain investigational.', 7.6, 40, 1.8);
  para('The American College of Medical Toxicology (ref 14) states there is no validated biomarker for mould or mycotoxin exposure; a Lancet Infectious Diseases review (ref 15) notes no diagnostic test exists for building-related illness, which rests on history, exposure assessment and exclusion of other causes; a proposed framework for dampness and mould hypersensitivity syndrome (ref 16) uses clinical and exposure criteria only. In an Australian clinical context VCS should be treated as non-validated and not a stand-alone diagnostic or monitoring tool. Reduced contrast sensitivity is also produced by refractive error, cataract, glaucoma, macular disease, diabetes, alcohol and many drugs.', 7.6, 40, 2);
  footer();
  return doc.output('blob');
}
async function downloadPdf(){
  const btn=$('btnPdf');
  if(!lastAnalysis) return;
  if(!window.jspdf){ toast('PDF library did not load; use Copy summary instead.'); return; }
  btn.disabled=true; btn.textContent='Preparing PDF…';
  try{
    const blob = buildPdf(lastAnalysis);
    const name = `VCS-report-${new Date().toISOString().slice(0,10)}.pdf`;
    const dl = (window.claude && window.claude.use) ? await claude.use('downloads') : null;
    if(dl){ await dl.save({filename:name, data:blob}); toast('PDF saved'); return; }
    // Standalone hosting: ordinary browser download
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href), 5000); toast('PDF downloaded');
  }catch(e){
    if(e && e.code==='declined') toast('Download cancelled');
    else if(e && e.code==='rate_limited') toast('A download prompt is already open');
    else toast('Could not save the PDF' + (e&&e.message?': '+e.message:''));
  }finally{ btn.disabled=false; btn.textContent='Download PDF report'; }
}
function toast(msg){ const t=document.createElement('div'); t.className='toast'; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(),2200); }

// ---------- History ----------
function loadHistory(){ try{ return JSON.parse(localStorage.getItem('vcs-history')||'[]'); }catch(e){ return []; } }
function saveHistory(entry){ try{ const h=loadHistory(); h.unshift(entry); localStorage.setItem('vcs-history', JSON.stringify(h.slice(0,50))); }catch(e){} }
function renderHistory(){
  const h = loadHistory();
  const T = $('histTable');
  if(!h.length){ T.innerHTML = '<tr><td class="muted">No tests saved on this device yet.</td></tr>'; return; }
  T.innerHTML = '<tr><th>Date</th><th>Result</th><th>Total</th><th>Biotoxin</th><th>R thresholds A–E</th><th>L thresholds A–E</th></tr>' +
    h.map(e=>`<tr><td class="mono">${new Date(e.t).toLocaleString()}</td><td><span class="tag ${e.overall==='POSITIVE'?'pos':'neg'}">${e.overall}</span></td><td class="mono">${e.total}/90</td><td class="mono">${e.bio}/36</td><td class="mono">${e.R.map(t=>t?Math.round(t):'–').join('/')}</td><td class="mono">${e.L.map(t=>t?Math.round(t):'–').join('/')}</td></tr>`).join('');
}

// ---------- Orientation key ----------
function renderKey(container){
  container.innerHTML = '';
  ORIENTS.forEach(o=>{
    const f=document.createElement('figure');
    const c=document.createElement('canvas');
    f.appendChild(c);
    const cap=document.createElement('figcaption'); cap.textContent = o[0].toUpperCase()+o.slice(1);
    f.appendChild(cap); container.appendChild(f);
    drawGrating(c, 3, 0.9, o, 110/5, 110);
  });
}

// ---------- Wiring ----------
document.querySelectorAll('[data-go]').forEach(b=> b.addEventListener('click', ()=> show(b.dataset.go)));
$('btnStart').addEventListener('click', ()=>{ updateCal(); show('cal'); });
$('btnHistory').addEventListener('click', ()=>{ const h=$('homeHistory'); h.hidden=!h.hidden; renderHistory(); });
$('btnClearHist').addEventListener('click', ()=>{ try{localStorage.removeItem('vcs-history');}catch(e){} renderHistory(); });
$('pxcm').addEventListener('input', updateCal);
$('dist').addEventListener('input', updateCal);
$('mode').addEventListener('change', e=> S.mode=e.target.value);
$('btnToInstr').addEventListener('click', ()=>{ updateCal(); show('instr'); });
$('btnBegin').addEventListener('click', ()=> startEye('right'));
$('btnLeft').addEventListener('click', ()=> startEye('left'));
document.querySelectorAll('[data-ans]').forEach(b=> b.addEventListener('click', ()=> answer(b.dataset.ans)));
document.addEventListener('keydown', e=>{
  if($('v-test').hidden) return;
  const k={ArrowLeft:'left',ArrowUp:'up',ArrowRight:'right',ArrowDown:'none'}[e.key];
  if(k){ e.preventDefault(); answer(k); }
});
$('btnAgain').addEventListener('click', ()=> show('instr'));
$('btnPdf').addEventListener('click', downloadPdf);
$('btnCopy').addEventListener('click', ()=>{
  const txt=$('summaryText').textContent;
  const done=()=>{ const t=document.createElement('div'); t.className='toast'; t.textContent='Summary copied'; document.body.appendChild(t); setTimeout(()=>t.remove(),1600); };
  try{ navigator.clipboard.writeText(txt).then(done).catch(()=>{ const r=document.createRange(); r.selectNodeContents($('summaryText')); const s=getSelection(); s.removeAllRanges(); s.addRange(r); }); }
  catch(e){ const r=document.createRange(); r.selectNodeContents($('summaryText')); const s=getSelection(); s.removeAllRanges(); s.addRange(r); }
});
window.addEventListener('resize', ()=>{ if(!$('v-test').hidden) drawGrating($('stim'), FREQS[S.col], CONTRAST[S.row], S.orient, S.ppd, Math.min(document.querySelector('.field').clientWidth-24, Math.max(160, Math.round(S.ppd*5)))); });

// init
try{ const c=JSON.parse(localStorage.getItem('vcs-cal')||'null'); if(c){ $('pxcm').value=c.pxPerCm; $('dist').value=c.distCm; } }catch(e){}
updateCal();
renderKey($('homeKey')); renderKey($('instrKey'));
show('home');
})();
