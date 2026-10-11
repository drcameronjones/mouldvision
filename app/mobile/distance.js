// MouldVision Phase 1 — viewing-distance estimator from the front camera.
// Principle: the human iris has a physical diameter close to 11.7 mm with little variation between adults, so its apparent
// size in the camera image gives eye-to-camera distance once the camera's focal length (in pixels) is known:
//   distance = focalPx × 11.7 mm / irisPx.
// The focal length is the unknown. Without a per-device value it is assumed from a typical front-camera field of view
// (recorded as distanceSource 'camera-iris-assumedFov', about ±20 %); a one-time check at a measured distance replaces it
// ('camera-iris-calibrated'). Frames are processed on the device by MediaPipe FaceLandmarker and never stored or sent.
// The pure functions below have no DOM dependency and are unit-tested (M03, M05); the sensor class needs a browser.
(function (root) {
  const IRIS_MM = 11.7;
  const ASSUMED_FOV_DEG = 70;                   // long-side field of view assumed for an uncalibrated front camera
  const ASSUMED_FOV_UNCERTAINTY = 0.20;
  const LEFT_IRIS = [468, 469, 470, 471, 472], RIGHT_IRIS = [473, 474, 475, 476, 477];   // MediaPipe face mesh with refined landmarks
  const DRIFT_FRACTION = 0.15;                  // Phase 1 §3: redraw at the next trial when distance drifts more than this
  const MIN_CM = 20, MAX_CM = 90;               // readings outside this range are treated as detector noise (a partly seen face), not a distance
  const MIN_SAMPLES_FOR_RESIZE = 4, MAX_STD_FRACTION_FOR_RESIZE = 0.10;
  const dist2 = (a, b, w, h) => Math.hypot((a.x - b.x) * w, (a.y - b.y) * h);

  /** Iris diameter in image pixels from 478 normalised landmarks; null if iris landmarks are missing. */
  function irisDiameterPx(lm, w, h) {
    if (!lm || lm.length < 478) return null;
    const d = [];
    for (const I of [LEFT_IRIS, RIGHT_IRIS]) {
      const horiz = dist2(lm[I[1]], lm[I[3]], w, h), vert = dist2(lm[I[2]], lm[I[4]], w, h);
      if (horiz > 0 && vert > 0) d.push((horiz + vert) / 2);
    }
    return d.length ? d.reduce((s, v) => s + v, 0) / d.length : null;
  }
  function focalFromFov(longSidePx, fovDeg) { return (longSidePx / 2) / Math.tan((fovDeg || ASSUMED_FOV_DEG) * Math.PI / 360); }
  function distanceCm(irisPx, focalPx) { return irisPx > 0 ? (focalPx * IRIS_MM / irisPx) / 10 : null; }
  function focalFromKnownDistance(irisPx, knownCm) { return irisPx * knownCm * 10 / IRIS_MM; }
  /** Synthetic landmark set: a face at `distCm` seen by a camera of `focalPx`, iris centred at (cx, cy) in normalised units. */
  function syntheticLandmarks(distCm, focalPx, w, h, cx = 0.5, cy = 0.5) {
    const irisPx = focalPx * IRIS_MM / (distCm * 10), r = irisPx / 2;
    const lm = Array.from({ length: 478 }, () => ({ x: cx, y: cy, z: 0 }));
    const place = (I, ox) => { const x0 = cx + ox / w; lm[I[0]] = { x: x0, y: cy, z: 0 }; lm[I[1]] = { x: x0 + r / w, y: cy, z: 0 }; lm[I[2]] = { x: x0, y: cy - r / h, z: 0 }; lm[I[3]] = { x: x0 - r / w, y: cy, z: 0 }; lm[I[4]] = { x: x0, y: cy + r / h, z: 0 }; };
    place(LEFT_IRIS, -irisPx * 2.7); place(RIGHT_IRIS, irisPx * 2.7);
    return lm;
  }
  const median = a => { const s = a.slice().sort((x, y) => x - y); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
  const stddev = a => { if (a.length < 2) return 0; const m = a.reduce((s, v) => s + v, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / (a.length - 1)); };
  /** Drift rule: true when the live distance differs from the distance the patch was sized for by more than DRIFT_FRACTION. */
  function drifted(sizedForCm, liveCm) { return sizedForCm > 0 && liveCm != null && Math.abs(liveCm - sizedForCm) / sizedForCm > DRIFT_FRACTION; }
  /** A trial's distance summary is well supported when it rests on several agreeing frames; only then may it resize the patch. */
  function wellSupported(sum) { return !!sum && sum.n >= MIN_SAMPLES_FOR_RESIZE && sum.medianCm != null && (sum.stdCm == null || sum.stdCm / sum.medianCm <= MAX_STD_FRACTION_FOR_RESIZE); }
  /** Summary of a sequence of readings per trial: median, SD and count. */
  function summarise(readings) { const v = readings.filter(x => x != null && isFinite(x)); return { medianCm: v.length ? +median(v).toFixed(1) : null, stdCm: v.length > 1 ? +stddev(v).toFixed(1) : null, n: v.length }; }

  // ---------- Browser sensor (camera + FaceLandmarker) ----------
  const TASKS_VISION = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
  const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
  class DistanceSensor {
    constructor(opts = {}) {
      this.video = opts.video || null; this.intervalMs = opts.intervalMs || 300; this.onReading = opts.onReading || (() => {});
      this.focalPx = null; this.focalSource = 'assumedFov'; this.readings = []; this.lastRaw = null; this.running = false;
      this.landmarker = null; this.stream = null; this.error = null; this.noFaceFrames = 0; this.frameLong = 0;
    }
    async loadModel() {
      if (this.landmarker) return this.landmarker;
      const mod = await import(TASKS_VISION + '/vision_bundle.mjs');
      const vision = await mod.FilesetResolver.forVisionTasks(TASKS_VISION + '/wasm');
      try {
        this.landmarker = await mod.FaceLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' }, runningMode: 'VIDEO', numFaces: 1 });
      } catch (e) {
        this.landmarker = await mod.FaceLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' }, runningMode: 'VIDEO', numFaces: 1 });
      }
      return this.landmarker;
    }
    async start() {
      if (this.running) return true;
      this.error = null;
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('camera API unavailable');
        this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
        this.video.srcObject = this.stream; this.video.setAttribute('playsinline', ''); this.video.muted = true;
        await this.video.play();
        await this.loadModel();
        this.frameLong = Math.max(this.video.videoWidth, this.video.videoHeight);
        const stored = this.loadStoredFocal();
        if (stored) { this.focalPx = stored; this.focalSource = 'calibrated'; }
        else { this.focalPx = focalFromFov(this.frameLong, ASSUMED_FOV_DEG); this.focalSource = 'assumedFov'; }
        this.running = true; this._tick();
        return true;
      } catch (e) { this.error = e && (e.name + ': ' + e.message) || String(e); this.stop(); return false; }
    }
    _tick() {
      if (!this.running) return;
      try {
        const w = this.video.videoWidth, h = this.video.videoHeight;
        if (w && h && this.video.readyState >= 2) {
          const res = this.landmarker.detectForVideo(this.video, performance.now());
          const lm = res && res.faceLandmarks && res.faceLandmarks[0];
          const iris = irisDiameterPx(lm, w, h);
          if (iris) { const cm = distanceCm(iris, this.focalPx); if (cm >= MIN_CM && cm <= MAX_CM) { this.noFaceFrames = 0; this.lastRaw = iris; this._push(cm); this.onReading({ cm, irisPx: iris, faceFound: true }); } else { this.noFaceFrames++; this.onReading({ cm: null, irisPx: iris, faceFound: false, implausible: cm }); } }
          else { this.noFaceFrames++; this.onReading({ cm: null, irisPx: null, faceFound: false }); }
        }
      } catch (e) { this.error = String(e && e.message || e); }
      this._timer = setTimeout(() => this._tick(), this.intervalMs);
    }
    _push(cm) { this.readings.push(cm); if (this.readings.length > 20) this.readings.shift(); }
    /** Median of the last few readings (the value used for geometry), with its spread. */
    current(n = 5) { const v = this.readings.slice(-n); return v.length ? { cm: +median(v).toFixed(1), stdCm: +stddev(v).toFixed(1), n: v.length } : { cm: null, stdCm: null, n: 0 }; }
    stable(n = 6, tolCm = 2) { const v = this.readings.slice(-n); return v.length >= n && (Math.max(...v) - Math.min(...v)) <= 2 * tolCm; }
    /** One-time check: the user holds the phone at a measured distance; the current iris size fixes the focal length. */
    calibrate(knownCm) { if (!this.lastRaw) return false; this.focalPx = focalFromKnownDistance(this.lastRaw, knownCm); this.focalSource = 'calibrated'; this.readings = []; try { localStorage.setItem('mv-focal-v1', JSON.stringify({ focalPx: this.focalPx, frameLong: this.frameLong, at: new Date().toISOString() })); } catch (e) {} return true; }
    loadStoredFocal() { try { const s = JSON.parse(localStorage.getItem('mv-focal-v1') || 'null'); return s && s.frameLong === this.frameLong && s.focalPx > 0 ? s.focalPx : null; } catch (e) { return null; } }
    clearStoredFocal() { try { localStorage.removeItem('mv-focal-v1'); } catch (e) {} }
    get source() { return this.focalSource === 'calibrated' ? 'camera-iris-calibrated' : 'camera-iris-assumedFov'; }
    stop() { this.running = false; clearTimeout(this._timer); if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; } if (this.video) { try { this.video.srcObject = null; } catch (e) {} } }
  }
  root.MVM = root.MVM || {};
  root.MVM.distance = { IRIS_MM, ASSUMED_FOV_DEG, ASSUMED_FOV_UNCERTAINTY, DRIFT_FRACTION, MIN_CM, MAX_CM, MIN_SAMPLES_FOR_RESIZE, MAX_STD_FRACTION_FOR_RESIZE, wellSupported, MODEL_URL, TASKS_VISION, irisDiameterPx, focalFromFov, distanceCm, focalFromKnownDistance, syntheticLandmarks, drifted, summarise, median, stddev, DistanceSensor };
})(typeof globalThis !== 'undefined' ? globalThis : this);
