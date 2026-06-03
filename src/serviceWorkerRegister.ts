/**
 * Service Worker Registration
 * Handles PWA offline support and caching
 */

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.log('Service Workers not supported in this browser')
    return
  }

  try {
    // For development, use a simple SW file
    // In production, Workbox will generate an optimized SW
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
      console.log('New Service Worker activated')
    })
  } catch (error) {
    console.error('Service Worker registration failed:', error)
  }
}
