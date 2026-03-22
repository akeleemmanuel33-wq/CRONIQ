const CACHE_NAME = 'croniq-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/app.html',
  '/app.js',
  '/login.html',
  '/signup.html',
  '/discover.html',
  '/admin.html',
  '/settings.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
];

// Install — cache static assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate — clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch — network first, fallback to cache
self.addEventListener('fetch', e => {
  // Skip non-GET and Supabase API calls (always fresh)
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('supabase.co')) return;
  if (e.request.url.includes('unpkg.com')) return;
  if (e.request.url.includes('fonts.googleapis.com')) return;
  if (e.request.url.includes('cdnjs.cloudflare.com')) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Cache fresh response
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
