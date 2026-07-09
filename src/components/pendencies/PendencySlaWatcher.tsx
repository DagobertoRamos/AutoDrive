'use client'

// =============================================================================
// PendencySlaWatcher — pop-up BLOQUEANTE de SLA (Fase 3). Ao entrar no sistema
// (e a cada intervalo), consulta /api/pendencies/action-required. Se o
// responsável tem pendência Alta/Urgente sem prazo comprometido, exige:
//   "Em quanto tempo você resolve isso?" (não fecha sem prazo ou adiar c/ motivo)
// Se Urgente com prazo estourado, cobra: "Você disse que resolveria até X…".
// Cada exibição/resposta é gravada na timeline (pendency_events).
// Trata uma pendência por vez; volta a checar após cada ação.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Clock, CalendarClock } from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'

interface Pendency { id: string; customerName: string; plate: string | null; type: string | null; description: string | null; priority: string; status: string; dueDate: string | null; unit?: { name: string } | null }
interface Decision { kind: 'commit' | 'charge'; blocking: boolean; committedDueDate: string | null; deferCount: number; canDefer: boolean; overdue: boolean }
interface Item { pendency: Pendency; decision: Decision }

const POLL_MS = 60_000
const PRI_COLOR: Record<string, string> = { URGENTE: 'bg-red-100 text-red-700', ALTA: 'bg-orange-100 text-orange-700' }

export default function PendencySlaWatcher() {
  const { status } = useSession()
  const router = useRouter()
  const [item, setItem] = useState<Item | null>(null)
  const [due, setDue] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const shownForRef = useRef<string | null>(null)

  const fetchNext = useCallback(async () => {
    try {
      const res = await fetch('/api/pendencies/action-required', { credentials: 'include' })
      const j = await res.json().catch(() => null)
      const list: Item[] = j?.data ?? []
      setItem((cur) => cur ?? list[0] ?? null)
    } catch { /* silencioso */ }
  }, [])

  useEffect(() => {
    if (status !== 'authenticated') return
    fetchNext()
    const t = setInterval(fetchNext, POLL_MS)
    const onFocus = () => fetchNext()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus) }
  }, [status, fetchNext])

  // Registra "pop-up exibido" uma vez por pendência exibida (auditoria + throttle).
  useEffect(() => {
    if (!item || shownForRef.current === item.pendency.id) return
    shownForRef.current = item.pendency.id
    setDue(''); setNote(''); setError('')
    fetch(`/api/pendencies/${item.pendency.id}/sla-action`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ action: 'shown', kind: item.decision.kind }),
    }).catch(() => {})
  }, [item])

  const post = async (payload: Record<string, unknown>): Promise<boolean> => {
    if (!item) return false
    setBusy(true); setError('')
    try {
      const res = await fetch(`/api/pendencies/${item.pendency.id}/sla-action`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(payload),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j?.error ?? 'Falha ao registrar.'); return false }
      return true
    } catch { setError('Erro de rede.'); return false } finally { setBusy(false) }
  }

  const advance = async () => { setItem(null); await fetchNext() }

  const handleCommit = async () => {
    if (!due) { setError('Informe em quanto tempo você resolve.'); return }
    if (await post({ action: 'commit', committedDueDate: new Date(due).toISOString(), note: note.trim() || undefined })) advance()
  }
  const handleRespond = async () => {
    if (note.trim().length < 3) { setError('Explique o que aconteceu.'); return }
    if (await post({ action: 'respond', note: note.trim(), committedDueDate: due ? new Date(due).toISOString() : undefined })) advance()
  }
  const handleDefer = async () => {
    const reason = window.prompt('Por que adiar? (será registrado no histórico)')
    if (reason === null) return
    if (reason.trim().length < 3) { setError('Justifique o adiamento.'); return }
    if (await post({ action: 'defer', reason: reason.trim() })) advance()
  }

  if (!item) return null
  const { pendency: p, decision: d } = item
  const isCharge = d.kind === 'charge'

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4" role="alertdialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative z-10 flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className={cn('flex items-center gap-2 px-5 py-4 text-white', isCharge ? 'bg-red-600' : 'bg-orange-500')}>
          {isCharge ? <AlertTriangle size={18} /> : <Clock size={18} />}
          <h2 className="text-sm font-bold">{isCharge ? 'COBRANÇA — prazo estourado' : 'DEFINA UM PRAZO PARA RESOLVER'}</h2>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <div className="rounded-xl border border-gray-200 p-3">
            <div className="flex items-center gap-2">
              <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold', PRI_COLOR[p.priority] ?? 'bg-gray-100 text-gray-600')}>{p.priority}</span>
              {p.type && <span className="text-xs font-medium text-gray-600">{p.type}</span>}
            </div>
            <p className="mt-1 text-sm font-semibold text-gray-800">{p.customerName}{p.plate ? ` — ${p.plate}` : ''}</p>
            {p.description && <p className="mt-0.5 text-xs text-gray-500">{p.description}</p>}
            <p className="mt-1 text-[11px] text-gray-400">{p.unit?.name ? `${p.unit.name} · ` : ''}{p.dueDate ? `vence ${formatDate(new Date(p.dueDate))}` : 'sem vencimento'}</p>
          </div>

          {isCharge ? (
            <>
              <p className="text-sm text-gray-700">Você se comprometeu a resolver até <b>{d.committedDueDate ? formatDate(new Date(d.committedDueDate)) : '—'}</b> e o prazo passou. O que aconteceu?</p>
              <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Explique a situação…" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
              <label className="block text-xs font-medium text-gray-700">Novo prazo (opcional)</label>
              <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </>
          ) : (
            <>
              <p className="text-sm text-gray-700">Em quanto tempo você resolve isso? Registre o prazo com que se compromete.</p>
              <label className="block text-xs font-medium text-gray-700">Prazo comprometido *</label>
              <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Observação (opcional)" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </>
          )}

          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        </div>

        <div className="flex flex-col gap-2 border-t border-gray-100 px-5 py-3">
          <button onClick={isCharge ? handleRespond : handleCommit} disabled={busy} className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <CalendarClock size={15} />}
            {isCharge ? 'Registrar resposta' : 'Registrar prazo'}
          </button>
          <div className="flex items-center justify-between">
            <button onClick={() => { setItem(null); router.push(`/pendencias/central?id=${p.id}`) }} className="text-xs font-medium text-brand-700 hover:underline">Abrir na Central</button>
            {!isCharge && d.canDefer && (
              <button onClick={handleDefer} disabled={busy} className="text-xs font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50">Adiar (justificar)</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
