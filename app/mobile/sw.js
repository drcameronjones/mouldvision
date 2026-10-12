// MouldVision phone edition — service worker. Caches the app shell so the test runs with no network after first load.
// The cache name carries the build's source hash (injected at build), so a new verified build replaces the old one.
const BUILD = 'a42e5a834ff856d5-staging';
const SHELL = 'mv-shell-' + BUILD;
const RUNTIME = 'mv-runtime-v1';
const APP_FILES = ['./', 'index.html', 'test/', 'test/index.html', 'styles.css', 'tokens.css', 'mobile.css', 'build-info.js', 'app.js', 'devices.js', 'distance.js', 'mobile.js', 'manifest.webmanifest', 'bhs-logo.png', 'icons/icon-192.png', 'icons/icon-512.png', 'faq.html', 'evidence.html', 'terms.html', 'privacy.html', 'site.css', 'img/figure-grating.png', 'img/figure-tilts.png', 'img/figure-columns.png', 'vendor/jspdf.umd.min.js', 'vendor/fonts/fonts.css', 'vendor/fonts/newsreader-latin-400-normal.woff2', 'vendor/fonts/newsreader-latin-400-italic.woff2', 'vendor/fonts/newsreader-latin-600-normal.woff2', 'vendor/fonts/public-sans-latin-400-normal.woff2', 'vendor/fonts/public-sans-latin-500-normal.woff2', 'vendor/fonts/public-sans-latin-600-normal.woff2', 'vendor/fonts/public-sans-latin-700-normal.woff2', 'vendor/fonts/ibm-plex-mono-latin-400-normal.woff2', 'vendor/fonts/ibm-plex-mono-latin-500-normal.woff2', 'vendor/fonts/pdf/Newsreader-400.ttf', 'vendor/fonts/pdf/Newsreader-600.ttf', 'vendor/fonts/pdf/PublicSans-400.ttf', 'vendor/fonts/pdf/PublicSans-600.ttf', 'vendor/fonts/pdf/IBMPlexMono-400.ttf'];
const EXTERNAL = [];   // everything is served from this origin
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    await c.addAll(APP_FILES);
    for (const u of EXTERNAL) { try { await c.add(new Request(u, { mode: 'cors' })); } catch (err) { try { await c.add(new Request(u, { mode: 'no-cors' })); } catch (e2) {} } }
    self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => { const keys = await caches.keys(); await Promise.all(keys.filter(k => k.startsWith('mv-shell-') && k !== SHELL).map(k => caches.delete(k))); await self.clients.claim(); })());
});
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Same origin only. Face-landmark model and wasm (vendor/mediapipe, ~13 MB) go to a runtime cache on first use; the rest is the shell.
  if (url.origin !== self.location.origin) return;
  const isModel = /\/vendor\/mediapipe\//.test(url.pathname);
  const isShell = !isModel;
  if (!isShell && !isModel) return;
  e.respondWith((async () => {
    const cache = await caches.open(isShell ? SHELL : RUNTIME);
    const hit = await cache.match(req, { ignoreSearch: isShell });
    if (hit) return hit;
    try { const res = await fetch(req); if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; }
    catch (err) { if (isShell && req.mode === 'navigate') return cache.match(/\/test\/?$/.test(url.pathname) ? 'test/index.html' : 'index.html'); throw err; }
  })());
});
