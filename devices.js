// MouldVision Phase 1 — device density table.
// Gives CSS pixels per centimetre for a phone or tablet from what a browser can read: the screen's CSS size and devicePixelRatio.
// Figures are derived from each model's physical panel width and logical (CSS) width; they are nominal, not measured on the device.
// Lookup result carries `source`: 'table-exact' (screen size + DPR matched a listed model), 'table-class' (density class only, about ±10 %).
(function (root) {
  const PORTRAIT = (w, h) => [Math.min(w, h), Math.max(w, h)];
  // [cssWidth, cssHeight, dpr, cssPxPerCm, label]. Where several models share a size/DPR they share a density to within 1 %.
  const TABLE = [
    // iPhone (logical width / panel width): 460 ppi OLED @3 → 60.4 px/cm; 326 ppi LCD @2 → 64.2; 476 ppi mini @3 → 65.2; 458 ppi Max @3 → 60.0
    [320, 568, 2, 64.2, 'iPhone 5/5s/SE (1st gen)'],
    [375, 667, 2, 64.2, 'iPhone 6/7/8/SE (2nd–3rd gen)'],
    [414, 736, 3, 60.4, 'iPhone 6/7/8 Plus'],
    [375, 812, 3, 60.2, 'iPhone X/XS/11 Pro'],
    [375, 812, 3, 65.1, 'iPhone 12 mini/13 mini'],          // same logical size as X/XS; the two are averaged and the uncertainty widened
    [414, 896, 2, 64.2, 'iPhone XR/11'],
    [414, 896, 3, 59.8, 'iPhone XS Max/11 Pro Max'],
    [390, 844, 3, 60.4, 'iPhone 12/12 Pro/13/13 Pro/14/16e'],
    [428, 926, 3, 60.0, 'iPhone 12 Pro Max/13 Pro Max/14 Plus'],
    [393, 852, 3, 60.4, 'iPhone 14 Pro/15/15 Pro/16'],
    [430, 932, 3, 60.4, 'iPhone 14 Pro Max/15 Plus/15 Pro Max/16 Plus'],
    [402, 874, 3, 60.4, 'iPhone 16 Pro/17/17 Pro'],
    [440, 956, 3, 60.4, 'iPhone 16 Pro Max/17 Pro Max'],
    [420, 912, 3, 60.4, 'iPhone Air'],
    // iPad (264 ppi @2 → 52.0 px/cm; iPad mini 6 326 ppi @2 → 64.2)
    [768, 1024, 2, 52.0, 'iPad (9.7"/10.2") / iPad Air 2 / iPad Pro 9.7"'],
    [810, 1080, 2, 52.0, 'iPad 10.2"'],
    [820, 1180, 2, 52.0, 'iPad 10th gen / iPad Air 10.9"'],
    [834, 1112, 2, 52.0, 'iPad Air 3 / iPad Pro 10.5"'],
    [834, 1194, 2, 52.0, 'iPad Pro 11" / iPad Air 11"'],
    [834, 1210, 2, 52.0, 'iPad Pro 11" (M4)'],
    [1024, 1366, 2, 52.0, 'iPad Pro 12.9"'],
    [1032, 1376, 2, 52.0, 'iPad Pro 13" (M4)'],
    [744, 1133, 2, 64.2, 'iPad mini 6/7'],
    // Android (cssPxPerCm = ppi / dpr / 2.54 from each model's panel)
    [412, 915, 2.625, 64.2, 'Pixel 6/7/8/9 (428–430 ppi)'],
    [412, 892, 2.625, 64.2, 'Pixel 6a/7a (429 ppi)'],
    [412, 915, 3.5, 56.8, 'Pixel 6 Pro/7 Pro/8 Pro/9 Pro XL (~505 ppi)'],
    [384, 854, 2.8125, 62.3, 'Pixel 5/4a (432–443 ppi)'],
    [360, 780, 3, 55.8, 'Galaxy S22/S23/S24/S25 (420–425 ppi)'],
    [360, 800, 3, 55.8, 'Galaxy S23+/S24+ (393–416 ppi)'],
    [384, 824, 3.5, 56.8, 'Galaxy S23 Ultra/S24 Ultra/S25 Ultra (~500 ppi)'],
    [412, 915, 2.625, 64.2, 'Galaxy S21 FE / A series FHD+ 6.4" (~401 ppi)'],
    [360, 800, 3, 52.5, 'Galaxy A series FHD+ 6.6–6.7" (~390 ppi)'],
    [412, 915, 2.625, 60.5, 'Galaxy A series FHD+ 6.7" (~385 ppi)'],
  ];
  // Fallback by density class: the logical density most phone makers target is 160 CSS px per inch (63 px/cm); iPhones with DPR 3 sit at 60.4.
  function classFallback(dpr, isApple) {
    if (isApple) return dpr >= 3 ? 60.4 : 64.2;
    if (dpr >= 3.25) return 57.0;
    if (dpr >= 2.5) return 63.0;
    if (dpr >= 1.75) return 63.0;
    return 56.0;   // low-DPR tablets and laptops; the card step is offered instead
  }
  function lookup(cssW, cssH, dpr, ua) {
    const [w, h] = PORTRAIT(cssW, cssH);
    const isApple = /iPhone|iPad|Macintosh/.test(ua || '');
    const hits = TABLE.filter(r => r[0] === w && r[1] === h && Math.abs(r[2] - dpr) < 0.01);
    if (hits.length) {
      const vals = hits.map(r => r[3]), mean = vals.reduce((s, v) => s + v, 0) / vals.length;
      const spread = (Math.max(...vals) - Math.min(...vals)) / mean;
      return { pxPerCm: +mean.toFixed(1), source: 'table-exact', label: hits.map(r => r[4]).join(' or '), uncertainty: +Math.max(0.03, spread / 2 + 0.02).toFixed(2) };
    }
    return { pxPerCm: classFallback(dpr, isApple), source: 'table-class', label: `${isApple ? 'Apple' : 'generic'} device, DPR ${dpr}`, uncertainty: 0.10 };
  }
  function detect() {
    const scr = (typeof screen !== 'undefined' && screen) || {};
    const w = scr.width || (typeof innerWidth !== 'undefined' ? innerWidth : 0), h = scr.height || (typeof innerHeight !== 'undefined' ? innerHeight : 0);
    const dpr = (typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1) || 1;
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
    return { ...lookup(w, h, dpr, ua), cssW: w, cssH: h, dpr, isMobile: /iPhone|iPad|Android|Mobile/.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1) };
  }
  root.MVM = root.MVM || {};
  root.MVM.devices = { TABLE, lookup, detect, classFallback };
})(typeof globalThis !== 'undefined' ? globalThis : this);
