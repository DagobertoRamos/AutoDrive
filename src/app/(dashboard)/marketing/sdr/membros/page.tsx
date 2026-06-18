'use client'

// =============================================================================
// Marketing > Mesa SDR > Membros — CRUD via /api/marketing/sdr/members.
// Leitura: marketing.sdr | gestão: marketing.sdr.manage.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Headset, Plus, Pencil, Trash2, X, Save, Power } from 'lucide-react'
import { cn } from '@/lib/utils'

const MANAGE_ROLES = ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE']
const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const PRESENCE = [['ONLINE', 'Online'], ['BUSY', 'Ocupado'], ['AWAY', 'Ausente'], ['ON_CALL', 'Em ligação'], ['OFFLINE', 'Offline']] as const
const PRESENCE_CLS: Record<string, string> = { ONLINE: 'bg-green-100 text-green-700', BUSY: 'bg-amber-100 text-amber-700', AWAY: 'bg-gray-100 text-gray-600', ON_CALL: 'bg-blue-100 text-blue-700', OFFLINE: 'bg-gray-100 text-gray-400' }

interface Team { id: string; name: string }
interface Member { id: string; teamId: string; userId: string; role: string; active: boolean; presence: string; maxOpenLeads: number | null }
interface Form { teamId: string; userId: string; role: string; maxOpenLeads: string; active: boolean }
const empty: Form = { teamId: '', userId: '', role: 'SDR', maxOpenLeads: '', active: true }

export default function SdrMembersPage() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role
  const canManage = !role || MANAGE_ROLES.includes(role)

  const [teams, setTeams] = useState<Team[]>([])
  const [items, setItems] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [modal, setModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Form>(empty)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))
  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? id

  const load = useCallback(async () => {
    setLoading(true); setDenied(false)
    try {
      const [mRes, tRes] = await Promise.all([
        fetch('/api/marketing/sdr/members', { credentials: 'include' }),
        fetch('/api/marketing/sdr/teams', { credentials: 'include' }),
      ])
      if (mRes.status === 403) { setDenied(true); setItems([]); return }
      setItems((await mRes.json())?.data ?? [])
      setTeams((await tRes.json())?.data ?? [])
    } catch { setItems([]) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const openNew = () => { setEditingId(null); setForm({ ...empty, teamId: teams[0]?.id ?? '' }); setError(null); setModal(true) }
  const openEdit = (m: Member) => { setEditingId(m.id); setForm({ teamId: m.teamId, userId: m.userId, role: m.role, maxOpenLeads: m.maxOpenLeads != null ? String(m.maxOpenLeads) : '', active: m.active }); setError(null); setModal(true) }
  const save = async () => {
    if (!editingId && (!form.teamId || !form.userId.trim())) { setError('Informe o time e o usuário.'); return }
    setSaving(true); setError(null)
    try {
      const maxOpen = form.maxOpenLeads ? Number(form.maxOpenLeads) : null
      const body = editingId
        ? { role: form.role, active: form.active, maxOpenLeads: maxOpen }
        : { teamId: form.teamId, userId: form.userId.trim(), role: form.role, active: form.active, maxOpenLeads: maxOpen }
      const url = editingId ? `/api/marketing/sdr/members/${editingId}` : '/api/marketing/sdr/members'
      const res = await fetch(url, { method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) })
      const j = await res.json(); if (!res.ok) { setError(j?.error ?? 'Erro ao salvar.'); return }
      setModal(false); await load()
    } catch { setError('Erro de rede.') } finally { setSaving(false) }
  }
  const setPresence = async (m: Member, presence: string) => { await fetch(`/api/marketing/sdr/members/${m.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ presence }) }); await load() }
  const toggle = async (m: Member) => { await fetch(`/api/marketing/sdr/members/${m.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ active: !m.active }) }); await load() }
  const remove = async (m: Member) => { if (!confirm('Remover este membro?')) return; await fetch(`/api/marketing/sdr/members/${m.id}`, { method: 'DELETE', credentials: 'include' }); await load() }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><Headset size={20} className="text-brand-600" />Membros da Mesa SDR</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${items.length} membro(s)`}</p>
        </div>
        {canManage && <button onClick={openNew} disabled={teams.length === 0} className="btn-primary text-sm disabled:opacity-50" title={teams.length === 0 ? 'Cadastre um time primeiro' : ''}><Plus size={15} />Novo membro</button>}
      </div>

      {denied ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Seu perfil não tem acesso à Mesa SDR.</div>
      ) : (
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50"><tr>{['Usuário', 'Time', 'Papel', 'Presença', 'Limite', 'Status', ''].map((h) => (<th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? Array.from({ length: 3 }).map((_, i) => (<tr key={i}>{Array.from({ length: 7 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>))}</tr>))
              : items.length === 0 ? (<tr><td colSpan={7} className="py-12 text-center"><Headset size={28} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Nenhum membro cadastrado.</p></td></tr>)
              : items.map((m) => (
                <tr key={m.id} className={cn('hover:bg-gray-50', !m.active && 'opacity-50')}>
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{m.userId}</td>
                  <td className="px-4 py-3 text-gray-600">{teamName(m.teamId)}</td>
                  <td className="px-4 py-3"><span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{m.role}</span></td>
                  <td className="px-4 py-3">
                    {canManage ? (
                      <select value={m.presence} onChange={(e) => setPresence(m, e.target.value)} className={cn('rounded-full px-2 py-0.5 text-xs font-semibold focus:outline-none', PRESENCE_CLS[m.presence])}>
                        {PRESENCE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    ) : <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', PRESENCE_CLS[m.presence])}>{PRESENCE.find((p) => p[0] === m.presence)?.[1] ?? m.presence}</span>}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-gray-500">{m.maxOpenLeads ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{m.active ? 'Ativo' : 'Inativo'}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {canManage && <>
                      <button onClick={() => toggle(m)} className="mr-1 inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title={m.active ? 'Inativar' : 'Ativar'}><Power size={15} /></button>
                      <button onClick={() => openEdit(m)} className="mr-1 inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Editar"><Pencil size={15} /></button>
                      <button onClick={() => remove(m)} className="inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Remover"><Trash2 size={15} /></button>
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
            <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold text-gray-900">{editingId ? 'Editar membro' : 'Novo membro'}</h2><button onClick={() => setModal(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X size={18} /></button></div>
            <div className="space-y-3">
              {!editingId && <>
                <div><label className="mb-1 block text-xs font-medium text-gray-700">Time <span className="text-red-500">*</span></label><select className={inputCls} value={form.teamId} onChange={(e) => set('teamId', e.target.value)}>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
                <div><label className="mb-1 block text-xs font-medium text-gray-700">ID do usuário <span className="text-red-500">*</span></label><input className={inputCls} value={form.userId} onChange={(e) => set('userId', e.target.value)} placeholder="ID do usuário da loja" /></div>
              </>}
              <div className="grid grid-cols-2 gap-3">
                <div><label className="mb-1 block text-xs font-medium text-gray-700">Papel</label><select className={inputCls} value={form.role} onChange={(e) => set('role', e.target.value)}><option value="SDR">SDR</option><option value="LEADER">Líder</option></select></div>
                <div><label className="mb-1 block text-xs font-medium text-gray-700">Limite de leads abertos</label><input type="number" min={1} className={inputCls} value={form.maxOpenLeads} onChange={(e) => set('maxOpenLeads', e.target.value)} placeholder="—" /></div>
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
