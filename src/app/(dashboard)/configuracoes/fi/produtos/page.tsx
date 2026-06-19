'use client'

// =============================================================================
// Configurações da Loja > F&I > Produtos Agregados (Fase 2b.3+).
// Garantia, seguro, proteção, rastreador e outros produtos do F&I da loja.
// Consome /api/settings/financing/products (+[id]). RBAC financing.config;
// tenant-scoped; MASTER bloqueado.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Package, Plus, Pencil, Trash2, X, Save, Lock, Power } from 'lucide-react'
import { cn } from '@/lib/utils'
import { maskBRL, parseBRL, numberToBRLMask } from '@/lib/masks'

const CONFIG_ROLES = ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'FINANCEIRO']
const KINDS = ['GARANTIA', 'SEGURO', 'PROTECAO', 'RASTREADOR', 'OUTRO'] as const
type Kind = (typeof KINDS)[number]
const KIND_LABEL: Record<Kind, string> = { GARANTIA: 'Garantia', SEGURO: 'Seguro', PROTECAO: 'Proteção', RASTREADOR: 'Rastreador', OUTRO: 'Outro' }

interface Row { id: string; name: string; kind: Kind | null; defaultValue: number | null; active: boolean }
interface Form { name: string; kind: Kind; defaultValue: number; active: boolean }
const emptyForm: Form = { name: '', kind: 'GARANTIA', defaultValue: 0, active: true }

const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function FiProductsPage() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role
  const allowed = !role || CONFIG_ROLES.includes(role)

  const [items, setItems] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Form>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))

  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await fetch('/api/settings/financing/products', { credentials: 'include' }).then((x) => x.json()); setItems(r?.data ?? []) }
    catch { setItems([]) } finally { setLoading(false) }
  }, [])
  useEffect(() => { if (allowed) load() }, [allowed, load])

  const openNew = () => { setEditingId(null); setForm(emptyForm); setError(null); setModal(true) }
  const openEdit = (r: Row) => { setEditingId(r.id); setForm({ name: r.name, kind: (r.kind as Kind) ?? 'OUTRO', defaultValue: r.defaultValue ?? 0, active: r.active }); setError(null); setModal(true) }
  const save = async () => {
    if (!form.name.trim()) { setError('Informe o nome do produto.'); return }
    setSaving(true); setError(null)
    try {
      const payload = { name: form.name, kind: form.kind, defaultValue: form.defaultValue || null, active: form.active }
      const url = editingId ? `/api/settings/financing/products/${editingId}` : '/api/settings/financing/products'
      const res = await fetch(url, { method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload) })
      const json = await res.json()
      if (!res.ok) { setError(json?.error ?? 'Erro ao salvar.'); return }
      setModal(false); await load()
    } catch { setError('Erro de rede.') } finally { setSaving(false) }
  }
  const toggle = async (r: Row) => { await fetch(`/api/settings/financing/products/${r.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ active: !r.active }) }); await load() }
  const remove = async (r: Row) => { if (!confirm(`Excluir o produto "${r.name}"?`)) return; await fetch(`/api/settings/financing/products/${r.id}`, { method: 'DELETE', credentials: 'include' }); await load() }

  if (session && !allowed) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600"><Lock size={24} /></div>
        <div><p className="text-lg font-semibold text-gray-800">Configuração restrita</p><p className="mt-1 max-w-md text-sm text-gray-500">Os produtos agregados são definidos pela loja (administração/gerência/financeiro).</p></div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><Package size={20} className="text-brand-600" />Produtos Agregados</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${items.length} produto(s) — garantia, seguro, proteção, rastreador`}</p>
        </div>
        <button onClick={openNew} className="btn-primary text-sm"><Plus size={15} />Novo produto</button>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50"><tr>{['Produto', 'Tipo', 'Valor padrão', 'Status', ''].map((h) => (<th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (<tr key={i}>{Array.from({ length: 5 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>))}</tr>))
              ) : items.length === 0 ? (
                <tr><td colSpan={5} className="py-14 text-center"><Package size={30} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Nenhum produto agregado cadastrado.</p></td></tr>
              ) : items.map((r) => (
                <tr key={r.id} className={cn('hover:bg-gray-50', !r.active && 'opacity-50')}>
                  <td className="px-4 py-3 font-medium text-gray-900">{r.name}</td>
                  <td className="px-4 py-3"><span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{r.kind ? (KIND_LABEL[r.kind] ?? r.kind) : '—'}</span></td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gray-700">{r.defaultValue ? fmt(r.defaultValue) : '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{r.active ? 'Ativo' : 'Inativo'}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button onClick={() => toggle(r)} className="mr-1 inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title={r.active ? 'Inativar' : 'Ativar'}><Power size={15} /></button>
                    <button onClick={() => openEdit(r)} className="mr-1 inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Editar"><Pencil size={15} /></button>
                    <button onClick={() => remove(r)} className="inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Excluir"><Trash2 size={15} /></button>
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
            <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold text-gray-900">{editingId ? 'Editar produto' : 'Novo produto'}</h2><button onClick={() => setModal(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X size={18} /></button></div>
            <div className="space-y-3">
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Nome <span className="text-red-500">*</span></label><input className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex: Garantia estendida 12 meses" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="mb-1 block text-xs font-medium text-gray-700">Tipo</label><select className={inputCls} value={form.kind} onChange={(e) => set('kind', e.target.value as Kind)}>{KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></div>
                <div><label className="mb-1 block text-xs font-medium text-gray-700">Valor padrão</label><input type="text" inputMode="numeric" className={inputCls} value={numberToBRLMask(form.defaultValue || '')} onChange={(e) => set('defaultValue', parseBRL(maskBRL(e.target.value)) ?? 0)} placeholder="0,00" /></div>
              </div>
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
