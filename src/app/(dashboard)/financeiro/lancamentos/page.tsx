'use client'

// =============================================================================
// Financeiro — Lançamentos (hub operacional) — AutoDrive
// Lista com filtros + criar/editar + liquidar + excluir + sincronizar.
// Consome /api/finance/entries (+[id]), /categories, /accounts, /sync.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, Wallet, X, Save, RefreshCw, CheckCircle2, DownloadCloud } from 'lucide-react'
import { cn } from '@/lib/utils'
import { maskBRL, parseBRL } from '@/lib/masks'
import SearchBox from '@/components/reports/SearchBox'

interface Entry {
  id: string; type: 'RECEITA' | 'DESPESA'; status: string; description: string; amount: number
  category: string | null; account: string | null; counterparty: string | null
  dueDate: string | null; competenceDate: string | null; source: string | null
}
interface Ref { id: string; name: string; kind?: string }
interface Form {
  type: 'RECEITA' | 'DESPESA'; status: 'PREVISTO' | 'PAGO' | 'RECEBIDO' | 'CANCELADO'
  description: string; amount: number; dueDate: string; competenceDate: string
  categoryId: string; accountId: string; counterparty: string; documentNumber: string; paymentMethod: string; notes: string
}
const emptyForm: Form = { type: 'DESPESA', status: 'PREVISTO', description: '', amount: 0, dueDate: '', competenceDate: '', categoryId: '', accountId: '', counterparty: '', documentNumber: '', paymentMethod: '', notes: '' }
const inputClass = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const date = (s: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR') : '—')
const STATUS_LABEL: Record<string, string> = { PREVISTO: 'Previsto', PAGO: 'Pago', RECEBIDO: 'Recebido', CANCELADO: 'Cancelado' }
const STATUS_CLS: Record<string, string> = { PAGO: 'bg-green-100 text-green-700', RECEBIDO: 'bg-green-100 text-green-700', PREVISTO: 'bg-amber-100 text-amber-700', CANCELADO: 'bg-gray-100 text-gray-500' }

export default function FinanceEntriesPage() {
  const [items, setItems] = useState<Entry[]>([])
  const [totals, setTotals] = useState<Record<string, { total: number; count: number }>>({})
  const [loading, setLoading] = useState(true)
  const [fType, setFType] = useState(''); const [fStatus, setFStatus] = useState(''); const [q, setQ] = useState('')
  const [categories, setCategories] = useState<Ref[]>([]); const [accounts, setAccounts] = useState<Ref[]>([])
  const [modal, setModal] = useState(false); const [editing, setEditing] = useState<Entry | null>(null)
  const [form, setForm] = useState<Form>(emptyForm); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false); const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (fType) qs.set('type', fType); if (fStatus) qs.set('status', fStatus); if (q) qs.set('q', q)
      const res = await fetch(`/api/finance/entries?${qs}`, { credentials: 'include' })
      const json = await res.json(); setItems(json?.data ?? []); setTotals(json?.totals ?? {})
    } catch { setItems([]); setTotals({}) } finally { setLoading(false) }
  }, [fType, fStatus, q])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    (async () => {
      try {
        const [c, a] = await Promise.all([
          fetch('/api/finance/categories?active=true', { credentials: 'include' }).then((r) => r.json()),
          fetch('/api/finance/accounts?active=true', { credentials: 'include' }).then((r) => r.json()),
        ])
        setCategories(c?.data ?? []); setAccounts(a?.data ?? [])
      } catch { /* selects ficam vazios */ }
    })()
  }, [])

  const open = (e?: Entry) => {
    setEditing(e ?? null)
    if (e) {
      setForm({
        type: e.type, status: e.status as Form['status'], description: e.description, amount: e.amount,
        dueDate: e.dueDate ? e.dueDate.slice(0, 10) : '', competenceDate: e.competenceDate ? e.competenceDate.slice(0, 10) : '',
        categoryId: '', accountId: '', counterparty: e.counterparty ?? '', documentNumber: '', paymentMethod: '', notes: '',
      })
    } else setForm(emptyForm)
    setError(null); setModal(true)
  }

  const save = async () => {
    setSaving(true); setError(null)
    try {
      const payload: Record<string, unknown> = {
        type: form.type, status: form.status, description: form.description, amount: form.amount,
        dueDate: form.dueDate || null, competenceDate: form.competenceDate || null,
        categoryId: form.categoryId || null, accountId: form.accountId || null,
        counterparty: form.counterparty || null, documentNumber: form.documentNumber || null,
        paymentMethod: form.paymentMethod || null, notes: form.notes || null,
      }
      const url = editing ? `/api/finance/entries/${editing.id}` : '/api/finance/entries'
      const res = await fetch(url, { method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload) })
      const json = await res.json()
      if (!res.ok) { setError(json?.error ?? 'Erro ao salvar.'); return }
      setModal(false); await load()
    } catch { setError('Erro de rede.') } finally { setSaving(false) }
  }

  const settle = async (e: Entry) => {
    const newStatus = e.type === 'RECEITA' ? 'RECEBIDO' : 'PAGO'
    await fetch(`/api/finance/entries/${e.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ status: newStatus }) })
    await load()
  }
  const remove = async (e: Entry) => {
    if (!confirm(`Excluir o lançamento "${e.description}"?`)) return
    await fetch(`/api/finance/entries/${e.id}`, { method: 'DELETE', credentials: 'include' }); await load()
  }
  const sync = async () => {
    setSyncing(true); setMsg(null)
    try {
      const res = await fetch('/api/finance/sync', { method: 'POST', credentials: 'include' })
      const json = await res.json()
      setMsg(res.ok ? `Sincronizado: ${json.vendas ?? 0} receitas (vendas) e ${json.comissoes ?? 0} despesas (comissões).` : (json?.error ?? 'Falha na sincronização.'))
      await load()
    } catch { setMsg('Erro de rede na sincronização.') } finally { setSyncing(false) }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Lançamentos financeiros</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${items.length} lançamentos`}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={sync} disabled={syncing} className="btn-secondary text-sm" title="Gerar receitas de vendas finalizadas e despesas de comissões"><DownloadCloud size={15} className={cn(syncing && 'animate-pulse')} />{syncing ? 'Sincronizando...' : 'Sincronizar'}</button>
          <button onClick={() => open()} className="btn-primary text-sm"><Plus size={15} />Novo lançamento</button>
        </div>
      </div>

      {msg && <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm text-brand-800">{msg}</div>}

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-green-200 bg-green-50 p-4"><p className="text-xs font-medium uppercase tracking-wide text-green-700">Receitas (filtro atual)</p><p className="mt-1 text-xl font-bold tabular-nums text-green-700">{loading ? '—' : fmt(totals.RECEITA?.total ?? 0)}</p></div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4"><p className="text-xs font-medium uppercase tracking-wide text-red-700">Despesas (filtro atual)</p><p className="mt-1 text-xl font-bold tabular-nums text-red-700">{loading ? '—' : fmt(totals.DESPESA?.total ?? 0)}</p></div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select className={cn(inputClass, 'w-auto')} value={fType} onChange={(e) => setFType(e.target.value)}><option value="">Todos os tipos</option><option value="RECEITA">Receitas</option><option value="DESPESA">Despesas</option></select>
        <select className={cn(inputClass, 'w-auto')} value={fStatus} onChange={(e) => setFStatus(e.target.value)}><option value="">Todos os status</option><option value="PREVISTO">Previsto</option><option value="PAGO">Pago</option><option value="RECEBIDO">Recebido</option><option value="CANCELADO">Cancelado</option></select>
        <SearchBox value={q} onChange={setQ} placeholder="Buscar: placa, negociação, nome, fornecedor, valor..." className="min-w-[280px] flex-1" />
        <button onClick={load} className="btn-secondary text-xs"><RefreshCw size={13} className={cn(loading && 'animate-spin')} />Atualizar</button>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50"><tr>{['Descrição', 'Tipo', 'Categoria', 'Conta', 'Vencimento', 'Valor', 'Status', ''].map((h) => (<th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (<tr key={i}>{Array.from({ length: 8 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>))}</tr>))
              ) : items.length === 0 ? (
                <tr><td colSpan={8} className="py-14 text-center"><Wallet size={32} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Nenhum lançamento. Crie um ou use “Sincronizar”.</p></td></tr>
              ) : (
                items.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3"><p className="font-medium text-gray-900">{e.description}</p>{e.source && e.source !== 'MANUAL' && <span className="text-[10px] uppercase tracking-wide text-brand-600">{e.source}</span>}</td>
                    <td className="px-4 py-3"><span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', e.type === 'RECEITA' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600')}>{e.type === 'RECEITA' ? 'Receita' : 'Despesa'}</span></td>
                    <td className="px-4 py-3 text-gray-600">{e.category ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{e.account ?? '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">{date(e.dueDate)}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums font-medium text-gray-900">{fmt(e.amount)}</td>
                    <td className="px-4 py-3"><span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', STATUS_CLS[e.status] ?? 'bg-gray-100 text-gray-600')}>{STATUS_LABEL[e.status] ?? e.status}</span></td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {e.status === 'PREVISTO' && <button onClick={() => settle(e)} className="mr-1 inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-green-50 hover:text-green-600" title="Liquidar"><CheckCircle2 size={15} /></button>}
                      <button onClick={() => open(e)} className="mr-1 inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Editar"><Pencil size={15} /></button>
                      <button onClick={() => remove(e)} className="inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Excluir"><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setModal(false)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(ev) => ev.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold text-gray-900">{editing ? 'Editar lançamento' : 'Novo lançamento'}</h2><button onClick={() => setModal(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X size={18} /></button></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="mb-1.5 block text-xs font-medium text-gray-700">Tipo</label><select className={inputClass} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Form['type'] })}><option value="DESPESA">Despesa</option><option value="RECEITA">Receita</option></select></div>
              <div><label className="mb-1.5 block text-xs font-medium text-gray-700">Status</label><select className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Form['status'] })}><option value="PREVISTO">Previsto</option><option value="PAGO">Pago</option><option value="RECEBIDO">Recebido</option><option value="CANCELADO">Cancelado</option></select></div>
              <div className="col-span-2"><label className="mb-1.5 block text-xs font-medium text-gray-700">Descrição</label><input className={inputClass} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ex: Conta de luz, Venda à vista..." /></div>
              <div><label className="mb-1.5 block text-xs font-medium text-gray-700">Valor</label><input type="text" inputMode="numeric" className={inputClass} value={maskBRL(form.amount ? Math.round(form.amount * 100).toString() : '')} onChange={(e) => setForm({ ...form, amount: parseBRL(maskBRL(e.target.value)) ?? 0 })} placeholder="0,00" /></div>
              <div><label className="mb-1.5 block text-xs font-medium text-gray-700">Vencimento</label><input type="date" className={inputClass} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
              <div><label className="mb-1.5 block text-xs font-medium text-gray-700">Categoria</label><select className={inputClass} value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}><option value="">—</option>{categories.filter((c) => !c.kind || c.kind === form.type).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
              <div><label className="mb-1.5 block text-xs font-medium text-gray-700">Conta</label><select className={inputClass} value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })}><option value="">—</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
              <div><label className="mb-1.5 block text-xs font-medium text-gray-700">Competência</label><input type="date" className={inputClass} value={form.competenceDate} onChange={(e) => setForm({ ...form, competenceDate: e.target.value })} /></div>
              <div><label className="mb-1.5 block text-xs font-medium text-gray-700">Contraparte</label><input className={inputClass} value={form.counterparty} onChange={(e) => setForm({ ...form, counterparty: e.target.value })} placeholder="Fornecedor / cliente" /></div>
              <div className="col-span-2"><label className="mb-1.5 block text-xs font-medium text-gray-700">Observações</label><input className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setModal(false)} className="btn-secondary text-sm">Cancelar</button>
              <button onClick={save} disabled={saving || !form.description.trim() || form.amount <= 0} className="btn-primary text-sm"><Save size={15} />{saving ? 'Salvando...' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
