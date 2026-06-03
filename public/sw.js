/**
 * Service Worker — PWA offline + auto-update
 *
 * Strategy:
 *  - HTML: network-first (always check for new version, cache as fallback)
 *  - Static assets (JS/CSS/WASM): cache-first (they have content hashes)
 *  - Auto-update: skipWaiting + clients.claim on new version
 *  - Old caches purged on activate
 */

const CACHE_VERSION = 'v2'
const CACHE_NAME = `audio-loudness-${CACHE_VERSION}`

// ── Install: pre-cache app shell ──────────────────
self.addEventListener('install', (event) => {
  console.log(`[SW] Installing ${CACHE_NAME}...`)
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(['/', '/index.html', '/manifest.json']).catch((err) => {
        console.warn('[SW] Pre-cache partial failure:', err)
      })
    })
  )
  // Take control immediately — don't wait for tabs to close
  self.skipWaiting()
})

// ── Activate: purge old caches, claim clients ─────
self.addEventListener('activate', (event) => {
  console.log(`[SW] Activating ${CACHE_NAME}...`)
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log(`[SW] Deleting old cache: ${key}`)
            return caches.delete(key)
          })
      )
    })
    .then(() => self.clients.claim())
    .then(() => console.log('[SW] Ready — all clients claimed'))
  )
})

// ── Fetch: network-first HTML, cache-first assets ──
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  const url = new URL(event.request.url)

  // Network-first for page navigations (HTML)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache the fresh response
          const cloned = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned))
          return response
        })
        .catch(() => {
          // Offline — serve cached page
          return caches.match(event.request).then((cached) => cached || caches.match('/index.html'))
        })
    )
    return
  }

  // Cache-first for static assets (JS, CSS, WASM, icons)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached

      return fetch(event.request).then((response) => {
        // Only cache successful same-origin responses
        if (response.status === 200 && url.origin === self.location.origin) {
          const cloned = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned))
        }
        return response
      })
      .catch(() => {
        // Offline and not in cache — nothing we can do
        return new Response('Offline — resource not cached', { status: 503 })
      })
    })
  )
})
