'use client'

// =============================================================================
// Master > F&I > Bancos Homologados (Fase Master). MASTER-only.
// Bancos suportados por provedor. Consome /api/master/financing/provider-banks
// (+[id]) e /providers (para o seletor). GLOBAL.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Landmark, Plus, Pencil, Trash2, X, Save, Lock, Power } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Bank { id: string; providerId: string; providerName: string; name: string; code: string | null; active: boolean }
interface Provider { id: string; name: string }
interface Form { providerId: string; name: string; code: string; active: boolean }
const emptyForm: Form = { providerId: '', name: '', code: '', active: true }
const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

export default function MasterBanksPage() {
  const { data: session } = useSession()
  const isMaster = !((session?.user as { role?: string })?.role) || (session?.user as { role?: string })?.role === 'MASTER'

  const [items, setItems] = useState<Bank[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Form>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = filter ? `?providerId=${filter}` : ''
      const [b, p] = await Promise.all([
        fetch(`/api/master/financing/provider-banks${qs}`, { credentials: 'include' }).then((x) => x.json()),
        fetch('/api/master/financing/providers', { credentials: 'include' }).then((x) => x.json()),
      ])
      setItems(b?.data ?? [])
      setProviders((p?.data ?? []).map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })))
    } catch { setItems([]) } finally { setLoading(false) }
  }, [filter])
  useEffect(() => { if (isMaster) load() }, [isMaster, load])

  const openNew = () => { setEditingId(null); setForm({ ...emptyForm, providerId: filter || providers[0]?.id || '' }); setError(null); setModal(true) }
  const openEdit = (b: Bank) => { setEditingId(b.id); setForm({ providerId: b.providerId, name: b.name, code: b.code ?? '', active: b.active }); setError(null); setModal(true) }
  const save = async () => {
    if (!form.providerId) { setError('Selecione o provedor.'); return }
    if (!form.name.trim()) { setError('Informe o nome do banco.'); return }
    setSaving(true); setError(null)
    try {
      const url = editingId ? `/api/master/financing/provider-banks/${editingId}` : '/api/master/financing/provider-banks'
      const payload = editingId ? { name: form.name, code: form.code || null, active: form.active } : { providerId: form.providerId, name: form.name, code: form.code || null, active: form.active }
      const res = await fetch(url, { method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload) })
      const json = await res.json()
      if (!res.ok) { setError(json?.error ?? 'Erro ao salvar.'); return }
      setModal(false); await load()
    } catch { setError('Erro de rede.') } finally { setSaving(false) }
  }
  const toggle = async (b: Bank) => { await fetch(`/api/master/financing/provider-banks/${b.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ active: !b.active }) }); await load() }
  const remove = async (b: Bank) => { if (!confirm(`Excluir "${b.name}"?`)) return; await fetch(`/api/master/financing/provider-banks/${b.id}`, { method: 'DELETE', credentials: 'include' }); await load() }

  if (session && !isMaster) {
    return <div className="flex flex-col items-center justify-center gap-4 py-20 text-center"><div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600"><Lock size={24} /></div><p className="text-lg font-semibold text-gray-800">Área exclusiva do MASTER</p></div>
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><Landmark size={20} className="text-brand-600" />Bancos Homologados</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${items.length} banco(s) suportado(s)`}</p>
        </div>
        <div className="flex items-center gap-2">
          <select className={cn(inputCls, 'w-auto')} value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">Todos os provedores</option>{providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <button onClick={openNew} disabled={providers.length === 0} className="btn-primary text-sm disabled:opacity-50"><Plus size={15} />Novo banco</button>
        </div>
      </div>

      {providers.length === 0 && !loading && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">Cadastre um provedor primeiro em Master &gt; F&amp;I &gt; Provedores.</div>}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50"><tr>{['Banco', 'Código', 'Provedor', 'Status', ''].map((h) => (<th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (<tr key={i}>{Array.from({ length: 5 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>))}</tr>))
              ) : items.length === 0 ? (
                <tr><td colSpan={5} className="py-14 text-center"><Landmark size={30} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Nenhum banco homologado.</p></td></tr>
              ) : items.map((b) => (
                <tr key={b.id} className={cn('hover:bg-gray-50', !b.active && 'opacity-50')}>
                  <td className="px-4 py-3 font-medium text-gray-900">{b.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{b.code || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{b.providerName}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{b.active ? 'Ativo' : 'Inativo'}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button onClick={() => toggle(b)} className="mr-1 inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title={b.active ? 'Inativar' : 'Ativar'}><Power size={15} /></button>
                    <button onClick={() => openEdit(b)} className="mr-1 inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Editar"><Pencil size={15} /></button>
                    <button onClick={() => remove(b)} className="inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Excluir"><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={() => setModal(false)}>
          <div className="my-8 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold text-gray-900">{editingId ? 'Editar banco' : 'Novo banco homologado'}</h2><button onClick={() => setModal(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X size={18} /></button></div>
            <div className="space-y-3">
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Provedor <span className="text-red-500">*</span></label><select className={inputCls} value={form.providerId} onChange={(e) => set('providerId', e.target.value)} disabled={!!editingId}><option value="">Selecione...</option>{providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Nome do banco <span className="text-red-500">*</span></label><input className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex: Santander, BV, Itaú..." /></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Código</label><input className={inputCls} value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="Ex: 033" /></div>
              <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />Ativo</label>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
            <div className="mt-5 flex justify-end gap-2"><button onClick={() => setModal(false)} className="btn-secondary text-sm">Cancelar</button><button onClick={save} disabled={saving} className="btn-primary text-sm"><Save size={15} />{saving ? 'Salvando...' : 'Salvar'}</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
