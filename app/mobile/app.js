'use strict';
/* MouldVision / VCS Screen — Phase 0 engine (v0.7.0) with Phase 1 additive extensions (v0.8.0): geometry sources, context module, front-end hooks
 * Spec: MouldVision Phase 0 Specification rev 2 (9 Oct 2026).
 * Unchanged from v0.6.0: drawGrating(), FREQS, SENS, CONTRAST, TILT, buildSequence(), calibration arithmetic,
 * the v1 scoring rule (highest sensitivity of any correct presented trial).
 */

// ---------- Versions and build ----------
const SOFTWARE_VERSION = 'v0.8.0';
const RECORD_SCHEMA = 1;
const SCORING_VERSION = 'score-v1-maxcorrect';
const STIMULUS_VERSION = 'gauss-0.42R-sRGB-dither-v1';
const PROTOCOLS = { full: 'full-5x9-v1', quick: 'quick-2miss-v1' };
const BUILD_TARGET = (typeof globalThis !== 'undefined' && globalThis.MV_BUILD_TARGET) || 'live';
const BUILD_VALIDATION = (typeof globalThis !== 'undefined' && globalThis.MV_VALIDATION) || null;
const BUILD_INFO = (typeof globalThis !== 'undefined' && globalThis.MV_BUILD) || { sourceHash: null, gitCommit: null, gitDirty: null, builtAt: null, verificationReason: 'unbuilt source' };
const STORE_KEY = BUILD_TARGET === 'staging' ? 'mv-staging-runs-v1' : 'mv-runs-v1';
const DRAFT_KEY = BUILD_TARGET === 'staging' ? 'mv-staging-draft' : 'mv-draft';
const EXPORTED_KEY = BUILD_TARGET === 'staging' ? 'mv-staging-exported' : 'mv-exported';
const LEGACY_KEY = 'vcs-history';
const STORAGE_WARN = 80, STORAGE_MAX = 100;
const BLANK_MS = (typeof globalThis !== 'undefined' && Number(globalThis.MV_BLANK_MS)) || 250;   // inter-stimulus blank; tests may shorten it
const SHOW_REFERENCE_CURVE = false;
const RENDERING_MODEL = 'sRGB transfer function, 8-bit per channel, mean grey code 128; display output not measured';
const HAS_DOM = typeof document !== 'undefined' && typeof document.getElementById === 'function';

// ---------- Test definition (unchanged) ----------
const FREQS = [1.5, 3, 6, 12, 18];                      // columns A–E, cycles/degree
const COLS = ['A','B','C','D','E'];
const SENS = Array.from({length:9}, (_,i) => 3.5 * Math.pow(200/3.5, i/8));
const CONTRAST = SENS.map(s => 1/s);
const HEALTHY = [75, 115, 110, 65, 30];                   // retained; drawn only when SHOW_REFERENCE_CURVE
const TILT = 15 * Math.PI/180;
const ORIENTS = ['left','up','right'];
const EXPLORATORY_FROM_ROW = 7;                            // rows 7–9 (1-based) exploratory pending N3

function srgb(lin){ return lin<=0.0031308 ? 12.92*lin : 1.055*Math.pow(lin,1/2.4)-0.055; }
function srgbToLin(v){ v/=255; return v<=0.04045 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); }
// Computed sine amplitude in 8-bit code values at mean grey 128 under the stated rendering model (arithmetic, not a measurement)
function codeAmplitude(contrast){ const m = srgbToLin(128); return (srgb(m*(1+contrast)) - srgb(m*(1-contrast)))*255/2; }
const LADDER = SENS.map((s,i)=>{ const c=CONTRAST[i]; const a=codeAmplitude(c); return { row:i+1, sensitivity:+s.toFixed(4), contrast:+c.toFixed(6), computedCodeAmplitude:+a.toFixed(2), subStepUnderModel:a<1, exploratory:i+1>=EXPLORATORY_FROM_ROW }; });

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
  'Valtonen V. Clinical diagnosis of the dampness and mold hypersensitivity syndrome: review of the literature and suggested diagnostic criteria. Front Immunol. 2017;8:951. doi:10.3389/fimmu.2017.00951',
  'Paulsen AJ, Schubert CR, Johnson LJ, et al. Association of cadmium and lead exposure with the incidence of contrast sensitivity impairment among middle-aged adults. JAMA Ophthalmol. 2018;136(12):1342-1350. doi:10.1001/jamaophthalmol.2018.3931',
  'Xiong YZ, Kwon M, Bittner AK, Virgili G, Giacomelli G, Legge GE. Relationship between acuity and contrast sensitivity: differences due to eye disease. Invest Ophthalmol Vis Sci. 2020;61(6):40. doi:10.1167/iovs.61.6.40'
];

// ---------- State ----------
const S = {
  pxPerCm: 40/8.56, distCm: 50, ppd: 0, mode: 'full',
  pxPerCmSource: 'card', distanceSource: 'typed', distanceStdCm: null, deviceModel: null,   // Phase 1: mobile front end sets these
  eye: 'right', col: 0, row: 0, orient: 'up',
  seq: [], seqIdx: 0, columnMisses: 0,
  run: null,
  trial: { state: 'IDLE', shownAt: 0, pointerId: null, sizePx: 0, discarded: 0 },
  calDevice: null,
  finalisePromise: null,
  blankTimer: null
};
const views = ['home','cal','instr','test','switch','results'];
const $ = id => HAS_DOM ? document.getElementById(id) : null;
const nowIso = () => { const d=new Date(); const off=-d.getTimezoneOffset(); const sg=off>=0?'+':'-'; const p=n=>String(Math.abs(n)).padStart(2,'0'); const loc=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,-1); return loc + sg + p(Math.floor(Math.abs(off)/60)) + ':' + p(Math.abs(off)%60); };
const perfNow = () => (typeof performance!=='undefined' && performance.now) ? performance.now() : Date.now();
const uuid = () => (typeof crypto!=='undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{ const r=Math.random()*16|0; return (c==='x'?r:(r&0x3|0x8)).toString(16); });
const safeStore = {
  get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } },
  set(k,v){ localStorage.setItem(k,v); },            // throws on purpose; callers handle
  remove(k){ try{ localStorage.removeItem(k); }catch(e){} },
  sget(k){ try{ return sessionStorage.getItem(k); }catch(e){ return null; } },
  sset(k,v){ try{ sessionStorage.setItem(k,v); }catch(e){} },
  sremove(k){ try{ sessionStorage.removeItem(k); }catch(e){} }
};

function show(v){ if(!HAS_DOM) return; views.forEach(x => { const el=$('v-'+x); if(el) el.hidden = (x!==v); }); renderSteps(v); if(typeof window!=='undefined' && window.scrollTo) window.scrollTo({top:0}); }
function renderSteps(v){
  const map = {home:0,cal:1,instr:2,test:3,switch:3,results:4};
  const el=$('steps'); if(!el) return;
  el.innerHTML = ['Start','Set up','Instructions','Test','Results'].map((t,i)=>`<span class="${i===map[v]?'on':''}">${t}</span>`).join('');
}

// ---------- Grating renderer (unchanged from v0.6.0) ----------
function drawGrating(canvas, cpd, contrast, orient, ppd, sizePx){
  const dpr = Math.min((typeof window!=='undefined' && window.devicePixelRatio)||1, 2);
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
      const u = dx*ct + dy*st;
      const env = Math.exp(-r2/(2*sigma*sigma));
      const lin = meanLin*(1 + contrast*env*Math.sin(2*Math.PI*cyclesPerPx*u));
      const dith = (((x*7 + y*13) % 17) / 17 - 0.5);
      const v = Math.max(0, Math.min(255, Math.round(srgb(lin)*255 + dith)));
      d[i]=d[i+1]=d[i+2]=v; d[i+3]=255;
    }
  }
  ctx.putImageData(img,0,0);
}

// ---------- Geometry set-up (size and distance only; no photometric calibration) ----------
function deviceSnapshot(){
  const w = typeof window!=='undefined' ? window : {};
  const nav = typeof navigator!=='undefined' ? navigator : {};
  const ua = String(nav.userAgent||'');
  const fam = /Firefox\/(\d+)/.test(ua) ? 'Firefox '+RegExp.$1 : /Edg\/(\d+)/.test(ua) ? 'Edge '+RegExp.$1 : /Chrome\/(\d+)/.test(ua) ? 'Chrome '+RegExp.$1 : /Version\/(\d+).*Safari/.test(ua) ? 'Safari '+RegExp.$1 : 'unknown';
  const os = /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Linux/.test(ua) ? 'Linux' : 'unknown';
  return { devicePixelRatio: w.devicePixelRatio||1, innerWidth: w.innerWidth||0, innerHeight: w.innerHeight||0, colorDepth: (w.screen&&w.screen.colorDepth)||null, userAgentFamily: fam+' / '+os, touch: !!(nav.maxTouchPoints), zoomChangedDuringRun: false };
}
/** Canvas pixels per CSS pixel actually drawn by drawGrating (its DPR cap of 2 is part of the unchanged stimulus renderer). */
function renderScale(){ return Math.min((typeof window!=='undefined' && window.devicePixelRatio)||1, 2); }
function geometry(){
  const ppd = S.ppd, rs = renderScale();
  return { pxPerCm:+S.pxPerCm.toFixed(2), pxPerCmSource:S.pxPerCmSource||'card', deviceModel:S.deviceModel||null,
    distanceCm:S.distCm, distanceSource:S.distanceSource||'typed', distanceStdCm:S.distanceStdCm==null?null:+S.distanceStdCm.toFixed(1),
    ppd:+ppd.toFixed(2), patchDeg:5.0, cardWidthMm:85.6,
    pxPerCycleAt18cpd:+(ppd/18).toFixed(2),                       // CSS pixels per cycle (Phase 0 field, kept)
    renderScale:rs, pxPerCycleAt18cpdRendered:+(ppd*rs/18).toFixed(2) };   // canvas pixels per cycle, the sampling that is actually drawn
}
function samplingBand(pxPerCycle){ return pxPerCycle < 2 ? 'not_representable' : pxPerCycle < 4 ? 'coarse' : 'adequate'; }
/** Sampling at 18 cpd as drawn: rendered canvas pixels per cycle when the record has it, else the CSS value (older records). */
function renderedPpc(g){ return g.pxPerCycleAt18cpdRendered!=null ? g.pxPerCycleAt18cpdRendered : g.pxPerCycleAt18cpd; }
function updateCal(){
  if(HAS_DOM && $('pxcm')){ S.pxPerCm = parseFloat($('pxcm').value); S.distCm = Math.max(20, parseFloat($('dist').value)||50); }
  S.ppd = S.pxPerCm * S.distCm * Math.tan(Math.PI/180);
  if(!HAS_DOM) return;
  const sz=$('sizer'); if(sz) sz.style.transform = `scale(${S.pxPerCm/ (96/2.54)})`;
  if($('pxcmOut')) $('pxcmOut').textContent = `${S.pxPerCm.toFixed(1)} px/cm  ·  ${(S.pxPerCm*2.54).toFixed(0)} px/inch`;
  const rs = renderScale(), ppc = S.ppd*rs/18;
  if($('calOut')) $('calOut').textContent = `pixels per degree: ${S.ppd.toFixed(1)}   ·   patch: 5.0° ≈ ${(S.ppd*5).toFixed(0)} px   ·   18 cpd sampled at ${ppc.toFixed(2)} canvas px per cycle (render scale ${rs})`;
  const w = $('calWarn');
  if(w){
    const band = samplingBand(ppc);
    if(band==='adequate'){ w.hidden=true; }
    else { w.hidden=false; w.textContent = band==='not_representable'
      ? `At ${S.distCm} cm the 18 cpd bars would be drawn at ${ppc.toFixed(2)} pixels per cycle, which cannot represent a grating at all. Column E will be reported as not drawn. Move back or use a higher-resolution screen.`
      : `At ${S.distCm} cm the 18 cpd bars are drawn at ${ppc.toFixed(2)} pixels per cycle: coarsely sampled, so column E's effective contrast is uncertain. More than 4 px per cycle (about ${Math.ceil(72/(S.pxPerCm*rs*Math.tan(Math.PI/180)))} cm on this screen) is better.`; }
  }
  try{ localStorage.setItem('vcs-cal', JSON.stringify({pxPerCm:S.pxPerCm, distCm:S.distCm})); }catch(e){}
}

// ---------- Sequence (unchanged) ----------
function buildSequence(){ const seq=[]; for(let c=0;c<5;c++) for(let r=0;r<9;r++) seq.push({c,r}); return seq; }

// ---------- Run lifecycle ----------
function storedRuns(){ try{ const a=JSON.parse(safeStore.get(STORE_KEY)||'[]'); return Array.isArray(a)?a:[]; }catch(e){ return []; } }
function exportedIds(){ try{ return JSON.parse(safeStore.get(EXPORTED_KEY)||'[]'); }catch(e){ return []; } }
function storageCheck(){ const n=storedRuns().length; return { count:n, warn:n>=STORAGE_WARN, full:n>=STORAGE_MAX }; }

function startRun(mode){
  S.mode = mode || S.mode;
  updateCal();
  S.calDevice = deviceSnapshot();
  S.run = {
    schema: RECORD_SCHEMA, id: uuid(), status: 'RUNNING_RIGHT',
    startedAt: nowIso(), completedAt: null,
    versions: { software: SOFTWARE_VERSION, buildTarget: BUILD_TARGET, protocol: PROTOCOLS[S.mode], scoring: SCORING_VERSION, stimulus: STIMULUS_VERSION, sourceHash: BUILD_INFO.sourceHash, gitCommit: BUILD_INFO.gitCommit, builtAt: BUILD_INFO.builtAt },
    geometry: geometry(), device: S.calDevice, ladder: LADDER, renderingModel: RENDERING_MODEL,
    trials: [], integrity: null, scoring: null,
    validation: buildValidation(), notes: []
  };
  S.finalisePromise = null;
  const sc = storageCheck();
  if(sc.full) S.run.notes.push('storage_full_at_start');
  else if(sc.warn) S.run.notes.push('storage_warning_at_start');
  return S.run;
}
function buildValidation(){
  const sw = BUILD_VALIDATION && BUILD_VALIDATION.software ? BUILD_VALIDATION.software : null;
  return {
    software: sw && sw.status==='passed' && sw.sourceHash && sw.sourceHash===BUILD_INFO.sourceHash ? { status:'passed', suite:sw.suite, version:sw.version, runAt:sw.runAt, passed:sw.passed, total:sw.total, sourceHash:sw.sourceHash, gitCommit:sw.gitCommit }
            : sw && sw.status==='failed' ? { status:'failed', suite:sw.suite, version:sw.version, runAt:sw.runAt, passed:sw.passed, total:sw.total, sourceHash:sw.sourceHash, gitCommit:sw.gitCommit }
            : { status:'not_run', suite:'phase0-T01-T28+phase1-M01-M15+guidance-G01-G07+site-W01-W05', version:SOFTWARE_VERSION, runAt:null, sourceHash:BUILD_INFO.sourceHash, reason: sw && sw.status==='passed' ? 'test results are for a different source hash' : (BUILD_INFO.verificationReason||'no test results for this build') },
    measurement: { status:'not_performed', method:null, displayRef:null, note:'display luminance and contrast not measured (N3 pending)' },
    clinical: { status:'not_performed', claim:'none', note:'no diagnostic or exposure claim' }
  };
}
function startEye(eye){
  S.eye = eye; S.seq = buildSequence(); S.seqIdx = 0; S.columnMisses = 0;
  S.run.status = eye==='right' ? 'RUNNING_RIGHT' : 'RUNNING_LEFT';
  if(HAS_DOM){
    if($('eyeTitle')) $('eyeTitle').textContent = eye==='right' ? 'Right eye' : 'Left eye';
    if($('coverPill')) $('coverPill').textContent = eye==='right' ? 'Cover your left eye' : 'Cover your right eye';
    show('test');
  }
  nextTrial();
}
function nextTrial(){
  if(S.seqIdx >= S.seq.length) return endOfEye();
  const t = S.seq[S.seqIdx];
  if(t.r===0) S.columnMisses = 0;
  S.col = t.c; S.row = t.r;
  S.orient = ORIENTS[Math.floor(Math.random()*3)];
  let sizePx = Math.max(160, Math.round(S.ppd*5));
  if(HAS_DOM){
    const field = document.querySelector('.field');
    if(field && field.clientWidth) sizePx = Math.min(field.clientWidth-24, sizePx);
    const stim=$('stim'); if(stim && stim.getContext) drawGrating(stim, FREQS[S.col], CONTRAST[S.row], S.orient, S.ppd, sizePx);
    const done = S.seqIdx + (S.eye==='left'?45:0);
    if($('prog')) $('prog').style.width = (100*done/90)+'%';
    if($('trialLabel')) $('trialLabel').textContent = `${COLS[S.col]}${S.row+1} · ${FREQS[S.col]} cpd · ${(CONTRAST[S.row]*100).toFixed(1)}% contrast · ${S.seqIdx+1}/45`;
    setAnswerButtons(true);
  }
  // zoom / DPR guard (recorded, not acted on in Phase 0)
  const dev = deviceSnapshot();
  if(S.calDevice && (dev.devicePixelRatio!==S.calDevice.devicePixelRatio || dev.innerWidth!==S.calDevice.innerWidth)) S.run.device.zoomChangedDuringRun = true;
  S.trial.sizePx = sizePx; S.trial.pointerId = null; S.trial.shownAt = perfNow();
  S.trial.state = 'ARMED';
}
function setAnswerButtons(enabled){ if(!HAS_DOM) return; document.querySelectorAll('[data-ans]').forEach(b=>{ b.disabled = !enabled; }); }

/** The only entry point for an answer. Synchronous guard first; nothing else runs unless the trial is ARMED. */
function submitAnswer(source, value, pointerId){
  if(S.trial.state !== 'ARMED'){ S.trial.discarded++; return false; }
  S.trial.state = 'LOCKED';
  const answeredAt = perfNow();
  const a = value;
  const correct = a === S.orient;
  const trial = {
    n: S.run.trials.length+1, eye:S.eye, col:COLS[S.col], cpd:FREQS[S.col], row:S.row+1, contrast:+CONTRAST[S.row].toFixed(6), sensitivity:+SENS[S.row].toFixed(4),
    presented:true, orient:S.orient, answer:a, correct, source:source||'unknown', pointerId: pointerId==null?null:pointerId,
    shownAt:+S.trial.shownAt.toFixed(1), answeredAt:+answeredAt.toFixed(1), latencyMs: Math.round(answeredAt - S.trial.shownAt),
    sizePx:S.trial.sizePx, dpr:(typeof window!=='undefined'&&window.devicePixelRatio)||1, ppd:+S.ppd.toFixed(2)
  };
  // Phase 1 hook: a front end may add measurement fields (viewing distance, swipe angle) to the trial before it is recorded and hashed.
  if(typeof globalThis!=='undefined' && typeof globalThis.MV_TRIAL_DECORATE==='function'){ try{ globalThis.MV_TRIAL_DECORATE(trial, S.run); }catch(e){} }
  S.run.trials.push(trial);
  S.columnMisses = correct ? 0 : S.columnMisses+1;
  S.seqIdx++;
  if(S.mode==='quick' && S.columnMisses>=2){
    while(S.seqIdx < S.seq.length && S.seq[S.seqIdx].c===S.col){
      const r = S.seq[S.seqIdx].r;
      S.run.trials.push({ n:S.run.trials.length+1, eye:S.eye, col:COLS[S.col], cpd:FREQS[S.col], row:r+1, contrast:+CONTRAST[r].toFixed(6), sensitivity:+SENS[r].toFixed(4),
        presented:false, orient:null, answer:null, correct:null, reason:'quick-stop' });
      S.seqIdx++;
    }
  }
  saveDraft();
  setAnswerButtons(false);
  if(S.seqIdx >= S.seq.length){ S.trial.state='IDLE'; endOfEye(); return true; }
  S.trial.state = 'BLANK';
  if(HAS_DOM){ if($('fix')) $('fix').hidden=false; if($('stim')) $('stim').style.visibility='hidden'; }
  S.blankTimer = setTimeout(()=>{ if(HAS_DOM){ if($('fix')) $('fix').hidden=true; if($('stim')) $('stim').style.visibility='visible'; } nextTrial(); }, BLANK_MS);
  return true;
}
function endOfEye(){
  if(S.eye==='right'){ S.run.status='SWITCH'; saveDraft(); S.trial.state='IDLE'; if(HAS_DOM) show('switch'); return; }
  const p = finaliseRun();
  if(HAS_DOM){ p.then(()=>{ renderResults(); show('results'); }); }
}
function saveDraft(){ if(!S.run) return; safeStore.sset(DRAFT_KEY, JSON.stringify(S.run)); }

// ---------- Integrity ----------
function canonical(obj){
  if(obj===null || typeof obj!=='object') return JSON.stringify(obj);
  if(Array.isArray(obj)) return '['+obj.map(canonical).join(',')+']';
  return '{'+Object.keys(obj).sort().map(k=>JSON.stringify(k)+':'+canonical(obj[k])).join(',')+'}';
}
const INTEGRITY_SCOPE = ['schema','id','versions','geometry','device','ladder','renderingModel','trials'];
function integrityPayload(run){ const o={}; INTEGRITY_SCOPE.forEach(k=>{ o[k]=run[k]; }); return canonical(o); }
async function sha256Hex(str){
  const subtle = (typeof crypto!=='undefined' && crypto.subtle) ? crypto.subtle : null;
  if(!subtle) throw new Error('crypto.subtle unavailable');
  const buf = await subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function computeIntegrity(run){
  const payload = integrityPayload(run);
  const base = { algorithm:'SHA-256', scope:INTEGRITY_SCOPE.slice(), canonical:'JSON, keys sorted, no whitespace, UTF-8', hash:null, hashError:null,
    meaning:'integrity check against accidental alteration or corruption; computed locally, so it is not proof of origin or authenticity' };
  try{ base.hash = await sha256Hex(payload); }catch(e){ base.hashError = String(e && e.message || e); }
  return base;
}

/** Executes exactly once per run (idempotent via status + cached promise). */
function finaliseRun(){
  if(!S.run) return Promise.resolve(null);
  if(S.finalisePromise) return S.finalisePromise;
  if(['COMPLETE','COMPLETE_UNSAVED','FINALISING'].includes(S.run.status)) return Promise.resolve(S.run);
  S.run.status = 'FINALISING';
  S.finalisePromise = (async () => {
    const run = S.run;
    run.completedAt = nowIso();
    run.scoring = scoreRun(run);
    try{ run.guidance = guidanceForRun(run, guidanceHistory(run)); }catch(e){ run.guidance = null; }   // outside INTEGRITY_SCOPE: derived, versioned, recomputable
    run.integrity = await computeIntegrity(run);
    const sc = storageCheck();
    if(sc.full){ run.status='COMPLETE_UNSAVED'; run.unsavedReason='storage_limit'; }
    else {
      try{ const arr = storedRuns(); arr.unshift(run); run.status='COMPLETE'; safeStore.set(STORE_KEY, JSON.stringify(arr)); }
      catch(e){ run.status='COMPLETE_UNSAVED'; run.unsavedReason='storage_error: '+String(e && e.name || e); }
    }
    if(run.status==='COMPLETE') safeStore.sremove(DRAFT_KEY); else saveDraft();
    return run;
  })();
  return S.finalisePromise;
}

// ---------- Scoring (v1 rule unchanged; counts over presented trials only) ----------
function scoreEye(trials, eye){
  const own = trials.filter(t=>t.eye===eye);
  const presented = own.filter(t=>t.presented);
  const out = { presented:presented.length, correct:presented.filter(t=>t.correct===true).length, incorrect:presented.filter(t=>t.correct===false && t.answer!=='none').length,
    cantSee:presented.filter(t=>t.answer==='none').length, notPresented:own.length-presented.length, scheduled:own.length,
    lowestContrastCorrect:[], lowestContrastCorrectRows1to6:[], isolated:[], byColumn:[] };
  COLS.forEach(col=>{
    const ct = own.filter(t=>t.col===col).sort((a,b)=>a.row-b.row);
    const ok = ct.filter(t=>t.presented && t.correct===true);
    const best = ok.length ? Math.max(...ok.map(t=>t.sensitivity)) : null;                 // v1 rule
    const okCore = ok.filter(t=>t.row<EXPLORATORY_FROM_ROW);
    const bestCore = okCore.length ? Math.max(...okCore.map(t=>t.sensitivity)) : null;
    let isolated=false;
    if(best!==null){ const bestRow = ok.find(t=>t.sensitivity===best).row; isolated = ct.some(t=>t.presented && t.row<bestRow && t.correct!==true); }
    out.lowestContrastCorrect.push(best); out.lowestContrastCorrectRows1to6.push(bestCore); out.isolated.push(isolated);
    out.byColumn.push({ col, presented:ct.filter(t=>t.presented).length, correct:ok.length, notPresented:ct.filter(t=>!t.presented).length });
  });
  return out;
}
function scoreRun(run){
  const R = scoreEye(run.trials,'right'), L = scoreEye(run.trials,'left');
  const inter = COLS.map((_,i)=> (R.lowestContrastCorrect[i] && L.lowestContrastCorrect[i]) ? +(Math.log10(R.lowestContrastCorrect[i]) - Math.log10(L.lowestContrastCorrect[i])).toFixed(3) : null);
  return { version:SCORING_VERSION, right:R, left:L, interocularLog10:inter, presented:R.presented+L.presented, correct:R.correct+L.correct, scheduled:R.scheduled+L.scheduled };
}

// ---------- Toxin-context module (Phase 1 §5): context and data, never a result; never read by scoring ----------
const CONTEXT_VERSION = 'context-v2';   // v1 approved 11 Oct 2026; v2 adds night/glare driving and diabetes, and the cadmium evidence (approved same day)
const CONTEXT_PARAGRAPH = 'Why environmental toxin exposure matters to this test. Contrast sensitivity, the ability to see faint patterns, is one of the visual functions reported to change with exposure to a range of toxic agents. Published work has linked reduced contrast sensitivity at the middle spatial frequencies to living or working in water-damaged buildings [7, 8, 12], to exposure to toxins from cyanobacteria and dinoflagellates [4, 5, 6], and to solvents and other volatile organic compounds. In a ten-year study of middle-aged adults, higher cadmium levels, largely from tobacco smoke, predicted new loss of contrast sensitivity [17]. The same function declines with age and alcohol, and changes with cataract, refractive error, glaucoma, macular disease, diabetes, medication and some neurological conditions [10, 11, 18], which is why a result on its own cannot identify a cause [13, 14, 15]. MouldVision records your contrast function and, if you choose, the exposures and conditions you tell us about, so that changes over time can be read alongside what is happening in your environment. Testing the building itself (air and surface sampling) is the way to find out whether mould is present.';
const CONTEXT_ITEMS = [
  { id:'mouldSmell',   q:'Visible mould or a musty smell at home or work in the last 12 months', type:'choice', options:['none','some','substantial'] },
  { id:'waterDamage',  q:'Water damage, flooding or persistent damp in the last 12 months', type:'choice', options:['no','yes'] },
  { id:'sampling',     q:'Building sampling done', type:'choice', options:['none','BHS kit','professional assessment'], extra:'BHS job or kit number (optional)' },
  { id:'symptoms',     q:'Symptoms you associate with being in the building', type:'choice', options:['none','some','many'], extra:'Describe (optional)' },
  { id:'smoking',      q:'Currently smoking or vaping', type:'choice', options:['no','yes'] },
  { id:'alcohol24h',   q:'Alcohol in the last 24 hours', type:'choice', options:['no','yes'] },
  { id:'solvents',     q:'Regular exposure to solvents, paints, fuels or pesticides', type:'choice', options:['no','yes'] },
  { id:'eyeConditions',q:'Known eye conditions', type:'multi', options:['none','cataract','glaucoma','macular disease','other'] },
  { id:'diabetes',     q:'Diabetes (diagnosed by a doctor)', type:'choice', options:['no','yes'] },
  { id:'correction',   q:'Wearing your usual glasses or contacts now', type:'choice', options:['yes','no','none needed'] },
  { id:'nightDriving', q:'Difficulty seeing when driving at night or with glare', type:'choice', options:['no','some','a lot','do not drive'] },
  { id:'medication',   q:'Medications that affect vision (as told by a doctor)', type:'choice', options:['no','yes'] },
  { id:'treatment',    q:'Under treatment for mould- or biotoxin-related illness', type:'choice', options:['no','yes'] },
  { id:'ageBand',      q:'Age band', type:'choice', options:['18–29','30–39','40–49','50–59','60–69','70+'] }
];
/** Validates answers against CONTEXT_ITEMS; returns { ok, answers, errors }. Unknown ids and values are rejected, free text is capped. */
function validateContext(answers){
  const out={}, errors=[]; const a = answers && typeof answers==='object' ? answers : {};
  CONTEXT_ITEMS.forEach(it=>{
    const v = a[it.id]; if(v==null || v==='') return;
    if(it.type==='choice'){ if(it.options.includes(v)) out[it.id]=v; else errors.push(it.id+': not an option'); }
    else if(it.type==='multi'){ const arr = Array.isArray(v)?v:[v]; if(arr.every(x=>it.options.includes(x))) out[it.id]=arr; else errors.push(it.id+': not an option'); }
    if(it.extra && a[it.id+'Text']!=null){ const t=String(a[it.id+'Text']).slice(0,200); if(t) out[it.id+'Text']=t; }
  });
  Object.keys(a).forEach(k=>{ if(!CONTEXT_ITEMS.some(it=>it.id===k || it.id+'Text'===k)) errors.push(k+': unknown item'); });
  return { ok:errors.length===0, answers:out, errors };
}
/** Attaches the context block to a run (and to its stored copy). Outside INTEGRITY_SCOPE by design: it is context, not test data, and scoring never reads it. */
function setRunContext(run, answers, meta){
  const v = validateContext(answers||{});
  run.context = { version:CONTEXT_VERSION, shownParagraph:true, answered:Object.keys(v.answers).length>0, answers:v.answers, answeredAt: Object.keys(v.answers).length?nowIso():null, ...(meta||{}) };
  try{ const arr=storedRuns(); const i=arr.findIndex(r=>r.id===run.id); if(i>=0){ arr[i].context=run.context; safeStore.set(STORE_KEY, JSON.stringify(arr)); } }catch(e){}
  return run.context;
}
function contextToldLines(run){
  const c = run.context; if(!c || !c.answered) return [];
  return CONTEXT_ITEMS.filter(it=> c.answers[it.id]!=null).map(it=>{ const v=c.answers[it.id]; const t=c.answers[it.id+'Text']; return `${it.q}: ${Array.isArray(v)?v.join(', '):v}${t?` (${t})`:''}`; });
}

// ---------- Guidance (guidance-v1-provisional; approved by Dr Cameron Jones, 11 Oct 2026) ----------
// Action-based summary of a result: what to do next, never a statement about the person's condition or its cause.
// Reads only the scored trials, the recorded test conditions and the person's own earlier runs. Never reads run.context.
// Rows 7–9 (exploratory) never contribute. Thresholds are provisional until the Phase B normative sample reports.
const GUIDANCE_VERSION = 'guidance-v1-provisional';
const LADDER_STEP_LOG = Math.log10(200/3.5)/8;            // one contrast row ≈ 0.22 log10 units
const GUIDANCE_RULES = { easyCols:['A','B','C'], easyMaxRow:3, easyMissesForCheck:2, faceSeenMin:0.8, driftMax:3, eyeDiffSteps:2, eyeDiffMinAdjacent:2, baselineDropSteps:2, baselineDropMinCols:2, baselineRuns:2 };
const TIER_ORDER = { none:0, repeat:1, eyecheck:2 };
const TIER_TEXT = {
  none:     { label:'Nothing in this result calls for action', text:'You identified the easier patches in every column with both eyes, the test conditions were steady, and nothing changed beyond what this test usually varies. Keep this as a baseline and repeat it in about three months under the same conditions.' },
  repeat:   { label:'Repeat to confirm', text:'Something in this run is uncertain. Repeat the test within a week, same phone, same room, same distance, before reading anything into it.' },
  eyecheck: { label:'Worth an eye check', text:'This is a reason to see an optometrist, whatever the cause. Take this report with you. It does not say what the cause is; an eye examination does.' }
};
function lowestRow(eyeScore, i){ const v = eyeScore.lowestContrastCorrectRows1to6[i]; if(v==null) return 0; let k=0; SENS.forEach((s,j)=>{ if(Math.abs(Math.log10(s/v)) < Math.abs(Math.log10(SENS[k]/v))) k=j; }); return k+1; }   // nearest ladder row (record stores rounded sensitivities)   // 0 = nothing identified in rows 1–6
function adjacentRun(flags){ let best=0, cur=0; flags.forEach(f=>{ cur = f ? cur+1 : 0; best=Math.max(best,cur); }); return best; }
function eyeDiffColumns(sc){ return COLS.map((_,i)=>{ const r=lowestRow(sc.right,i), l=lowestRow(sc.left,i); return { d:r-l, big: Math.abs(r-l) >= GUIDANCE_RULES.eyeDiffSteps }; }); }
/** history: earlier COMPLETE runs of the same person/device, oldest first (the app passes its local store). */
function guidanceForRun(run, history){
  const sc = run.scoring; if(!sc) return null;
  const R = GUIDANCE_RULES, out = { version:GUIDANCE_VERSION, tier:'none', reasons:[], why:[] };
  const raise = (tier, code, why) => { out.reasons.push(code); out.why.push(why); if(TIER_ORDER[tier] > TIER_ORDER[out.tier]) out.tier = tier; };
  // a. run quality (conditions only; never accuracy)
  const q = [];
  const pres = run.trials.filter(t=>t.presented);
  const cam = pres.filter(t=>t.distanceSource && t.distanceSource!=='typed');
  if(cam.length){ const seen = cam.filter(t=>(t.distanceSamples||0)>0).length/cam.length; if(seen < R.faceSeenMin) q.push(`the camera could not see your face for ${Math.round(100*(1-seen))} % of the patches`); }
  const drift = (run.geometry && run.geometry.driftEvents) || 0; if(drift > R.driftMax) q.push(`your distance from the screen changed ${drift} times during the test`);
  if(run.device && run.device.zoomChangedDuringRun) q.push('the screen zoom changed during the test');
  if((run.notes||[]).includes('app_backgrounded_during_test')) q.push('the app was left during the test');
  // answers mirrored: on clearly visible patches (rows 1–3), Left and Right answered as the opposite lean far more often than correctly
  const lr = run.trials.filter(t=>t.presented && t.row<=3 && (t.orient==='left'||t.orient==='right') && (t.answer==='left'||t.answer==='right'));
  const mirrored = lr.filter(t=>t.answer!==t.orient).length, lrRight = lr.length - mirrored;
  const swapped = lr.length >= 8 && mirrored >= 6 && mirrored >= 2*lrRight;
  if(swapped) q.push(`your Left and Right answers look reversed: on the clearly visible patches, ${mirrored} of ${lr.length} leaning patches were answered with the opposite lean. Check that the button you tap leans the same way as the bars, then repeat`);
  out.leftRightMirrored = { mirrored, total: lr.length, swapped };
  const reliable = q.length===0;
  if(!reliable) raise('repeat', swapped ? 'left_right_swapped' : 'conditions', 'Test conditions: ' + q.join('; ') + '.');
  // b. easy-patch check: rows 1–3 of columns A–C, seen by almost any adult with healthy, corrected eyes, on any phone
  ['right','left'].forEach(eye=>{
    const easy = run.trials.filter(t=>t.eye===eye && R.easyCols.includes(t.col) && t.row<=R.easyMaxRow);
    const missed = easy.filter(t=>t.presented ? t.correct!==true : true);
    if(missed.length >= R.easyMissesForCheck){
      const where = missed.map(t=>t.col+t.row).join(', ');
      raise(reliable ? 'eyecheck' : 'repeat', 'easy_'+eye, `${eye==='right'?'Right':'Left'} eye missed ${missed.length} of the ${easy.length} easiest patches (${where}), which most adults with healthy, corrected eyes identify.`);
    }
  });
  // c. between the eyes: ≥2 contrast steps apart in ≥2 adjacent columns (rows 1–6 only)
  const dif = eyeDiffColumns(sc);
  if(adjacentRun(dif.map(x=>x.big)) >= R.eyeDiffMinAdjacent){
    const cols = COLS.filter((_,i)=>dif[i].big).join(', ');
    const prev = (history||[]).filter(h=>h.scoring).slice(-1)[0];
    const repeated = prev && (()=>{ const pd = eyeDiffColumns(prev.scoring); return adjacentRun(dif.map((x,i)=>x.big && pd[i].big && Math.sign(pd[i].d)===Math.sign(x.d))) >= R.eyeDiffMinAdjacent; })();
    raise(repeated && reliable ? 'eyecheck' : 'repeat', repeated ? 'eyes_differ_repeated' : 'eyes_differ', `Your two eyes differed by two or more contrast steps in columns ${cols}${repeated ? ', as they did in your previous test' : ''}.`);
  }
  // d. against the person's own baseline (first two earlier runs)
  const base = (history||[]).filter(h=>h.scoring).slice(0, R.baselineRuns);
  out.baseline = base.length >= R.baselineRuns ? base.map(b=>b.id) : null;
  if(out.baseline){
    ['right','left'].forEach(eye=>{
      const drops = COLS.map((c,i)=>{ const now = lowestRow(sc[eye], i); const b = base.map(h=>lowestRow(h.scoring[eye], i)); const bmean = b.reduce((a,v)=>a+v,0)/b.length; return { c, drop: bmean - now }; }).filter(x=>x.drop >= R.baselineDropSteps);
      if(drops.length >= R.baselineDropMinCols) raise('repeat', 'baseline_'+eye, `${eye==='right'?'Right':'Left'} eye: changed since your baseline, two or more contrast steps lower in columns ${drops.map(x=>x.c).join(', ')}.`);
    });
  }
  if(out.reasons.some(r=>r.startsWith('baseline_')) && out.tier==='repeat') out.label = 'Changed since your baseline: repeat to confirm';
  out.label = out.label || TIER_TEXT[out.tier].label; out.text = TIER_TEXT[out.tier].text;
  if(out.tier==='none') out.why.push(out.baseline ? 'Both eyes are within two contrast steps of your baseline in every column.' : 'This is one of your first runs; a second run in 2–14 days sets your personal baseline.');
  out.computedAt = nowIso();
  return out;
}
function guidanceHistory(run){ return storedRuns().filter(r=>r.id!==run.id && r.status==='COMPLETE' && r.scoring && (r.completedAt||'') < (run.completedAt||'~')).sort((a,b)=>(a.completedAt||'').localeCompare(b.completedAt||'')); }

// ---------- Report text (section 5 wording; counts always from the record) ----------
const FORBIDDEN_LABELS = ['positive','negative','pass','fail','clear','flagged','abnormal','biotoxin','mould','mycotoxin','cirs'];
function fmtSens(v){ return v==null ? '–' : v>=100 ? v.toFixed(0) : v.toFixed(1); }
function fmtPct(c){ return (100*c).toFixed(c<0.01?2:1)+' %'; }
function reportText(run){
  const sc = run.scoring, g = run.geometry, d = run.device, R=sc.right, L=sc.left;
  const quick = run.versions.protocol.startsWith('quick');
  const ppc = renderedPpc(g), band = samplingBand(ppc);
  const rsNote = g.renderScale!=null ? ` (${g.pxPerCycleAt18cpd.toFixed(2)} CSS pixels at a render scale of ${g.renderScale}${d.devicePixelRatio>2?`; the display's own scale is ${d.devicePixelRatio}, so the browser enlarged the drawn patch by ${(d.devicePixelRatio/g.renderScale).toFixed(2)}×, which can soften the finest bars`:''})` : '';
  const sampling = band==='not_representable'
    ? `The finest bars (18 cycles per degree) would have needed ${ppc.toFixed(2)} pixels per cycle on this screen${rsNote}, which cannot represent a grating at all, so column E is reported as not drawn.`
    : band==='coarse'
    ? `The finest bars (18 cycles per degree) were drawn at ${ppc.toFixed(2)} pixels per cycle${rsNote}. A sampled grating needs more than two pixels per cycle to be represented at all, and several more before its rendered contrast and shape approach the nominal values; at ${ppc.toFixed(2)} pixels per cycle the column E patches were coarsely sampled and their effective contrast is uncertain.`
    : `The finest bars (18 cycles per degree) were drawn at ${ppc.toFixed(2)} pixels per cycle${rsNote}, adequately sampled for this purpose; their rendered contrast was still not measured.`;
  const srcPx = g.pxPerCmSource||'card', srcD = g.distanceSource||'typed';
  const sizeSentence = srcPx==='card' ? `Screen size was set from a bank card (${g.pxPerCm.toFixed(1)} px/cm)`
    : srcPx==='table-exact' ? `Screen pixel density was taken from a device table (${g.deviceModel||'model matched'}: ${g.pxPerCm.toFixed(1)} px/cm)`
    : srcPx==='table-class' ? `Screen pixel density was estimated from the device's density class (${g.pxPerCm.toFixed(1)} px/cm, about ±10 %)`
    : `Screen pixel density was set as ${g.pxPerCm.toFixed(1)} px/cm (${srcPx})`;
  const disp = run.mobile && run.mobile.display ? run.mobile.display : null;
  const displayNote = disp ? `; you ${disp.brightnessMaxConfirmed?'confirmed':'did not confirm'} that brightness was at maximum and ${disp.nightShiftOffConfirmed?'confirmed':'did not confirm'} that colour filters were off${disp.lighting?`, and reported ${disp.lighting==='daylight'?'indoor daylight':disp.lighting==='artificial'?'artificial light':'dim light'}`:''}` : '';
  const sd = g.distanceStdCm!=null ? `, varying by ±${g.distanceStdCm} cm (one standard deviation) over the test` : '';
  const distSentence = srcD==='typed' ? `viewing distance entered as ${g.distanceCm} cm`
    : srcD==='camera-iris-assumedFov' ? `viewing distance was estimated by the front camera from the apparent size of the iris, using an assumed camera focal length (about ±20 %), averaging ${g.distanceCm} cm${sd}`
    : srcD==='camera-iris-calibrated' ? `viewing distance was estimated by the front camera from the apparent size of the iris, with the camera's focal length set by a one-time distance check, averaging ${g.distanceCm} cm${sd}`
    : `viewing distance ${g.distanceCm} cm (${srcD})`;
  const scheduledEye = 45;
  const s1 = quick
    ? `This test showed you up to ${scheduledEye} circular patches of faint parallel bars for each eye, at five bar widths (1.5, 3, 6, 12 and 18 cycles per degree) and nine contrast levels from 28.6 % down to 0.5 %. The quick protocol stops a column after two consecutive misses, so ${R.notPresented} right-eye and ${L.notPresented} left-eye patches were not presented; ${R.presented} and ${L.presented} were. For each patch you chose whether the bars tilted left, stood upright or tilted right. The charts and tables record exactly what you were shown and what you answered. They describe how faint a pattern you identified; they do not identify a cause.`
    : `This test showed you ${R.presented} circular patches of faint parallel bars for the right eye and ${L.presented} for the left, at five bar widths (1.5, 3, 6, 12 and 18 cycles per degree) and nine contrast levels from 28.6 % down to 0.5 %. For each patch you chose whether the bars tilted left, stood upright or tilted right. The charts and tables record exactly what you were shown and what you answered. They describe how faint a pattern you identified; they do not identify a cause.`;
  const s2 = `${sizeSentence} and ${distSentence}, giving ${g.ppd.toFixed(1)} pixels per degree. Brightness, colour settings and room lighting were not measured${displayNote}. ${sampling} The three faintest contrast levels have, under the assumed rendering model (sRGB transfer function, 8-bit display, mid-grey background), computed amplitudes below one display step; what contrast those patches actually produced on this screen was not measured, and they are marked exploratory. Protocol: ${quick?'quick (stop after two consecutive misses)':'full (every patch presented)'}. ${d.zoomChangedDuringRun ? 'Browser zoom or display scaling changed during the test; results may not be comparable.' : 'No change in browser zoom was detected during the test.'}`;
  const s4 = `At each bar width the lowest contrast identified by the right eye and the left eye differed by ${sc.interocularLog10.map(v=>v==null?'–':v.toFixed(2)).join(' / ')} log units (a value above zero means the right eye identified a fainter patch). Differences of this size between a person's eyes can arise from the test's own variability; whether they are meaningful has not been established for this test.`;
  const s5 = `This is a self-administered screen on an uncalibrated consumer display. Results depend on the screen, its settings, the room, attention and guessing (one in three answers would be right by chance). Each contrast level was shown once per eye, so a single lucky or unlucky answer moves the result. The test has not been validated against clinical contrast sensitivity instruments, and no normal range has been established for it. Reduced contrast sensitivity, where present, has many possible causes, including uncorrected refractive error, cataract, glaucoma, macular disease, diabetes, medication, alcohol and fatigue.`;
  const s6 = `This test does not tell you whether your vision needs attention; an eye examination does. See an optometrist or your doctor if you have persistent difficulty seeing in dim light, fog, rain or glare, difficulty reading or recognising faces, any visual symptoms such as blur, haloes, distortion or a shadow in your vision, or any sudden change in your sight, which needs same-day attention. A consistent change across repeat tests taken under the same conditions is also worth discussing. Take this report with you; the numbers and charts are meant to be read alongside a clinical examination, not instead of one.`;
  const s7 = `A contrast sensitivity result on its own does not identify mould, mycotoxin or any other environmental exposure, and cannot diagnose any illness. Research has reported group-level associations between reduced contrast sensitivity and exposure to water-damaged buildings; it has also reported that the handheld chart version does not separate exposed people from controls, and expert bodies have concluded that no validated test for such exposure exists. Questions about your home or workplace are answered by an environmental assessment, and questions about your health by a medical practitioner.`;
  const v = run.validation;
  const src = run.versions.sourceHash ? ` · Source ${run.versions.sourceHash.slice(0,12)}${run.versions.gitCommit?` · Commit ${run.versions.gitCommit.slice(0,8)}`:''}` : ' · Source hash unavailable';
  const swLine = v.software.status==='passed' ? `Software verification: passed, suite ${v.software.suite}, ${v.software.version}, ${v.software.runAt}${v.software.total?` (${v.software.passed}/${v.software.total} tests)`:''}, bound to source ${String(v.software.sourceHash).slice(0,12)}.`
               : v.software.status==='failed' ? `Software verification: FAILED for this build (${v.software.suite}).`
               : `Software verification: not verified for this build (${v.software.reason||'no test results'}).`;
  const ident = `Run ${run.id} · ${run.completedAt||run.startedAt} · Software ${run.versions.software} (${run.versions.buildTarget}) · Protocol ${run.versions.protocol} · Scoring ${run.versions.scoring} · Stimulus ${run.versions.stimulus} · Integrity SHA-256 ${run.integrity&&run.integrity.hash ? run.integrity.hash.slice(0,12) : 'unavailable'} over test definition and responses (local integrity check, not proof of origin) · Geometry ${g.pxPerCm.toFixed(1)} px/cm (${srcPx}), ${g.distanceCm} cm (${srcD}), ${g.ppd.toFixed(1)} px/°, ${ppc.toFixed(2)} px/cycle at 18 cpd, DPR ${d.devicePixelRatio}${g.renderScale!=null?`, render scale ${g.renderScale}`:''}${run.context?` · Context ${run.context.version}`:''}${run.guidance?` · Guidance ${run.guidance.version}`:''}${src}`;
  // Phase 1 §5: context section only when the run carries a context block (mobile front end); desktop runs are unchanged
  const s8 = run.context ? CONTEXT_PARAGRAPH : null;
  const told = contextToldLines(run);
  const valid = `${swLine} Physical measurement validation: not performed. Clinical validation: not performed; no diagnostic or exposure claim.`;
  const banner = `Right eye ${R.correct} of ${R.presented} patches identified · Left eye ${L.correct} of ${L.presented} · Clinical significance not established`;
  const under = e => `${e.correct} of ${e.presented} presented patches identified; ${e.cantSee} answered can't see; ${e.notPresented} not presented; ${e.isolated.filter(Boolean).length} isolated correct responses.`;
  return { heading:'Visual contrast test results', banner, guidance:run.guidance||null, guidanceNote:'How this summary works: it is based on which patches you identified, the test conditions and your own earlier runs. It says what to do next, not what the cause is. Rules '+GUIDANCE_VERSION+'.', s1, s2, s4, s5, s6, s7, s8, told, toldHeading:'What you told us', s8Heading:'8. Environmental context', ident, valid, underRight:under(R), underLeft:under(L),
    storage:'Records are kept in this browser only. They are not permanent, not encrypted and not a clinical record. Export any record you want to keep.',
    chartCaption:'Lowest contrast correctly identified (descriptive; one presentation per level)',
    bandCaption:'Exploratory: computed sub-step amplitude under the assumed rendering model; displayed contrast not measured' };
}

// ---------- SVG chart ----------
function chartSVG(run, eye){
  const sc = eye==='right' ? run.scoring.right : run.scoring.left;
  const trials = run.trials.filter(t=>t.eye===eye);
  const W=360, H=340, left=48, right=48, top=18, bottom=60;
  const pw = W-left-right, ph = H-top-bottom;
  const ymin=Math.log10(3), ymax=Math.log10(250);
  const Y = s => top + ph*(1-(Math.log10(s)-ymin)/(ymax-ymin));
  const X = c => left + pw*(c+0.5)/5;
  let g='';
  // exploratory band rows 7–9
  const bTop = Y(SENS[8])-8, bBot = Y(SENS[6])+8;
  g += `<defs><pattern id="hatch-${eye}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="var(--line)" stroke-width="1"/></pattern></defs>`;
  g += `<rect x="${left}" y="${bTop}" width="${pw}" height="${bBot-bTop}" fill="url(#hatch-${eye})"/>`;
  g += `<text x="${left+pw/2}" y="${bTop-3}" text-anchor="middle" font-size="8.5" fill="var(--muted)">exploratory rows 7–9: computed sub-step amplitude; displayed contrast not measured</text>`;
  [5,10,20,50,100,200].forEach(s=>{ g+=`<line x1="${left}" x2="${W-right}" y1="${Y(s)}" y2="${Y(s)}" stroke="var(--line)"/><text x="${left-6}" y="${Y(s)+4}" text-anchor="end" font-size="10" fill="var(--muted)">${s}</text>`; });
  [0.5,1,2,5,10,20].forEach(p=>{ const s=100/p; g+=`<text x="${W-right+6}" y="${Y(s)+4}" font-size="10" fill="var(--muted)">${p}</text>`; });
  g += `<text transform="translate(12 ${top+ph/2}) rotate(-90)" text-anchor="middle" font-size="10" fill="var(--muted)">Contrast sensitivity</text>`;
  g += `<text transform="translate(${W-10} ${top+ph/2}) rotate(90)" text-anchor="middle" font-size="10" fill="var(--muted)">Percent contrast</text>`;
  COLS.forEach((c,i)=>{ g+=`<text x="${X(i)}" y="${H-bottom+16}" text-anchor="middle" font-size="11" font-weight="700" fill="var(--fg)">${c}</text><text x="${X(i)}" y="${H-bottom+29}" text-anchor="middle" font-size="9" fill="var(--muted)">(${FREQS[i]})</text>`; });
  g += `<text x="${left+pw/2}" y="${H-6}" text-anchor="middle" font-size="10" fill="var(--muted)">Cycles per degree (cpd)</text>`;
  if(SHOW_REFERENCE_CURVE) g += `<polyline fill="none" stroke="var(--muted)" stroke-width="1.5" points="${HEALTHY.map((h,i)=>`${X(i)},${Y(h)}`).join(' ')}"/>`;
  // descriptive line: solid for core rows, dashed when it enters the exploratory band
  const pts = sc.lowestContrastCorrect.map((s,i)=> s? {x:X(i),y:Y(s),expl:s>=SENS[EXPLORATORY_FROM_ROW-1]-1e-9} : null);
  for(let i=0;i<4;i++){ const a=pts[i], b=pts[i+1]; if(!a||!b) continue; const dashed = a.expl||b.expl; g += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="var(--bad)" stroke-width="2.5"${dashed?' stroke-dasharray="5 4"':''}/>`; }
  // markers
  trials.forEach(t=>{
    const x=X(COLS.indexOf(t.col)), y=Y(t.sensitivity);
    if(!t.presented){ g += `<circle cx="${x}" cy="${y}" r="4.2" fill="none" stroke="var(--muted)" stroke-width="1.2"/>`; return; }
    const ang = t.orient==='left'? -TILT : t.orient==='right'? TILT : 0;
    g += `<line x1="${x}" y1="${y}" x2="${x+9*Math.sin(ang)}" y2="${y-9*Math.cos(ang)}" stroke="var(--fg)" stroke-width="1.5"/>`;
    if(t.correct===false && t.answer!=='none'){ const a2 = t.answer==='left'? -TILT : t.answer==='right'? TILT : 0; g += `<line x1="${x}" y1="${y}" x2="${x+9*Math.sin(a2)}" y2="${y-9*Math.cos(a2)}" stroke="var(--bad)" stroke-width="1.5"/>`; }
    const iso = sc.isolated[COLS.indexOf(t.col)] && t.correct && t.sensitivity===sc.lowestContrastCorrect[COLS.indexOf(t.col)];
    if(iso) g += `<circle cx="${x}" cy="${y}" r="7" fill="none" stroke="var(--warn)" stroke-width="1.5"/>`;
    g += `<circle cx="${x}" cy="${y}" r="4.2" fill="${t.correct?'var(--good)':'var(--bad)'}" stroke="var(--surface)" stroke-width="1"/>`;
  });
  // legend
  const ly = H-bottom+42;
  g += `<line x1="${left}" y1="${ly}" x2="${left+18}" y2="${ly}" stroke="var(--bad)" stroke-width="2.5"/><text x="${left+22}" y="${ly+3}" font-size="8.5" fill="var(--fg)">Lowest contrast correctly identified (descriptive; one presentation per level)</text>`;
  g += `<circle cx="${left+6}" cy="${ly+12}" r="3.5" fill="var(--good)"/><text x="${left+13}" y="${ly+15}" font-size="8.5" fill="var(--fg)">identified</text>`;
  g += `<circle cx="${left+66}" cy="${ly+12}" r="3.5" fill="var(--bad)"/><text x="${left+73}" y="${ly+15}" font-size="8.5" fill="var(--fg)">not identified</text>`;
  g += `<circle cx="${left+146}" cy="${ly+12}" r="3.5" fill="none" stroke="var(--muted)"/><text x="${left+153}" y="${ly+15}" font-size="8.5" fill="var(--fg)">not presented</text>`;
  g += `<circle cx="${left+226}" cy="${ly+12}" r="5" fill="none" stroke="var(--warn)" stroke-width="1.5"/><text x="${left+235}" y="${ly+15}" font-size="8.5" fill="var(--fg)">isolated</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${eye} eye contrast results">${g}</svg>`;
}

// ---------- Results view ----------
function renderResults(){
  if(!HAS_DOM) return;
  const run = S.run, T = reportText(run), sc = run.scoring;
  const unsaved = run.status==='COMPLETE_UNSAVED';
  const stor = storageCheck();
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const col = (e)=> `<table><tr><th>Column</th>${COLS.map((c,i)=>`<th>${c} (${FREQS[i]})</th>`).join('')}</tr>
    <tr><td>Presented</td>${e.byColumn.map(b=>`<td class="mono">${b.presented}</td>`).join('')}</tr>
    <tr><td>Identified</td>${e.byColumn.map(b=>`<td class="mono">${b.correct}</td>`).join('')}</tr>
    <tr><td>Lowest contrast identified</td>${e.lowestContrastCorrect.map((v,i)=>`<td class="mono">${v==null?'–':fmtPct(1/v)}${e.isolated[i]?' <span class="tag na" title="isolated: a miss at an easier level">iso</span>':''}</td>`).join('')}</tr>
    <tr><td>Same, rows 1–6 only</td>${e.lowestContrastCorrectRows1to6.map(v=>`<td class="mono">${v==null?'–':fmtPct(1/v)}</td>`).join('')}</tr></table>`;
  $('v-results').innerHTML = `
    ${unsaved ? `<div class="notice crit" id="unsavedNotice" role="alert"><strong>This result has not been saved.</strong> ${run.unsavedReason==='storage_limit' ? 'The local store already holds '+stor.count+' records; export your records and delete the ones you have exported to make room.' : 'This browser refused to store it ('+esc(run.unsavedReason)+').'} Closing or reloading this page may lose it. <button class="primary" id="btnExportNow">Export JSON now</button></div>` : ''}
    ${!unsaved && stor.warn ? `<div class="notice">${stor.count} of ${STORAGE_MAX} local records used. Export your records; the page will stop saving at ${STORAGE_MAX} and never deletes records itself.</div>` : ''}
    <div class="card stack">
      <h2>${T.heading}</h2>
      ${T.guidance ? `<div class="guide tier-${T.guidance.tier}" id="guideCard"><div class="glabel">${esc(T.guidance.label)}</div><p class="small">${esc(T.guidance.text)}</p><ul class="small">${T.guidance.why.map(w=>`<li>${esc(w)}</li>`).join('')}</ul><div class="small muted">${esc(T.guidanceNote)}</div></div>` : ''}
      <div class="banner neutral">${esc(T.banner)}</div>
      <div class="small muted">${esc(T.storage)}</div>
    </div>
    <div class="card stack"><h3>1. What was measured</h3><p class="small">${esc(T.s1)}</p></div>
    <div class="card stack"><h3>2. Test conditions and their reliability</h3><p class="small">${esc(T.s2)}</p></div>
    <div class="card stack"><h3>3. Results per eye and bar width</h3>
      <div class="charts">
        <div class="chart"><h3 style="text-align:center">Left eye</h3>${chartSVG(run,'left')}<div class="cap small">${esc(T.underLeft)}</div><div class="tablewrap">${col(sc.left)}</div></div>
        <div class="chart"><h3 style="text-align:center">Right eye</h3>${chartSVG(run,'right')}<div class="cap small">${esc(T.underRight)}</div><div class="tablewrap">${col(sc.right)}</div></div>
      </div></div>
    <div class="card stack"><h3>4. Differences between the eyes</h3><p class="small">${esc(T.s4)}</p></div>
    <div class="card stack"><h3>5. Limitations</h3><p class="small">${esc(T.s5)}</p></div>
    <div class="card stack"><h3>6. When to consult someone</h3><p class="small">${esc(T.s6)}</p></div>
    <div class="card stack"><h3>7. What this test does not show</h3><p class="small">${esc(T.s7)}</p></div>
    ${T.s8 ? `<div class="card stack"><h3>${esc(T.s8Heading)}</h3><p class="small">${esc(T.s8)}</p>${T.told.length ? `<h3>${esc(T.toldHeading)}</h3><ul class="small">${T.told.map(l=>`<li>${esc(l)}</li>`).join('')}</ul><p class="small muted">Recorded as context beside the test record. It is not used in any calculation.</p>` : ''}</div>` : ''}
    <div class="card stack"><h3>Identification</h3><p class="mono small" style="white-space:pre-wrap">${esc(T.ident)}\n${esc(T.valid)}</p>
      <div class="row"><button class="primary" id="btnPdf">Download PDF report</button><button id="btnExport">Export JSON record</button><button id="btnAgain">Run again</button><button class="ghost" data-go="home">Home</button></div></div>`;
  $('btnPdf').addEventListener('click', downloadPdf);
  $('btnExport').addEventListener('click', ()=>exportRun(run));
  if($('btnExportNow')) $('btnExportNow').addEventListener('click', ()=>exportRun(run));
  $('btnAgain').addEventListener('click', ()=>{ S.run=null; S.finalisePromise=null; show('instr'); });
  document.querySelectorAll('#v-results [data-go]').forEach(b=> b.addEventListener('click', ()=> show(b.dataset.go)));
}

// ---------- History ----------
function renderHistory(){
  if(!HAS_DOM || !$('histTable')) return;
  const runs = storedRuns(); const T = $('histTable');
  let html = `<tr><td colspan="7" class="small muted">Records are kept in this browser only. They are not permanent, not encrypted and not a clinical record. Export any record you want to keep. ${runs.length} of ${STORAGE_MAX} used.</td></tr>`;
  if(runs.length){
    html += '<tr><th>Date</th><th>Versions</th><th>Geometry</th><th>Right</th><th>Left</th><th>Status</th><th></th></tr>';
    runs.forEach((r,i)=>{
      const prev = runs[i+1];
      const differ = prev && (prev.geometry.distanceCm!==r.geometry.distanceCm || prev.geometry.pxPerCm!==r.geometry.pxPerCm || prev.device.devicePixelRatio!==r.device.devicePixelRatio || JSON.stringify(prev.versions)!==JSON.stringify(r.versions));
      html += `<tr><td class="mono">${new Date(r.completedAt||r.startedAt).toLocaleString()}</td><td class="mono small">${r.versions.software} · ${r.versions.protocol}</td><td class="mono small">${r.geometry.distanceCm} cm · ${r.geometry.pxPerCm} px/cm · DPR ${r.device.devicePixelRatio}${differ?' <span class="tag na">conditions differ</span>':''}</td><td class="mono">${r.scoring.right.correct}/${r.scoring.right.presented}</td><td class="mono">${r.scoring.left.correct}/${r.scoring.left.presented}</td><td><span class="tag na">${r.status}</span></td><td><button class="ghost small" data-export="${r.id}">Export</button></td></tr>`;
    });
  } else html += '<tr><td colspan="7" class="muted">No records on this device yet.</td></tr>';
  let legacy=[]; try{ legacy=JSON.parse(safeStore.get(LEGACY_KEY)||'[]'); }catch(e){}
  if(legacy.length){ html += `<tr><th colspan="7">Legacy (v0.6.0, thresholds only; read-only)</th></tr>` + legacy.map(e=>`<tr><td class="mono" colspan="7">${new Date(e.t).toLocaleString()} · total ${e.total}/90 · R ${e.R.map(t=>t?Math.round(t):'–').join('/')} · L ${e.L.map(t=>t?Math.round(t):'–').join('/')}</td></tr>`).join(''); }
  T.innerHTML = html;
  T.querySelectorAll('[data-export]').forEach(b=> b.addEventListener('click', ()=>{ const r=storedRuns().find(x=>x.id===b.dataset.export); if(r) exportRun(r); }));
  const ea=$('btnExportAll'); if(ea){ ea.hidden = runs.length===0; }
  const de=$('btnDeleteExported'); if(de){ const ex=exportedIds(); const n=runs.filter(r=>ex.includes(r.id)).length; de.hidden = n===0; de.textContent = `Delete ${n} exported record${n===1?'':'s'}…`; }
}
function deleteExportedConfirmed(){
  const ex = exportedIds(); const runs = storedRuns(); const keep = runs.filter(r=>!ex.includes(r.id));
  try{ safeStore.set(STORE_KEY, JSON.stringify(keep)); }catch(e){ toast('Could not update the store'); }
  renderHistory();
}

// ---------- Export / download ----------
async function deliverFile(name, data){
  if(typeof globalThis!=='undefined' && typeof globalThis.MV_DELIVER==='function') return globalThis.MV_DELIVER(name, data);   // Phase 1: mobile share sheet
  const dl = (typeof claude!=='undefined' && claude && claude.use) ? await claude.use('downloads').catch(()=>null) : null;
  if(dl){ await dl.save({filename:name, data}); return 'saved'; }
  if(!HAS_DOM) return 'no-dom';
  const blob = data instanceof Blob ? data : new Blob([data], {type:'application/octet-stream'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 5000); return 'downloaded';
}
function exportFilename(run){ return `mouldvision-run-${run.id}.json`; }
function exportJson(run){ return JSON.stringify(run, null, 2); }
async function exportRun(run){
  try{ const r = await deliverFile(exportFilename(run), exportJson(run)); if(r!=='no-dom'){ markExported(run.id); toast('Record exported'); } }
  catch(e){ if(e && e.code==='declined') toast('Export cancelled'); else toast('Could not export'+(e&&e.message?': '+e.message:'')); }
}
function markExported(id){ try{ const ex=exportedIds(); if(!ex.includes(id)){ ex.push(id); safeStore.set(EXPORTED_KEY, JSON.stringify(ex)); } }catch(e){} renderHistory(); }
async function exportAll(){ const runs=storedRuns(); if(!runs.length) return; try{ await deliverFile(`mouldvision-runs-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(runs,null,2)); runs.forEach(r=>markExported(r.id)); toast('All records exported'); }catch(e){ toast('Could not export'); } }

// ---------- PDF ----------
function pdfChart(doc, run, eye, x0, y0, w, h){
  const sc = eye==='right' ? run.scoring.right : run.scoring.left;
  const trials = run.trials.filter(t=>t.eye===eye);
  const left=x0+12, right=x0+w-12, top=y0+10, bottom=y0+h-16;
  const pw=right-left, ph=bottom-top;
  const ymin=Math.log10(3), ymax=Math.log10(250);
  const Y = s => top + ph*(1-(Math.log10(s)-ymin)/(ymax-ymin));
  const X = c => left + pw*(c+0.5)/5;
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(20);
  doc.text(eye==='right'?'Right eye':'Left eye', x0+w/2, y0+3, {align:'center'});
  // exploratory band
  const bTop=Y(SENS[8])-2.4, bBot=Y(SENS[6])+2.4;
  doc.setFillColor(240,240,240); doc.rect(left, bTop, pw, bBot-bTop, 'F');
  doc.setDrawColor(200); doc.setLineWidth(0.15); for(let xx=left; xx<right; xx+=2){ doc.line(xx, bBot, Math.min(xx+ (bBot-bTop), right), bTop); }
  doc.setFontSize(6); doc.setTextColor(90); doc.setFont('helvetica','italic'); doc.text('exploratory rows 7–9: computed sub-step amplitude; displayed contrast not measured', left+pw/2, bTop-1, {align:'center'}); doc.setFont('helvetica','normal');
  doc.setDrawColor(215,222,227); doc.setLineWidth(0.2); doc.setFontSize(7); doc.setTextColor(90);
  [5,10,20,50,100,200].forEach(s=>{ doc.line(left, Y(s), right, Y(s)); doc.text(String(s), left-1.5, Y(s)+1, {align:'right'}); });
  [0.5,1,2,5,10,20].forEach(p=>{ doc.text(String(p), right+1.5, Y(100/p)+1); });
  doc.text('Contrast sensitivity', x0+3, top+ph/2, {angle:90, align:'center'});
  doc.text('Percent contrast', x0+w-2, top+ph/2, {angle:-90, align:'center'});
  COLS.forEach((c,i)=>{ doc.setFont('helvetica','bold'); doc.setTextColor(20); doc.text(c, X(i), bottom+4, {align:'center'}); doc.setFont('helvetica','normal'); doc.setTextColor(90); doc.text(`(${FREQS[i]})`, X(i), bottom+7.5, {align:'center'}); });
  doc.text('Cycles per degree (cpd)', left+pw/2, bottom+12, {align:'center'});
  if(SHOW_REFERENCE_CURVE){ doc.setDrawColor(128); doc.setLineWidth(0.4); for(let i=0;i<4;i++) doc.line(X(i),Y(HEALTHY[i]),X(i+1),Y(HEALTHY[i+1])); }
  const th = sc.lowestContrastCorrect;
  doc.setDrawColor(196,60,47); doc.setLineWidth(0.7);
  for(let i=0;i<4;i++){ if(!(th[i]&&th[i+1])) continue; const expl = th[i]>=SENS[6]-1e-9 || th[i+1]>=SENS[6]-1e-9; if(expl) doc.setLineDashPattern([1.5,1.2],0); doc.line(X(i),Y(th[i]),X(i+1),Y(th[i+1])); if(expl) doc.setLineDashPattern([],0); }
  trials.forEach(t=>{
    const ci=COLS.indexOf(t.col), x=X(ci), y=Y(t.sensitivity);
    if(!t.presented){ doc.setDrawColor(150); doc.setLineWidth(0.3); doc.circle(x,y,1.2,'S'); return; }
    const ang = t.orient==='left'? -TILT : t.orient==='right'? TILT : 0;
    doc.setDrawColor(20); doc.setLineWidth(0.35); doc.line(x, y, x+2.6*Math.sin(ang), y-2.6*Math.cos(ang));
    if(t.correct===false && t.answer!=='none'){ const a2 = t.answer==='left'? -TILT : t.answer==='right'? TILT : 0; doc.setDrawColor(196,60,47); doc.line(x, y, x+2.6*Math.sin(a2), y-2.6*Math.cos(a2)); }
    const iso = sc.isolated[ci] && t.correct && t.sensitivity===th[ci];
    if(iso){ doc.setDrawColor(184,114,10); doc.setLineWidth(0.4); doc.circle(x,y,2.0,'S'); }
    if(t.correct) doc.setFillColor(31,138,76); else doc.setFillColor(196,60,47);
    doc.setDrawColor(255); doc.setLineWidth(0.2); doc.circle(x, y, 1.2, 'FD');
  });
  doc.setDrawColor(196,60,47); doc.setLineWidth(0.7); doc.line(left, bottom+16, left+6, bottom+16);
  doc.setTextColor(20); doc.setFontSize(6.5); doc.text('Lowest contrast correctly identified (descriptive; one presentation per level)', left+8, bottom+17);
  doc.setFontSize(6.5); doc.setFillColor(31,138,76); doc.circle(left+2, bottom+21, 1, 'F'); doc.text('identified', left+5, bottom+22);
  doc.setFillColor(196,60,47); doc.circle(left+24, bottom+21, 1, 'F'); doc.text('not identified', left+27, bottom+22);
  doc.setDrawColor(150); doc.circle(left+50, bottom+21, 1, 'S'); doc.text('not presented', left+53, bottom+22);
  doc.setDrawColor(184,114,10); doc.circle(left+76, bottom+21, 1.4, 'S'); doc.text('isolated', left+80, bottom+22);
  doc.setFont('helvetica','bold'); doc.setFontSize(8.5);
  doc.text(`${sc.correct} of ${sc.presented} presented patches identified`, x0+w/2, bottom+28, {align:'center'});
  doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(90);
  doc.text(`${sc.cantSee} can't see · ${sc.notPresented} not presented · ${sc.isolated.filter(Boolean).length} isolated`, x0+w/2, bottom+32, {align:'center'});
}
function logoDataUri(){
  if(!HAS_DOM) return (typeof globalThis!=='undefined' && globalThis.MV_LOGO) || null;
  const img=$('bhsLogo'); if(!img) return null;
  const src=img.getAttribute('src')||''; if(src.startsWith('data:')) return src;
  try{ const c=document.createElement('canvas'); c.width=img.naturalWidth; c.height=img.naturalHeight; c.getContext('2d').drawImage(img,0,0); return c.toDataURL('image/png'); }catch(e){ return null; }
}
function buildPdf(run){
  const { jsPDF } = (typeof window!=='undefined' && window.jspdf) ? window.jspdf : globalThis.jspdf;
  const doc = new jsPDF({unit:'mm', format:'a4', compress:true});
  const W=210, M=14, T = reportText(run);
  const LOGO = logoDataUri();
  if(LOGO){ try{ doc.addImage(LOGO, 'PNG', M, 10, 52, 52*875/3405, undefined, 'FAST'); }catch(e){} }
  doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.setTextColor(11,110,142);
  doc.text('MouldVision', M+57, 15.5);
  doc.setFontSize(8.5); doc.setFont('helvetica','normal'); doc.setTextColor(90);
  doc.text('Visual contrast test report', M+57, 20);
  doc.text('Concept: Dr Cameron Jones, PhD  ·  www.biologicalhealthservices.com.au', M+57, 24.5);
  doc.setFontSize(13); doc.setFont('helvetica','bold'); doc.setTextColor(20);
  doc.text(T.heading, W-M, 15.5, {align:'right'});
  if(run.versions.buildTarget==='staging'){ doc.setFontSize(8); doc.setTextColor(184,114,10); doc.text('STAGING BUILD', W-M, 20.5, {align:'right'}); }
  doc.setFontSize(8.5); doc.setFont('helvetica','normal'); doc.setTextColor(20);
  let y=34;
  const meta=[['Run:', run.id, 'Completed:', run.completedAt||'—'],['Protocol:', run.versions.protocol+(run.versions.protocol.startsWith('quick')?' (stop after two consecutive misses)':' (every patch presented)'), 'Name:', '______________________'],['Geometry:', `${run.geometry.distanceCm} cm (${run.geometry.distanceSource||'typed'}) · ${run.geometry.pxPerCm} px/cm (${run.geometry.pxPerCmSource||'card'}) · ${run.geometry.ppd} px/deg · ${renderedPpc(run.geometry)} px/cycle at 18 cpd`, 'Status:', run.status]];
  meta.forEach(r=>{ doc.setFont('helvetica','bold'); doc.text(r[0], M, y); doc.setFont('helvetica','normal'); doc.text(r[1], M+20, y); doc.setFont('helvetica','bold'); doc.text(r[2], 134, y); doc.setFont('helvetica','normal'); doc.text(r[3], 152, y); y+=4.5; });
  doc.setDrawColor(11,110,142); doc.setLineWidth(0.5); doc.line(M, y, W-M, y); y+=3;
  doc.setFillColor(226,241,246); doc.rect(M, y, W-2*M, 8, 'F');
  doc.setTextColor(20); doc.setFont('helvetica','bold'); doc.setFontSize(9.2);
  doc.text(T.banner, W/2, y+5.4, {align:'center'}); y+=11;
  if(T.guidance){ const G=T.guidance, col = G.tier==='none' ? [11,110,142] : G.tier==='repeat' ? [184,114,10] : [122,62,122];
    doc.setFont('helvetica','normal'); doc.setFontSize(8); const body = doc.splitTextToSize(G.text + ' ' + G.why.join(' '), W-2*M-10); const h = 9 + body.length*3.5;
    doc.setFillColor(248,248,248); doc.rect(M, y, W-2*M, h, 'F'); doc.setFillColor(col[0],col[1],col[2]); doc.rect(M, y, 2.2, h, 'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(col[0],col[1],col[2]); doc.text(G.label, M+6, y+5.6);
    doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(40); doc.text(body, M+6, y+10); y += h + 3; }
  if(run.status==='COMPLETE_UNSAVED'){ doc.setFillColor(253,241,220); doc.rect(M, y, W-2*M, 6, 'F'); doc.setFontSize(8); doc.setTextColor(120,70,0); doc.text('This record was not saved in the browser; keep the exported JSON file.', W/2, y+4, {align:'center'}); y+=8; }
  pdfChart(doc, run, 'left', M, y, (W-2*M)/2-2, 100);
  pdfChart(doc, run, 'right', W/2+2, y, (W-2*M)/2-2, 100);
  y+=138;
  const PAGE_BOTTOM = 276;
  const id = run.id;
  const footer = () => { const n=doc.getNumberOfPages(); for(let i=1;i<=n;i++){ doc.setPage(i); doc.setDrawColor(215,222,227); doc.setLineWidth(0.2); doc.line(M, 283, W-M, 283); doc.setFontSize(7); doc.setTextColor(90); doc.setFont('helvetica','bold'); doc.text('Biological Health Services', M, 287); doc.setFont('helvetica','normal'); doc.text('Level 1, 459 Toorak Road, Toorak VIC 3142  ·  Laboratory: 7/4 Weddel Court, Laverton North VIC 3026', M, 290.3); doc.text('www.biologicalhealthservices.com.au  ·  Concept: Dr Cameron Jones, PhD  ·  environmental microbiology, not a clinical service', M, 293.6); doc.setTextColor(120); doc.text(`MouldVision ${run.versions.software} · ${id.slice(0,8)} · page ${i} of ${n}`, W-M, 287, {align:'right'}); } };
  const ensure = (h) => { if(y + h > PAGE_BOTTOM){ doc.addPage(); y = 20; } };
  const para = (text, size=8.2, color=20, gap=2.5) => { doc.setFont('helvetica','normal'); doc.setFontSize(size); doc.setTextColor(color); const lines=doc.splitTextToSize(text, W-2*M); const lh=size*0.44; ensure(lines.length*lh); doc.text(lines, M, y); y += lines.length*lh + gap; };
  const heading = (text, size=9.5) => { ensure(size*0.5+6); doc.setFont('helvetica','bold'); doc.setFontSize(size); doc.setTextColor(20); doc.text(text, M, y); y += size*0.5+1.5; };
  heading('1. What was measured'); para(T.s1);
  heading('2. Test conditions and their reliability'); para(T.s2);
  heading('3. Results per eye and bar width');
  para('Each circle is one patch, placed by its contrast and bar width. Green: tilt identified. Red: not identified; the red tail shows the tilt chosen, the black tail the true tilt. Hollow: not presented (quick protocol). A ring marks an isolated correct response, one with a miss at an easier level. The hatched band covers rows 7–9, which are exploratory. The red line joins the lowest contrast correctly identified in each column and is dashed where it enters the exploratory band.', 7.8, 40, 2);
  const labelW = 44, cw=(W-2*M-labelW)/6;
  const colX = i => M+labelW+cw*i+1;
  const table = (label, e) => { ensure(26); doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(20); doc.text(label, M, y); y+=4; doc.setFontSize(7.5); ['A (1.5)','B (3)','C (6)','D (12)','E (18)','Total'].forEach((h,i)=> doc.text(h, colX(i), y)); y+=1.5; doc.setDrawColor(200); doc.setLineWidth(0.2); doc.line(M,y,W-M,y); y+=3.5; doc.setFont('helvetica','normal');
    const rows=[['Presented', e.byColumn.map(b=>b.presented), e.presented],['Identified', e.byColumn.map(b=>b.correct), e.correct],['Lowest contrast identified', e.lowestContrastCorrect.map((v,i)=> v==null?'–':fmtPct(1/v)+(e.isolated[i]?' *':'')), ''],['Same, rows 1–6 only', e.lowestContrastCorrectRows1to6.map(v=> v==null?'–':fmtPct(1/v)), '']];
    rows.forEach(r=>{ doc.text(r[0], M+1, y); r[1].forEach((v,i)=> doc.text(String(v), colX(i), y)); doc.text(String(r[2]), colX(5), y); y+=4; }); y+=1; };
  table('Right eye', run.scoring.right); table('Left eye', run.scoring.left);
  para('* isolated: the defining correct response has a miss at an easier contrast level.', 7, 90, 3);
  heading('4. Differences between the eyes'); para(T.s4);
  heading('5. Limitations'); para(T.s5);
  heading('6. When to consult someone'); para(T.s6);
  heading('7. What this test does not show'); para(T.s7, 8.2, 20, 4);
  if(T.s8){ heading(T.s8Heading); para(T.s8, 8.2, 20, 2.5); if(T.told.length){ heading(T.toldHeading, 8.5); T.told.forEach(l=> para('• '+l, 7.8, 20, 1)); para('Recorded as context beside the test record. It is not used in any calculation.', 7.2, 90, 4); } }
  heading('Identification', 9); para(T.ident, 7.4, 40, 1.5); para(T.valid, 7.4, 40, 4);
  heading('Evidence status', 9.5);
  para('Visual contrast sensitivity measures how faint a pattern can be discriminated across spatial frequencies. It depends on both optical factors (refractive error, clarity of the cornea and lens, pupil size, light scatter) and neural factors (retina, optic nerve and visual cortex), so reduced sensitivity can arise from ocular disease such as cataract, glaucoma or macular disease, from uncorrected refractive error, and from neurological conditions, medication, alcohol and fatigue. Shoemaker popularised it as a bedside marker of biotoxin-related illness after exposure to water-damaged buildings. The evidence is mixed and the test is not validated as a diagnostic tool for mould-related illness.', 7.6, 40, 1.8);
  para('A NIOSH study (ref 12) found lower VCS values at every spatial frequency among employees of a severely water-damaged school than at a comparison school, with more rash, respiratory and constitutional symptoms, yet advised against recommending VCS for mould-exposed people because earlier studies used non-representative samples, lacked comparison groups, characterised exposure poorly and were confounded by conditions such as fibromyalgia and chronic fatigue. A 2026 four-method comparison (ref 13) found the handheld Shoemaker chart did not separate exposed people from controls while digital tests did; the digital tools remain investigational and their figures do not apply to this software.', 7.6, 40, 1.8);
  para('The American College of Medical Toxicology (ref 14) states there is no validated biomarker for mould or mycotoxin exposure; a Lancet Infectious Diseases review (ref 15) notes no diagnostic test exists for building-related illness; a proposed framework for dampness and mould hypersensitivity syndrome (ref 16) uses clinical and exposure criteria only. In an Australian clinical context VCS should be treated as non-validated and not a stand-alone diagnostic or monitoring tool.', 7.6, 40, 3);
  heading('References', 9.5);
  REFS.forEach((r,i)=> para(`${i+1}. ${r}`, 7.4, 40, 1.3));
  footer();
  return doc.output('blob');
}
async function downloadPdf(){
  const btn=$('btnPdf'); if(!S.run) return;
  if(!(typeof window!=='undefined' && window.jspdf)){ toast('PDF library did not load; use Export JSON instead.'); return; }
  btn.disabled=true; btn.textContent='Preparing PDF…';
  try{ const blob=buildPdf(S.run); const r = await deliverFile(`MouldVision-report-${S.run.id.slice(0,8)}.pdf`, blob); if(r!=='no-dom') toast('PDF saved'); }
  catch(e){ if(e && e.code==='declined') toast('Download cancelled'); else toast('Could not save the PDF'+(e&&e.message?': '+e.message:'')); }
  finally{ btn.disabled=false; btn.textContent='Download PDF report'; }
}
function toast(msg){ if(!HAS_DOM) return; const t=document.createElement('div'); t.className='toast'; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(),2400); }

// ---------- Orientation key ----------
function renderKey(container){
  if(!container) return; container.innerHTML = '';
  ORIENTS.forEach(o=>{ const f=document.createElement('figure'); const c=document.createElement('canvas'); f.appendChild(c); const cap=document.createElement('figcaption'); cap.textContent = o[0].toUpperCase()+o.slice(1); f.appendChild(cap); container.appendChild(f); drawGrating(c, 3, 0.9, o, 110/5, 110); });
}

// ---------- Interrupted draft ----------
function loadDraft(){ try{ const d=JSON.parse(safeStore.sget(DRAFT_KEY)||'null'); return d && d.schema===RECORD_SCHEMA ? d : null; }catch(e){ return null; } }
function renderDraftBanner(){
  if(!HAS_DOM || !$('draftBanner')) return;
  const d = loadDraft(); const el=$('draftBanner');
  if(!d || d.status==='COMPLETE'){ el.hidden=true; return; }
  const incomplete = { ...d, status: d.status==='COMPLETE_UNSAVED' ? 'COMPLETE_UNSAVED' : 'INCOMPLETE', scoring: d.status==='COMPLETE_UNSAVED' ? d.scoring : null };
  el.hidden=false;
  el.innerHTML = `<strong>${incomplete.status==='COMPLETE_UNSAVED' ? 'An unsaved completed test was found.' : 'An interrupted test was found.'}</strong> ${incomplete.trials.length} trial${incomplete.trials.length===1?'':'s'} recorded, started ${new Date(d.startedAt).toLocaleString()}. ${incomplete.status==='INCOMPLETE' ? 'It cannot be scored or reported; you can export it or discard it.' : 'You can export it or discard it.'} <button id="btnDraftExport">Export JSON</button> <button class="ghost" id="btnDraftDiscard">Discard</button>`;
  $('btnDraftExport').addEventListener('click', ()=> exportRun(incomplete));
  $('btnDraftDiscard').addEventListener('click', ()=>{ safeStore.sremove(DRAFT_KEY); renderDraftBanner(); });
}

// ---------- Wiring ----------
function wire(){
  if(!HAS_DOM || !$('v-home')) return;
  const st=$('stagingBanner'); if(st) st.hidden = BUILD_TARGET!=='staging';
  document.querySelectorAll('[data-go]').forEach(b=> b.addEventListener('click', ()=> show(b.dataset.go)));
  $('btnStart').addEventListener('click', ()=>{ updateCal(); show('cal'); });
  $('btnHistory').addEventListener('click', ()=>{ const h=$('homeHistory'); h.hidden=!h.hidden; renderHistory(); });
  if($('btnExportAll')) $('btnExportAll').addEventListener('click', exportAll);
  if($('btnDeleteExported')) $('btnDeleteExported').addEventListener('click', ()=>{ const c=$('confirmDelete'); c.hidden=false; });
  if($('btnDeleteYes')) $('btnDeleteYes').addEventListener('click', ()=>{ $('confirmDelete').hidden=true; deleteExportedConfirmed(); });
  if($('btnDeleteNo')) $('btnDeleteNo').addEventListener('click', ()=>{ $('confirmDelete').hidden=true; });
  $('pxcm').addEventListener('input', updateCal);
  $('dist').addEventListener('input', updateCal);
  $('mode').addEventListener('change', e=> S.mode=e.target.value);
  $('btnToInstr').addEventListener('click', ()=>{ updateCal(); const r = startRun($('mode').value); const sc=storageCheck(); const n=$('storeNotice'); if(n){ n.hidden = !(sc.warn||sc.full); n.textContent = sc.full ? `The local store holds ${sc.count} records and will not save this run; it can still be exported. Export your records and delete exported ones from the history view.` : `${sc.count} of ${STORAGE_MAX} local records used. Export your records soon; the page never deletes them itself.`; } show('instr'); });
  $('btnBegin').addEventListener('click', ()=>{ if(!S.run) startRun($('mode').value); startEye('right'); });
  $('btnLeft').addEventListener('click', ()=> startEye('left'));
  document.querySelectorAll('[data-ans]').forEach(b=>{
    b.addEventListener('pointerup', e=>{ submitAnswer(e.pointerType||'pointer', b.dataset.ans, e.pointerId); });
    b.addEventListener('click', e=>{ e.preventDefault(); });   // keyboard activation of buttons is handled by keydown below
  });
  document.addEventListener('keydown', e=>{
    if(!$('v-test') || $('v-test').hidden) return;
    if(e.repeat){ S.trial.discarded++; return; }
    const k={ArrowLeft:'left',ArrowUp:'up',ArrowRight:'right',ArrowDown:'none'}[e.key];
    if(k){ e.preventDefault(); submitAnswer('keyboard', k, null); }
  });
  window.addEventListener('resize', ()=>{ if($('v-test') && !$('v-test').hidden && S.trial.state==='ARMED'){ const stim=$('stim'); const field=document.querySelector('.field'); const sizePx=Math.min(field.clientWidth-24, Math.max(160, Math.round(S.ppd*5))); drawGrating(stim, FREQS[S.col], CONTRAST[S.row], S.orient, S.ppd, sizePx); S.trial.sizePx=sizePx; } });
  window.addEventListener('beforeunload', e=>{ if(S.run && (S.run.status==='COMPLETE_UNSAVED' || ['RUNNING_RIGHT','SWITCH','RUNNING_LEFT','FINALISING'].includes(S.run.status))){ e.preventDefault(); e.returnValue=''; } });
  try{ const c=JSON.parse(localStorage.getItem('vcs-cal')||'null'); if(c){ $('pxcm').value=c.pxPerCm; $('dist').value=c.distCm; } }catch(e){}
  updateCal();
  renderKey($('homeKey')); renderKey($('instrKey'));
  renderDraftBanner();
  show('home');
}
if(HAS_DOM){ if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', wire); else wire(); }

// ---------- Exposed for tests ----------
globalThis.MV = { SOFTWARE_VERSION, BLANK_MS, BUILD_TARGET, STORE_KEY, DRAFT_KEY, EXPORTED_KEY, LEGACY_KEY, STORAGE_WARN, STORAGE_MAX, SCORING_VERSION, STIMULUS_VERSION, PROTOCOLS, FREQS, COLS, SENS, CONTRAST, LADDER, HEALTHY, SHOW_REFERENCE_CURVE, FORBIDDEN_LABELS, REFS, INTEGRITY_SCOPE,
  S, startRun, startEye, nextTrial, submitAnswer, finaliseRun, scoreEye, scoreRun, canonical, integrityPayload, computeIntegrity, reportText, chartSVG, buildPdf, exportJson, exportFilename, storedRuns, storageCheck, samplingBand, codeAmplitude, updateCal, loadDraft, renderResults, renderHistory, deliverFile, buildValidation,
  // Phase 1
  GUIDANCE_VERSION, GUIDANCE_RULES, guidanceForRun, guidanceHistory,
  CONTEXT_VERSION, CONTEXT_PARAGRAPH, CONTEXT_ITEMS, validateContext, setRunContext, contextToldLines, renderScale, renderedPpc, geometry, deviceSnapshot, drawGrating, show, toast, exportRun, exportAll, deleteExportedConfirmed, downloadPdf, saveDraft };
