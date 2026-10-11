# Changelog

## v0.8.0-rc1 — Phase 1 phone edition (branch phase-1/mobile, test copy on GitHub Pages only)
Spec: MouldVision Phase 1 Specification (11 Oct 2026). Live desktop artefact untouched; desktop staging artefact not republished.
New (src/mobile/, built to app/mobile/):
- Phone front end over the same engine: six portrait screens, swipe answers (`source: 'swipe'`, angle recorded), two-finger tap / button for can't-see, optional three-button mode, haptic tick, practice hint on the first two column-A patches.
- Device density table (`devices.js`): px/cm from screen size + DPR (`table-exact`) or density class (`table-class`, ±10 %); no bank-card step on phones.
- Camera viewing distance (`distance.js`): iris-size method with MediaPipe FaceLandmarker on the device; assumed focal length (±20 %, `camera-iris-assumedFov`) or a one-time 40 cm check (`camera-iris-calibrated`); readings written to every trial (`distanceCm`, `distanceStd`, `distanceSamples`, `sizedForCm`); drift > 15 % resizes the next patch and is recorded; typed fallback (`typed`) when the camera is refused, with the report saying so.
- Display checklist (brightness max, colour filters off, room lighting) stored on the run and stated in section 2.
- Toxin-context module: context paragraph (draft, numbered references) before the test and as report section 8; optional 12-item exposure questionnaire stored in `run.context`, shown as "What you told us", outside the integrity scope and never read by scoring (M07 mutation test).
- PWA: manifest, service worker (shell cached, offline after first load), install hints; Web Share for PDF/JSON on phones.
Engine changes in src/app.js (additive; stimulus, ladder, sequence, scoring and classification unchanged):
- `geometry()` gains `pxPerCmSource`, `deviceModel`, `distanceSource`, `distanceStdCm`, `renderScale`, `pxPerCycleAt18cpdRendered`. The sampling band and sentence now use the rendered canvas pixels per cycle (drawGrating draws at min(DPR, 2) canvas px per CSS px); the CSS value is kept and stated alongside. On DPR-3 phones the report states the 1.5× browser enlargement of the drawn patch.
- Section 2 wording adapts to the density and distance sources; identification block carries the sources, render scale and context version.
- `MV_TRIAL_DECORATE` hook (front end adds measurement fields to a trial before it is recorded and hashed); `MV_DELIVER` hook (share sheet).
- Context helpers: `CONTEXT_ITEMS`, `validateContext()`, `setRunContext()`, `contextToldLines()`.
- `[hidden]{display:none!important}` added to styles.css (sections with `.stack` were not reliably hidden).
Tests: Phase 0 T-suite unchanged in intent (T23 sets the rendered field; T24 follows SOFTWARE_VERSION; T02 dispatches both keys in one task to remove a timing flake). Phase 1 adds M01–M09, M12, M13 (11 tests). Suite id `phase0-T01-T28+phase1-M01-M13`; 47/47 bound to the source hash, which now also covers src/mobile/*.
Not in this build: collection dashboard (M10, M11), native wrapper, norm collection.
Known limitation for the adviser: drawGrating caps its canvas scale at 2, so on DPR-3 phones the finest column is drawn at 2× and enlarged 1.5× by the browser. Lifting the cap is a one-line stimulus change and needs written authorisation; until then the report states it.

## v0.7.0 — Phase 0 (branch phase-0/audit-records, staging only)
Spec: MouldVision Phase 0 Specification rev 2 + four implementation safeguards (9 Oct 2026).
- Trial lifecycle state machine (ARMED → LOCKED → BLANK); single `submitAnswer()` with synchronous guard; pointer/keyboard/touch dedupe.
- Full trial records; quick-mode skips recorded as not presented (never as misses).
- Run record schema 1 with versions, geometry, device, ladder, rendering model, integrity hash (SHA-256 over test definition + responses), structured validation.
- `finaliseRun()` idempotent; COMPLETE_UNSAVED on storage failure or limit; INCOMPLETE drafts exportable only.
- Browser storage treated as temporary: warning at 80, stop-saving at 100, user-confirmed delete of exported records only.
- POSITIVE/NEGATIVE/biotoxin labels removed; heading "Visual contrast test results"; seven-section report; reference curve off.
- Rows 7–9 marked exploratory (computed sub-step amplitude under the assumed rendering model); v1 scoring rule unchanged.
- Staging build target with separate storage keys and banner.
Unchanged: drawGrating(), contrast ladder, sequence, visual design, branding. Live artefact not republished (pinned in app/live-artifact.json).

## v0.6.0-prototype — baseline as delivered 9 Oct 2026
