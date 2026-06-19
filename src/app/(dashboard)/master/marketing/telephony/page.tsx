'use client'

// =============================================================================
// Master > Telefonia (global) — CRUD de provedores homologados (TelephonyProvider).
// Camada técnica GLOBAL: provedores/adapters que a loja pode conectar (BYOC).
// MASTER nunca vê credencial do tenant. Gate: master.marketing.telephony.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Phone, Plus, Pencil, Trash2, X, Save, Power, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'

const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const KINDS = [['ASTERISK', 'Asterisk'], ['THREE_CX', '3CX'], ['TWILIO', 'Twilio'], ['GENERIC_WEBHOOK', 'Webhook genérico'], ['MANUAL', 'Manual']] as const
const kindLabel = (k: string) => KINDS.find((x) => x[0] === k)?.[1] ?? k
const CAPS = [['supportsInbound', 'Entrada'], ['supportsOutbound', 'Saída'], ['supportsRecording', 'Gravação'], ['supportsWebhook', 'Webhook']] as const

interface Provider { id: string; name: string; kind: string; active: boolean; supportsInbound: boolean; supportsOutbound: boolean; supportsRecording: boolean; supportsWebhook: boolean; baseUrl: string | null; apiVersion: string | null; notes: string | null; connections: number }
interface Form { name: string; kind: string; active: boolean; supportsInbound: boolean; supportsOutbound: boolean; supportsRecording: boolean; supportsWebhook: boolean; baseUrl: string; apiVersion: string; notes: string }
const empty: Form = { name: '', kind: 'GENERIC_WEBHOOK', active: true, supportsInbound: true, supportsOutbound: false, supportsRecording: false, supportsWebhook: true, baseUrl: '', apiVersion: '', notes: '' }

export default function MasterTelephonyProvidersPage() {
  const [items, setItems] = useState<Provider[]>([])
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
      const res = await fetch('/api/master/marketing/telephony/providers', { credentials: 'include' })
      if (res.status === 403) { setDenied(true); return }
      setItems((await res.json())?.data ?? [])
    } catch { /* noop */ } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const openNew = () => { setEditingId(null); setForm(empty); setError(null); setModal(true) }
  const openEdit = (p: Provider) => { setEditingId(p.id); setForm({ name: p.name, kind: p.kind, active: p.active, supportsInbound: p.supportsInbound, supportsOutbound: p.supportsOutbound, supportsRecording: p.supportsRecording, supportsWebhook: p.supportsWebhook, baseUrl: p.baseUrl ?? '', apiVersion: p.apiVersion ?? '', notes: p.notes ?? '' }); setError(null); setModal(true) }
  const save = async () => {
    if (!form.name.trim()) { setError('Informe o nome.'); return }
    setSaving(true); setError(null)
    try {
      const body = { ...form, baseUrl: form.baseUrl || null, apiVersion: form.apiVersion || null, notes: form.notes || null }
      const url = editingId ? `/api/master/marketing/telephony/providers/${editingId}` : '/api/master/marketing/telephony/providers'
      const res = await fetch(url, { method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) })
      const j = await res.json(); if (!res.ok) { setError(j?.error ?? 'Erro ao salvar.'); return }
      setModal(false); await load()
    } catch { setError('Erro de rede.') } finally { setSaving(false) }
  }
  const toggle = async (p: Provider) => { await fetch(`/api/master/marketing/telephony/providers/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ active: !p.active }) }); await load() }
  const remove = async (p: Provider) => {
    if (!confirm(`Excluir o provedor "${p.name}"?`)) return
    const res = await fetch(`/api/master/marketing/telephony/providers/${p.id}`, { method: 'DELETE', credentials: 'include' })
    if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j?.error ?? 'Não foi possível excluir.') }
    await load()
  }

  if (denied) return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600"><Lock size={24} /></div>
      <div><p className="text-lg font-semibold text-gray-800">Área exclusiva do MASTER</p><p className="mt-1 max-w-md text-sm text-gray-500">Os provedores de telefonia são a camada técnica global da plataforma.</p></div>
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><Phone size={20} className="text-brand-600" />Telefonia (global)</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${items.length} provedor(es) homologado(s). As lojas conectam com as próprias credenciais (BYOC).`}</p>
        </div>
        <button onClick={openNew} className="btn-primary text-sm"><Plus size={15} />Novo provedor</button>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50"><tr>{['Provedor', 'Tipo', 'Capacidades', 'Conexões', 'Status', ''].map((h) => (<th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? Array.from({ length: 3 }).map((_, i) => (<tr key={i}>{Array.from({ length: 6 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>))}</tr>))
              : items.length === 0 ? (<tr><td colSpan={6} className="py-12 text-center"><Phone size={28} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Nenhum provedor homologado.</p></td></tr>)
              : items.map((p) => (
                <tr key={p.id} className={cn('hover:bg-gray-50', !p.active && 'opacity-50')}>
                  <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                  <td className="px-4 py-3"><span className="rounded bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">{kindLabel(p.kind)}</span></td>
                  <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{CAPS.filter(([k]) => p[k as keyof Provider]).map(([k, l]) => <span key={k} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">{l}</span>)}</div></td>
                  <td className="px-4 py-3 tabular-nums text-gray-500">{p.connections}</td>
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
          <div className="my-8 w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold text-gray-900">{editingId ? 'Editar provedor' : 'Novo provedor'}</h2><button onClick={() => setModal(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X size={18} /></button></div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="mb-1 block text-xs font-medium text-gray-700">Nome <span className="text-red-500">*</span></label><input className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex: Twilio Brasil" /></div>
                <div><label className="mb-1 block text-xs font-medium text-gray-700">Tipo</label><select className={inputCls} value={form.kind} onChange={(e) => set('kind', e.target.value)}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="mb-1 block text-xs font-medium text-gray-700">Base URL (opcional)</label><input className={inputCls} value={form.baseUrl} onChange={(e) => set('baseUrl', e.target.value)} /></div>
                <div><label className="mb-1 block text-xs font-medium text-gray-700">Versão da API</label><input className={inputCls} value={form.apiVersion} onChange={(e) => set('apiVersion', e.target.value)} /></div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Capacidades</label>
                <div className="flex flex-wrap gap-4">
                  {CAPS.map(([k, l]) => (
                    <label key={k} className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={form[k as keyof Form] as boolean} onChange={(e) => set(k as keyof Form, e.target.checked as never)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />{l}</label>
                  ))}
                </div>
              </div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Observações</label><input className={inputCls} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></div>
              <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />Ativo</label>
              <p className="rounded-lg bg-gray-50 px-3 py-2 text-[11px] text-gray-500">As credenciais de acesso são cadastradas pela própria loja (BYOC) em Marketing › Telefonia › Conexões. O MASTER nunca vê credencial de tenant.</p>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
            <div className="mt-5 flex justify-end gap-2"><button onClick={() => setModal(false)} className="btn-secondary text-sm">Cancelar</button><button onClick={save} disabled={saving} className="btn-primary text-sm"><Save size={15} />{saving ? 'Salvando...' : 'Salvar'}</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
