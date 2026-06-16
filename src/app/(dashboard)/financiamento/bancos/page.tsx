'use client'

// =============================================================================
// Financiamento — Bancos (CRUD) — AutoDrive
// Consome /api/financing/banks (GET/POST) e /[id] (PATCH/DELETE).
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Landmark, X, Save, Power } from 'lucide-react'
import { cn } from '@/lib/utils'
import SearchBox from '@/components/reports/SearchBox'

interface Bank { id: string; name: string; code: string | null; active: boolean; notes: string | null; proposals: number }
interface Form { name: string; code: string; active: boolean; notes: string }
const emptyForm: Form = { name: '', code: '', active: true, notes: '' }
const inputClass = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

export default function FinancingBanksPage() {
  const [items, setItems] = useState<Bank[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Bank | null>(null)
  const [form, setForm] = useState<Form>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/financing/banks', { credentials: 'include' })
      const json = await res.json(); setItems(json?.data ?? [])
    } catch { setItems([]) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const open = (b?: Bank) => {
    setEditing(b ?? null)
    setForm(b ? { name: b.name, code: b.code ?? '', active: b.active, notes: b.notes ?? '' } : emptyForm)
    setError(null); setModal(true)
  }
  const save = async () => {
    setSaving(true); setError(null)
    try {
      const url = editing ? `/api/financing/banks/${editing.id}` : '/api/financing/banks'
      const res = await fetch(url, { method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(form) })
      const json = await res.json()
      if (!res.ok) { setError(json?.error ?? 'Erro ao salvar.'); return }
      setModal(false); await load()
    } catch { setError('Erro de rede.') } finally { setSaving(false) }
  }
  const toggle = async (b: Bank) => {
    if (b.active) {
      if (!confirm(`Inativar/remover o banco "${b.name}"?`)) return
      await fetch(`/api/financing/banks/${b.id}`, { method: 'DELETE', credentials: 'include' })
    } else {
      await fetch(`/api/financing/banks/${b.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ active: true }) })
    }
    await load()
  }

  const term = q.trim().toLowerCase()
  const filtered = term ? items.filter((b) => b.name.toLowerCase().includes(term) || (b.code ?? '').toLowerCase().includes(term)) : items

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Bancos</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${filtered.length}${term ? ` de ${items.length}` : ''} bancos`}</p>
        </div>
        <div className="flex items-center gap-2">
          <SearchBox value={q} onChange={setQ} placeholder="Buscar banco..." className="w-56" />
          <button onClick={() => open()} className="btn-primary text-sm"><Plus size={15} />Novo banco</button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50"><tr>{['Banco', 'Código', 'Fichas', 'Status', ''].map((h) => (<th key={h} className={cn('px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500', h === 'Fichas' ? 'text-center' : 'text-left')}>{h}</th>))}</tr></thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (<tr key={i}>{Array.from({ length: 5 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>))}</tr>))
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="py-14 text-center"><Landmark size={32} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">{term ? 'Nenhum banco encontrado.' : 'Nenhum banco. Cadastre o primeiro.'}</p></td></tr>
            ) : (
              filtered.map((b) => (
                <tr key={b.id} className={cn('hover:bg-gray-50', !b.active && 'opacity-50')}>
                  <td className="px-4 py-3 font-medium text-gray-900">{b.name}{b.notes && <p className="max-w-xs truncate text-xs text-gray-400">{b.notes}</p>}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{b.code || '—'}</td>
                  <td className="px-4 py-3 text-center tabular-nums text-gray-500">{b.proposals}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{b.active ? 'Ativo' : 'Inativo'}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => open(b)} className="mr-2 inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Editar"><Pencil size={15} /></button>
                    <button onClick={() => toggle(b)} className="inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title={b.active ? 'Inativar' : 'Reativar'}><Power size={15} /></button>
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
            <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold text-gray-900">{editing ? 'Editar banco' : 'Novo banco'}</h2><button onClick={() => setModal(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X size={18} /></button></div>
            <div className="space-y-3">
              <div><label className="mb-1.5 block text-xs font-medium text-gray-700">Nome do banco <span className="text-red-500">*</span></label><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Banco Santander, BV, Itaú..." /></div>
              <div><label className="mb-1.5 block text-xs font-medium text-gray-700">Código (opcional)</label><input className={inputClass} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="Ex: 033" /></div>
              <div><label className="mb-1.5 block text-xs font-medium text-gray-700">Observações</label><textarea className={cn(inputClass, 'min-h-[60px] resize-y')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Contato, condições, taxas..." /></div>
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
