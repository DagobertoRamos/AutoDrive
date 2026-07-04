'use client'

// =============================================================================
// VerificarVezModal — pop-up "Verificar vez" (vendedor da vez / cliente de porta).
// Lê GET /api/seller-queue/check-turn (servidor calcula vez/posição/elegibilidade)
// e oferece as ações reusando os endpoints existentes:
//   - "Iniciar atendimento" (sou o da vez): quick-call → accept (com GPS).
//   - "Chamar <Fulano>"      (outro é a vez): quick-call.
// Não altera o motor da fila; só orquestra chamadas existentes. Mobile-first.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { X, Crown, PhoneCall, Play, RefreshCw, AlertCircle, CheckCircle2, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CheckTurn {
  eligible: boolean
  reason: string | null
  isCurrentTurn: boolean
  userPosition: number
  currentSeller: { id: string; name: string } | null
  counts: { available: number; paused: number; attending: number; waiting: number }
  nextUp: Array<{ name: string; position: number }>
  canStartAttendance: boolean
  canCallCurrentSeller: boolean
  canManage: boolean
  message: string
}

function getPosition(): Promise<{ latitude?: number; longitude?: number; accuracyM?: number }> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve({})
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracyM: p.coords.accuracy }),
      () => resolve({}),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    )
  })
}

export default function VerificarVezModal({ onClose, onChanged }: { onClose: () => void; onChanged?: () => void }) {
  const [data, setData] = useState<CheckTurn | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null)
  const [types, setTypes] = useState<Array<{ code: string; label: string }>>([])
  const [visitType, setVisitType] = useState('CLIENTE_PORTA')

  useEffect(() => {
    fetch('/api/seller-queue/attendance-types-config', { credentials: 'include' }).then((r) => r.json())
      .then((j) => { const t = (j?.data?.types ?? []).filter((x: { active?: boolean }) => x.active !== false); setTypes(t); if (t[0]?.code) setVisitType((v) => t.some((x: { code: string }) => x.code === v) ? v : t[0].code) })
      .catch(() => setTypes([]))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/seller-queue/check-turn', { credentials: 'include' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setFeedback({ ok: false, msg: j?.error ?? 'Não foi possível verificar a vez.' }); setData(null) }
      else setData(j?.data ?? null)
    } catch { setFeedback({ ok: false, msg: 'Erro de conexão.' }) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const post = async (url: string, body?: unknown) => {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body ?? {}) })
    const j = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, data: j?.data, error: j?.error as string | undefined }
  }

  // Chamar o vendedor da vez (outro colaborador). Toca/notifica ele.
  const callCurrent = async () => {
    setBusy(true); setFeedback(null)
    try {
      const r = await post('/api/seller-queue/quick-call')
      if (!r.ok) { setFeedback({ ok: false, msg: r.error ?? 'Falha ao chamar.' }); return }
      const callOk = r.data?.call?.ok !== false
      setFeedback({ ok: callOk, msg: callOk ? `${data?.currentSeller?.name ?? 'Vendedor da vez'} foi chamado.` : (r.data?.call?.reason ?? 'Chamada não concluída.') })
      onChanged?.()
      await load()
    } finally { setBusy(false) }
  }

  // Iniciar atendimento (sou o da vez): chama a mim mesmo e aceito com GPS.
  const startAttendance = async () => {
    setBusy(true); setFeedback(null)
    try {
      const r = await post('/api/seller-queue/quick-call')
      if (!r.ok) { setFeedback({ ok: false, msg: r.error ?? 'Falha ao iniciar.' }); return }
      const attId = r.data?.call?.attendanceId as string | undefined
      if (!attId || r.data?.call?.ok === false) {
        setFeedback({ ok: false, msg: r.data?.call?.reason ?? 'Não foi possível iniciar o atendimento agora.' }); await load(); return
      }
      const pos = await getPosition()
      const acc = await post(`/api/seller-queue/attendances/${attId}/accept`, pos)
      if (!acc.ok) { setFeedback({ ok: false, msg: acc.error ?? 'Não foi possível validar sua presença para iniciar.' }); return }
      // Grava a natureza da visita (best-effort — não bloqueia o início).
      if (visitType) await post(`/api/seller-queue/attendances/${attId}/set-type`, { visitType }).catch(() => {})
      setFeedback({ ok: true, msg: 'Atendimento iniciado! Cadastre o cliente na sua fila.' })
      onChanged?.()
      await load()
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-md rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900"><Crown size={18} className="text-brand-600" />Verificar vez</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X size={18} /></button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-5">
          {loading ? (
            <div className="h-28 animate-pulse rounded-lg bg-gray-100" />
          ) : data ? (
            <>
              {/* Mensagem principal */}
              <div className={cn('rounded-xl border p-4 text-center', data.isCurrentTurn ? 'border-brand-200 bg-brand-50' : data.eligible ? 'border-blue-200 bg-blue-50' : 'border-amber-200 bg-amber-50')}>
                {data.isCurrentTurn && <Crown size={28} className="mx-auto mb-1 text-brand-600" />}
                <p className={cn('text-sm font-semibold', data.isCurrentTurn ? 'text-brand-800' : data.eligible ? 'text-blue-800' : 'text-amber-800')}>{data.message}</p>
                {data.eligible && !data.isCurrentTurn && data.userPosition > 0 && (
                  <p className="mt-1 text-xs text-blue-700">Sua posição na fila: <strong>{data.userPosition}º</strong></p>
                )}
              </div>

              {/* Indicadores */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-2.5">
                  <p className="text-lg font-bold tabular-nums text-green-700">{data.counts.available}</p>
                  <p className="text-[11px] text-gray-500">Disponíveis</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-2.5">
                  <p className="text-lg font-bold tabular-nums text-amber-700">{data.counts.paused}</p>
                  <p className="text-[11px] text-gray-500">Pausados</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-2.5">
                  <p className="text-lg font-bold tabular-nums text-blue-700">{data.counts.attending}</p>
                  <p className="text-[11px] text-gray-500">Atendendo</p>
                </div>
              </div>

              {/* Próximos da fila */}
              {data.nextUp.length > 0 && (
                <div className="rounded-lg border border-gray-200">
                  <div className="flex items-center gap-1.5 border-b border-gray-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500"><Users size={13} />Próximos na fila</div>
                  <ul className="divide-y divide-gray-100">
                    {data.nextUp.map((n) => (
                      <li key={n.position} className="flex items-center gap-2 px-3 py-2 text-sm">
                        <span className="w-5 tabular-nums text-gray-400">{n.position}º</span>
                        <span className="text-gray-800">{n.name}</span>
                        {n.position === 1 && <span className="ml-auto rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-medium text-brand-700">da vez</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {feedback && (
                <div className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 text-sm', feedback.ok ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700')}>
                  {feedback.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}{feedback.msg}
                </div>
              )}

              {/* Ações */}
              <div className="space-y-2">
                {data.canStartAttendance && types.length > 0 && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Tipo de atendimento</label>
                    <select value={visitType} onChange={(e) => setVisitType(e.target.value)} disabled={busy}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500">
                      {types.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
                    </select>
                  </div>
                )}
                {data.canStartAttendance && (
                  <button onClick={startAttendance} disabled={busy} className="btn-primary w-full justify-center py-3 text-base">
                    {busy ? <RefreshCw size={18} className="animate-spin" /> : <Play size={18} />}Iniciar atendimento
                  </button>
                )}
                {data.canCallCurrentSeller && (
                  <button onClick={callCurrent} disabled={busy} className="btn-primary w-full justify-center py-3 text-base">
                    {busy ? <RefreshCw size={18} className="animate-spin" /> : <PhoneCall size={18} />}Chamar {data.currentSeller?.name}
                  </button>
                )}
                {data.canManage && (
                  <a href="/vendedor-da-vez/painel" className="btn-secondary w-full justify-center py-2.5 text-sm">Abrir painel da unidade (transferir / assumir)</a>
                )}
                {!data.eligible && !data.canManage && (
                  <a href="/vendedor-da-vez/minha-fila" className="btn-secondary w-full justify-center py-2.5 text-sm">Ir para Minha Fila</a>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle size={15} />{feedback?.msg ?? 'Não foi possível verificar a vez.'}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button onClick={load} disabled={loading || busy} className="btn-secondary text-xs"><RefreshCw size={13} className={cn(loading && 'animate-spin')} />Atualizar</button>
          <button onClick={onClose} className="btn-secondary text-xs">Fechar</button>
        </div>
      </div>
    </div>
  )
}
