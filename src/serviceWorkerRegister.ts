/**
 * Service Worker Registration
 * Only active in production builds — disabled during development
 * to prevent stale caches from breaking Vite HMR.
 */

export async function registerServiceWorker() {
  // Skip in dev mode — the SW caches pages and breaks Vite HMR
  if (import.meta.env.DEV) {
    console.log('Service Worker disabled in development mode')
    return
  }

  if (!('serviceWorker' in navigator)) {
    console.log('Service Workers not supported in this browser')
    return
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    })

    console.log('Service Worker registered successfully:', registration)

    // Check for updates periodically
    setInterval(() => {
      registration.update()
    }, 60000) // Check every minute

    // Listen for controller change (SW activated)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.log('New Service Worker activated — page will refresh')
      window.location.reload()
    })
  } catch (error) {
    console.error('Service Worker registration failed:', error)
  }
}
