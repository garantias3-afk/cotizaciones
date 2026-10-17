// sw.js — Cachea solo el shell (index, css, js, manifest, icons). Nunca cachea api.github.com.
const CACHE_NAME = "cotizaciones-shell-v1";
const SHELL = [
  "/cotizaciones/",
  "/cotizaciones/index.html",
  "/cotizaciones/styles.css",
  "/cotizaciones/calc.js",
  "/cotizaciones/app.js",
  "/cotizaciones/manifest.webmanifest",
  "/cotizaciones/icons/icon-180.png",
  "/cotizaciones/icons/icon-192.png",
  "/cotizaciones/icons/icon-512.png",
  "/cotizaciones/icons/apple-touch-icon.png",
  "/cotizaciones/icons/maskable.png",
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
