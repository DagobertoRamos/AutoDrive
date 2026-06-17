'use client'

// =============================================================================
// Master > F&I > Mapeamento de Campos (Fase Master). MASTER-only.
// De/para entre campos do AutoDrive e o caminho na API do provedor, por
// provedor (FinanceProvider.fieldMappings). Consome /api/master/financing/
// providers (lista + fieldMappings) e PATCH /providers/[id] { mappings }.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { GitCompareArrows, Plus, Trash2, Save, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Provider { id: string; name: string; fieldMappings: Record<string, string> | null }
interface Pair { key: string; value: string }
const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

export default function MasterMappingsPage() {
  const { data: session } = useSession()
  const isMaster = !((session?.user as { role?: string })?.role) || (session?.user as { role?: string })?.role === 'MASTER'

  const [providers, setProviders] = useState<Provider[]>([])
  const [selected, setSelected] = useState('')
  const [pairs, setPairs] = useState<Pair[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/master/financing/providers', { credentials: 'include' }).then((x) => x.json())
      const list: Provider[] = r?.data ?? []
      setProviders(list)
      setSelected((cur) => cur || list[0]?.id || '')
    } catch { setProviders([]) } finally { setLoading(false) }
  }, [])
  useEffect(() => { if (isMaster) load() }, [isMaster, load])

  // Carrega os pares quando muda o provedor selecionado.
  useEffect(() => {
    const p = providers.find((x) => x.id === selected)
    const map = p?.fieldMappings ?? {}
    setPairs(Object.entries(map).map(([key, value]) => ({ key, value: String(value) })))
  }, [selected, providers])

  const setPair = (i: number, field: keyof Pair, v: string) => setPairs((ps) => ps.map((p, idx) => idx === i ? { ...p, [field]: v } : p))
  const addPair = () => setPairs((ps) => [...ps, { key: '', value: '' }])
  const removePair = (i: number) => setPairs((ps) => ps.filter((_, idx) => idx !== i))

  const save = async () => {
    if (!selected) return
    setSaving(true); setToast(null)
    try {
      const mappings: Record<string, string> = {}
      for (const p of pairs) { const k = p.key.trim(); if (k) mappings[k] = p.value.trim() }
      const res = await fetch(`/api/master/financing/providers/${selected}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ mappings }) })
      const json = await res.json()
      if (!res.ok) { setToast({ ok: false, msg: json?.error ?? 'Erro ao salvar.' }); return }
      setToast({ ok: true, msg: 'Mapeamento salvo.' }); await load()
    } catch { setToast({ ok: false, msg: 'Erro de rede.' }) } finally { setSaving(false) }
  }

  if (session && !isMaster) {
    return <div className="flex flex-col items-center justify-center gap-4 py-20 text-center"><div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600"><Lock size={24} /></div><p className="text-lg font-semibold text-gray-800">Área exclusiva do MASTER</p></div>
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><GitCompareArrows size={20} className="text-brand-600" />Mapeamento de Campos</h1>
          <p className="mt-0.5 text-sm text-gray-500">De/para entre o dado do AutoDrive e o caminho na API do provedor.</p>
        </div>
        <div className="flex items-center gap-2">
          <select className={cn(inputCls, 'w-auto')} value={selected} onChange={(e) => setSelected(e.target.value)} disabled={providers.length === 0}><option value="">Selecione o provedor...</option>{providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <button onClick={save} disabled={saving || !selected} className="btn-primary text-sm disabled:opacity-50"><Save size={15} />{saving ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>

      {toast && <div className={cn('rounded-lg border px-4 py-2.5 text-sm', toast.ok ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700')}>{toast.msg}</div>}

      {providers.length === 0 && !loading ? (
        <div className="rounded-xl border border-gray-200 bg-white py-14 text-center shadow-card"><GitCompareArrows size={30} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Cadastre um provedor primeiro em Provedores F&amp;I.</p></div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
          <div className="mb-2 grid grid-cols-[1fr_1fr_auto] gap-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            <span>Campo AutoDrive</span><span>Caminho na API do provedor</span><span></span>
          </div>
          {pairs.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">Nenhum mapeamento. Adicione o primeiro de/para.</p>
          ) : (
            <div className="space-y-2">
              {pairs.map((p, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                  <input className={cn(inputCls, 'font-mono')} value={p.key} onChange={(e) => setPair(i, 'key', e.target.value)} placeholder="cpf" />
                  <input className={cn(inputCls, 'font-mono')} value={p.value} onChange={(e) => setPair(i, 'value', e.target.value)} placeholder="proponente.documento" />
                  <button onClick={() => removePair(i)} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Remover"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          )}
          <button onClick={addPair} className="btn-secondary mt-3 text-sm"><Plus size={15} />Adicionar de/para</button>
        </div>
      )}
    </div>
  )
}
