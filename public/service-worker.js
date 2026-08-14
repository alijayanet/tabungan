const CACHE_NAME = 'tabungan-pwa-v2'
const PRECACHE_URLS = ['/', '/manifest.json', '/offline.html']

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => {
        if (key !== CACHE_NAME) return caches.delete(key)
      }))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET') return

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/offline.html'))
    )
    return
  }

  event.respondWith(
    caches.match(req).then(cached => {
      const fetchPromise = fetch(req)
        .then(networkResp => {
          const respClone = networkResp.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(req, respClone)).catch(() => {})
          return networkResp
        })
        .catch(() => cached || Promise.reject())
      return cached || fetchPromise
    })
  )
})
