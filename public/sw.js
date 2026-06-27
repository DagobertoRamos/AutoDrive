// =============================================================================
// Service Worker do AutoDrive — Web Push (PWA, inclusive iPhone iOS 16.4+).
// Recebe a notificação de chamada e, ao tocar, abre a Minha Fila.
// =============================================================================

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch (e) { /* */ }
  const title = data.title || 'Você é o vendedor da vez 🔔'
  const body = data.body || 'Cliente aguardando — aceite ou recuse.'
  const options = {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: 'queue-call',
    renotify: true,
    requireInteraction: true,
    vibrate: [600, 400, 600, 400, 600],
    data: { url: '/vendedor-da-vez/minha-fila', ...(data.data || {}) },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/vendedor-da-vez/minha-fila'
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of all) {
      if ('focus' in c) { try { await c.navigate(url) } catch (e) { /* */ } return c.focus() }
    }
    if (self.clients.openWindow) return self.clients.openWindow(url)
  })())
})
