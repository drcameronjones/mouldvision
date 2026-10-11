// MouldVision Phase 1 — phone front end over the unchanged Phase 0 engine (app.js, exposed as MV).
// The engine owns the stimulus, ladder, sequence, trial lifecycle, scoring, record, report and PDF. This file owns:
// screens, swipe input, device density, camera distance, display checklist, the context questionnaire and the share sheet.
(function () {
  'use strict';
  const MV = window.MV, D = window.MVM.devices, DS = window.MVM.distance;
  const $ = id => document.getElementById(id);
  const S = MV.S;
  const SCREENS = ['m-start', 'm-hold', 'm-cover', 'v-test', 'v-switch', 'v-results'];
  const M = { mode: 'full', density: null, sensor: null, distanceMode: 'camera', typedCm: 40, sizedForCm: null, trialReadings: [], driftEvents: 0, hintShown: false, display: { brightnessMaxConfirmed: false, nightShiftOffConfirmed: false, lighting: null }, buttonsMode: false, deferredInstall: null, resultsShown: false };

  function mscreen(name) {
    SCREENS.forEach(s => { const el = $(s); if (el) el.hidden = s !== name; });
    const sb = $('stagingBanner'); if (sb) sb.hidden = name === 'v-test' || MV.BUILD_TARGET !== 'staging';   // nothing bright on the trial screen
    window.scrollTo({ top: 0 });
  }
  const vibrate = ms => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} };

  // ---------- Share / save (iOS has no reliable blob download in standalone mode) ----------
  window.MV_DELIVER = async function (name, data) {
    const type = name.endsWith('.pdf') ? 'application/pdf' : 'application/json';
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    const file = (typeof File !== 'undefined') ? new File([blob], name, { type }) : null;
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return 'shared'; }
      catch (e) { if (e && e.name === 'AbortError') { const err = new Error('cancelled'); err.code = 'declined'; throw err; } }
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000); return 'downloaded';
  };

  // ---------- Geometry from device table + distance ----------
  function applyGeometry(distCm, source, stdCm) {
    S.pxPerCm = M.density.pxPerCm; S.pxPerCmSource = M.density.source; S.deviceModel = M.density.label;
    S.distCm = Math.max(20, Math.round(distCm)); S.distanceSource = source; S.distanceStdCm = stdCm == null ? null : stdCm;
    MV.updateCal();
  }
  function geomWarn() {
    const rs = MV.renderScale(), ppc = S.ppd * rs / 18, band = MV.samplingBand(ppc), el = $('geomWarn');
    const need = Math.ceil(72 / (S.pxPerCm * rs * Math.tan(Math.PI / 180)));
    if (band === 'adequate') { el.hidden = true; return; }
    el.hidden = false;
    el.textContent = band === 'not_representable'
      ? `At ${S.distCm} cm the finest bars cannot be drawn on this screen (${ppc.toFixed(2)} px per cycle). Hold the phone further away, about ${need} cm.`
      : `At ${S.distCm} cm the finest bars are coarsely drawn (${ppc.toFixed(2)} px per cycle). Holding the phone at about ${need} cm or more gives a cleaner column E.`;
  }
  function updateDistLine(cur) {
    const el = $('distLine');
    if (M.distanceMode === 'typed') { el.textContent = `Typed distance ${M.typedCm} cm (camera not used)`; return; }
    if (!cur || cur.cm == null) { el.textContent = 'Looking for your face…'; return; }
    el.textContent = `Distance ${cur.cm} cm ± ${cur.stdCm ?? 0} · ${M.sensor.focalSource === 'calibrated' ? 'focal length from your one-time check' : 'assumed camera focal length (±20 %)'}`;
  }

  // ---------- Hold-the-phone screen ----------
  async function startHold() {
    M.density = D.detect();
    $('densityLine').textContent = `Screen: ${M.density.label} · ${M.density.pxPerCm} px/cm (${M.density.source === 'table-exact' ? 'device table' : 'density class, ±10 %'}) · DPR ${M.density.dpr} · ${M.density.cssW}×${M.density.cssH}`;
    parkCamera(false); mscreen('m-hold');
    $('btnHoldNext').disabled = true; $('ring').className = 'ring'; $('ringText').textContent = 'starting camera…'; $('camNotice').hidden = true;
    M.distanceMode = 'camera';
    if (!M.sensor) M.sensor = new DS.DistanceSensor({ video: $('cam'), intervalMs: 300, onReading: onReading });
    const ok = await M.sensor.start();
    if (!ok) {
      M.distanceMode = 'typed';
      $('ringText').textContent = 'no camera';
      $('ring').className = 'ring bad';
      $('camNotice').hidden = false; $('camNotice').textContent = `The camera could not be used (${M.sensor.error || 'unknown'}). The typed distance below will be used instead, and the report will say the distance was entered, not measured.`;
      applyGeometry(M.typedCm, 'typed', null); geomWarn(); updateDistLine(); $('btnHoldNext').disabled = false;
    }
    $('focalLine').textContent = M.sensor && M.sensor.focalSource === 'calibrated' ? 'A one-time distance check is stored on this phone.' : '';
  }
  function onReading(r) {
    if (M.distanceMode !== 'camera') return;
    const cur = M.sensor.current(5);
    updateDistLine(cur);
    const ring = $('ring');
    if (!r.faceFound) { if (!$('m-hold').hidden) { ring.className = 'ring bad'; $('ringText').textContent = 'face not found'; $('btnHoldNext').disabled = true; } if ($('v-test') && !$('v-test').hidden) $('liveDist').textContent = 'camera: face not seen'; return; }
    const onHold = !$('m-hold').hidden;
    if (onHold) {   // geometry is set only here; during the test the drift rule in MV_TRIAL_DECORATE is the only thing that may change it
      if (M.sensor.stable(6, 2) && cur.cm) { ring.className = 'ring ok'; $('ringText').textContent = `${cur.cm} cm — hold`; applyGeometry(cur.cm, M.sensor.source, cur.stdCm); geomWarn(); $('btnHoldNext').disabled = false; }
      else { ring.className = 'ring'; $('ringText').textContent = cur.cm ? `${cur.cm} cm — hold still` : 'hold still'; $('btnHoldNext').disabled = true; }
    }
    if ($('v-switch') && !$('v-switch').hidden) $('switchDist').textContent = cur.cm ? `Current distance ${cur.cm} cm (test was sized for ${M.sizedForCm} cm)` : '';
    if ($('v-test') && !$('v-test').hidden) { if (r.cm != null && r.cm >= DS.MIN_CM && r.cm <= DS.MAX_CM) M.trialReadings.push(r.cm); $('liveDist').textContent = cur.cm ? `${cur.cm} cm` : ''; }
  }
  // The camera keeps running during the test; moving the <video> between containers keeps the stream alive on iOS, hiding it would not.
  function parkCamera(park) { const v = $('cam'); if (!v) return; if (park) $('camKeep').appendChild(v); else $('camwrap').insertBefore(v, $('ring')); }
  function useTyped() {
    M.typedCm = Math.max(20, Math.min(100, parseFloat($('typedDist').value) || 40));
    M.distanceMode = 'typed'; if (M.sensor) M.sensor.stop();
    $('ring').className = 'ring'; $('ringText').textContent = 'typed distance';
    applyGeometry(M.typedCm, 'typed', null); geomWarn(); updateDistLine(); $('btnHoldNext').disabled = false;
  }
  function calibrate() {
    if (M.distanceMode !== 'camera' || !M.sensor || !M.sensor.lastRaw) { MV.toast('Camera reading needed first'); return; }
    if (M.sensor.calibrate(40)) { $('focalLine').textContent = 'Focal length set from your 40 cm check and stored on this phone.'; MV.toast('Distance check saved'); }
  }

  // ---------- Run ----------
  function beginRun() {
    M.display = { brightnessMaxConfirmed: $('chkBright').checked, nightShiftOffConfirmed: $('chkNight').checked, lighting: $('lighting').value || null };
    const run = MV.startRun(M.mode);
    run.mobile = {
      frontEnd: 'phone-pwa-v1', density: { source: M.density.source, label: M.density.label, pxPerCm: M.density.pxPerCm, uncertainty: M.density.uncertainty, cssW: M.density.cssW, cssH: M.density.cssH, dpr: M.density.dpr },
      distance: { mode: M.distanceMode, source: S.distanceSource, focalSource: M.sensor ? M.sensor.focalSource : null, assumedFovDeg: M.sensor && M.sensor.focalSource !== 'calibrated' ? DS.ASSUMED_FOV_DEG : null, driftFraction: DS.DRIFT_FRACTION, driftEvents: 0 },
      display: M.display, input: 'swipe', standalone: !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || !!navigator.standalone
    };
    M.sizedForCm = S.distCm; M.trialReadings = []; M.driftEvents = 0; M.carried = 0; M.hintShown = false; M.resultsShown = false;
    showCover('right');
  }
  function showCover(eye) {
    M.nextEye = eye;
    $('coverTitle').textContent = eye === 'right' ? 'Cover your left eye' : 'Cover your right eye';
    $('handL').hidden = eye !== 'right'; $('handR').hidden = eye !== 'left';
    $('coverText').innerHTML = eye === 'right' ? 'Use your palm, without pressing on the eye. Keep wearing your usual glasses or contacts. The <strong>right eye</strong> is tested first.' : 'Now the <strong>left eye</strong>. Keep the phone at the same distance.';
    mscreen('m-cover');
  }
  function beginEye(eye) {
    parkCamera(true); mscreen('v-test');   // engine's show('test') will also run; both leave v-test visible
    $('answerButtons').hidden = !M.buttonsMode;
    M.trialReadings = [];
    MV.startEye(eye);
    if (document.documentElement.requestFullscreen && !document.fullscreenElement && /Android/.test(navigator.userAgent)) { document.documentElement.requestFullscreen().catch(() => {}); }
    try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('portrait').catch(() => {}); } catch (e) {}
  }

  // Per-trial distance bookkeeping. The engine calls MV_TRIAL_DECORATE synchronously while it builds each trial, before the
  // trial is recorded and before the run can be finalised, so these fields are inside the integrity hash. The run-level
  // geometry summary (median distance over the run) is kept current the same way; the drift rule resizes the next patch.
  let pendingAnswer = null;
  window.MV_TRIAL_DECORATE = function (t, run) {
    const sum = DS.summarise(M.trialReadings); M.trialReadings = [];
    const camMode = M.distanceMode === 'camera', cam = camMode && sum.medianCm != null;
    t.distanceCm = cam ? sum.medianCm : S.distCm;
    t.distanceSource = cam ? S.distanceSource : camMode ? S.distanceSource : 'typed';
    if (camMode && !cam) { t.distanceCarried = true; M.carried++; }   // face not seen during this trial: the last applied distance stands
    t.distanceStd = sum.stdCm; t.distanceSamples = sum.n; t.sizedForCm = M.sizedForCm;
    if (pendingAnswer && pendingAnswer.angle != null) t.swipeAngle = pendingAnswer.angle;
    // drift resize only on a well-supported reading (Phase 1 §3 rule, tightened after the first phone run: single frames can be wild)
    if (cam && DS.wellSupported(sum) && DS.drifted(M.sizedForCm, sum.medianCm)) { t.distanceDrift = true; M.pendingResize = Math.round(sum.medianCm); }
    if (cam) { const all = run.trials.filter(x => x.presented && x.distanceSamples >= 3).map(x => x.distanceCm).concat(sum.n >= 3 ? [t.distanceCm] : []); const s = DS.summarise(all); if (s.medianCm != null) { run.geometry.distanceCm = Math.round(s.medianCm); run.geometry.distanceStdCm = s.stdCm; } }
    run.geometry.driftEvents = M.driftEvents + (t.distanceDrift ? 1 : 0);
  };
  function afterAnswer(trial) {
    if (M.pendingResize) {
      M.driftEvents++; S.run.mobile.distance.driftEvents = M.driftEvents;
      if (!S.run.notes.includes('distance_drift')) S.run.notes.push('distance_drift');
      S.distCm = M.pendingResize; MV.updateCal(); M.sizedForCm = S.distCm; M.pendingResize = null;   // the next patch is drawn at the new distance
    }
    if (!M.hintShown && trial && trial.col === 'A' && trial.row <= 2 && trial.correct === false) { M.hintShown = true; showHint('Swipe the way the bars lean: up-left, straight up, or up-right'); }
    MV.saveDraft();
  }
  function showHint(text) { const h = $('swipeHint'); h.textContent = text; h.hidden = false; setTimeout(() => { h.hidden = true; }, 2600); }

  function answer(value, source, extra) {
    pendingAnswer = extra || null;
    const n = S.run ? S.run.trials.length : 0;
    const ok = MV.submitAnswer(source, value, null);
    pendingAnswer = null;
    if (!ok) return;
    vibrate(12);
    afterAnswer(S.run.trials[n]);
    if (S.eye === 'left' && S.trial.state === 'IDLE' && ['FINALISING', 'COMPLETE', 'COMPLETE_UNSAVED'].includes(S.run.status)) {
      MV.finaliseRun().then(() => { afterFinalise(); });
    }
  }
  function afterFinalise() {
    if (M.sensor) M.sensor.stop();
    if (M.carried) { S.run.mobile.distance.trialsWithoutFace = M.carried; }
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    showContextForm();
  }

  // ---------- Swipe input ----------
  function wireSwipe() {
    const field = $('field'); let start = null, touches = 0;
    field.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && e.button !== 0) return; start = { x: e.clientX, y: e.clientY, id: e.pointerId, t: performance.now() }; try { field.setPointerCapture(e.pointerId); } catch (err) {} });
    field.addEventListener('pointerup', e => {
      if (!start || e.pointerId !== start.id) { start = null; return; }
      const dx = e.clientX - start.x, dy = e.clientY - start.y; start = null;
      if (touches >= 2) { touches = 0; answer('none', 'two-finger', { angle: null }); return; }
      const len = Math.hypot(dx, dy); if (len < 24) return;                 // too short: ignored
      if (dy > 0 && Math.abs(dy) > Math.abs(dx)) return;                    // downward swipes are not answers
      const angle = Math.atan2(dx, -dy) * 180 / Math.PI;                    // 0 = straight up, negative = left
      const value = Math.abs(angle) <= 15 ? 'up' : angle < 0 ? 'left' : 'right';
      answer(value, 'swipe', { angle: +angle.toFixed(1) });
    });
    field.addEventListener('pointercancel', () => { start = null; });
    field.addEventListener('touchstart', e => { touches = Math.max(touches, e.touches.length); if (e.touches.length >= 2) e.preventDefault(); }, { passive: false });
    field.addEventListener('touchend', e => { if (e.touches.length === 0 && touches >= 2) { touches = 0; answer('none', 'two-finger', { angle: null }); } }, { passive: true });
    document.querySelectorAll('#v-test [data-ans]').forEach(b => { b.addEventListener('pointerup', e => { answer(b.dataset.ans, e.pointerType === 'touch' ? 'tap' : 'pointer', { angle: null }); }); b.addEventListener('click', e => e.preventDefault()); });
    document.addEventListener('keydown', e => { if ($('v-test').hidden) return; if (e.repeat) { S.trial.discarded++; return; } const k = { ArrowLeft: 'left', ArrowUp: 'up', ArrowRight: 'right', ArrowDown: 'none' }[e.key]; if (k) { e.preventDefault(); answer(k, 'keyboard', { angle: null }); } });
    $('btnToggleButtons').addEventListener('click', () => { M.buttonsMode = !M.buttonsMode; $('answerButtons').hidden = !M.buttonsMode; $('btnToggleButtons').textContent = M.buttonsMode ? 'Use swipes' : 'Use buttons'; });
  }

  // ---------- Context questionnaire ----------
  function buildContextForm() {
    const f = $('ctxForm'); f.innerHTML = '';
    MV.CONTEXT_ITEMS.forEach(it => {
      const d = document.createElement('div'); d.className = 'qitem';
      const t = it.type === 'multi' ? 'checkbox' : 'radio';
      d.innerHTML = `<div class="q">${it.q}</div><div class="opts">${it.options.map(o => `<label><input type="${t}" name="q-${it.id}" value="${o}"><span>${o}</span></label>`).join('')}</div>${it.extra ? `<input type="text" name="t-${it.id}" maxlength="200" placeholder="${it.extra}">` : ''}`;
      f.appendChild(d);
    });
  }
  function readContextForm() {
    const a = {};
    MV.CONTEXT_ITEMS.forEach(it => {
      const els = [...document.querySelectorAll(`[name="q-${it.id}"]:checked`)].map(e => e.value);
      if (els.length) a[it.id] = it.type === 'multi' ? els : els[0];
      const tx = document.querySelector(`[name="t-${it.id}"]`); if (tx && tx.value.trim()) a[it.id + 'Text'] = tx.value.trim();
    });
    return a;
  }
  function showContextForm() { mscreen('v-results'); $('m-context').hidden = false; window.scrollTo({ top: 0 }); }
  function finishContext(skip) {
    const answers = skip ? {} : readContextForm();
    MV.setRunContext(S.run, answers, { skipped: !!skip });
    $('m-context').hidden = true;
    renderMobileResults();
  }
  function renderMobileResults() {
    MV.renderResults(); mscreen('v-results'); M.resultsShown = true;
    const again = $('btnAgain'); if (again) again.addEventListener('click', () => { S.run = null; S.finalisePromise = null; mscreen('m-start'); }, { once: true });
    document.querySelectorAll('#v-results [data-go]').forEach(b => b.addEventListener('click', () => mscreen('m-start')));
    const pdf = $('btnPdf'); if (pdf) pdf.textContent = 'Share / save PDF report';
    const ident = $('v-results').querySelector('.card:last-child'); if (ident && S.run.status === 'COMPLETE') { const n = document.createElement('div'); n.className = 'notice'; n.textContent = 'This run is saved on this phone. If you leave after sharing one file, the other can be shared any time from Past results on the start screen.'; ident.insertBefore(n, ident.firstChild); }
    const ex = $('btnExport'); if (ex) ex.textContent = 'Share / save JSON record';
  }

  // ---------- History ----------
  function wireHistory() {
    $('btnHistory').addEventListener('click', () => { const h = $('m-history'); h.hidden = !h.hidden; MV.renderHistory(); });
    $('btnExportAll').addEventListener('click', () => MV.exportAll());
    $('btnDeleteExported').addEventListener('click', () => { $('confirmDelete').hidden = false; });
    $('btnDeleteYes').addEventListener('click', () => { $('confirmDelete').hidden = true; MV.deleteExportedConfirmed(); });
    $('btnDeleteNo').addEventListener('click', () => { $('confirmDelete').hidden = true; });
  }
  function renderDraft() {
    const d = MV.loadDraft(), el = $('draftBanner');
    if (!d || d.status === 'COMPLETE') { el.hidden = true; return; }
    const inc = { ...d, status: d.status === 'COMPLETE_UNSAVED' ? 'COMPLETE_UNSAVED' : 'INCOMPLETE', scoring: d.status === 'COMPLETE_UNSAVED' ? d.scoring : null };
    el.hidden = false;
    el.innerHTML = `<strong>${inc.status === 'COMPLETE_UNSAVED' ? 'An unsaved completed test was found.' : 'An interrupted test was found.'}</strong> ${inc.trials.length} trial${inc.trials.length === 1 ? '' : 's'} recorded. ${inc.status === 'INCOMPLETE' ? 'It cannot be scored; you can export it or discard it.' : 'Export it to keep it.'} <button id="btnDraftExport">Export JSON</button> <button class="ghost" id="btnDraftDiscard">Discard</button>`;
    $('btnDraftExport').addEventListener('click', () => MV.exportRun(inc));
    $('btnDraftDiscard').addEventListener('click', () => { try { sessionStorage.removeItem(MV.DRAFT_KEY); } catch (e) {} renderDraft(); });
  }

  // ---------- Install ----------
  function wireInstall() {
    const isIOS = /iPhone|iPad/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
    const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
    if (standalone) return;
    let seen = false; try { seen = localStorage.getItem('mv-install-hint') === '1'; } catch (e) {}
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); M.deferredInstall = e; $('installCard').hidden = false; $('installText').textContent = 'Installed, it opens full screen and works without a connection.'; $('btnInstall').hidden = false; });
    $('btnInstall').addEventListener('click', async () => { if (!M.deferredInstall) return; M.deferredInstall.prompt(); await M.deferredInstall.userChoice; M.deferredInstall = null; $('installCard').hidden = true; });
    if (isIOS && !seen) { $('installCard').hidden = false; $('installText').textContent = 'In Safari tap the Share button, then "Add to Home Screen". It then opens full screen and works without a connection.'; try { localStorage.setItem('mv-install-hint', '1'); } catch (e) {} }
    if ('serviceWorker' in navigator && !window.MV_NO_SW) { navigator.serviceWorker.register('sw.js').catch(() => {}); }   // tests set MV_NO_SW: a worker would bypass their request routes
  }

  // ---------- Wiring ----------
  function wire() {
    const b = window.MV_BUILD || {};
    $('buildLine').textContent = `${MV.SOFTWARE_VERSION} · ${MV.BUILD_TARGET} · ${b.sourceHash ? b.sourceHash.slice(0, 12) : 'unbuilt'}${b.gitCommit ? ' · ' + b.gitCommit.slice(0, 8) : ''}`;
    const st = $('stagingBanner'); if (st) st.hidden = MV.BUILD_TARGET !== 'staging';
    $('ctxParagraph').textContent = MV.CONTEXT_PARAGRAPH;
    document.querySelectorAll('[name="mode"]').forEach(r => r.addEventListener('change', () => { M.mode = r.value; }));
    $('btnStart').addEventListener('click', startHold);
    document.querySelectorAll('[data-mgo]').forEach(b => b.addEventListener('click', () => { if (M.sensor) M.sensor.stop(); mscreen(b.dataset.mgo === 'start' ? 'm-start' : b.dataset.mgo); }));
    $('btnUseTyped').addEventListener('click', useTyped);
    $('btnCalib').addEventListener('click', calibrate);
    $('btnHoldNext').addEventListener('click', beginRun);
    $('btnBegin').addEventListener('click', () => beginEye(M.nextEye || 'right'));   // the cover screen starts whichever eye is next
    $('btnLeft').addEventListener('click', () => showCover('left'));
    $('btnCtxDone').addEventListener('click', () => finishContext(false));
    $('btnCtxSkip').addEventListener('click', () => finishContext(true));
    wireSwipe(); wireHistory(); wireInstall(); buildContextForm(); renderDraft();
    ['startKey', 'coverKey'].forEach(id => { const c = $(id); if (!c) return; c.innerHTML = ''; ['left', 'up', 'right'].forEach(o => { const f = document.createElement('figure'); const cv = document.createElement('canvas'); f.appendChild(cv); const cap = document.createElement('figcaption'); cap.textContent = o === 'up' ? 'Upright' : o[0].toUpperCase() + o.slice(1); f.appendChild(cap); c.appendChild(f); MV.drawGrating(cv, 3, 0.9, o, 90 / 5, 90); }); });
    window.addEventListener('beforeunload', e => { if (S.run && (S.run.status === 'COMPLETE_UNSAVED' || ['RUNNING_RIGHT', 'SWITCH', 'RUNNING_LEFT', 'FINALISING'].includes(S.run.status))) { e.preventDefault(); e.returnValue = ''; } });
    document.addEventListener('visibilitychange', () => { if (document.hidden && S.run && ['RUNNING_RIGHT', 'RUNNING_LEFT'].includes(S.run.status)) { if (!S.run.notes.includes('app_backgrounded_during_test')) S.run.notes.push('app_backgrounded_during_test'); MV.saveDraft(); } });
    mscreen('m-start');
  }
  window.MVM.app = { M, mscreen, applyGeometry, answer, beginRun, beginEye, showCover, finishContext, readContextForm, renderMobileResults, afterFinalise, useTyped, startHold };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})();
