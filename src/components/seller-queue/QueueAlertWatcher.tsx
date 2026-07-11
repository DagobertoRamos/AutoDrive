'use client'

// =============================================================================
// QueueAlertWatcher — vigia GLOBAL do "vendedor da vez". Roda em TODAS as telas
// (app Android, PWA iPhone, PC). Ao ser chamado (CALLED) toca o alerta CRÍTICO
// e abre um POP-UP: Aceitar / Recusar (com motivo) / Passar a vez.
// Robusto: clicar PARA tudo na hora; chamada já tratada não volta a tocar; o
// alarme/pop-up encerram exatamente quando o prazo vence (e dispara o timeout).
// =============================================================================

import { useEffect, useRef, useState, useCallback } from 'react'
import { CheckCircle2, XCircle, SkipForward, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { unlockAudio, ensureNotifyPermission, criticalAlert, stopCriticalAlert } from '@/lib/seller-queue/alert-client'
import { registerPushToken, consumePushAction, isNativeAndroid, stopNativeRinger } from '@/lib/mobile/push-bridge'
import { refreshWebPushIfGranted } from '@/lib/mobile/web-push-client'

const POLL_MS = 2000 // detecção rápida da chamada (endpoint leve /my-active-call)

// Rótulos dos tipos de visita para o pop-up (espelha DEFAULT_ATTENDANCE_TYPES).
const VISIT_LABEL: Record<string, string> = {
  CLIENTE_PORTA: 'Cliente de porta',
  INFORMACAO_RAPIDA: 'Informação rápida',
  AGENDAMENTO: 'Agendamento',
  RETORNO: 'Retorno',
  POS_VENDA: 'Pós-venda',
  RETIRADA_CARRO: 'Retirada de carro',
  ENTREGA_VEICULO: 'Entrega de veículo',
  DOCUMENTACAO: 'Documentação',
  TEST_DRIVE: 'Test-drive',
  AVALIACAO: 'Avaliação',
  OUTRO: 'Outro',
}

function getPosition(): Promise<{ latitude?: number; longitude?: number; accuracyM?: number }> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve({})
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracyM: p.coords.accuracy }),
      () => resolve({}), { enableHighAccuracy: true, timeout: 8000 },
    )
  })
}

interface Prompt { attId: string; customerName: string | null; visitType?: string | null; unitName?: string | null; acceptDeadline?: string | null }

export default function QueueAlertWatcher() {
  const alertTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const titleTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const deadlineTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const baseTitle = useRef<string>('')
  const isCalled = useRef(false)
  const noAccess = useRef(false)
  const handledAttId = useRef<string | null>(null) // chamada já tratada pelo usuário → não re-alertar
  const busyRef = useRef(false) // evita fechar popup durante submissão ativa (race GPS × deadline)

  const [prompt, setPrompt] = useState<Prompt | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [rejectMode, setRejectMode] = useState(false)
  const [reason, setReason] = useState('')
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)

  // Contagem regressiva até o prazo de aceite (só visual).
  useEffect(() => {
    if (!prompt?.acceptDeadline) { setSecondsLeft(null); return }
    const target = new Date(prompt.acceptDeadline).getTime()
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((target - Date.now()) / 1000)))
    tick()
    const i = setInterval(tick, 1000)
    return () => clearInterval(i)
  }, [prompt?.acceptDeadline])

  // Para TUDO de uma vez (timers + sirene nativa + título). Direto, sem eventos.
  const stopAll = useCallback(() => {
    if (alertTimer.current) { clearInterval(alertTimer.current); alertTimer.current = null }
    if (deadlineTimer.current) { clearTimeout(deadlineTimer.current); deadlineTimer.current = null }
    if (titleTimer.current) { clearInterval(titleTimer.current); titleTimer.current = null; if (baseTitle.current) document.title = baseTitle.current }
    isCalled.current = false
    stopCriticalAlert()
    void stopNativeRinger() // para o alarme/sirene do app Android (no-op no PWA/PC)
  }, [])

  // Destrava áudio + permissão de notificação no 1º gesto.
  useEffect(() => {
    const onGesture = () => { unlockAudio(); void ensureNotifyPermission() }
    window.addEventListener('pointerdown', onGesture)
    window.addEventListener('keydown', onGesture)
    return () => { window.removeEventListener('pointerdown', onGesture); window.removeEventListener('keydown', onGesture) }
  }, [])

  // App nativo (Android): registra o token de push e executa a ação que o usuário
  // tocou na NOTIFICAÇÃO (Aceitar/Recusar) com o app fechado ou em 2º plano.
  const processNativeAction = useCallback(async () => {
    const { action, attId } = await consumePushAction()
    if (!action || !attId) return
    // Tocou no corpo da notificação → abre a Minha Fila (o pop-up de aceite
    // aparece sozinho pelo poll, pois o atendimento está CALLED).
    if (action === 'open') {
      if (!window.location.pathname.includes('/vendedor-da-vez/minha-fila')) {
        window.location.assign('/vendedor-da-vez/minha-fila')
      }
      return
    }
    handledAttId.current = attId
    stopAll(); setPrompt(null)
    try {
      if (action === 'accept') {
        const pos = await getPosition()
        const res = await fetch(`/api/seller-queue/attendances/${attId}/accept`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(pos) })
        if (!res.ok) handledAttId.current = null // ex.: longe da loja → deixa o pop-up reaparecer
      } else if (action === 'reject') {
        await fetch(`/api/seller-queue/attendances/${attId}/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ reason: 'Recusado pela notificação' }) })
      }
    } catch { handledAttId.current = null }
  }, [stopAll])

  useEffect(() => {
    void registerPushToken()
    // iPhone/PWA: mantém a inscrição Web Push VIVA a cada abertura/retorno ao app.
    // O iOS rotaciona/expira o endpoint da subscription; sem renovar, ela morre e
    // o envio falha (404/410) → o iPhone fechado deixa de receber a chamada (só
    // "tocava" com o app aberto). No-op se não houver permissão (não abre prompt).
    void refreshWebPushIfGranted()
    void processNativeAction()
    const onResume = () => { if (!document.hidden) { void processNativeAction(); void refreshWebPushIfGranted() } }
    document.addEventListener('visibilitychange', onResume)
    window.addEventListener('focus', onResume)
    return () => { document.removeEventListener('visibilitychange', onResume); window.removeEventListener('focus', onResume) }
  }, [processNativeAction])

  useEffect(() => {
    let stopped = false

    const startTitleFlash = () => {
      if (titleTimer.current) return
      baseTitle.current = document.title
      let on = false
      titleTimer.current = setInterval(() => { document.title = on ? '🔔 SUA VEZ — atender!' : baseTitle.current; on = !on }, 1000)
    }
    const startAlert = (a: { soundType?: string; repeatSeconds?: number; sound?: boolean; browserPush?: boolean }) => {
      if (alertTimer.current) return
      // No app Android nativo, quem toca é o CallRinger (push) — não duplicar som aqui.
      if (isNativeAndroid()) { startTitleFlash(); return }
      const fire = () => criticalAlert({ title: 'Você é o vendedor da vez 🔔', body: 'Cliente aguardando — aceite ou recuse.', soundType: a.soundType, sound: a.sound, push: a.browserPush })
      fire()
      alertTimer.current = setInterval(fire, Math.max(5, a.repeatSeconds || 10) * 1000)
      startTitleFlash()
    }
    const fireTimeout = (attId?: string) => {
      if (!attId) return
      fetch(`/api/seller-queue/attendances/${attId}/timeout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ reason: 'prazo de aceite esgotado' }) }).catch(() => {})
    }

    const poll = async () => {
      if (stopped || noAccess.current) return
      try {
        const sp = typeof window !== 'undefined' ? window.location.search : ''
        const res = await fetch(`/api/seller-queue/my-active-call${sp}`, { credentials: 'include' })
        if (res.status === 403) { noAccess.current = true; return }
        if (!res.ok) return
        const data = (await res.json())?.data
        const att = data?.myAttendance

        // Sem chamada ativa → para tudo, fecha e libera p/ a próxima.
        if (!att || att.status !== 'CALLED') {
          if (isCalled.current) stopAll()
          setPrompt(null); handledAttId.current = null
          return
        }

        const deadlineMs = att.acceptDeadline ? new Date(att.acceptDeadline).getTime() : null
        const expired = deadlineMs !== null && Date.now() >= deadlineMs

        // Chamada já tratada pelo usuário (ex.: aceite recusado/erro) → não toca de novo.
        if (att.id === handledAttId.current) {
          if (isCalled.current) stopAll()
          if (expired) { fireTimeout(att.id); setPrompt(null) }
          return
        }

        if (!expired) {
          if (!isCalled.current) {
            isCalled.current = true
            startAlert(data.alerts ?? { soundType: 'siren', repeatSeconds: 10, sound: true, browserPush: true })
            // App Android: a notificação de chamada do SISTEMA (CallStyle) é o
            // único "Aceitar/Recusar" — não mostrar o balão interno para não
            // duplicar/conflitar. No PWA/PC (sem notificação nativa), mostra.
            if (!isNativeAndroid()) setPrompt({ attId: att.id, customerName: att.arrival?.customerName ?? null, visitType: att.visitType ?? null, unitName: data.unitName ?? null, acceptDeadline: att.acceptDeadline ?? null })
            if (deadlineMs) {
              if (deadlineTimer.current) clearTimeout(deadlineTimer.current)
              deadlineTimer.current = setTimeout(() => {
                stopAll()
                // Não fecha o popup se o vendedor está no meio de uma submissão
                // (ex.: GPS demorando 8s + prazo vencendo ao mesmo tempo).
                // Nesse caso o popup permanece até a resposta da API (ok ou erro).
                if (!busyRef.current) setPrompt(null)
                fireTimeout(att.id)
              }, Math.max(0, deadlineMs - Date.now()))
            }
          }
        } else {
          // Prazo venceu sem ação → para, fecha e avança a fila.
          if (isCalled.current) stopAll()
          if (!busyRef.current) setPrompt(null)
          fireTimeout(att.id)
        }
      } catch { /* noop */ }
    }

    void poll()
    const i = setInterval(poll, POLL_MS)
    return () => { stopped = true; clearInterval(i); stopAll() }
  }, [stopAll])

  // ── Ações do pop-up ─────────────────────────────────────────────────────────
  const act = async (path: string, body: unknown) => {
    if (!prompt) return
    const attId = prompt.attId
    stopAll()                       // para alarme/sirene IMEDIATAMENTE
    handledAttId.current = attId    // não volta a tocar para esta chamada
    busyRef.current = true; setBusy(true); setErr(null)
    try {
      const res = await fetch(`/api/seller-queue/attendances/${attId}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        // Mantém o pop-up visível para tentar de novo (ex.: longe da loja, 409 de race).
        // Se o deadline fechou o popup enquanto o GPS buscava, reabre com o erro.
        setPrompt((prev) => prev ?? { attId, customerName: null, visitType: null, unitName: null, acceptDeadline: null })
        setErr(j?.error ?? 'Não foi possível concluir.')
        return
      }
      setPrompt(null); setRejectMode(false); setReason('')
      // Aceitou → vai direto para a Minha Fila (atendimento em andamento).
      if (path === 'accept' && !window.location.pathname.includes('/vendedor-da-vez/minha-fila')) {
        window.location.assign('/vendedor-da-vez/minha-fila')
      }
    } catch { setErr('Erro de rede. Tente de novo.') } finally { busyRef.current = false; setBusy(false) }
  }
  const accept = async () => { busyRef.current = true; setBusy(true); const pos = await getPosition(); await act('accept', pos) }
  const reject = async () => { if (!reason.trim()) { setErr('Informe o motivo da recusa.'); return } await act('reject', { reason: reason.trim() }) }
  const pass = async () => { await act('reject', { reason: 'Passou a vez' }) }

  if (!prompt) return null

  const visitLabel = prompt.visitType ? (VISIT_LABEL[prompt.visitType] ?? 'Atendimento') : null

  return (
    <div role="alertdialog" aria-modal="true" className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl ring-4 ring-brand-500/40">
        {/* Cabeçalho urgente */}
        <div className="animate-pulse bg-brand-600 px-5 py-4 text-center">
          <p className="text-2xl">🔔</p>
          <h2 className="text-lg font-black uppercase tracking-wide text-white">Você é o vendedor da vez</h2>
        </div>

        <div className="p-5">
          {/* Detalhes da chamada */}
          <div className="mb-4 space-y-1.5 rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm">
            <p className="text-gray-700">Cliente aguardando atendimento{prompt.customerName ? <>: <strong className="text-gray-900">{prompt.customerName}</strong></> : null}.</p>
            {visitLabel && <p className="text-gray-600">Tipo: <strong className="text-gray-900">{visitLabel}</strong></p>}
            {prompt.unitName && <p className="text-gray-600">Unidade: <strong className="text-gray-900">{prompt.unitName}</strong></p>}
            {secondsLeft !== null && (
              <p className={cn('font-bold tabular-nums', secondsLeft <= 10 ? 'text-red-600' : 'text-brand-700')}>
                Tempo para responder: {secondsLeft}s
              </p>
            )}
          </div>

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
    </div>
  )
}
