'use client'

// =============================================================================
// VacationManagerCard — Férias e Ausências da fila (GESTÃO). Fase 2.
// Lista as ausências da unidade e permite cadastrar/cancelar por colaborador.
// Reusa /api/seller-queue/vacations (+ /callable p/ o seletor). Backend valida
// permissão (queue.vacations.manage), tenant e unidade.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Palmtree, RefreshCw, Plus, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Vacation {
  id: string
  sellerId: string
  sellerName: string
  type: string
  startAt: string
  endAt: string
  reason: string | null
  autoReturn: boolean
  status: 'PROGRAMADO' | 'ATIVO' | 'ENCERRADO' | 'CANCELADO'
  inEffect: boolean
  createdByName: string | null
}

const TYPES: { value: string; label: string }[] = [
  { value: 'FERIAS', label: 'Férias' },
  { value: 'FOLGA', label: 'Folga' },
  { value: 'ATESTADO', label: 'Atestado' },
  { value: 'TREINAMENTO', label: 'Treinamento' },
  { value: 'AUSENCIA', label: 'Ausência temporária' },
  { value: 'BLOQUEIO_ADM', label: 'Bloqueio administrativo' },
  { value: 'OUTRO', label: 'Outro' },
]
const TYPE_LABEL: Record<string, string> = Object.fromEntries(TYPES.map((t) => [t.value, t.label]))

const STATUS_CLS: Record<string, string> = {
  PROGRAMADO: 'border-blue-200 bg-blue-50 text-blue-700',
  ATIVO: 'border-amber-200 bg-amber-50 text-amber-700',
  ENCERRADO: 'border-gray-200 bg-gray-50 text-gray-500',
  CANCELADO: 'border-gray-200 bg-gray-50 text-gray-400 line-through',
}
const STATUS_LABEL: Record<string, string> = { PROGRAMADO: 'Programado', ATIVO: 'Ativo', ENCERRADO: 'Encerrado', CANCELADO: 'Cancelado' }

const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const fmt = (s: string) => { try { return new Date(s).toLocaleDateString('pt-BR') } catch { return '—' } }
// yyyy-MM-dd de hoje (para default do formulário).
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

export default function VacationManagerCard() {
  const [rows, setRows] = useState<Vacation[] | null>(null)
  const [sellers, setSellers] = useState<{ sellerId: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  // Formulário de nova ausência.
  const [sellerId, setSellerId] = useState('')
  const [type, setType] = useState('FERIAS')
  const [startAt, setStartAt] = useState(today())
  const [endAt, setEndAt] = useState(today())
  const [reason, setReason] = useState('')
  const [autoReturn, setAutoReturn] = useState(true)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [vRes, sRes] = await Promise.all([
        fetch('/api/seller-queue/vacations', { credentials: 'include' }),
        fetch('/api/seller-queue/callable', { credentials: 'include' }),
      ])
      const vj = await vRes.json().catch(() => ({}))
      if (!vRes.ok) throw new Error(vj.error ?? 'Erro ao carregar ausências')
      setRows(vj.data ?? [])
      if (sRes.ok) setSellers((await sRes.json())?.data ?? [])
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Erro ao carregar') } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const create = async () => {
    setError(''); setOk('')
    if (!sellerId) { setError('Selecione o colaborador.'); return }
    if (endAt < startAt) { setError('A data final deve ser igual ou depois da inicial.'); return }
    setBusy('create')
    try {
      // Início 00:00 e fim 23:59:59.999 do dia escolhido (dia inteiro).
      const startISO = new Date(`${startAt}T00:00:00`).toISOString()
      const endISO = new Date(`${endAt}T23:59:59.999`).toISOString()
      const res = await fetch('/api/seller-queue/vacations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ sellerId, type, startAt: startISO, endAt: endISO, reason: reason.trim() || null, autoReturn }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? 'Erro ao cadastrar')
      setOk('Ausência cadastrada.'); setReason(''); setSellerId('')
      await load()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Erro ao cadastrar') } finally { setBusy(null) }
  }

  const cancel = async (id: string) => {
    if (!window.confirm('Cancelar esta ausência? O colaborador volta a poder entrar na fila.')) return
    setBusy(id); setError(''); setOk('')
    try {
      const res = await fetch(`/api/seller-queue/vacations/${id}`, { method: 'DELETE', credentials: 'include' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? 'Erro ao cancelar')
      await load()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Erro ao cancelar') } finally { setBusy(null) }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900"><Palmtree size={17} className="text-brand-600" />Férias e Ausências</h2>
          <p className="mt-0.5 text-xs text-gray-500">Colaborador com ausência em vigor não entra na fila, não vira vendedor da vez e não recebe chamada.</p>
        </div>
        <button onClick={load} disabled={loading} className="rounded p-1.5 text-gray-400 hover:bg-gray-100"><RefreshCw size={14} className={cn(loading && 'animate-spin')} /></button>
      </div>

      {error && <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle size={15} />{error}</div>}
      {ok && <div className="mt-3 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700"><CheckCircle2 size={15} />{ok}</div>}

      {/* Formulário de nova ausência */}
      <div className="mt-4 grid grid-cols-1 gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="lg:col-span-2">
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Colaborador</label>
          <select value={sellerId} onChange={(e) => setSellerId(e.target.value)} className={inputCls}>
            <option value="">Selecione…</option>
            {sellers.map((s) => <option key={s.sellerId} value={s.sellerId}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Tipo</label>
          <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Início</label>
          <input type="date" value={startAt} onChange={(e) => setStartAt(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Fim</label>
          <input type="date" value={endAt} onChange={(e) => setEndAt(e.target.value)} className={inputCls} />
        </div>
        <div className="flex items-end">
          <button onClick={create} disabled={busy === 'create'} className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
            {busy === 'create' ? <RefreshCw size={15} className="animate-spin" /> : <Plus size={15} />}Cadastrar
          </button>
        </div>
        <div className="lg:col-span-5">
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo (opcional)" className={inputCls} />
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-600 lg:col-span-1">
          <input type="checkbox" checked={autoReturn} onChange={(e) => setAutoReturn(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
          Retorno automático
        </label>
      </div>

      {/* Lista */}
      {loading ? <div className="mt-4 h-32 animate-pulse rounded-lg bg-gray-100" /> : rows && rows.length > 0 ? (
        <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50"><tr>{['Colaborador', 'Tipo', 'Período', 'Status', 'Motivo', ''].map((h) => <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.id} className={cn(r.status === 'CANCELADO' && 'opacity-60')}>
                  <td className="px-3 py-2 font-medium text-gray-900">{r.sellerName}</td>
                  <td className="px-3 py-2 text-gray-600">{TYPE_LABEL[r.type] ?? r.type}</td>
                  <td className="px-3 py-2 text-gray-600 tabular-nums">{fmt(r.startAt)} – {fmt(r.endAt)}</td>
                  <td className="px-3 py-2"><span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-semibold', STATUS_CLS[r.status])}>{STATUS_LABEL[r.status] ?? r.status}</span></td>
                  <td className="px-3 py-2 text-gray-500">{r.reason ?? '—'}</td>
                  <td className="px-3 py-2 text-right">
                    {r.status !== 'CANCELADO' && r.status !== 'ENCERRADO' && (
                      <button onClick={() => cancel(r.id)} disabled={busy === r.id} className="rounded p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-50" title="Cancelar ausência"><Trash2 size={15} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="mt-4 text-sm text-gray-500">Nenhuma ausência cadastrada nesta unidade.</p>}
    </div>
  )
}
