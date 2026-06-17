'use client'

// =============================================================================
// Master > F&I > Provedores (Fase Master). MASTER-only.
// CRUD global de provedores (Credere, banco direto, integradores). Capabilities
// (simulação/envio/webhook/status) e URLs por ambiente. Sem credenciais (da loja).
// Consome /api/master/financing/providers (+[id]).
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Boxes, Plus, Pencil, Trash2, X, Save, Lock, Power } from 'lucide-react'
import { cn } from '@/lib/utils'

const KINDS = ['CREDERE', 'BANCO_DIRETO', 'INTEGRADOR', 'MANUAL', 'OUTRO'] as const
type Kind = (typeof KINDS)[number]
const KIND_LABEL: Record<Kind, string> = { CREDERE: 'Credere', BANCO_DIRETO: 'Banco direto', INTEGRADOR: 'Integrador', MANUAL: 'Manual', OUTRO: 'Outro' }

interface Provider { id: string; name: string; kind: Kind; active: boolean; baseUrlHomolog: string | null; baseUrlProd: string | null; apiVersion: string | null; supportsSimulate: boolean; supportsSubmit: boolean; supportsWebhook: boolean; supportsStatus: boolean; notes: string | null; banksCount: number }
interface Form { name: string; kind: Kind; active: boolean; baseUrlHomolog: string; baseUrlProd: string; apiVersion: string; supportsSimulate: boolean; supportsSubmit: boolean; supportsWebhook: boolean; supportsStatus: boolean; notes: string }
const emptyForm: Form = { name: '', kind: 'MANUAL', active: true, baseUrlHomolog: '', baseUrlProd: '', apiVersion: '', supportsSimulate: false, supportsSubmit: false, supportsWebhook: false, supportsStatus: false, notes: '' }

const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const CAPS: { key: keyof Form; label: string }[] = [
  { key: 'supportsSimulate', label: 'Simulação' }, { key: 'supportsSubmit', label: 'Envio' },
  { key: 'supportsWebhook', label: 'Webhook' }, { key: 'supportsStatus', label: 'Status' },
]

export default function MasterProvidersPage() {
  const { data: session } = useSession()
  const isMaster = !((session?.user as { role?: string })?.role) || (session?.user as { role?: string })?.role === 'MASTER'

  const [items, setItems] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Form>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))

  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await fetch('/api/master/financing/providers', { credentials: 'include' }).then((x) => x.json()); setItems(r?.data ?? []) }
    catch { setItems([]) } finally { setLoading(false) }
  }, [])
  useEffect(() => { if (isMaster) load() }, [isMaster, load])

  const openNew = () => { setEditingId(null); setForm(emptyForm); setError(null); setModal(true) }
  const openEdit = (p: Provider) => {
    setEditingId(p.id)
    setForm({ name: p.name, kind: p.kind, active: p.active, baseUrlHomolog: p.baseUrlHomolog ?? '', baseUrlProd: p.baseUrlProd ?? '', apiVersion: p.apiVersion ?? '', supportsSimulate: p.supportsSimulate, supportsSubmit: p.supportsSubmit, supportsWebhook: p.supportsWebhook, supportsStatus: p.supportsStatus, notes: p.notes ?? '' })
    setError(null); setModal(true)
  }
  const save = async () => {
    if (!form.name.trim()) { setError('Informe o nome.'); return }
    setSaving(true); setError(null)
    try {
      const payload = { ...form, baseUrlHomolog: form.baseUrlHomolog || null, baseUrlProd: form.baseUrlProd || null, apiVersion: form.apiVersion || null, notes: form.notes || null }
      const url = editingId ? `/api/master/financing/providers/${editingId}` : '/api/master/financing/providers'
      const res = await fetch(url, { method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload) })
      const json = await res.json()
      if (!res.ok) { setError(json?.error ?? 'Erro ao salvar.'); return }
      setModal(false); await load()
    } catch { setError('Erro de rede.') } finally { setSaving(false) }
  }
  const toggle = async (p: Provider) => {
    await fetch(`/api/master/financing/providers/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ active: !p.active }) }); await load()
  }
  const remove = async (p: Provider) => {
    if (!confirm(`Excluir o provedor "${p.name}"${p.banksCount > 0 ? ` e seus ${p.banksCount} banco(s) homologado(s)` : ''}?`)) return
    await fetch(`/api/master/financing/providers/${p.id}`, { method: 'DELETE', credentials: 'include' }); await load()
  }

  if (session && !isMaster) {
    return <div className="flex flex-col items-center justify-center gap-4 py-20 text-center"><div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600"><Lock size={24} /></div><p className="text-lg font-semibold text-gray-800">Área exclusiva do MASTER</p></div>
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><Boxes size={20} className="text-brand-600" />Provedores F&amp;I</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${items.length} provedor(es) — cadastro global da plataforma`}</p>
        </div>
        <button onClick={openNew} className="btn-primary text-sm"><Plus size={15} />Novo provedor</button>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50"><tr>{['Provedor', 'Tipo', 'Capabilities', 'Bancos', 'Status', ''].map((h) => (<th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (<tr key={i}>{Array.from({ length: 6 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>))}</tr>))
              ) : items.length === 0 ? (
                <tr><td colSpan={6} className="py-14 text-center"><Boxes size={30} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Nenhum provedor cadastrado.</p></td></tr>
              ) : items.map((p) => (
                <tr key={p.id} className={cn('hover:bg-gray-50', !p.active && 'opacity-50')}>
                  <td className="px-4 py-3 font-medium text-gray-900">{p.name}{p.apiVersion && <span className="ml-1 font-mono text-[11px] text-gray-400">v{p.apiVersion}</span>}</td>
                  <td className="px-4 py-3 text-gray-600">{KIND_LABEL[p.kind]}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {CAPS.filter((c) => p[c.key as keyof Provider]).map((c) => <span key={c.key} className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-700">{c.label}</span>)}
                      {!CAPS.some((c) => p[c.key as keyof Provider]) && <span className="text-xs text-gray-400">—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums text-gray-500">{p.banksCount}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{p.active ? 'Ativo' : 'Inativo'}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button onClick={() => toggle(p)} className="mr-1 inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title={p.active ? 'Inativar' : 'Ativar'}><Power size={15} /></button>
                    <button onClick={() => openEdit(p)} className="mr-1 inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Editar"><Pencil size={15} /></button>
                    <button onClick={() => remove(p)} className="inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Excluir"><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={() => setModal(false)}>
          <div className="my-4 w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold text-gray-900">{editingId ? 'Editar provedor' : 'Novo provedor'}</h2><button onClick={() => setModal(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X size={18} /></button></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="mb-1 block text-xs font-medium text-gray-700">Nome <span className="text-red-500">*</span></label><input className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex: Credere, Santander Direto..." /></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Tipo</label><select className={inputCls} value={form.kind} onChange={(e) => set('kind', e.target.value as Kind)}>{KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Versão da API</label><input className={inputCls} value={form.apiVersion} onChange={(e) => set('apiVersion', e.target.value)} placeholder="Ex: 1.0" /></div>
              <div className="col-span-2"><label className="mb-1 block text-xs font-medium text-gray-700">Base URL (homologação)</label><input className={inputCls} value={form.baseUrlHomolog} onChange={(e) => set('baseUrlHomolog', e.target.value)} placeholder="https://homolog.api..." /></div>
              <div className="col-span-2"><label className="mb-1 block text-xs font-medium text-gray-700">Base URL (produção)</label><input className={inputCls} value={form.baseUrlProd} onChange={(e) => set('baseUrlProd', e.target.value)} placeholder="https://api..." /></div>
              <div className="col-span-2"><label className="mb-1 block text-xs font-medium text-gray-700">Capabilities</label>
                <div className="flex flex-wrap gap-3">{CAPS.map((c) => (<label key={c.key} className="flex items-center gap-1.5 text-sm text-gray-700"><input type="checkbox" checked={form[c.key] as boolean} onChange={(e) => set(c.key, e.target.checked as never)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />{c.label}</label>))}</div>
              </div>
              <label className="col-span-2 flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />Ativo</label>
              <div className="col-span-2"><label className="mb-1 block text-xs font-medium text-gray-700">Observações</label><textarea className={cn(inputCls, 'min-h-[56px] resize-y')} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></div>
              {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}
            </div>
            <div className="mt-5 flex justify-end gap-2"><button onClick={() => setModal(false)} className="btn-secondary text-sm">Cancelar</button><button onClick={save} disabled={saving} className="btn-primary text-sm"><Save size={15} />{saving ? 'Salvando...' : 'Salvar'}</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
