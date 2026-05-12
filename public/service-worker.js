const CACHE_NAME = 'fixit-v1';

// Fisierele de baza care se cacheaza la instalare
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/mobile.css',
  '/manifest.json',
  '/offline.html'
];

// ── Instalare: cacheaza fisierele statice ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// ── Activare: sterge cache-urile vechi ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: strategie Network First ──
// Incearca intotdeauna reteaua; daca nu are internet,
// pentru pagini HTML arata offline.html,
// pentru assets statice serveste din cache.
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignora request-urile catre API — nu le cacheam niciodata
  if (url.pathname.startsWith('/api/')) return;

  // Ignora request-uri non-GET
  if (request.method !== 'GET') return;

  event.respondWith(
    fetch(request)
      .then(response => {
        // Daca raspunsul e valid, il cacheaza si il returneaza
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Offline: cauta in cache
        return caches.match(request).then(cached => {
          if (cached) return cached;

          // Daca e o navigare (pagina HTML) si nu avem cache, arata offline.html
          if (request.destination === 'document') {
            return caches.match('/offline.html');
          }
        });
      })
  );
});
