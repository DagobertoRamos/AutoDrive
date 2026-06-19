'use client'

// =============================================================================
// Marketing > Mesa SDR > Distribuição — políticas via /api/marketing/sdr/policies.
// Leitura: marketing.sdr | gestão: marketing.sdr.manage.
// (O motor de distribuição automática consome estas políticas — fase futura.)
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { GitBranch, Plus, Pencil, Trash2, X, Save, Power, Play } from 'lucide-react'
import { cn } from '@/lib/utils'

const MANAGE_ROLES = ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE']
const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const MODES = [['ROUND_ROBIN', 'Roleta'], ['SHARK_TANK', 'Tanque de Tubarão'], ['MANUAL', 'Livre (manual)'], ['LOAD_BALANCED', 'Menor carga'], ['PERFORMANCE_WEIGHTED', 'Peso por performance'], ['PRIORITY_RULES', 'Regras por origem/unidade']] as const
const modeLabel = (m: string) => MODES.find((x) => x[0] === m)?.[1] ?? m

interface Policy { id: string; name: string; mode: string; active: boolean; priority: number; teamId: string | null; unitId: string | null; config: unknown }
interface Form { name: string; mode: string; priority: string; active: boolean; config: string }
const empty: Form = { name: '', mode: 'ROUND_ROBIN', priority: '0', active: true, config: '' }

export default function SdrPoliciesPage() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role
  const canManage = !role || MANAGE_ROLES.includes(role)

  const [items, setItems] = useState<Policy[]>([])
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [modal, setModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Form>(empty)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [runMsg, setRunMsg] = useState<string | null>(null)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))

  const load = useCallback(async () => {
    setLoading(true); setDenied(false)
    try {
      const res = await fetch('/api/marketing/sdr/policies', { credentials: 'include' })
      if (res.status === 403) { setDenied(true); setItems([]); return }
      setItems((await res.json())?.data ?? [])
    } catch { setItems([]) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const openNew = () => { setEditingId(null); setForm(empty); setError(null); setModal(true) }
  const openEdit = (p: Policy) => { setEditingId(p.id); setForm({ name: p.name, mode: p.mode, priority: String(p.priority), active: p.active, config: p.config ? JSON.stringify(p.config, null, 2) : '' }); setError(null); setModal(true) }
  const save = async () => {
    if (!form.name.trim()) { setError('Informe o nome da política.'); return }
    let config: unknown = undefined
    if (form.config.trim()) { try { config = JSON.parse(form.config) } catch { setError('Config (JSON) inválido.'); return } }
    setSaving(true); setError(null)
    try {
      const body = { name: form.name, mode: form.mode, priority: Number(form.priority) || 0, active: form.active, config }
      const url = editingId ? `/api/marketing/sdr/policies/${editingId}` : '/api/marketing/sdr/policies'
      const res = await fetch(url, { method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) })
      const j = await res.json(); if (!res.ok) { setError(j?.error ?? 'Erro ao salvar.'); return }
      setModal(false); await load()
    } catch { setError('Erro de rede.') } finally { setSaving(false) }
  }
  const toggle = async (p: Policy) => { await fetch(`/api/marketing/sdr/policies/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ active: !p.active }) }); await load() }
  const remove = async (p: Policy) => { if (!confirm(`Excluir a política "${p.name}"?`)) return; await fetch(`/api/marketing/sdr/policies/${p.id}`, { method: 'DELETE', credentials: 'include' }); await load() }
  const distribute = async () => {
    setRunning(true); setRunMsg(null)
    try {
      const res = await fetch('/api/marketing/sdr/distribute', { method: 'POST', credentials: 'include' })
      const j = await res.json()
      if (!res.ok) { setRunMsg(j?.error ?? 'Falha ao distribuir.'); return }
      const d = j.distribution, s = j.sla
      setRunMsg(d?.note ? `Distribuição: ${d.note}` : `Distribuídos ${d?.assigned ?? 0} lead(s); ${d?.skipped ?? 0} sem agente elegível. SLA: ${s?.recycled ?? 0} devolvido(s) à fila.`)
    } catch { setRunMsg('Erro de rede.') } finally { setRunning(false); setTimeout(() => setRunMsg(null), 6000) }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><GitBranch size={20} className="text-brand-600" />Políticas de Distribuição</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${items.length} política(s) — como os leads são distribuídos`}</p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <button onClick={distribute} disabled={running} className="btn-secondary text-sm"><Play size={14} className={cn(running && 'animate-pulse')} />{running ? 'Distribuindo...' : 'Distribuir agora'}</button>
            <button onClick={openNew} className="btn-primary text-sm"><Plus size={15} />Nova política</button>
          </div>
        )}
      </div>

      {runMsg && <div className="rounded-lg border border-brand-200 bg-brand-50/50 px-4 py-2 text-sm text-brand-800">{runMsg}</div>}

      {denied ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Seu perfil não tem acesso à Mesa SDR.</div>
      ) : (
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50"><tr>{['Política', 'Modo', 'Prioridade', 'Status', ''].map((h) => (<th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? Array.from({ length: 3 }).map((_, i) => (<tr key={i}>{Array.from({ length: 5 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>))}</tr>))
              : items.length === 0 ? (<tr><td colSpan={5} className="py-12 text-center"><GitBranch size={28} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Nenhuma política cadastrada.</p></td></tr>)
              : items.map((p) => (
                <tr key={p.id} className={cn('hover:bg-gray-50', !p.active && 'opacity-50')}>
                  <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                  <td className="px-4 py-3"><span className="rounded bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">{modeLabel(p.mode)}</span></td>
                  <td className="px-4 py-3 tabular-nums text-gray-500">{p.priority}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{p.active ? 'Ativa' : 'Inativa'}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {canManage && <>
                      <button onClick={() => toggle(p)} className="mr-1 inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title={p.active ? 'Inativar' : 'Ativar'}><Power size={15} /></button>
                      <button onClick={() => openEdit(p)} className="mr-1 inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Editar"><Pencil size={15} /></button>
                      <button onClick={() => remove(p)} className="inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Excluir"><Trash2 size={15} /></button>
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
          <div className="my-8 w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold text-gray-900">{editingId ? 'Editar política' : 'Nova política'}</h2><button onClick={() => setModal(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X size={18} /></button></div>
            <div className="space-y-3">
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Nome <span className="text-red-500">*</span></label><input className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex: Distribuição padrão" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="mb-1 block text-xs font-medium text-gray-700">Modo</label><select className={inputCls} value={form.mode} onChange={(e) => set('mode', e.target.value)}>{MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                <div><label className="mb-1 block text-xs font-medium text-gray-700">Prioridade</label><input type="number" className={inputCls} value={form.priority} onChange={(e) => set('priority', e.target.value)} /></div>
              </div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Parâmetros (JSON, opcional)</label><textarea className={cn(inputCls, 'h-28 font-mono text-xs')} value={form.config} onChange={(e) => set('config', e.target.value)} placeholder='{ "slaSeconds": 300, "fallbackMode": "ROUND_ROBIN" }' /></div>
              <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />Ativa</label>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
            <div className="mt-5 flex justify-end gap-2"><button onClick={() => setModal(false)} className="btn-secondary text-sm">Cancelar</button><button onClick={save} disabled={saving} className="btn-primary text-sm"><Save size={15} />{saving ? 'Salvando...' : 'Salvar'}</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
