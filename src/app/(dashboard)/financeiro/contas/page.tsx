'use client'

// =============================================================================
// Financeiro — Contas (caixa/banco) CRUD — AutoDrive
// Consome /api/finance/accounts (GET/POST) e /[id] (PATCH/DELETE soft).
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Landmark, X, Save, Power } from 'lucide-react'
import { cn } from '@/lib/utils'
import { maskBRL, parseBRL } from '@/lib/masks'
import SearchBox from '@/components/reports/SearchBox'

interface Account { id: string; name: string; type: string; openingBalance: number | string; active: boolean }
interface Form { name: string; type: 'CAIXA' | 'BANCO' | 'CARTAO' | 'OUTRO'; openingBalance: number; active: boolean }
const emptyForm: Form = { name: '', type: 'CAIXA', openingBalance: 0, active: true }
const inputClass = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const TYPE_LABEL: Record<string, string> = { CAIXA: 'Caixa', BANCO: 'Banco', CARTAO: 'Cartão', OUTRO: 'Outro' }

export default function FinanceAccountsPage() {
  const [items, setItems] = useState<Account[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [form, setForm] = useState<Form>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/finance/accounts', { credentials: 'include' })
      const json = await res.json(); setItems(json?.data ?? [])
    } catch { setItems([]) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const open = (a?: Account) => {
    setEditing(a ?? null)
    setForm(a ? { name: a.name, type: a.type as Form['type'], openingBalance: Number(a.openingBalance) || 0, active: a.active } : emptyForm)
    setError(null); setModal(true)
  }

  const save = async () => {
    setSaving(true); setError(null)
    try {
      const url = editing ? `/api/finance/accounts/${editing.id}` : '/api/finance/accounts'
      const res = await fetch(url, { method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(form) })
      const json = await res.json()
      if (!res.ok) { setError(json?.error ?? 'Erro ao salvar.'); return }
      setModal(false); await load()
    } catch { setError('Erro de rede.') } finally { setSaving(false) }
  }

  const toggle = async (a: Account) => {
    if (!confirm(`${a.active ? 'Inativar' : 'Reativar'} a conta "${a.name}"?`)) return
    if (a.active) await fetch(`/api/finance/accounts/${a.id}`, { method: 'DELETE', credentials: 'include' })
    else await fetch(`/api/finance/accounts/${a.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ active: true }) })
    await load()
  }

  const term = q.trim().toLowerCase()
  const filtered = term
    ? items.filter((a) => a.name.toLowerCase().includes(term) || (TYPE_LABEL[a.type] ?? a.type).toLowerCase().includes(term))
    : items

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Contas financeiras</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${filtered.length}${term ? ` de ${items.length}` : ''} contas`}</p>
        </div>
        <div className="flex items-center gap-2">
          <SearchBox value={q} onChange={setQ} placeholder="Buscar conta..." className="w-56" />
          <button onClick={() => open()} className="btn-primary text-sm"><Plus size={15} />Nova conta</button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50"><tr>{['Conta', 'Tipo', 'Saldo inicial', 'Status', ''].map((h) => (<th key={h} className={cn('px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500', h === 'Saldo inicial' ? 'text-right' : 'text-left')}>{h}</th>))}</tr></thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (<tr key={i}>{Array.from({ length: 5 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>))}</tr>))
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="py-14 text-center"><Landmark size={32} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">{term ? 'Nenhuma conta encontrada para a busca.' : 'Nenhuma conta. Crie a primeira.'}</p></td></tr>
            ) : (
              filtered.map((a) => (
                <tr key={a.id} className={cn('hover:bg-gray-50', !a.active && 'opacity-50')}>
                  <td className="px-4 py-3 font-medium text-gray-900">{a.name}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{TYPE_LABEL[a.type] ?? a.type}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-gray-700">{fmt(Number(a.openingBalance) || 0)}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{a.active ? 'Ativa' : 'Inativa'}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => open(a)} className="mr-2 inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Editar"><Pencil size={15} /></button>
                    <button onClick={() => toggle(a)} className="inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title={a.active ? 'Inativar' : 'Reativar'}><Power size={15} /></button>
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
            <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold text-gray-900">{editing ? 'Editar conta' : 'Nova conta'}</h2><button onClick={() => setModal(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X size={18} /></button></div>
            <div className="space-y-3">
              <div><label className="mb-1.5 block text-xs font-medium text-gray-700">Nome</label><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Caixa loja, Banco Itaú..." /></div>
              <div><label className="mb-1.5 block text-xs font-medium text-gray-700">Tipo</label><select className={inputClass} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Form['type'] })}><option value="CAIXA">Caixa</option><option value="BANCO">Banco</option><option value="CARTAO">Cartão</option><option value="OUTRO">Outro</option></select></div>
              <div><label className="mb-1.5 block text-xs font-medium text-gray-700">Saldo inicial</label><input type="text" inputMode="numeric" className={inputClass} value={maskBRL(form.openingBalance ? Math.round(form.openingBalance * 100).toString() : '')} onChange={(e) => setForm({ ...form, openingBalance: parseBRL(maskBRL(e.target.value)) ?? 0 })} placeholder="0,00" /></div>
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
