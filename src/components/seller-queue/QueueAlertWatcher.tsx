'use client'

// =============================================================================
// QueueAlertWatcher — vigia GLOBAL do "vendedor da vez". Montado no DashboardShell,
// roda em TODAS as páginas (app, PWA iPhone, PC). Quando o usuário é chamado
// (status CALLED), dispara o alerta CRÍTICO (sirene + balão + vibração) e abre
// um POP-UP de aceite com Aceitar / Recusar / Passar a vez (motivo na recusa).
// O alarme para EXATAMENTE no fim do prazo de aceite e dispara o timeout.
// =============================================================================

import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, XCircle, SkipForward, Loader2 } from 'lucide-react'
import { unlockAudio, ensureNotifyPermission, criticalAlert, stopCriticalAlert, ALERT_STOP_EVENT } from '@/lib/seller-queue/alert-client'

const POLL_MS = 8000

function getPosition(): Promise<{ latitude?: number; longitude?: number; accuracyM?: number }> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve({})
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracyM: p.coords.accuracy }),
      () => resolve({}), { enableHighAccuracy: true, timeout: 8000 },
    )
  })
}

interface Prompt { attId: string; customerName: string | null }

export default function QueueAlertWatcher() {
  const alertTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const titleTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const deadlineTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const baseTitle = useRef<string>('')
  const isCalled = useRef(false)
  const noAccess = useRef(false)

  // Estado do POP-UP de aceite (mostrado em qualquer tela).
  const [prompt, setPrompt] = useState<Prompt | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [rejectMode, setRejectMode] = useState(false)
  const [reason, setReason] = useState('')
  const promptRef = useRef<Prompt | null>(null)
  promptRef.current = prompt

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
      const fire = () => criticalAlert({ title: 'Você é o vendedor da vez 🔔', body: 'Cliente presencial aguardando — aceite ou recuse.', soundType: a.soundType, sound: a.sound, push: a.browserPush })
      fire()
      alertTimer.current = setInterval(fire, Math.max(5, a.repeatSeconds || 10) * 1000)
      startTitleFlash()
    }
    const stopAlert = () => {
      if (alertTimer.current) { clearInterval(alertTimer.current); alertTimer.current = null }
      if (deadlineTimer.current) { clearTimeout(deadlineTimer.current); deadlineTimer.current = null }
      stopTitleFlash()
      stopCriticalAlert()
    }
    const closePrompt = () => { setPrompt(null); setRejectMode(false); setReason(''); setErr(null) }
    const fireTimeout = (attId?: string) => {
      if (!attId) return
      fetch(`/api/seller-queue/attendances/${attId}/timeout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ reason: 'prazo de aceite esgotado' }) }).catch(() => {})
    }

    const poll = async () => {
      if (stopped || noAccess.current) return
      try {
        const res = await fetch('/api/seller-queue/current', { credentials: 'include' })
        if (res.status === 403) { noAccess.current = true; return }
        if (!res.ok) return
        const data = (await res.json())?.data
        const att = data?.myAttendance
        const deadlineMs = att?.acceptDeadline ? new Date(att.acceptDeadline).getTime() : null
        const called = att?.status === 'CALLED' && (deadlineMs === null || Date.now() < deadlineMs)
        if (called && !isCalled.current) {
          isCalled.current = true
          startAlert(data.alerts ?? { soundType: 'siren', repeatSeconds: 10, sound: true, browserPush: true })
          setPrompt({ attId: att.id, customerName: att.arrival?.customerName ?? null })
          if (deadlineMs) {
            if (deadlineTimer.current) clearTimeout(deadlineTimer.current)
            deadlineTimer.current = setTimeout(() => { isCalled.current = false; stopAlert(); closePrompt(); fireTimeout(att?.id) }, Math.max(0, deadlineMs - Date.now()))
          }
        } else if (!called && isCalled.current) {
          isCalled.current = false
          stopAlert()
          closePrompt()
        }
      } catch { /* noop */ }
    }

    // Aceite/recusa em qualquer tela → para na hora.
    const onStop = () => { isCalled.current = false; stopAlert() }
    window.addEventListener(ALERT_STOP_EVENT, onStop)

    void poll()
    const i = setInterval(poll, POLL_MS)
    return () => { stopped = true; clearInterval(i); window.removeEventListener(ALERT_STOP_EVENT, onStop); stopAlert() }
  }, [])

  // ── Ações do pop-up ─────────────────────────────────────────────────────────
  const act = async (path: string, body: unknown) => {
    if (!prompt) return
    setBusy(true); setErr(null)
    stopCriticalAlert()
    try {
      const res = await fetch(`/api/seller-queue/attendances/${prompt.attId}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(j?.error ?? 'Não foi possível concluir.'); return }
      isCalled.current = false
      setPrompt(null); setRejectMode(false); setReason('')
    } catch { setErr('Erro de rede.') } finally { setBusy(false) }
  }
  const accept = async () => { const pos = await getPosition(); await act('accept', pos) }
  const reject = async () => { if (!reason.trim()) { setErr('Informe o motivo da recusa.'); return } await act('reject', { reason: reason.trim() }) }
  const pass = async () => { await act('reject', { reason: 'Passou a vez' }) }

  if (!prompt) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-3 sm:items-center">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-2xl">🔔</span>
          <h2 className="text-lg font-bold text-gray-900">Você é o vendedor da vez!</h2>
        </div>
        <p className="mb-4 text-sm text-gray-500">{prompt.customerName ? <>Cliente: <strong>{prompt.customerName}</strong></> : 'Cliente presencial aguardando.'} Aceite, recuse ou passe a vez.</p>

        {err && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

        {!rejectMode ? (
          <div className="space-y-2">
            <button onClick={accept} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-3 text-base font-bold text-white hover:bg-brand-700 disabled:opacity-60">{busy ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}Aceitar</button>
            <div className="flex gap-2">
              <button onClick={() => { setRejectMode(true); setErr(null) }} disabled={busy} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"><XCircle size={16} />Recusar</button>
              <button onClick={pass} disabled={busy} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-60"><SkipForward size={16} />Passar a vez</button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="block text-xs font-medium text-gray-700">Motivo da recusa *</label>
            <textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Ex.: já estou em atendimento / cliente não é meu perfil…" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            <div className="flex gap-2">
              <button onClick={() => { setRejectMode(false); setErr(null) }} disabled={busy} className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">Voltar</button>
              <button onClick={reject} disabled={busy} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">{busy ? <Loader2 size={15} className="animate-spin" /> : <XCircle size={15} />}Confirmar recusa</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
