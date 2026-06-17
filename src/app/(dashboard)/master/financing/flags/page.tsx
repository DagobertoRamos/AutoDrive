'use client'

// =============================================================================
// Master > F&I > Feature Flags (Fase Master). MASTER-only.
// Liga/desliga integrações F&I globalmente (model global FeatureFlag, chaves
// fi_*). Consome /api/master/financing/flags (+[id]).
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { ToggleRight, Plus, Trash2, X, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Flag { id: string; key: string; name: string; enabled: boolean; rolloutPct: number; notes: string | null }
const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

export default function MasterFlagsPage() {
  const { data: session } = useSession()
  const isMaster = !((session?.user as { role?: string })?.role) || (session?.user as { role?: string })?.role === 'MASTER'

  const [items, setItems] = useState<Flag[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ key: 'fi_', name: '', enabled: false, rolloutPct: 0, notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await fetch('/api/master/financing/flags', { credentials: 'include' }).then((x) => x.json()); setItems(r?.data ?? []) }
    catch { setItems([]) } finally { setLoading(false) }
  }, [])
  useEffect(() => { if (isMaster) load() }, [isMaster, load])

  const patch = async (id: string, data: Record<string, unknown>) => {
    await fetch(`/api/master/financing/flags/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(data) }); await load()
  }
  const create = async () => {
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/master/financing/flags', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(form) })
      const json = await res.json()
      if (!res.ok) { setError(json?.error ?? 'Erro ao criar.'); return }
      setModal(false); setForm({ key: 'fi_', name: '', enabled: false, rolloutPct: 0, notes: '' }); await load()
    } catch { setError('Erro de rede.') } finally { setSaving(false) }
  }
  const remove = async (f: Flag) => { if (!confirm(`Excluir a flag "${f.key}"?`)) return; await fetch(`/api/master/financing/flags/${f.id}`, { method: 'DELETE', credentials: 'include' }); await load() }

  if (session && !isMaster) {
    return <div className="flex flex-col items-center justify-center gap-4 py-20 text-center"><div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600"><Lock size={24} /></div><p className="text-lg font-semibold text-gray-800">Área exclusiva do MASTER</p></div>
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><ToggleRight size={20} className="text-brand-600" />Feature Flags F&amp;I</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${items.length} flag(s) globais (fi_*)`}</p>
        </div>
        <button onClick={() => { setError(null); setModal(true) }} className="btn-primary text-sm"><Plus size={15} />Nova flag</button>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => (<div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100" />))}</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-14 text-center shadow-card"><ToggleRight size={30} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Nenhuma flag de F&amp;I.</p></div>
      ) : (
        <div className="space-y-2">
          {items.map((f) => (
            <div key={f.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-card">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900">{f.name} <span className="ml-1 font-mono text-[11px] text-gray-400">{f.key}</span></p>
                {f.notes && <p className="text-xs text-gray-500">{f.notes}</p>}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <span>Rollout</span>
                <input type="number" min={0} max={100} value={f.rolloutPct} onChange={(e) => patch(f.id, { rolloutPct: Math.max(0, Math.min(100, Number(e.target.value))) })} className="w-16 rounded-lg border border-gray-300 px-2 py-1 text-sm" />
                <span>%</span>
              </div>
              <button onClick={() => patch(f.id, { enabled: !f.enabled })} className={cn('relative h-6 w-11 rounded-full transition-colors', f.enabled ? 'bg-green-500' : 'bg-gray-300')} title={f.enabled ? 'Ativa' : 'Inativa'}>
                <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform', f.enabled ? 'translate-x-5' : 'translate-x-0.5')} />
              </button>
              <button onClick={() => remove(f)} className="inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Excluir"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={() => setModal(false)}>
          <div className="my-8 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold text-gray-900">Nova feature flag</h2><button onClick={() => setModal(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X size={18} /></button></div>
            <div className="space-y-3">
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Chave <span className="text-red-500">*</span></label><input className={cn(inputCls, 'font-mono')} value={form.key} onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))} placeholder="fi_credere_simulacao" /><p className="mt-1 text-[11px] text-gray-400">Formato fi_minha_flag (minúsculas e _).</p></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Nome <span className="text-red-500">*</span></label><input className={inputCls} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Simulação via Credere" /></div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={form.enabled} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />Ativa</label>
                <div className="flex items-center gap-1.5 text-sm text-gray-600"><span>Rollout</span><input type="number" min={0} max={100} value={form.rolloutPct} onChange={(e) => setForm((f) => ({ ...f, rolloutPct: Number(e.target.value) }))} className="w-16 rounded-lg border border-gray-300 px-2 py-1 text-sm" /><span>%</span></div>
              </div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Observações</label><textarea className={cn(inputCls, 'min-h-[56px] resize-y')} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></div>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
            <div className="mt-5 flex justify-end gap-2"><button onClick={() => setModal(false)} className="btn-secondary text-sm">Cancelar</button><button onClick={create} disabled={saving} className="btn-primary text-sm">{saving ? 'Criando...' : 'Criar'}</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
