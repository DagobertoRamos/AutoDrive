// =============================================================================
// Service Worker do AutoDrive — Web Push (PWA, inclusive iPhone iOS 16.4+).
// Recebe a chamada da fila, mostra a notificação (com botões onde suportado) e,
// ao tocar/agir, abre a decisão ou recusa direto. iOS: sem alarme contínuo nem
// pop-up sobre a tela bloqueada (limite da Apple) — mas a notificação chega na
// tela bloqueada com som e é reforçada pelo servidor enquanto a chamada segue.
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
  const attendanceId = payload.attendanceId || data.attendanceId
  const options = {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: isQueueCall ? 'queue-call' : (notificationId ? `notification-${notificationId}` : `autodrive-${type}`),
    renotify: isQueueCall,
    requireInteraction: isQueueCall || data.requireInteraction === true || payload.requireInteraction === 'true',
    vibrate: isQueueCall ? [600, 400, 600, 400, 600] : [180, 90, 180],
    // Botões de resposta rápida (onde o navegador/OS suportam — desktop/Android
    // sempre; iOS varia). Se não renderizar, o toque no corpo abre a decisão.
    actions: isQueueCall ? [
      { action: 'accept', title: '✅ Aceitar' },
      { action: 'reject', title: '❌ Recusar' },
    ] : undefined,
    data: { url, type, notificationId, attendanceId, ...payload },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

async function focusOrOpen(url) {
  const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  for (const c of all) {
    if ('focus' in c) { try { await c.navigate(url) } catch (_e) { /* */ } return c.focus() }
  }
  if (self.clients.openWindow) return self.clients.openWindow(url)
}

self.addEventListener('notificationclick', (event) => {
  const d = event.notification.data || {}
  const url = d.url || '/dashboard'
  const attId = d.attendanceId
  event.notification.close()

  // Recusar direto pela notificação (não precisa de GPS). Se falhar (sessão
  // expirada, etc.), abre o app para o vendedor decidir.
  if (event.action === 'reject' && attId) {
    event.waitUntil((async () => {
      try {
        const res = await fetch(`/api/seller-queue/attendances/${attId}/reject`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ reason: 'Recusado pela notificação' }),
        })
        if (res.ok) return
      } catch (_e) { /* cai no fallback abaixo */ }
      return focusOrOpen(url)
    })())
    return
  }

  // Aceitar precisa de GPS (revalidação de presença), que só existe na tela →
  // abre/foca o app na decisão. Toque no corpo também abre.
  event.waitUntil(focusOrOpen(url))
})
