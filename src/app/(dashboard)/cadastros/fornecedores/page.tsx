'use client'

// =============================================================================
// Cadastros › Fornecedores — oficinas, funilaria, estética, despachante, peças,
// laudos… Usados nos serviços de preparação do veículo e no financeiro.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { AlertCircle, Loader2, Pencil, Plus, Save, Search, Wrench, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { canAccessModule } from '@/lib/permissions'
import { SUPPLIER_KINDS } from '@/lib/stock/suppliers'

interface Supplier {
  id: string; name: string; kind: string; document: string | null; contactName: string | null; phone: string | null; whatsapp: string | null
  email: string | null; city: string | null; address: string | null; pixKey: string | null; bankInfo: string | null; notes: string | null
  active: boolean; _count?: { services: number }
}
type Form = Omit<Supplier, 'id' | 'active' | '_count'>
const EMPTY: Form = { name: '', kind: 'OFICINA', document: '', contactName: '', phone: '', whatsapp: '', email: '', city: '', address: '', pixKey: '', bankInfo: '', notes: '' }
const KIND_LABEL = Object.fromEntries(SUPPLIER_KINDS) as Record<string, string>
const inputCls = 'mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

export default function FornecedoresPage() {
  const { data: session } = useSession()
  const role = session?.user?.role
  const canEdit = canAccessModule(role, 'stock.manage') || canAccessModule(role, 'finance')
  const [rows, setRows] = useState<Supplier[] | null>(null)
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')
  const [editing, setEditing] = useState<{ id: string | null; form: Form } | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const j = await fetch(`/api/suppliers${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`).then((r) => r.json()).catch(() => null)
    if (j?.success) setRows(j.data); else { setErr(j?.error ?? 'Falha ao carregar.'); setRows([]) }
  }, [q])
  useEffect(() => { const t = setTimeout(() => void load(), 250); return () => clearTimeout(t) }, [load])

  async function save() {
    if (!editing) return
    setSaving(true); setErr('')
    const r = await fetch(editing.id ? `/api/suppliers/${editing.id}` : '/api/suppliers', { method: editing.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing.form) })
    const j = await r.json().catch(() => ({}))
    setSaving(false)
    if (!r.ok) { setErr(j.error ?? 'Falha ao salvar.'); return }
    setEditing(null); void load()
  }
  const toggle = async (s: Supplier) => { await fetch(`/api/suppliers/${s.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !s.active }) }); void load() }
  const set = (k: keyof Form, v: string) => setEditing((e) => e && { ...e, form: { ...e.form, [k]: v } })

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Wrench size={20} /></div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Fornecedores</h1>
            <p className="text-sm text-gray-500">Oficinas, funilaria, estética, despachante e demais prestadores da preparação dos veículos.</p>
          </div>
        </div>
        {canEdit && <button onClick={() => setEditing({ id: null, form: EMPTY })} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"><Plus size={15} /> Novo fornecedor</button>}
      </div>
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome ou cidade" className={cn(inputCls, 'mt-0 pl-9')} />
      </div>
      {err && <p className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle size={15} />{err}</p>}
      {!rows ? <Loader2 className="animate-spin text-gray-400" /> : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">Nenhum fornecedor cadastrado.</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((s) => (
            <div key={s.id} className={cn('rounded-xl border border-gray-200 bg-white p-4 shadow-sm', !s.active && 'opacity-60')}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><p className="truncate font-semibold text-gray-900">{s.name}</p><p className="text-xs text-gray-500">{KIND_LABEL[s.kind] ?? s.kind}{s.city ? ` · ${s.city}` : ''}</p></div>
                <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', s.active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500')}>{s.active ? 'Ativo' : 'Inativo'}</span>
              </div>
              <div className="mt-2 space-y-0.5 text-xs text-gray-600">
                {s.contactName && <p>Contato: {s.contactName}</p>}
                {(s.whatsapp || s.phone) && <p>{s.whatsapp ? `WhatsApp ${s.whatsapp}` : `Tel. ${s.phone}`}</p>}
                {s.pixKey && <p>PIX: {s.pixKey}</p>}
                <p className="font-medium text-gray-700">{s._count?.services ?? 0} carro(s) em serviço agora</p>
              </div>
              {canEdit && (
                <div className="mt-3 flex gap-2">
                  <button onClick={() => setEditing({ id: s.id, form: Object.fromEntries(Object.keys(EMPTY).map((k) => [k, (s as unknown as Record<string, string | null>)[k] ?? ''])) as Form })} className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"><Pencil size={12} />Editar</button>
                  <button onClick={() => void toggle(s)} className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">{s.active ? 'Desativar' : 'Ativar'}</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold text-gray-900">{editing.id ? 'Editar fornecedor' : 'Novo fornecedor'}</h2><button onClick={() => setEditing(null)} className="rounded p-1 text-gray-500 hover:bg-gray-100" aria-label="Fechar"><X size={18} /></button></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium text-gray-600">Nome *<input className={inputCls} value={editing.form.name} onChange={(e) => set('name', e.target.value)} maxLength={120} /></label>
              <label className="block text-xs font-medium text-gray-600">Tipo<select className={inputCls} value={editing.form.kind} onChange={(e) => set('kind', e.target.value)}>{SUPPLIER_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
              {([['document', 'CNPJ/CPF'], ['contactName', 'Contato'], ['whatsapp', 'WhatsApp'], ['phone', 'Telefone'], ['email', 'E-mail'], ['city', 'Cidade'], ['address', 'Endereço'], ['pixKey', 'Chave PIX']] as Array<[keyof Form, string]>).map(([k, l]) => (
                <label key={k} className="block text-xs font-medium text-gray-600">{l}<input className={inputCls} value={editing.form[k] ?? ''} onChange={(e) => set(k, e.target.value)} /></label>
              ))}
              <label className="block text-xs font-medium text-gray-600 sm:col-span-2">Dados bancários<input className={inputCls} value={editing.form.bankInfo ?? ''} onChange={(e) => set('bankInfo', e.target.value)} /></label>
              <label className="block text-xs font-medium text-gray-600 sm:col-span-2">Observações<textarea rows={3} className={inputCls} value={editing.form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancelar</button>
              <button onClick={() => void save()} disabled={saving || !editing.form.name.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
