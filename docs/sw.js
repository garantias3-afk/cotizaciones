// sw.js — Cachea solo el shell (index, css, js, manifest, icons). Nunca cachea api.github.com.
const CACHE_NAME = "cotizaciones-shell-v1";
const SHELL = [
  "/cotizaciones/",
  "/cotizaciones/docs/index.html",
  "/cotizaciones/docs/styles.css",
  "/cotizaciones/docs/calc.js",
  "/cotizaciones/docs/app.js",
  "/cotizaciones/docs/manifest.webmanifest",
  "/cotizaciones/docs/icons/icon-180.png",
  "/cotizaciones/docs/icons/icon-192.png",
  "/cotizaciones/docs/icons/icon-512.png",
  "/cotizaciones/docs/icons/apple-touch-icon.png",
  "/cotizaciones/docs/icons/maskable.png",
];

self.addEventListener("install", (ev) => {
  ev.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(SHELL)));
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  return self.clients.claim();
});

self.addEventListener("fetch", (ev) => {
  const url = new URL(ev.request.url);
  // Solo cachear peticiones del shell mismo-origin. api.github.com nunca se cachea.
  if (url.origin !== location.origin) return;
  ev.respondWith(
    caches.match(ev.request).then((cached) => cached || fetch(ev.request))
  );
});
