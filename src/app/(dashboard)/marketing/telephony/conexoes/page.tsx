'use client'

// =============================================================================
// Marketing > Telefonia > Conexões — BYOC via /api/marketing/telephony/connections.
// Leitura: marketing.telephony | gestão: marketing.telephony.manage.
// Credenciais cifradas no backend; o front só vê hints mascarados.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Phone, Plus, Pencil, Trash2, X, Save, Power, PlugZap } from 'lucide-react'
import { cn } from '@/lib/utils'

const MANAGE_ROLES = ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO']
const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

interface Provider { id: string; name: string; kind: string }
interface Conn { id: string; providerId: string; provider: Provider; environment: string; active: boolean; label: string | null; webhookActive: boolean; lastTestStatus: string | null; hasCredentials: boolean; maskedHints: Record<string, string> | null }
interface Form { providerId: string; environment: string; label: string; webhookActive: boolean; secrets: string }
const empty: Form = { providerId: '', environment: 'PRODUCAO', label: '', webhookActive: false, secrets: '' }

export default function TelephonyConnectionsPage() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role
  const canManage = !role || MANAGE_ROLES.includes(role)

  const [providers, setProviders] = useState<Provider[]>([])
  const [items, setItems] = useState<Conn[]>([])
  const [cryptoReady, setCryptoReady] = useState(true)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [modal, setModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Form>(empty)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))
  const flash = (msg: string, ok: boolean) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 4000) }

  const load = useCallback(async () => {
    setLoading(true); setDenied(false)
    try {
      const [cRes, pRes] = await Promise.all([
        fetch('/api/marketing/telephony/connections', { credentials: 'include' }),
        fetch('/api/marketing/telephony/providers', { credentials: 'include' }),
      ])
      if (cRes.status === 403) { setDenied(true); return }
      const cj = await cRes.json(); setItems(cj?.data ?? []); setCryptoReady(cj?.cryptoReady ?? true)
      setProviders((await pRes.json())?.data ?? [])
    } catch { /* noop */ } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const openNew = () => { setEditingId(null); setForm({ ...empty, providerId: providers[0]?.id ?? '' }); setError(null); setModal(true) }
  const openEdit = (c: Conn) => { setEditingId(c.id); setForm({ providerId: c.providerId, environment: c.environment, label: c.label ?? '', webhookActive: c.webhookActive, secrets: '' }); setError(null); setModal(true) }
  const save = async () => {
    if (!editingId && !form.providerId) { setError('Selecione o provedor.'); return }
    let secrets: unknown = undefined
    if (form.secrets.trim()) { try { secrets = JSON.parse(form.secrets) } catch { setError('Credenciais (JSON) inválidas.'); return } }
    setSaving(true); setError(null)
    try {
      const body = editingId
        ? { environment: form.environment, label: form.label || null, webhookActive: form.webhookActive, ...(secrets ? { secrets } : {}) }
        : { providerId: form.providerId, environment: form.environment, label: form.label || null, webhookActive: form.webhookActive, ...(secrets ? { secrets } : {}) }
      const url = editingId ? `/api/marketing/telephony/connections/${editingId}` : '/api/marketing/telephony/connections'
      const res = await fetch(url, { method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) })
      const j = await res.json(); if (!res.ok) { setError(j?.error ?? 'Erro ao salvar.'); return }
      setModal(false); await load()
    } catch { setError('Erro de rede.') } finally { setSaving(false) }
  }
  const toggle = async (c: Conn) => { await fetch(`/api/marketing/telephony/connections/${c.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ active: !c.active }) }); await load() }
  const remove = async (c: Conn) => { if (!confirm('Excluir esta conexão e suas credenciais?')) return; await fetch(`/api/marketing/telephony/connections/${c.id}`, { method: 'DELETE', credentials: 'include' }); await load() }
  const test = async (c: Conn) => {
    setTesting(c.id)
    try {
      const res = await fetch(`/api/marketing/telephony/connections/${c.id}/test`, { method: 'POST', credentials: 'include' })
      const j = await res.json(); flash(j?.test?.message ?? j?.error ?? 'Teste concluído.', !!j?.test?.ok); await load()
    } catch { flash('Erro de rede.', false) } finally { setTesting(null) }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><Phone size={20} className="text-brand-600" />Conexões de Telefonia</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${items.length} conexão(ões) — credenciais da própria loja (BYOC)`}</p>
        </div>
        {canManage && <button onClick={openNew} disabled={providers.length === 0} className="btn-primary text-sm disabled:opacity-50" title={providers.length === 0 ? 'Nenhum provedor disponível' : ''}><Plus size={15} />Nova conexão</button>}
      </div>

      {!cryptoReady && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">⚠️ A chave de criptografia de telefonia (TELEPHONY_ENCRYPTION_KEY) não está configurada no servidor — não é possível salvar credenciais com segurança.</div>}
      {toast && <div className={cn('rounded-lg px-4 py-2 text-sm', toast.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600')}>{toast.msg}</div>}

      {denied ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Seu perfil não tem acesso à telefonia.</div>
      ) : (
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50"><tr>{['Provedor', 'Rótulo', 'Ambiente', 'Credenciais', 'Último teste', 'Status', ''].map((h) => (<th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? Array.from({ length: 2 }).map((_, i) => (<tr key={i}>{Array.from({ length: 7 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>))}</tr>))
              : items.length === 0 ? (<tr><td colSpan={7} className="py-12 text-center"><Phone size={28} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Nenhuma conexão cadastrada.</p></td></tr>)
              : items.map((c) => (
                <tr key={c.id} className={cn('hover:bg-gray-50', !c.active && 'opacity-50')}>
                  <td className="px-4 py-3 font-medium text-gray-900">{c.provider?.name}<span className="ml-1 text-xs text-gray-400">({c.provider?.kind})</span></td>
                  <td className="px-4 py-3 text-gray-600">{c.label || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{c.environment}</td>
                  <td className="px-4 py-3 text-xs">{c.hasCredentials ? <span className="text-green-700">{Object.values(c.maskedHints ?? {})[0] ?? 'configuradas'}</span> : <span className="text-gray-400">—</span>}</td>
                  <td className="px-4 py-3 text-xs">{c.lastTestStatus ? <span className={cn(c.lastTestStatus === 'OK' ? 'text-green-700' : 'text-red-600')}>{c.lastTestStatus}</span> : '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{c.active ? 'Ativa' : 'Inativa'}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {canManage && <>
                      <button onClick={() => test(c)} disabled={testing === c.id} className="mr-1 inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-brand-50 hover:text-brand-700" title="Testar conexão"><PlugZap size={15} className={cn(testing === c.id && 'animate-pulse')} /></button>
                      <button onClick={() => toggle(c)} className="mr-1 inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title={c.active ? 'Inativar' : 'Ativar'}><Power size={15} /></button>
                      <button onClick={() => openEdit(c)} className="mr-1 inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Editar"><Pencil size={15} /></button>
                      <button onClick={() => remove(c)} className="inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Excluir"><Trash2 size={15} /></button>
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
            <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold text-gray-900">{editingId ? 'Editar conexão' : 'Nova conexão'}</h2><button onClick={() => setModal(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X size={18} /></button></div>
            <div className="space-y-3">
              {!editingId && <div><label className="mb-1 block text-xs font-medium text-gray-700">Provedor <span className="text-red-500">*</span></label><select className={inputCls} value={form.providerId} onChange={(e) => set('providerId', e.target.value)}>{providers.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.kind})</option>)}</select></div>}
              <div className="grid grid-cols-2 gap-3">
                <div><label className="mb-1 block text-xs font-medium text-gray-700">Ambiente</label><select className={inputCls} value={form.environment} onChange={(e) => set('environment', e.target.value)}><option value="PRODUCAO">Produção</option><option value="HOMOLOGACAO">Homologação</option></select></div>
                <div><label className="mb-1 block text-xs font-medium text-gray-700">Rótulo</label><input className={inputCls} value={form.label} onChange={(e) => set('label', e.target.value)} /></div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Credenciais (JSON){editingId && ' — preencha só p/ rotacionar'}</label>
                <textarea className={cn(inputCls, 'h-24 font-mono text-xs')} value={form.secrets} onChange={(e) => set('secrets', e.target.value)} placeholder='{ "accountSid": "...", "authToken": "...", "webhookSecret": "..." }' />
                <p className="mt-1 text-[11px] text-gray-400">Cifradas no servidor; nunca exibidas em texto puro.</p>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={form.webhookActive} onChange={(e) => set('webhookActive', e.target.checked)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />Webhook ativo</label>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
            <div className="mt-5 flex justify-end gap-2"><button onClick={() => setModal(false)} className="btn-secondary text-sm">Cancelar</button><button onClick={save} disabled={saving} className="btn-primary text-sm"><Save size={15} />{saving ? 'Salvando...' : 'Salvar'}</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
