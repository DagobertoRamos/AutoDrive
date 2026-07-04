'use client'

// =============================================================================
// AttendanceTypesConfigCard — tipos de atendimento (natureza da visita) por
// unidade, com "consome a vez". Reusa /api/seller-queue/attendance-types-config.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { ListChecks, Save, RefreshCw, Plus, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TypeItem { code: string; label: string; active: boolean; consumesTurn: boolean; requiresDescription?: boolean }
const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

export default function AttendanceTypesConfigCard({ unitId }: { unitId?: string | null }) {
  const [types, setTypes] = useState<TypeItem[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const qs = unitId ? `?unitId=${encodeURIComponent(unitId)}` : ''

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/seller-queue/attendance-types-config${qs}`, { credentials: 'include' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? 'Erro ao carregar')
      setTypes(j.data.types ?? [])
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Erro ao carregar') } finally { setLoading(false) }
  }, [qs])
  useEffect(() => { load() }, [load])

  const dirty = () => setSaved(false)
  const setItem = (i: number, patch: Partial<TypeItem>) => { setTypes((ts) => ts ? ts.map((t, j) => j === i ? { ...t, ...patch } : t) : ts); dirty() }
  const add = () => { setTypes((ts) => ts ? [...ts, { code: '', label: '', active: true, consumesTurn: true }] : ts); dirty() }
  const del = (i: number) => { setTypes((ts) => ts ? ts.filter((_, j) => j !== i) : ts); dirty() }

  const save = async () => {
    if (!types) return
    setSaving(true); setError(''); setSaved(false)
    try {
      const res = await fetch(`/api/seller-queue/attendance-types-config${qs}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ types }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? 'Erro ao salvar')
      setSaved(true); await load()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Erro ao salvar') } finally { setSaving(false) }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900"><ListChecks size={17} className="text-brand-600" />Tipos de atendimento</h2>
          <p className="mt-0.5 text-xs text-gray-500">Natureza da visita ao iniciar. "Consome a vez" manda o vendedor ao fim da fila ao finalizar.</p>
        </div>
        <button onClick={load} disabled={loading} className="rounded p-1.5 text-gray-400 hover:bg-gray-100"><RefreshCw size={14} className={cn(loading && 'animate-spin')} /></button>
      </div>

      {loading ? <div className="mt-4 h-40 animate-pulse rounded-lg bg-gray-100" /> : types ? (
        <div className="mt-4 space-y-3">
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50"><tr>{['Código', 'Rótulo', 'Ativo', 'Consome a vez', ''].map((h) => <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-gray-100">
                {types.map((t, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1.5"><input value={t.code} onChange={(e) => setItem(i, { code: e.target.value })} placeholder="RETIRADA_CARRO" className={cn(inputCls, 'font-mono text-xs')} /></td>
                    <td className="px-2 py-1.5"><input value={t.label} onChange={(e) => setItem(i, { label: e.target.value })} placeholder="Retirada de carro" className={inputCls} /></td>
                    <td className="px-3 py-1.5 text-center"><input type="checkbox" checked={t.active} onChange={(e) => setItem(i, { active: e.target.checked })} className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" /></td>
                    <td className="px-3 py-1.5 text-center"><input type="checkbox" checked={t.consumesTurn} onChange={(e) => setItem(i, { consumesTurn: e.target.checked })} className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" /></td>
                    <td className="px-2 py-1.5 text-center"><button onClick={() => del(i)} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={add} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 py-2 text-sm text-gray-500 hover:border-brand-400 hover:text-brand-600"><Plus size={15} />Adicionar tipo</button>

          {error && <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle size={14} />{error}</div>}
          {saved && <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700"><CheckCircle2 size={14} />Salvo.</div>}
          <div className="flex justify-end"><button onClick={save} disabled={saving} className="btn-primary text-sm">{saving ? <><RefreshCw size={13} className="animate-spin" />Salvando...</> : <><Save size={13} />Salvar</>}</button></div>
        </div>
      ) : <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error || 'Não foi possível carregar.'}</div>}
    </div>
  )
}
