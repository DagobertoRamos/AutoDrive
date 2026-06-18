'use client'

// =============================================================================
// Marketing > Mesa SDR > Times — CRUD via /api/marketing/sdr/teams.
// Leitura: marketing.sdr | gestão: marketing.sdr.manage. Tenant-scoped.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Users, Plus, Pencil, Trash2, X, Save, Power } from 'lucide-react'
import { cn } from '@/lib/utils'

const MANAGE_ROLES = ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE']
const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

interface Team { id: string; name: string; description: string | null; unitId: string | null; active: boolean; members: number }
interface Form { name: string; description: string; unitId: string; active: boolean }
const empty: Form = { name: '', description: '', unitId: '', active: true }

export default function SdrTeamsPage() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role
  const canManage = !role || MANAGE_ROLES.includes(role)

  const [items, setItems] = useState<Team[]>([])
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
      const res = await fetch('/api/marketing/sdr/teams', { credentials: 'include' })
      if (res.status === 403) { setDenied(true); setItems([]); return }
      const j = await res.json(); setItems(j?.data ?? [])
    } catch { setItems([]) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const openNew = () => { setEditingId(null); setForm(empty); setError(null); setModal(true) }
  const openEdit = (t: Team) => { setEditingId(t.id); setForm({ name: t.name, description: t.description ?? '', unitId: t.unitId ?? '', active: t.active }); setError(null); setModal(true) }
  const save = async () => {
    if (!form.name.trim()) { setError('Informe o nome do time.'); return }
    setSaving(true); setError(null)
    try {
      const body = { name: form.name, description: form.description || null, unitId: form.unitId || null, active: form.active }
      const url = editingId ? `/api/marketing/sdr/teams/${editingId}` : '/api/marketing/sdr/teams'
      const res = await fetch(url, { method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) })
      const j = await res.json(); if (!res.ok) { setError(j?.error ?? 'Erro ao salvar.'); return }
      setModal(false); await load()
    } catch { setError('Erro de rede.') } finally { setSaving(false) }
  }
  const toggle = async (t: Team) => { await fetch(`/api/marketing/sdr/teams/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ active: !t.active }) }); await load() }
  const remove = async (t: Team) => { if (!confirm(`Excluir o time "${t.name}"? Os membros também serão removidos.`)) return; await fetch(`/api/marketing/sdr/teams/${t.id}`, { method: 'DELETE', credentials: 'include' }); await load() }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><Users size={20} className="text-brand-600" />Times SDR</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${items.length} time(s) de pré-vendas`}</p>
        </div>
        {canManage && <button onClick={openNew} className="btn-primary text-sm"><Plus size={15} />Novo time</button>}
      </div>

      {denied ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Seu perfil não tem acesso à Mesa SDR.</div>
      ) : (
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50"><tr>{['Time', 'Descrição', 'Membros', 'Status', ''].map((h) => (<th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? Array.from({ length: 3 }).map((_, i) => (<tr key={i}>{Array.from({ length: 5 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>))}</tr>))
              : items.length === 0 ? (<tr><td colSpan={5} className="py-12 text-center"><Users size={28} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Nenhum time cadastrado.</p></td></tr>)
              : items.map((t) => (
                <tr key={t.id} className={cn('hover:bg-gray-50', !t.active && 'opacity-50')}>
                  <td className="px-4 py-3 font-medium text-gray-900">{t.name}</td>
                  <td className="px-4 py-3 text-gray-600"><span className="block max-w-[280px] truncate">{t.description || '—'}</span></td>
                  <td className="px-4 py-3 tabular-nums text-gray-700">{t.members}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{t.active ? 'Ativo' : 'Inativo'}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {canManage && <>
                      <button onClick={() => toggle(t)} className="mr-1 inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title={t.active ? 'Inativar' : 'Ativar'}><Power size={15} /></button>
                      <button onClick={() => openEdit(t)} className="mr-1 inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Editar"><Pencil size={15} /></button>
                      <button onClick={() => remove(t)} className="inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Excluir"><Trash2 size={15} /></button>
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
            <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold text-gray-900">{editingId ? 'Editar time' : 'Novo time'}</h2><button onClick={() => setModal(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X size={18} /></button></div>
            <div className="space-y-3">
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Nome <span className="text-red-500">*</span></label><input className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex: Pré-vendas Matriz" /></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Descrição</label><input className={inputCls} value={form.description} onChange={(e) => set('description', e.target.value)} /></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Unidade (ID, opcional)</label><input className={inputCls} value={form.unitId} onChange={(e) => set('unitId', e.target.value)} /></div>
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
