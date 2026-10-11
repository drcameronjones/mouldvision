// Builds the MouldVision method explainer PDF (A4) from an HTML layout, with the captured phone screens and the engine's own charts.
const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..'), S = path.join(root, 'samples'), shots = path.join(root, 'docs/explainer-shots');
const img = f => 'data:image/png;base64,' + fs.readFileSync(path.join(shots, f)).toString('base64');
const logo = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'assets/bhs-logo.png')).toString('base64');
const pimg = f => 'data:image/png;base64,' + fs.readFileSync(path.join(shots, 'patches', f)).toString('base64');
const patchRow = (items) => `<div class="prow">${items.map(([f, top, bot]) => `<figure><img src="${pimg(f)}" alt=""><figcaption><b>${top}</b><span>${bot}</span></figcaption></figure>`).join('')}</div>`;
const charts = JSON.parse(fs.readFileSync(path.join(shots, 'charts.json'), 'utf8'));
const svgFix = s => s.replace(/var\(--line\)/g, '#d6dde3').replace(/var\(--muted\)/g, '#5b6b78').replace(/var\(--fg\)/g, '#13202b').replace(/var\(--bad\)/g, '#c43c2f').replace(/var\(--good\)/g, '#1f8a4c').replace(/var\(--warn\)/g, '#b8720a').replace(/var\(--surface\)/g, '#ffffff');
const REFS = [
  'Ginsburg AP. A new contrast sensitivity vision test chart. <i>Am J Optom Physiol Opt</i>. 1984;61(6):403–407.',
  'Ginsburg AP. Contrast sensitivity, drivers\' visibility, and vision standards. <i>Transportation Research Record</i>. 1987;1149:32–39.',
  'Ginsburg AP. Contrast sensitivity and functional vision. <i>Int Ophthalmol Clin</i>. 2003;43(2):5–15.',
  'Hudnell HK, House D, Schmid J, et al. Human visual function in the North Carolina clinical study on possible estuary-associated syndrome. <i>J Toxicol Environ Health A</i>. 2001;62(8):575–594.',
  'Shoemaker RC, Hudnell HK. Possible estuary-associated syndrome: symptoms, vision, and treatment. <i>Environ Health Perspect</i>. 2001;109(5):539–545.',
  'Hudnell HK. Chronic biotoxin-associated illness: multiple-system symptoms, a vision deficit, and effect of cholestyramine. <i>Neurotoxicol Teratol</i>. 2005;27(5):733–743.',
  'Shoemaker RC, House DE. A time-series study of sick building syndrome: chronic, biotoxin-associated illness from exposure to water-damaged buildings. <i>Neurotoxicol Teratol</i>. 2005;27(1):29–46.',
  'Shoemaker RC, House DE. Sick building syndrome (SBS) and exposure to water-damaged buildings: time series study, clinical trial and mechanisms. <i>Neurotoxicol Teratol</i>. 2006;28(5):573–588.',
  'McMahon SW, Kundomal KA, Yangalasetty S. Pediatrics norms for visual contrast sensitivity using an APT VCS tester. <i>Med Res Arch</i>. 2017;5(5).',
  'Pelli DG, Bex P. Measuring contrast sensitivity. <i>Vision Res</i>. 2013;90:10–14.',
  'Owsley C. Contrast sensitivity. <i>Ophthalmol Clin North Am</i>. 2003;16(2):171–177.',
  'Thomas G, Burton NC, Mueller C, Page E, Vesper S. Comparison of work-related symptoms and visual contrast sensitivity between employees at a severely water-damaged school and a school without significant water damage. <i>Am J Ind Med</i>. 2012;55(9):844–854.',
  'Jimenez-Barbosa IA, Di Lizio S, Ahn SB, et al. Assessment of visual contrast sensitivity in biotoxin-exposed individuals using four testing methods. <i>Ann Med</i>. 2026;58(1):2646821.',
  'American College of Medical Toxicology. Position statement: medical toxicology considerations in the diagnosis and treatment of patients with concerns about mold-related inhalation exposures. 2025.',
  'Denning DW, Chakrabarti A. Pulmonary and sinus fungal diseases in non-immunocompromised patients. <i>Lancet Infect Dis</i>. 2017;17(11):e357–e366.',
  'Valtonen V. Clinical diagnosis of the dampness and mold hypersensitivity syndrome: review of the literature and suggested diagnostic criteria. <i>Front Immunol</i>. 2017;8:951.',
  'Wild CP. Complementing the genome with an "exposome": the outstanding challenge of environmental exposure measurement in molecular epidemiology. <i>Cancer Epidemiol Biomarkers Prev</i>. 2005;14(8):1847–1850.',
  'World Health Organization. <i>WHO guidelines for indoor air quality: dampness and mould</i>. Copenhagen: WHO Regional Office for Europe; 2009.',
  'Klepeis NE, Nelson WC, Ott WR, et al. The National Human Activity Pattern Survey (NHAPS): a resource for assessing exposure to environmental pollutants. <i>J Expo Anal Environ Epidemiol</i>. 2001;11(3):231–252.',
  'Mendell MJ, Mirer AG, Cheung K, Tong M, Douwes J. Respiratory and allergic health effects of dampness, mold, and dampness-related agents: a review of the epidemiologic evidence. <i>Environ Health Perspect</i>. 2011;119(6):748–756.',
  'Fisk WJ, Lei-Gomez Q, Mendell MJ. Meta-analyses of the associations of respiratory health effects with dampness and mold in homes. <i>Indoor Air</i>. 2007;17(4):284–296.',
  'Neumeister-Kemp HG, Jones CL, Salthammer T, Burton L, Morawska L. Australian Mould Guideline (AMG) 2026: best practice guideline, a hygiene and risk-based framework for the assessment, interpretation, and management of indoor mould. In: <i>International Conference on Indoor Air Quality and Climate (Indoor Air 2026)</i>; 14–18 June 2026; Singapore. eprints.qut.edu.au/266288',
  'Jones CL. Hiding in plain sight: the indoor exposome of mould, air and the health risk in the rooms we live in [keynote]. <i>11th Annual NIIM Symposium: Future-Proofing Health: Integrative Solutions for Modern Medicine</i>; 10–11 September 2026; Richmond, VIC.',
  'Paulsen AJ, Schubert CR, Johnson LJ, et al. Association of cadmium and lead exposure with the incidence of contrast sensitivity impairment among middle-aged adults. <i>JAMA Ophthalmol</i>. 2018;136(12):1342–1350.',
  'Flaharty K, Niziol LM, Woodward MA, et al. Association of contrast sensitivity with eye disease and vision-related quality of life. <i>Am J Ophthalmol</i>. 2024;261:176–186.',
  'Xiong YZ, Kwon M, Bittner AK, et al. Relationship between acuity and contrast sensitivity: differences due to eye disease. <i>Invest Ophthalmol Vis Sci</i>. 2020;61(6):40.',
  'Balcer LJ, Baier ML, Cohen JA, et al. Contrast letter acuity as a visual component for the Multiple Sclerosis Functional Composite. <i>Neurology</i>. 2003;61(10):1367–1373.',
  'Lord SR, Dayhew J. Visual risk factors for falls in older people. <i>J Am Geriatr Soc</i>. 2001;49(5):508–515.',
  'Jones PR, Ungewiss J, Eichinger P, et al. Contrast sensitivity and night driving in older people. <i>Front Hum Neurosci</i>. 2022;16:914459.',
  'Desapriya E, Harjee R, Brubacher J, et al. Vision screening of older drivers for preventing road traffic injuries and fatalities. <i>Cochrane Database Syst Rev</i>. 2014;(2):CD006252.',
  'Austroads, National Transport Commission. <i>Assessing Fitness to Drive for commercial and private vehicle drivers</i>. Sydney: Austroads; 2022.',
];
let html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>MouldVision — the method</title>
<style>
@page{size:A4;margin:0}
:root{--ink:#13202b;--muted:#5b6b78;--line:#d6dde3;--teal:#0b6e8e;--teal-soft:#e2f1f6;--cream:#f6f3ee;--good:#1f8a4c;--bad:#c43c2f;--warn:#b8720a}
*{box-sizing:border-box}
html,body{margin:0;padding:0;color:var(--ink);font-family:Inter,system-ui,sans-serif;font-size:10.4pt;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
h1,h2,h3,.serif{font-family:Lora,Georgia,serif;font-weight:600;letter-spacing:-.005em}
h1{font-size:30pt;line-height:1.12;margin:0}
h2{font-size:19pt;line-height:1.2;margin:0 0 10pt}
h3{font-size:12pt;margin:14pt 0 4pt;color:var(--teal)}
p{margin:0 0 7pt}
.page{width:210mm;height:297mm;padding:18mm 18mm 16mm;position:relative;page-break-after:always;overflow:hidden;background:#fff}
.page:last-child{page-break-after:auto}
.eyebrow{font-size:8pt;letter-spacing:.14em;text-transform:uppercase;color:var(--teal);font-weight:600;margin-bottom:6pt}
.foot{position:absolute;left:18mm;right:18mm;bottom:9mm;font-size:7.6pt;color:var(--muted);display:flex;justify-content:space-between;border-top:1px solid var(--line);padding-top:5pt}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:9mm}
.cols3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6mm}
.cols3 .cap{font-size:7.9pt}
.lead{font-size:12.4pt;line-height:1.45;font-family:Lora,Georgia,serif;color:#24323d}
.box{background:var(--cream);border-radius:6pt;padding:10pt 12pt;margin:8pt 0}
.box.teal{background:var(--teal-soft)}
.box h4{margin:0 0 4pt;font-size:9pt;letter-spacing:.08em;text-transform:uppercase;color:var(--teal)}
.small{font-size:8.6pt;color:var(--muted);line-height:1.4}
.cap{font-size:8.4pt;color:var(--muted);margin-top:4pt;line-height:1.35}
.phone{border-radius:9pt;border:1px solid var(--line);display:block;width:100%;height:82mm;object-fit:cover;object-position:top}
.shot{text-align:center}
.shot .n{display:inline-block;width:16pt;height:16pt;border-radius:50%;background:var(--teal);color:#fff;font-weight:700;font-size:9pt;line-height:16pt;margin-bottom:4pt}
.prow{display:flex;gap:5pt}
.prow figure{margin:0;flex:1;text-align:center;background:#808080;border-radius:6pt;padding:5pt 4pt 5pt;box-shadow:inset 0 0 0 1px rgba(0,0,0,.12)}
.prow img{width:100%;max-width:23mm;margin:0 auto;display:block;border-radius:50%;box-shadow:0 0 0 1.2pt rgba(255,255,255,.55)}
.prow figcaption{color:#fff;font-size:7.8pt;line-height:1.2;margin-top:5pt;white-space:nowrap}
.figlabel{font-size:8pt;letter-spacing:.1em;text-transform:uppercase;color:var(--teal);font-weight:600;margin:9pt 0 4pt}
.prow figcaption b{display:block;font-size:9pt}
.prow figcaption span{opacity:.9}
ul{margin:0 0 7pt;padding-left:14pt}li{margin:0 0 3pt}
.refs{font-size:6.9pt;line-height:1.26;columns:2;column-gap:7mm}
.refs ol{margin:0;padding-left:12pt}.refs li{margin-bottom:3pt;break-inside:avoid}
table{border-collapse:collapse;width:100%;font-size:8.2pt}
th,td{text-align:left;padding:3pt 5pt;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:7.6pt;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.chart svg{width:100%;height:auto}
.tag{display:inline-block;padding:1pt 6pt;border-radius:4pt;font-size:7.6pt;font-weight:600;background:var(--teal-soft);color:var(--teal);letter-spacing:.04em}
.tiers3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5mm;margin:8pt 0 4pt}
.tcard{border-radius:6pt;padding:8pt 10pt;border-left:4pt solid #0b6e8e;background:#e2f1f6;font-size:9pt;line-height:1.4}
.tcard b{display:block;font-family:Lora,Georgia,serif;font-size:11pt;margin-bottom:4pt;color:#0b6e8e}
.tcard p{margin:0}
.tcard.t-repeat{border-left-color:#b8720a;background:#fdf1dc}.tcard.t-repeat b{color:#8a5508}
.tcard.t-eye{border-left-color:#7a3e7a;background:#f1e8f1}.tcard.t-eye b{color:#7a3e7a}
.kpi{display:grid;grid-template-columns:repeat(3,1fr);gap:5mm;margin:8pt 0}
.kpi div{border-top:2px solid var(--teal);padding-top:5pt}
.kpi b{display:block;font-family:Lora,Georgia,serif;font-size:17pt;font-weight:600;line-height:1.1}
.kpi span{font-size:8.4pt;color:var(--muted)}
/* cover */
.cover{background:linear-gradient(160deg,#0b4b61 0%,#0b6e8e 55%,#2a90ad 100%);color:#fff;padding:0}
.cover .inner{padding:20mm 18mm;height:100%;display:flex;flex-direction:column}
.cover .logo{background:#fff;border-radius:8pt;padding:8pt 12pt;display:inline-block;width:auto;align-self:flex-start}
.cover .logo img{height:40pt;display:block}
.cover h1{color:#fff;font-size:38pt;margin-top:14mm}
.cover .sub{font-family:Lora,Georgia,serif;font-size:15pt;line-height:1.35;opacity:.92;margin-top:10pt;max-width:150mm}
.cover .strip{margin-top:auto;display:grid;grid-template-columns:1fr 1fr 1fr;gap:6mm;border-top:1px solid rgba(255,255,255,.35);padding-top:9pt;font-size:8.6pt;opacity:.92}
.cover .strip b{display:block;font-size:9.5pt;margin-bottom:2pt}
.cover .art{position:absolute;right:18mm;top:118mm;width:62mm;height:62mm;border-radius:50%;overflow:hidden;box-shadow:0 20pt 60pt rgba(0,0,0,.35)}
.cover .art img{width:100%;height:100%;object-fit:cover;display:block;}
.cover .draft{position:absolute;right:18mm;top:20mm;font-size:8pt;letter-spacing:.14em;text-transform:uppercase;border:1px solid rgba(255,255,255,.6);padding:3pt 8pt;border-radius:3pt}
</style></head><body>

<!-- COVER -->
<section class="page cover">
  <div class="inner">
    <div class="logo"><img src="${logo}" alt="Biological Health Services"></div>
    <div class="draft">Method explainer · October 2026</div>
    <h1>MouldVision</h1>
    <div class="sub">A three-minute visual contrast test on your own phone, built to be read alongside the air you breathe: a functional measure for mould, indoor air quality, longevity and the exposome.</div>
    <div class="art"><img src="${img('cover-art.png')}" alt=""></div>
    <div class="strip">
      <div><b>What it measures</b>How faint a striped pattern each eye can still identify, at five bar widths, two eyes, 90 patches.</div>
      <div><b>What it is for</b>A repeatable, non-invasive marker to track over time alongside building assessment and clinical care.</div>
      <div><b>What it is not</b>Not a diagnosis of mould illness, not a biomarker of exposure, and not a substitute for an eye examination.</div>
    </div>
  </div>
</section>

<!-- 1 WHY -->
<section class="page">
  <div class="eyebrow">1 · Why measure vision in an environmental health practice</div>
  <h2>The exposome needs functional measures, not just lists of exposures</h2>
  <p class="lead">Genes account for a fraction of long-term health. The rest is the exposome: everything a person meets from conception onward, including the air inside the buildings where Australians spend close to ninety per cent of their lives [17, 19, 23]. Measuring that load is the central difficulty of environmental medicine. Air and surface sampling describe the building; blood and urine describe one moment in a body; a functional test describes what the nervous system is doing right now.</p>
  <div class="cols">
    <div>
      <h3>Dampness and mould are common and consequential</h3>
      <p>The World Health Organization's indoor-air guideline treats dampness and mould as a preventable risk to respiratory health, and meta-analyses place the increase in respiratory symptoms among occupants of damp or mouldy homes at roughly 30–50 per cent [18, 20, 21]. The Australian Mould Guideline 2026 sets out how indoor mould is assessed and managed: the building side of the picture this test complements [22]. Beyond the airways, occupants report fatigue, cognitive and visual complaints that are harder to measure, and it is here that an objective, quick, repeatable test has value.</p>
      <h3>Contrast sensitivity sits where optics meets the brain</h3>
      <p>Contrast sensitivity is the ability to see faint differences in shade. It depends on the clarity of the eye's optics and on neural processing in the retina, optic nerve and visual cortex [10, 11]. Because it draws on both, it changes with ageing, cataract, glaucoma and macular disease, with optic nerve conditions [27], and with neurotoxic exposures: cadmium, largely from tobacco smoke, predicted new loss over ten years in middle-aged adults [24], and work since the 1990s links deficits to biotoxins from water-damaged buildings and algal blooms [4–8].</p>
    </div>
    <div>
      <h3>The longevity case</h3>
      <p>Healthspan is shaped by cumulative, low-grade environmental load that no single clinical visit captures. The tests that matter for longevity are the ones people will actually repeat: cheap, short, at home, and sensitive to change. Contrast sensitivity is an established marker of visual ageing [3, 11], linked to falls [28], night-time hazard detection [29] and people's own rating of their vision [25]. Measured on a phone, it becomes a quarterly data point rather than a once-a-decade clinic measurement.</p>
      <div class="box teal">
        <h4>One marker, honestly framed</h4>
        <p style="margin:0">Reduced contrast sensitivity is non-specific. On its own it cannot tell a damp house from an early cataract. Its value comes from being tracked over time, in the same person, under recorded conditions, and read alongside what is known about the building and the person. MouldVision is built around that principle: every result carries its conditions, and no result carries a label.</p>
      </div>
      <div class="kpi">
        <div><b>~90 %</b><span>of time spent indoors in developed-country activity surveys [19]</span></div>
        <div><b>5 × 9</b><span>bar widths × contrast levels per eye, the classic FACT / VCTS layout [1, 2]</span></div>
        <div><b>3 min</b><span>per eye on a phone, no equipment, no calibration card</span></div>
      </div>
    </div>
  </div>
  <div class="foot"><span>MouldVision · Biological Health Services · Concept: Dr Cameron Jones, PhD · drcameronjones.com</span><span>Page 2</span></div>
</section>

<!-- 2 WHAT CS IS -->
<section class="page">
  <div class="eyebrow">2 · What the test measures</div>
  <h2>Five bar widths, nine contrast steps, three tilts</h2>
  <div class="cols">
    <div>
      <p>Each patch is a circle of soft, parallel bars on a mid-grey background. The bars are a sine-wave grating faded at the edges by a Gaussian window, the stimulus of record in vision science [2, 10]. Three things vary from patch to patch.</p>
      <p><b>Bar width (spatial frequency).</b> Five columns, A to E, at 1.5, 3, 6, 12 and 18 cycles per degree of visual angle. Column A is coarse; column E is close to the limit of normal acuity. Human sensitivity peaks in the middle, at 3–6 cycles per degree, which is also where the water-damaged-building literature reports deficits [5–8].</p>
    </div>
    <div>
      <p><b>Contrast.</b> Nine rows from 28.6 % down to 0.5 % Michelson contrast, spaced evenly on a logarithmic scale, so each step is the same proportional change. Contrast sensitivity is the reciprocal: identifying a 2 % patch means a sensitivity of 50.</p>
      <p><b>Tilt.</b> Every patch leans left, stands upright or leans right, by 15°. The person reports the tilt. With three choices, guessing is right one time in three, so the record keeps every answer rather than reducing a column to one number.</p>
    </div>
  </div>
  <div class="figlabel">Bar width · the five columns, each shown once at the same contrast</div>
  ${patchRow([['col-0.png','A','1.5 cpd'],['col-1.png','B','3 cpd'],['col-2.png','C','6 cpd'],['col-3.png','D','12 cpd'],['col-4.png','E','18 cpd']])}
  <div class="cap">Bars get finer from A to E; finer bars need more contrast to be seen, so a healthy curve rises to a peak at B–C and falls again towards E. Printed patches here are drawn with bars four times wider than on the phone so they survive printing; the ratios between columns are exact.</div>
  <div class="figlabel">Contrast · one column down the first six rows of the ladder</div>
  ${patchRow([['row-0.png','Row 1','28.6 %'],['row-1.png','Row 2','17.2 %'],['row-2.png','Row 3','10.4 %'],['row-3.png','Row 4','6.3 %'],['row-4.png','Row 5','3.8 %'],['row-5.png','Row 6','2.3 %']])}
  <div class="cap">Each row is about 40 % fainter than the one before; rows 5 and 6 may be hard to see in print, as they are meant to be. Rows 7 to 9 (1.4, 0.8 and 0.5 %) are fainter still; they are shown in the test but marked exploratory in every report, because an ordinary 8-bit screen cannot be assumed to render them faithfully.</div>
  <div class="cols" style="margin-top:4pt;align-items:start">
    <div>
      <div class="figlabel" style="margin-top:0">Tilt · the three possible answers</div>
      ${patchRow([['key-left.png','Left','leans left 15°'],['key-up.png','Upright','vertical'],['key-right.png','Right','leans right 15°']])}
      <div class="cap">Every patch is one of these three, chosen at random.</div>
    </div>
    <div class="box" style="margin-top:9pt">
      <h4>Why "cycles per degree" and not pixels</h4>
      <p style="margin:0;font-size:9.4pt">Bar width only has meaning at a known distance. MouldVision converts pixels to degrees of visual angle from the phone's pixel density and the measured eye-to-screen distance, so 6 cpd is 6 cpd on any phone.</p>
    </div>
  </div>
  <div class="foot"><span>MouldVision · Biological Health Services · Concept: Dr Cameron Jones, PhD · drcameronjones.com</span><span>Page 3</span></div>
</section>

<!-- 3 THE PHONE METHOD -->
<section class="page">
  <div class="eyebrow">3 · The three-minute test</div>
  <h2>Hold the phone, cover one eye, tap the tilt, swap eyes</h2>
  <div class="cols3">
    <div class="shot"><span class="n">1</span><img class="phone" src="${img('s1-start.png')}" alt=""><div class="cap"><b>Start.</b> One paragraph on what is measured, the three tilts, and a link to why environmental toxin exposure matters to this test. Full (90 patches) or quick protocol.</div></div>
    <div class="shot"><span class="n">2</span><img class="phone" src="${img('s2-hold.png')}" alt=""><div class="cap"><b>Hold the phone.</b> The front camera estimates eye-to-screen distance from the size of the iris, which is about 11.7 mm in almost every adult. Only the number is kept; no image leaves the phone. A checklist records brightness, colour filters and room light.</div></div>
    <div class="shot"><span class="n">3</span><img class="phone" src="${img('s3-cover.png')}" alt=""><div class="cap"><b>Cover one eye.</b> Right eye first, usual glasses or contacts on. The first two patches are easy and act as practice.</div></div>
  </div>
  <div class="cols3" style="margin-top:5mm">
    <div class="shot"><span class="n">4</span><img class="phone" src="${img('s4-trial.png')}" alt=""><div class="cap"><b>Answer.</b> Tap Left, Upright or Right, or swipe the way the bars lean. Patches get fainter down each column and finer across the columns. The screen is plain mid-grey throughout; distance is tracked between patches.</div></div>
    <div class="shot"><span class="n">5</span><img class="phone" src="${img('s5-context.png')}" alt=""><div class="cap"><b>Context (optional).</b> Fourteen one-tap questions about the building, exposures, eye history, diabetes, night-time driving and age band. Stored beside the result and shown back in the report; never used in any calculation.</div></div>
    <div class="shot"><span class="n">6</span><img class="phone" src="${img('s6-results.png')}" alt=""><div class="cap"><b>Results.</b> A seven-section report with both eyes' charts, saved on the phone, shareable as PDF or as the full machine-readable record.</div></div>
  </div>
  <div class="foot"><span>MouldVision · Biological Health Services · Concept: Dr Cameron Jones, PhD · drcameronjones.com</span><span>Page 4</span></div>
</section>

<!-- 4 READING THE REPORT -->
<section class="page">
  <div class="eyebrow">4 · Reading the result</div>
  <h2>Every patch is on the chart, so nothing is hidden behind a score</h2>
  <div class="cols" style="grid-template-columns:1fr 1fr;gap:6mm;padding:0 14mm">
    <div class="chart">${svgFix(charts.right)}<div class="cap"><b>Right eye.</b> ${charts.T.underRight}</div></div>
    <div class="chart">${svgFix(charts.left)}<div class="cap"><b>Left eye.</b> ${charts.T.underLeft}</div></div>
  </div>
  <div class="cap" style="margin-top:2pt">Illustrative record generated by the test suite from a simulated observer, not a person. Vertical axis: contrast sensitivity (left) and percent contrast (right), logarithmic. Columns: bar width in cycles per degree.</div>
  <div class="cols" style="margin-top:8pt">
    <div>
      <h3>How to read it</h3>
      <ul>
        <li><b>Green circle</b>: the tilt was identified. <b>Red circle</b>: it was not; the red tail shows the tilt chosen, the black tail the true tilt. <b>Hollow</b>: not presented (quick protocol stops a column after two misses in a row).</li>
        <li><b>Red line</b>: the lowest contrast correctly identified in each column, the familiar contrast sensitivity curve. It is descriptive: each level is shown once, so one lucky or unlucky answer moves it.</li>
        <li><b>Amber ring</b>: an isolated correct answer, one with a miss at an easier level, which is more likely to be a guess.</li>
        <li><b>Hatched band</b>: rows seven to nine, exploratory until the displayed contrast of those rows has been measured on real phones.</li>
      </ul>
    </div>
    <div>
      <h3>What the report says, in order</h3>
      <table>
        <tr><th>§</th><th>Section</th><th>What it holds</th></tr>
        <tr><td>1</td><td>What was measured</td><td>Counts of patches presented and identified, per eye</td></tr>
        <tr><td>2</td><td>Test conditions</td><td>Phone model and pixel density, measured distance and its spread, brightness checklist, how finely the finest bars were drawn</td></tr>
        <tr><td>3</td><td>Results per eye</td><td>The two charts and tables above</td></tr>
        <tr><td>4</td><td>Between the eyes</td><td>Difference per column in log units, with its caveat</td></tr>
        <tr><td>5–7</td><td>Limitations, when to consult someone, what this does not show</td><td>Plain statements; no diagnostic claim</td></tr>
        <tr><td>8</td><td>Environmental context</td><td>Why exposure matters, and "What you told us"</td></tr>
        <tr><td>—</td><td>Identification</td><td>Software version, protocol, stimulus and scoring versions, integrity hash, test-suite status</td></tr>
      </table>
    </div>
  </div>
  <div class="foot"><span>MouldVision · Biological Health Services · Concept: Dr Cameron Jones, PhD · drcameronjones.com</span><span>Page 5</span></div>
</section>

<!-- 4b WHAT YOUR RESULT TELLS YOU -->
<section class="page">
  <div class="eyebrow">5 · What your result tells you</div>
  <h2>One headline that says what to do next, never what is wrong</h2>
  <p class="lead" style="font-size:11.4pt">People want to know whether their result is normal. Until a measured reference range exists, the honest answer is a decision, not a diagnosis: every report opens with one of three headlines and the specific patches or conditions behind it.</p>
  <div class="tiers3">
    <div class="tcard t-none"><b>Nothing in this result calls for action</b><p>Easier patches identified in every column with both eyes, steady conditions, and no change beyond what the test usually varies. Keep it as a baseline; repeat in about three months.</p></div>
    <div class="tcard t-repeat"><b>Repeat to confirm</b><p>Something is uncertain: conditions changed, the two eyes differed for the first time, or the result moved two or more steps from the person's own baseline. Repeat within a week, same phone, same room.</p></div>
    <div class="tcard t-eye"><b>Worth an eye check</b><p>One eye missed patches most adults with healthy, corrected eyes identify, or a difference between the eyes repeated. See an optometrist with the report.</p></div>
  </div>
  <div class="cols" style="margin-top:6pt">
    <div>
      <h3>The rules (guidance-v1-provisional)</h3>
      <table>
        <tr><th>Check</th><th>Rule</th></tr>
        <tr><td>Easy patches</td><td>Rows 1–3 of columns A–C (28.6–10.4 % contrast). Two or more missed in one eye: eye check on a steady run, repeat otherwise.</td></tr>
        <tr><td>Conditions</td><td>Face seen by the camera on fewer than 80 % of patches, more than three distance changes, zoom changed, or app left: repeat.</td></tr>
        <tr><td>Between the eyes</td><td>Two or more contrast steps apart in two adjacent columns: repeat; again on the next run: eye check.</td></tr>
        <tr><td>Own baseline</td><td>After two baseline runs, two or more steps lower in two columns: changed since your baseline, repeat to confirm.</td></tr>
        <tr><td>Never counted</td><td>Rows 7–9 (exploratory), and anything in the questionnaire.</td></tr>
      </table>
    </div>
    <div>
      <h3>Why route to an eye check rather than name a cause</h3>
      <p>Contrast sensitivity falls with cataract, glaucoma, macular disease, diabetic eye disease and optic nerve conditions, each in a different proportion to acuity [26, 27]. In a 2024 study of 1,159 adults it tracked people's own rating of their vision and the difference between their eyes, yet a contrast chart alone was not sensitive or specific enough to screen for eye disease [25]. A home test should therefore do one thing well: notice when a person's result deserves a professional examination, and say so plainly.</p>
      <h3>Once the reference range exists</h3>
      <p>Each eye will also be placed against its age band: <i>typical for your age group</i> (5th–95th percentile), <i>lower than most people your age</i> (1st–5th) or <i>well below most people your age</i> (below the 1st), with sample size and date.</p>
      <div class="box teal"><h4>Other uses, same instrument</h4><p class="small" style="margin:0">Falls [28], night and glare driving [29] (no licensing cut-off; Australian standards assess acuity and fields [30, 31]), metals and tobacco [24], eye and neurological health [25–27]. See the Evidence page at visualcontrastsensitivity.com.</p></div>
    </div>
  </div>
  <div class="foot"><span>MouldVision · Biological Health Services · Concept: Dr Cameron Jones, PhD · drcameronjones.com</span><span>Page 0</span></div>
</section>

<!-- 5 WHAT MAKES IT DEFENSIBLE -->
<section class="page">
  <div class="eyebrow">6 · What makes a phone test defensible</div>
  <h2>The physics is fixed; the conditions are recorded; the claims are small</h2>
  <div class="cols">
    <div>
      <h3>Stimulus</h3>
      <p>Sine-wave gratings with Michelson contrast computed in linear luminance through the sRGB transfer function, a Gaussian envelope (σ = 0.42 of the patch radius), a 5° patch, ±15° tilts, ordered dither to reduce quantisation banding. The renderer is version-stamped and has not changed since the first reviewed build; any change restarts the normative sample.</p>
      <h3>Geometry without a calibration card</h3>
      <p>Pixel density comes from a table of phone models matched on screen size and pixel ratio. Viewing distance comes from the front camera every 300 ms, using the near-constant diameter of the adult iris; a one-time 40 cm check pins the camera's focal length. Distance is written to every trial, and if it drifts more than 15 % between patches the next patch is redrawn at the new distance and the drift is recorded.</p>
      <h3>A complete record</h3>
      <p>Each run stores all 90 trials with the tilt shown, the answer, the latency, the patch size and the distance at the time; the ladder; the device; the software, protocol, stimulus and scoring versions; and a SHA-256 integrity hash over the test definition and responses, so a record can be checked for accidental alteration. The report prints its versions and hash.</p>
    </div>
    <div>
      <h3>Validation stated, not implied</h3>
      <p>Every report carries three lines: software verification (an automated suite of 47 tests, bound to the exact source that produced the build), physical measurement validation, and clinical validation. Today the second and third read <i>not performed</i>, and will until the display contrast of real phones has been measured and a normative sample exists. The rows that an 8-bit screen cannot be assumed to render are marked exploratory rather than scored.</p>
      <h3>No labels</h3>
      <p>The report never says positive, negative, pass, fail or abnormal, and never attributes a result to mould, mycotoxins or any exposure. It describes what was shown, what was answered, and under what conditions; it tells people when an eye examination is warranted; and it directs questions about a building to building assessment.</p>
      <div class="box">
        <h4>The evidence on VCS and water-damaged buildings, briefly</h4>
        <p class="small" style="margin:0">A NIOSH study found lower contrast sensitivity at every bar width among staff of a severely water-damaged school than at a comparison school, yet advised against using VCS to evaluate mould-exposed people because the earlier literature was confounded and poorly controlled [12]. A 2026 comparison found the handheld chart did not separate exposed people from controls while digital tests did, and called the digital tools investigational [13]. Toxicology and infectious-disease bodies state that no validated biomarker or diagnostic test for mould-related illness exists [14, 15]. MouldVision takes the position those papers point to: build the digital instrument carefully, collect the data properly, and claim nothing until it has.</p>
      </div>
    </div>
  </div>
  <div class="foot"><span>MouldVision · Biological Health Services · Concept: Dr Cameron Jones, PhD · drcameronjones.com</span><span>Page 6</span></div>
</section>

<!-- 6 RESEARCH PROGRAMME -->
<section class="page">
  <div class="eyebrow">7 · The research programme and how to take part</div>
  <h2>From a measurement to a reference range</h2>
  <p class="lead">"Normal" for MouldVision will be a measured distribution, not a formula borrowed from a chart printed in 1984. Until it exists, the only comparison the app makes is each person against their own earlier runs.</p>
  <div class="cols">
    <div>
      <h3>Phase A — colleagues and existing BHS clients (now)</h3>
      <p>People who have had a BHS building assessment or mail-order mould test are invited to run the test on their own phone, repeat it 2–14 days later under the same conditions, and, if they choose, send the de-identified record to the research dashboard with the environmental questionnaire. The kit or job number links a vision record to a measured building without any name travelling with it.</p>
      <h3>Phase B — a normative sample</h3>
      <p>Target 150 adults aged 18–75 with no known eye disease, wearing their usual correction, across at least three phone models, each tested twice. Outputs: per-column 5th–95th percentile bands by age band, test–retest limits of agreement (the test's own noise), and device effects. Ethics approval precedes any recruitment beyond colleagues.</p>
      <h3>Phase C — the exposome dataset</h3>
      <p>Vision records read alongside spore-trap, tape-lift and settle-plate results for the same address, questionnaire context, and, where clinicians take part, their own patients' codes. Descriptive cross-tabulations first; any model later, pre-registered.</p>
    </div>
    <div>
      <div class="box teal">
        <h4>What we ask of a participant</h4>
        <ul style="margin:0">
          <li>A phone made in the last eight years, brightness at maximum, in a normally lit room.</li>
          <li>Three minutes per eye, twice, a week or two apart.</li>
          <li>Optional: the fourteen context questions, and consent to send the de-identified record.</li>
        </ul>
      </div>
      <div class="box">
        <h4>What we promise</h4>
        <ul style="margin:0">
          <li>No name, email, address or date of birth is collected by the app. Camera frames are processed on the phone and never stored or sent.</li>
          <li>Records sent to research are identified by a six-character code only, can be withdrawn by quoting the run ID, and are never used to compute a classification.</li>
          <li>Participants keep their own PDF and full record, and a copy of whatever the dataset eventually shows.</li>
        </ul>
      </div>
      <h3>Where it lives</h3>
      <p>visualcontrastsensitivity.com, installable from the browser on iPhone and Android, working offline after the first visit, with plain-language Questions and Evidence pages beside the test. The source is version-controlled and every build is tied to the test results that verified it.</p>
    </div>
  </div>
  <div class="foot"><span>MouldVision · Biological Health Services · Concept: Dr Cameron Jones, PhD · drcameronjones.com</span><span>Page 7</span></div>
</section>

<!-- 7 REFERENCES -->
<section class="page">
  <div class="eyebrow">References and contact</div>
  <h2 style="font-size:16pt">Sources</h2>
  <div class="refs"><ol>${REFS.map(r => `<li>${r}</li>`).join('')}</ol></div>
  <div class="cols" style="margin-top:4mm;align-items:end">
    <div>
      <img src="${logo}" style="height:34pt;display:block;margin-bottom:6pt" alt="">
      <p class="small" style="margin:0"><b>Biological Health Services</b><br>Head office: Level 1, 459 Toorak Road, Toorak VIC 3142<br>Laboratory: 7/4 Weddel Court, Laverton North VIC 3026<br>visualcontrastsensitivity.com · www.biologicalhealthservices.com.au<br>mould.net.au · drcameronjones.com<br>ISO 9001:2015 · ISO/IEC 17025:2017</p>
    </div>
    <div class="small">
      <p><b>Concept and scientific lead:</b> Dr Cameron Jones, PhD, Principal Environmental Microbiologist; co-author of the Australian Mould Guideline 2026 [22]. Publications and talks: drcameronjones.com.</p>
      <p>MouldVision is a screening and research instrument. It does not diagnose any condition, does not detect mould or mycotoxins in a person, and is not a substitute for an eye examination or medical advice. Questions about a building are answered by environmental assessment; questions about health by a medical practitioner. Software verification status, measurement validation status and clinical validation status are printed on every report. This document describes the method as built in October 2026 (v0.8.0) and will be revised as the validation work reports.</p>
    </div>
  </div>
  <div class="foot"><span>MouldVision · Biological Health Services · Concept: Dr Cameron Jones, PhD · drcameronjones.com</span><span>Page 8</span></div>
</section>
</body></html>`;
let pn = 1; html = html.replace(/<span>Page \d+<\/span>/g, () => `<span>Page ${++pn}</span>`);
fs.writeFileSync(path.join(S, 'explainer.html'), html);
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load' }); await page.evaluate(() => document.fonts.ready);
  const out = path.join(S, 'MouldVision-Method-Explainer.pdf');
  await page.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
  await browser.close(); console.log('wrote', out, fs.statSync(out).size);
})();
