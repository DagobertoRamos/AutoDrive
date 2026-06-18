'use client'

// =============================================================================
// Marketing > Telefonia > Números — via /api/marketing/telephony/numbers.
// Leitura: marketing.telephony | gestão: marketing.telephony.manage.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Hash, Plus, Pencil, Power, X, Save } from 'lucide-react'
import { cn } from '@/lib/utils'

const MANAGE_ROLES = ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO']
const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

interface Conn { id: string; label: string | null; provider: { name: string } }
interface Num { id: string; number: string; label: string | null; extension: string | null; unitId: string | null; source: string | null; inbound: boolean; outbound: boolean; active: boolean; connectionId: string | null }
interface Form { number: string; label: string; extension: string; source: string; connectionId: string; inbound: boolean; outbound: boolean; active: boolean }
const empty: Form = { number: '', label: '', extension: '', source: '', connectionId: '', inbound: true, outbound: true, active: true }

export default function TelephonyNumbersPage() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role
  const canManage = !role || MANAGE_ROLES.includes(role)

  const [conns, setConns] = useState<Conn[]>([])
  const [items, setItems] = useState<Num[]>([])
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [modal, setModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Form>(empty)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))

  const load = useCallback(async () => {
    setLoading(true); setDenied(false)
    try {
      const [nRes, cRes] = await Promise.all([
        fetch('/api/marketing/telephony/numbers', { credentials: 'include' }),
        fetch('/api/marketing/telephony/connections', { credentials: 'include' }),
      ])
      if (nRes.status === 403) { setDenied(true); return }
      setItems((await nRes.json())?.data ?? [])
      setConns((await cRes.json())?.data ?? [])
    } catch { /* noop */ } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const connLabel = (id: string | null) => { if (!id) return '—'; const c = conns.find((x) => x.id === id); return c ? (c.label || c.provider?.name || id) : id }
  const openNew = () => { setEditingId(null); setForm(empty); setError(null); setModal(true) }
  const openEdit = (n: Num) => { setEditingId(n.id); setForm({ number: n.number, label: n.label ?? '', extension: n.extension ?? '', source: n.source ?? '', connectionId: n.connectionId ?? '', inbound: n.inbound, outbound: n.outbound, active: n.active }); setError(null); setModal(true) }
  const save = async () => {
    if (!form.number.trim()) { setError('Informe o número.'); return }
    setSaving(true); setError(null)
    try {
      const body = { number: form.number, label: form.label || null, extension: form.extension || null, source: form.source || null, connectionId: form.connectionId || null, inbound: form.inbound, outbound: form.outbound, active: form.active }
      const url = editingId ? `/api/marketing/telephony/numbers/${editingId}` : '/api/marketing/telephony/numbers'
      const res = await fetch(url, { method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) })
      const j = await res.json(); if (!res.ok) { setError(j?.error ?? 'Erro ao salvar.'); return }
      setModal(false); await load()
    } catch { setError('Erro de rede.') } finally { setSaving(false) }
  }
  const toggle = async (n: Num) => { await fetch(`/api/marketing/telephony/numbers/${n.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ active: !n.active }) }); await load() }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><Hash size={20} className="text-brand-600" />Números / Ramais</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${items.length} número(s) rastreável(is)`}</p>
        </div>
        {canManage && <button onClick={openNew} className="btn-primary text-sm"><Plus size={15} />Novo número</button>}
      </div>

      {denied ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Seu perfil não tem acesso à telefonia.</div>
      ) : (
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50"><tr>{['Número', 'Rótulo', 'Ramal', 'Origem', 'Conexão', 'Direção', 'Status', ''].map((h) => (<th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? Array.from({ length: 3 }).map((_, i) => (<tr key={i}>{Array.from({ length: 8 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>))}</tr>))
              : items.length === 0 ? (<tr><td colSpan={8} className="py-12 text-center"><Hash size={28} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Nenhum número cadastrado.</p></td></tr>)
              : items.map((n) => (
                <tr key={n.id} className={cn('hover:bg-gray-50', !n.active && 'opacity-50')}>
                  <td className="px-4 py-3 font-medium text-gray-900">{n.number}</td>
                  <td className="px-4 py-3 text-gray-600">{n.label || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{n.extension || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{n.source || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{connLabel(n.connectionId)}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{[n.inbound && 'entra', n.outbound && 'sai'].filter(Boolean).join(' / ') || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{n.active ? 'Ativo' : 'Inativo'}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {canManage && <>
                      <button onClick={() => toggle(n)} className="mr-1 inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title={n.active ? 'Inativar' : 'Ativar'}><Power size={15} /></button>
                      <button onClick={() => openEdit(n)} className="inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Editar"><Pencil size={15} /></button>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={() => setModal(false)}>
          <div className="my-8 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold text-gray-900">{editingId ? 'Editar número' : 'Novo número'}</h2><button onClick={() => setModal(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X size={18} /></button></div>
            <div className="space-y-3">
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Número <span className="text-red-500">*</span></label><input className={inputCls} value={form.number} onChange={(e) => set('number', e.target.value)} placeholder="+55 11 9 9999-9999" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="mb-1 block text-xs font-medium text-gray-700">Rótulo</label><input className={inputCls} value={form.label} onChange={(e) => set('label', e.target.value)} /></div>
                <div><label className="mb-1 block text-xs font-medium text-gray-700">Ramal</label><input className={inputCls} value={form.extension} onChange={(e) => set('extension', e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="mb-1 block text-xs font-medium text-gray-700">Origem (campanha)</label><input className={inputCls} value={form.source} onChange={(e) => set('source', e.target.value)} /></div>
                <div><label className="mb-1 block text-xs font-medium text-gray-700">Conexão</label><select className={inputCls} value={form.connectionId} onChange={(e) => set('connectionId', e.target.value)}><option value="">—</option>{conns.map((c) => <option key={c.id} value={c.id}>{c.label || c.provider?.name}</option>)}</select></div>
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={form.inbound} onChange={(e) => set('inbound', e.target.checked)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />Entrada</label>
                <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={form.outbound} onChange={(e) => set('outbound', e.target.checked)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />Saída</label>
                <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />Ativo</label>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
            <div className="mt-5 flex justify-end gap-2"><button onClick={() => setModal(false)} className="btn-secondary text-sm">Cancelar</button><button onClick={save} disabled={saving} className="btn-primary text-sm"><Save size={15} />{saving ? 'Salvando...' : 'Salvar'}</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
