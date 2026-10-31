/* Minimal app-shell cache so the dashboard still opens offline.
   Data fetches (sheet CSV, ether-dash status) always go to the
   network — only the shell files are cached. */
const CACHE = "rizta-dash-shell-v1";
const SHELL = ["./", "index.html", "styles.css", "app.js", "manifest.json", "icon.svg", "icon-maskable.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // never intercept external data calls
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
