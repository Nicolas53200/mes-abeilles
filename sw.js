const CACHE_NAME = "mes-abeilles-v37-0";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon192.png",
  "./icon512.png"
];

/* Librairies tierces nécessaires à la carte, au scanner et aux QR codes.
   Sans elles en cache, ces trois fonctions étaient inutilisables hors
   connexion. Les URL portent un numéro de version, leur contenu ne change
   jamais : on peut donc servir le cache en priorité. */
const VENDOR_ASSETS = [
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
  "https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js",
  "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.all(
        // Une par une : un CDN injoignable ne doit pas faire échouer
        // la mise en cache de tout le reste (cache.addAll est atomique).
        APP_SHELL.concat(VENDOR_ASSETS).map(url =>
          cache.add(new Request(url, { mode: url.startsWith("http") ? "cors" : "same-origin" }))
            .catch(() => cache.add(new Request(url, { mode: "no-cors" })).catch(() => undefined))
        )
      ))
      // Pas de skipWaiting ici : le nouveau service worker attend en coulisse
      // et l'application propose à l'utilisateur de recharger. Sans cela, il
      // prendrait la main au milieu d'une session, pendant que la page tourne
      // encore sur l'ancien code.
  );
});

self.addEventListener("message", event => {
  if(event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if(event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  if(url.origin !== location.origin){
    // Librairies connues : cache d'abord, réseau en secours. Elles sont
    // versionnées dans l'URL, donc jamais périmées.
    if(VENDOR_ASSETS.includes(url.href)){
      event.respondWith(
        caches.match(event.request).then(cached => cached || fetch(event.request)
          .then(response => {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => {});
            return response;
          }))
      );
      return;
    }

    // Tout le reste (tuiles de carte, API météo) : réseau, cache en secours.
    // Volontairement non mis en cache : les tuiles satureraient le stockage.
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then(cached => cached || caches.match("./index.html")))
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || "./index.html";
  event.waitUntil(clients.openWindow(targetUrl));
});
