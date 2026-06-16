'use client'

// =============================================================================
// Financeiro — Categorias (CRUD) — AutoDrive
// Consome /api/finance/categories (GET/POST) e /[id] (PATCH/DELETE soft).
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Tags, X, Save, Power } from 'lucide-react'
import { cn } from '@/lib/utils'
import SearchBox from '@/components/reports/SearchBox'

interface Category { id: string; name: string; kind: 'RECEITA' | 'DESPESA'; color: string | null; active: boolean }
interface Form { name: string; kind: 'RECEITA' | 'DESPESA'; color: string; active: boolean }
const emptyForm: Form = { name: '', kind: 'DESPESA', color: '', active: true }
const inputClass = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

export default function FinanceCategoriesPage() {
  const [items, setItems] = useState<Category[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [form, setForm] = useState<Form>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/finance/categories', { credentials: 'include' })
      const json = await res.json(); setItems(json?.data ?? [])
    } catch { setItems([]) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const open = (c?: Category) => {
    setEditing(c ?? null)
    setForm(c ? { name: c.name, kind: c.kind, color: c.color ?? '', active: c.active } : emptyForm)
    setError(null); setModal(true)
  }

  const save = async () => {
    setSaving(true); setError(null)
    try {
      const url = editing ? `/api/finance/categories/${editing.id}` : '/api/finance/categories'
      const res = await fetch(url, { method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(form) })
      const json = await res.json()
      if (!res.ok) { setError(json?.error ?? 'Erro ao salvar.'); return }
      setModal(false); await load()
    } catch { setError('Erro de rede.') } finally { setSaving(false) }
  }

  const toggle = async (c: Category) => {
    if (!confirm(`${c.active ? 'Inativar' : 'Reativar'} a categoria "${c.name}"?`)) return
    if (c.active) await fetch(`/api/finance/categories/${c.id}`, { method: 'DELETE', credentials: 'include' })
    else await fetch(`/api/finance/categories/${c.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ active: true }) })
    await load()
  }

  const term = q.trim().toLowerCase()
  const filtered = term
    ? items.filter((c) => c.name.toLowerCase().includes(term) || (c.kind === 'RECEITA' ? 'receita' : 'despesa').includes(term))
    : items

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Categorias financeiras</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${filtered.length}${term ? ` de ${items.length}` : ''} categorias`}</p>
        </div>
        <div className="flex items-center gap-2">
          <SearchBox value={q} onChange={setQ} placeholder="Buscar categoria..." className="w-56" />
          <button onClick={() => open()} className="btn-primary text-sm"><Plus size={15} />Nova categoria</button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50"><tr>{['Categoria', 'Tipo', 'Status', ''].map((h) => (<th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (<tr key={i}>{Array.from({ length: 4 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>))}</tr>))
            ) : filtered.length === 0 ? (
              <tr><td colSpan={4} className="py-14 text-center"><Tags size={32} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">{term ? 'Nenhuma categoria encontrada para a busca.' : 'Nenhuma categoria. Crie a primeira.'}</p></td></tr>
            ) : (
              filtered.map((c) => (
                <tr key={c.id} className={cn('hover:bg-gray-50', !c.active && 'opacity-50')}>
                  <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                  <td className="px-4 py-3"><span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', c.kind === 'RECEITA' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600')}>{c.kind === 'RECEITA' ? 'Receita' : 'Despesa'}</span></td>
                  <td className="px-4 py-3 text-xs text-gray-500">{c.active ? 'Ativa' : 'Inativa'}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => open(c)} className="mr-2 inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Editar"><Pencil size={15} /></button>
                    <button onClick={() => toggle(c)} className="inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title={c.active ? 'Inativar' : 'Reativar'}><Power size={15} /></button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setModal(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold text-gray-900">{editing ? 'Editar categoria' : 'Nova categoria'}</h2><button onClick={() => setModal(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X size={18} /></button></div>
            <div className="space-y-3">
              <div><label className="mb-1.5 block text-xs font-medium text-gray-700">Nome</label><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Aluguel, Comissões, Vendas..." /></div>
              <div><label className="mb-1.5 block text-xs font-medium text-gray-700">Tipo</label><select className={inputClass} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Form['kind'] })}><option value="DESPESA">Despesa</option><option value="RECEITA">Receita</option></select></div>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setModal(false)} className="btn-secondary text-sm">Cancelar</button>
              <button onClick={save} disabled={saving || !form.name.trim()} className="btn-primary text-sm"><Save size={15} />{saving ? 'Salvando...' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
