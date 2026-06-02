// Service Worker — Mes Abeilles
// v19 — correction noms icônes + stratégie cache robuste

const CACHE_NAME = 'mes-abeilles-v19';
const FILES_TO_CACHE = [
  './index.html',
  './manifest.json',
  './icon192.png',
  './icon512.png'
];

// Installation : mise en cache des fichiers
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Mise en cache des fichiers');
      // addAll échoue si un seul fichier manque — on utilise add individuel
      return Promise.allSettled(
        FILES_TO_CACHE.map(f => cache.add(f).catch(e => console.warn('[SW] Cache manqué:', f, e)))
      );
    })
  );
  self.skipWaiting();
});

// Activation : nettoyage des anciens caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log('[SW] Suppression ancien cache:', k);
          return caches.delete(k);
        })
      )
    )
  );
  self.clients.claim();
});

// Fetch : réseau d'abord, cache en fallback
self.addEventListener('fetch', event => {
  // Ne pas intercepter les requêtes non-GET
  if(event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Mettre en cache la réponse fraîche
        if(response && response.status === 200){
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Réseau indisponible — servir depuis le cache
        return caches.match(event.request)
          .then(cached => cached || caches.match('./index.html'));
      })
  );
});
