// =============================================================================
// Service Worker do AutoDrive — Web Push (PWA, inclusive iPhone iOS 16.4+).
// Recebe a notificação de chamada e, ao tocar, abre a Minha Fila.
// =============================================================================

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch (_e) { /* */ }
  const payload = data.data || {}
  const type = data.type || payload.type || 'NOTIFICATION'
  const isQueueCall = type === 'QUEUE_CALL'
  const title = data.title || payload.title || (isQueueCall ? 'Você é o vendedor da vez 🔔' : 'AutoDrive')
  const body = data.body || payload.body || data.message || 'Você recebeu uma nova notificação.'
  const url = data.url || data.actionUrl || payload.url || (isQueueCall ? '/vendedor-da-vez/minha-fila' : '/dashboard')
  const notificationId = data.notificationId || payload.notificationId
  const options = {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: isQueueCall ? 'queue-call' : (notificationId ? `notification-${notificationId}` : `autodrive-${type}`),
    renotify: isQueueCall,
    requireInteraction: isQueueCall || data.requireInteraction === true || payload.requireInteraction === 'true',
    vibrate: isQueueCall ? [600, 400, 600, 400, 600] : [180, 90, 180],
    data: { url, type, notificationId, ...payload },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/dashboard'
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of all) {
      if ('focus' in c) { try { await c.navigate(url) } catch (_e) { /* */ } return c.focus() }
    }
    if (self.clients.openWindow) return self.clients.openWindow(url)
  })())
})
