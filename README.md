# VCS Screen — source package

Visual contrast sensitivity (VCS) screening web application.
Concept: Dr Cameron Jones, PhD — Biological Health Services, www.biologicalhealthservices.com.au
Generated with Claude (Anthropic), October 2026.

This package contains everything needed to run, review, host, or hand to a developer.
There is no build step, no framework, and no server: the application is one HTML page
with vanilla JavaScript and a single third-party library (jsPDF) for report generation.

```
vcs-screen-source/
├── README.md                     this file
├── app/
│   └── index.html                deployable single file (logo embedded, as published on claude.ai)
├── src/                          the same application split into readable parts
│   ├── index.html                page markup (6 views: home, calibration, instructions, test, switch-eye, results)
│   ├── styles.css                design tokens, light/dark themes, layout
│   └── app.js                    all logic: grating renderer, calibration, test sequence, scoring, SVG charts, PDF report
├── assets/
│   └── bhs-logo.png              Biological Health Services logo (900 px wide, transparent)
├── samples/
│   ├── sample-vcs-report.pdf     report produced from simulated results (not a real test)
│   └── ginsburg-1987-TRR1149-extracted-text.txt   source paper used for the VCTS layout
└── tools/
    ├── build-sample-pdf.js       regenerates samples/sample-vcs-report.pdf headlessly in Node
    └── package.json
```

## Running it

* **Quickest:** open `app/index.html` in any modern browser. Everything is inside the one file.
* **Split source:** serve the `src/` folder from any static web server (e.g. `npx serve src`,
  or drop the folder on Netlify, Vercel, GitHub Pages, S3, cPanel). Opening `src/index.html`
  directly from disk also works, except that some browsers block canvas export of the logo
  under `file://`, in which case the PDF header falls back to text.
* **No sign-in, database, or back end.** Results and calibration are kept in the viewer's own
  browser (`localStorage`) so repeat tests can be compared on the same device.
* **PDF download:** `src/app.js` uses a normal browser download. `app/index.html` is the
  claude.ai-published version and calls the claude.ai `downloads` capability when present,
  so on claude.ai the viewer sees a save prompt; the split build does not need that.

## How the test works (what a reviewer should check)

| Item | Implementation | Where |
|---|---|---|
| Stimulus | Sine-wave grating in a circular Gaussian-windowed patch (~5° diameter), bars tilted −15° / 0° / +15° (Left / Up / Right), as in the Vistech VCTS and FACT charts | `drawGrating()` in `app.js` |
| Spatial frequencies | 1.5, 3, 6, 12, 18 cycles per degree — columns A–E | `FREQS` |
| Contrast steps | 9 rows, geometric ladder from sensitivity 3.5 (28.6 % contrast) to 200 (0.5 %) | `SENS`, `CONTRAST` |
| Luminance | Mean grey = sRGB 128; modulation applied in linear light then re-encoded with the sRGB transfer curve; ordered dither so sub-step contrasts survive 8-bit quantisation | `srgb()`, `drawGrating()` |
| Calibration | Bank-card slider gives px/cm; viewing distance gives pixels-per-degree = px/cm × distance × tan(1°). Warns when the screen cannot render 18 cpd faithfully | `updateCal()` |
| Sequence | Right eye then left; each eye runs column A→E, rows 1→9 (45 trials); random orientation per trial; 250 ms blank between patches. "Quick" mode abandons a column after two consecutive misses and scores the rest as not seen | `buildSequence()`, `nextTrial()`, `answer()` |
| Scoring | Per column: threshold = highest sensitivity row answered correctly. Total /90. Biotoxin score = correct answers in columns C+D, both eyes, /36. Overall POSITIVE if any miss (mirrors the VCSTest.com pass/fail convention). Flags: C–D below half the healthy reference, E below half, A–B below half | `scoreEye()`, `analyse()` |
| Healthy reference curve | `HEALTHY = [75, 115, 110, 65, 30]` sensitivity units — an approximation of published FACT adult norms; **replace with your own normative data** | `HEALTHY` |
| Charts | Inline SVG, log sensitivity axis (left) with %-contrast axis (right), green/red circles with tilt tails, red threshold line, grey healthy line, blue C–D band | `chartSVG()` |
| PDF report | jsPDF 2.5.1, A4, charts redrawn to scale in vector, auto page breaks, 16 references, evidence-status section, BHS header and footer on every page | `pdfChart()`, `buildPdf()` |
| References | 16 citations shown on the page and printed in the report | `REFS` and the `#refs` section of `index.html` |

## Known limitations to discuss with an adviser

1. **Display fidelity.** Consumer 8-bit panels cannot render 0.5–1 % contrast exactly; the two
   faintest rows are approximate. Gamma, brightness, night-shift filters and ambient light all
   change the effective contrast. The page cannot measure the display; it can only calibrate size.
2. **No photometric calibration.** Commercial online tests collect display make/model and
   settings; this version does not. A luminance-matching step or a display database would be the
   next engineering step.
3. **Normative curve is approximate** and should be replaced by data gathered on this exact
   stimulus and procedure before any clinical use.
4. **Clinical validity.** The page carries an "Evidence status" section summarising the NIOSH
   school study (Thomas 2012), the 2026 four-method comparison (Jimenez-Barbosa), and the ACMT,
   Lancet ID and Valtonen positions: VCS is not a validated diagnostic for mould-related illness.
5. **IP.** The Vistech VCTS and FACT are commercial chart products; VCSTest.com and the Shoemaker
   APT tester are commercial online/handheld tests. This implementation reproduces the published
   chart geometry (Ginsburg 1984) from first principles and copies no code, images or text from
   those products, but trade marks, patents and the exact scoring logic of those products should
   be reviewed by an IP adviser before commercial release.
6. **Regulatory.** A screening tool that outputs a POSITIVE/NEGATIVE result with health wording
   may fall under TGA software-as-a-medical-device rules in Australia; wording and claims should
   be reviewed.

## Third-party components

* jsPDF 2.5.1 (MIT) — loaded from cdnjs at runtime; nothing else is bundled.
* Google Fonts: Sora, Manrope, JetBrains Mono (OFL) — loaded at runtime; fallback stacks are declared.

## Regenerating the sample report

```
cd tools
npm install
node build-sample-pdf.js      # writes ../samples/sample-vcs-report.pdf
```
