'use client'

// =============================================================================
// QueueAlertWatcher — vigia GLOBAL do "vendedor da vez". Montado no DashboardShell,
// roda em TODAS as páginas. Faz polling do estado da fila e, quando o usuário é
// chamado (status CALLED), dispara o alerta CRÍTICO (sirene + balão do navegador
// + vibração) repetidamente, NÃO importa em qual página/aba ele esteja. Também
// pisca o título da aba ("🔔 SUA VEZ"). Para ao aceitar/recusar/timeout.
// Sem acesso à fila (403) → encerra o polling. Não renderiza nada.
// =============================================================================

import { useEffect, useRef } from 'react'
import { unlockAudio, ensureNotifyPermission, criticalAlert, stopCriticalAlert, ALERT_STOP_EVENT } from '@/lib/seller-queue/alert-client'

const POLL_MS = 8000

export default function QueueAlertWatcher() {
  const alertTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const titleTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const baseTitle = useRef<string>('')
  const isCalled = useRef(false)
  const noAccess = useRef(false)

  // Destrava áudio + pede permissão de notificação no 1º gesto (em qualquer página).
  useEffect(() => {
    const onGesture = () => { unlockAudio(); void ensureNotifyPermission() }
    window.addEventListener('pointerdown', onGesture)
    window.addEventListener('keydown', onGesture)
    return () => { window.removeEventListener('pointerdown', onGesture); window.removeEventListener('keydown', onGesture) }
  }, [])

  useEffect(() => {
    let stopped = false

    const startTitleFlash = () => {
      if (titleTimer.current) return
      baseTitle.current = document.title
      let on = false
      titleTimer.current = setInterval(() => { document.title = on ? '🔔 SUA VEZ — atender!' : baseTitle.current; on = !on }, 1000)
    }
    const stopTitleFlash = () => {
      if (titleTimer.current) { clearInterval(titleTimer.current); titleTimer.current = null }
      if (baseTitle.current) document.title = baseTitle.current
    }

    const startAlert = (a: { soundType?: string; repeatSeconds?: number; sound?: boolean; browserPush?: boolean }) => {
      if (alertTimer.current) return
      const fire = () => criticalAlert({
        title: 'Você é o vendedor da vez 🔔',
        body: 'Cliente presencial aguardando — abra o app e aceite.',
        soundType: a.soundType, sound: a.sound, push: a.browserPush,
      })
      fire()
      alertTimer.current = setInterval(fire, Math.max(5, a.repeatSeconds || 10) * 1000)
      startTitleFlash()
    }
    const stopAlert = () => {
      if (alertTimer.current) { clearInterval(alertTimer.current); alertTimer.current = null }
      stopTitleFlash()
      stopCriticalAlert()
    }

    const poll = async () => {
      if (stopped || noAccess.current) return
      try {
        const res = await fetch('/api/seller-queue/current', { credentials: 'include' })
        if (res.status === 403) { noAccess.current = true; return } // não pertence à fila
        if (!res.ok) return
        const data = (await res.json())?.data
        const called = data?.myAttendance?.status === 'CALLED'
        if (called && !isCalled.current) {
          isCalled.current = true
          startAlert(data.alerts ?? { soundType: 'siren', repeatSeconds: 10, sound: true, browserPush: true })
        } else if (!called && isCalled.current) {
          isCalled.current = false
          stopAlert()
        }
      } catch { /* noop */ }
    }

    // Aceite/recusa em qualquer tela dispara este evento → para na hora,
    // sem esperar o próximo poll (corrige "continua apitando após aceitar").
    const onStop = () => { isCalled.current = false; stopAlert() }
    window.addEventListener(ALERT_STOP_EVENT, onStop)

    void poll()
    const i = setInterval(poll, POLL_MS)
    return () => { stopped = true; clearInterval(i); window.removeEventListener(ALERT_STOP_EVENT, onStop); stopAlert() }
  }, [])

  return null
}
