/**
 * Basic Service Worker for offline support
 * Will be enhanced with Workbox in Phase 6
 */

const CACHE_NAME = 'audio-loudness-v1'
const urlsToCache = [
    '/',
    '/index.html',
    '/manifest.json',
]

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('Caching app shell')
            return cache.addAll(urlsToCache).catch(() => {
                console.log('Some assets failed to cache during install')
            })
        })
    )
})

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Deleting old cache:', cacheName)
                        return caches.delete(cacheName)
                    }
                })
            )
        })
    )
})

self.addEventListener('fetch', (event) => {
    // Only cache GET requests
    if (event.request.method !== 'GET') {
        return
    }

    event.respondWith(
        caches.match(event.request).then((response) => {
            // Cache hit - return response
            if (response) {
                return response
            }

            return fetch(event.request)
                .then((response) => {
                    // Check if valid response
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response
                    }

                    // Clone the response
                    const responseToCache = response.clone()

                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache)
                    })

                    return response
                })
                .catch(() => {
                    // Return cached response if fetch fails
                    return caches.match('/index.html')
                })
        })
    )
})
