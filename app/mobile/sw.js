// MouldVision phone edition — service worker. Caches the app shell so the test runs with no network after first load.
// The cache name carries the build's source hash (injected at build), so a new verified build replaces the old one.
const BUILD = '77ae8cf276b82298-staging';
const SHELL = 'mv-shell-' + BUILD;
const RUNTIME = 'mv-runtime-v1';
const APP_FILES = ['./', 'index.html', 'styles.css', 'mobile.css', 'build-info.js', 'app.js', 'devices.js', 'distance.js', 'mobile.js', 'manifest.webmanifest', 'bhs-logo.png', 'icons/icon-192.png', 'icons/icon-512.png', 'faq.html', 'evidence.html', 'site.css'];
const EXTERNAL = ['https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'];
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
  // App shell and the PDF library: cache first. Face-landmark model and wasm: cache once fetched (large, versioned URLs).
  const isShell = url.origin === self.location.origin || EXTERNAL.includes(req.url);
  const isModel = /mediapipe|tasks-vision/.test(req.url);
  if (!isShell && !isModel) return;
  e.respondWith((async () => {
    const cache = await caches.open(isShell ? SHELL : RUNTIME);
    const hit = await cache.match(req, { ignoreSearch: isShell });
    if (hit) return hit;
    try { const res = await fetch(req); if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; }
    catch (err) { if (isShell && req.mode === 'navigate') return cache.match('index.html'); throw err; }
  })());
});
