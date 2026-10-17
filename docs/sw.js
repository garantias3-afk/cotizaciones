// sw.js — Cachea solo el shell. Nunca cachea respuestas de api.github.com.
// Estrategia: network-first para index/app.js/calc.js/manifest; cache-first para iconos y vendor.
let CACHE_NAME = "cotizaciones-shell-dev";
const SHELL = [
  "/cotizaciones/",
  "/cotizaciones/index.html",
  "/cotizaciones/styles.css",
  "/cotizaciones/calc.js",
  "/cotizaciones/app.js",
  "/cotizaciones/manifest.webmanifest",
];
const STATIC = [
  "/cotizaciones/icons/icon-180.png",
  "/cotizaciones/icons/icon-192.png",
  "/cotizaciones/icons/icon-512.png",
  "/cotizaciones/icons/apple-touch-icon.png",
  "/cotizaciones/icons/maskable.png",
  "/cotizaciones/vendor/marked.min.js",
  "/cotizaciones/vendor/dompurify.min.js",
];

self.addEventListener("install", (ev) => {
  ev.waitUntil(
    fetch("build-id.txt").then((r) => (r.ok ? r.text() : "dev")).catch(() => "dev").then((id) => {
      CACHE_NAME = "cotizaciones-shell-" + String(id || "dev").trim();
      return caches.open(CACHE_NAME).then((c) => c.addAll(SHELL));
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (ev) => {
  const url = new URL(ev.request.url);
  if (url.origin !== location.origin) return; // api.github.com nunca se cachea
  const isShell = SHELL.includes(url.pathname) || url.pathname === "/" || url.pathname === "/cotizaciones/";
  if (isShell) {
    ev.respondWith(
      fetch(ev.request).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE_NAME).then((c) => c.put(ev.request, copy));
        return resp;
      }).catch(() => caches.match(ev.request))
    );
  } else {
    ev.respondWith(
      caches.match(ev.request).then((cached) => cached || fetch(ev.request).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE_NAME).then((c) => c.put(ev.request, copy));
        return resp;
      }))
    );
  }
});
