// Service worker for the installed app. It keeps the app's own files so it opens without a connection;
// the schedule itself (/api) always comes from the network, as it does in the browser.
//  - Pages: network first, the last copy when offline, so a deploy shows up on the next open.
//  - /assets: cache first. Vite gives them a hash in the name, so a cached copy is never out of date.
//  - Anything else (icons, manifest, /api, other sites): straight to the network.
const CACHE = 'f1-shell-v1'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key !== CACHE) await caches.delete(key)
      }
      await self.clients.claim()
    })()
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    event.respondWith(pageFromNetwork(request))
  } else if (url.pathname.startsWith('/assets/')) {
    event.respondWith(assetFromCache(request))
  }
})

// Every page is the same index.html, so one copy serves them all offline.
async function pageFromNetwork(request) {
  const cache = await caches.open(CACHE)
  try {
    const response = await fetch(request)
    if (response.ok) await cache.put('/', response.clone())
    return response
  } catch (error) {
    const cached = await cache.match('/')
    if (cached) return cached
    throw error
  }
}

async function assetFromCache(request) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) await cache.put(request, response.clone())
  return response
}
