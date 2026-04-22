const CACHE_NAME = 'turni-boschetto-v1';
const urlsToCache = [
  './',
  './index.html',
  './style_v2.css',
  './script.js',
  './manifest.json'
];

// Installazione: salva i file nella memoria del telefono
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('File salvati in cache!');
        return cache.addAll(urlsToCache);
      })
  );
});

// Intercettazione: se sei offline, usa i file salvati
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Ritorna la versione salvata, altrimenti prova a scaricarla da internet
        return response || fetch(event.request);
      })
  );
});

// Pulizia: elimina le vecchie versioni se aggiorni l'app
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});