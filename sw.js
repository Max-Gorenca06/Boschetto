const CACHE_NAME = 'turni-boschetto-v5';
const urlsToCache = [
  './',
  './index.html',
  './style_v2.css',
  './script.js',
  './manifest.json'
];

// Installazione: salva i file e FORZA l'attivazione immediata
self.addEventListener('install', event => {
  self.skipWaiting(); // <--- LA MAGIA 1: Non aspettare nella sala d'attesa, entra subito in azione!
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('File salvati in cache v3!');
        return cache.addAll(urlsToCache);
      })
  );
});

// Intercettazione: usa i file salvati o scaricali
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request);
      })
  );
});

// Pulizia: elimina le vecchie versioni e PRENDI IL CONTROLLO
self.addEventListener('activate', event => {
  event.waitUntil(clients.claim()); // <--- LA MAGIA 2: Prendi immediatamente il controllo della pagina aperta
  
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Elimino vecchia cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});