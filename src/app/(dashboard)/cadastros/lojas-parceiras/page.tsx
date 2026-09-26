'use client'

// =============================================================================
// Cadastros › Lojas parceiras — lojistas cujos carros a loja anuncia.
// Usadas na origem do veículo (Publicações / estoque) e na tag do site.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { AlertCircle, Handshake, Loader2, Pencil, Plus, Save, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { canAccessModule } from '@/lib/permissions'

interface Partner {
  id: string; name: string; legalName: string | null; cnpj: string | null; responsibleName: string | null
  whatsapp: string | null; email: string | null; city: string | null; state: string | null; address: string | null
  instagram: string | null; website: string | null; commission: string | null; notes: string | null
  active: boolean; _count?: { vehicles: number }
}
type Form = Omit<Partner, 'id' | 'active' | '_count'>
const EMPTY: Form = { name: '', legalName: '', cnpj: '', responsibleName: '', whatsapp: '', email: '', city: '', state: '', address: '', instagram: '', website: '', commission: '', notes: '' }

const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

function fmtPhone(d: string | null) {
  const s = (d ?? '').replace(/\D/g, '')
  if (s.length === 11) return `(${s.slice(0, 2)}) ${s.slice(2, 7)}-${s.slice(7)}`
  if (s.length === 10) return `(${s.slice(0, 2)}) ${s.slice(2, 6)}-${s.slice(6)}`
  return d ?? ''
}

export default function LojasParceirasPage() {
  const { data: session } = useSession()
  const canEdit = canAccessModule(session?.user?.role, 'registrations.vehicles')
  const [rows, setRows] = useState<Partner[] | null>(null)
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')
  const [editing, setEditing] = useState<{ id: string | null; form: Form } | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/partner-stores${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`)
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Falha ao carregar.')
      setRows(j.data)
    } catch (e) { setErr((e as Error).message); setRows([]) }
  }, [q])
  useEffect(() => { const t = setTimeout(() => void load(), 250); return () => clearTimeout(t) }, [load])

  async function save() {
    if (!editing) return
    setSaving(true); setErr('')
    try {
      const r = await fetch(editing.id ? `/api/partner-stores/${editing.id}` : '/api/partner-stores', {
        method: editing.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing.form),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Falha ao salvar.')
      setEditing(null); void load()
    } catch (e) { setErr((e as Error).message) } finally { setSaving(false) }
  }

  async function toggle(p: Partner) {
    const r = await fetch(`/api/partner-stores/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !p.active }) })
    if (r.ok) void load()
  }

  const set = (k: keyof Form, v: string) => setEditing((e) => e && { ...e, form: { ...e.form, [k]: v } })

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Handshake size={20} /></div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Lojas parceiras</h1>
            <p className="text-sm text-gray-500">Lojistas cujos carros sua loja anuncia. Aparecem na origem do veículo e na tag do site.</p>
          </div>
        </div>
        {canEdit && (
          <button onClick={() => setEditing({ id: null, form: EMPTY })} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            <Plus size={15} /> Nova loja parceira
          </button>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome ou cidade" className={cn(inputCls, 'pl-9')} />
      </div>

      {err && <p className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle size={15} />{err}</p>}

      {!rows ? <Loader2 className="animate-spin text-gray-400" /> : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">Nenhuma loja parceira cadastrada.</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((p) => (
            <div key={p.id} className={cn('rounded-xl border bg-white p-4 shadow-sm', p.active ? 'border-gray-200' : 'border-gray-200 opacity-60')}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-gray-900">{p.name}</p>
                  <p className="text-xs text-gray-500">{[p.city, p.state].filter(Boolean).join('/') || 'Cidade não informada'}</p>
                </div>
                <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', p.active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500')}>{p.active ? 'Ativa' : 'Inativa'}</span>
              </div>
              <div className="mt-2 space-y-0.5 text-xs text-gray-600">
                {p.responsibleName && <p>Responsável: {p.responsibleName}</p>}
                {p.whatsapp && <p>WhatsApp: {fmtPhone(p.whatsapp)}</p>}
                {p.commission && <p>Comissão: {p.commission}</p>}
                <p className="font-medium text-gray-700">{p._count?.vehicles ?? 0} carro(s) ativo(s) no estoque</p>
              </div>
              {canEdit && (
                <div className="mt-3 flex gap-2">
                  <button onClick={() => setEditing({ id: p.id, form: Object.fromEntries(Object.keys(EMPTY).map((k) => [k, (p as unknown as Record<string, string | null>)[k] ?? ''])) as Form })}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"><Pencil size={12} />Editar</button>
                  <button onClick={() => toggle(p)} className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">{p.active ? 'Desativar' : 'Ativar'}</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">{editing.id ? 'Editar loja parceira' : 'Nova loja parceira'}</h2>
              <button onClick={() => setEditing(null)} className="rounded p-1 text-gray-500 hover:bg-gray-100" aria-label="Fechar"><X size={18} /></button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {([
                ['name', 'Nome da loja *'], ['legalName', 'Razão social'], ['cnpj', 'CNPJ'], ['responsibleName', 'Responsável'],
                ['whatsapp', 'WhatsApp'], ['email', 'E-mail'], ['city', 'Cidade'], ['state', 'UF'],
                ['address', 'Endereço'], ['instagram', 'Instagram'], ['website', 'Site'], ['commission', 'Comissão combinada'],
              ] as Array<[keyof Form, string]>).map(([k, label]) => (
                <label key={k} className="block text-xs font-medium text-gray-600">{label}
                  <input className={cn(inputCls, 'mt-1')} value={editing.form[k] ?? ''} onChange={(e) => set(k, e.target.value)} maxLength={k === 'state' ? 2 : 300} />
                </label>
              ))}
              <label className="block text-xs font-medium text-gray-600 sm:col-span-2">Observações
                <textarea rows={3} className={cn(inputCls, 'mt-1')} value={editing.form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancelar</button>
              <button onClick={save} disabled={saving || !editing.form.name.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
