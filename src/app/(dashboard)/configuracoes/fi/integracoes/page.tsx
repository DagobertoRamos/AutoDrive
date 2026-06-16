'use client'

// =============================================================================
// Configurações da Loja > F&I > Credenciais e Integrações (Fase 2b.1).
// Credenciais por banco: segredos CIFRADOS no servidor, exibidos MASCARADOS.
// Consome /api/settings/financing/credentials (+[id], +[id]/test) e
// /api/financing/banks. RBAC financing.config (guard no hub + APIs).
// O front NUNCA recebe segredo em texto puro — só maskedHints.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Plus, Pencil, Trash2, X, Save, KeyRound, Lock, ShieldAlert, Plug } from 'lucide-react'
import { cn } from '@/lib/utils'

const CONFIG_ROLES = ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'FINANCEIRO']

type Env = 'HOMOLOGACAO' | 'PRODUCAO'
type Hints = Record<string, string>
interface Row { id: string; bankId: string | null; bankName: string; environment: Env; label: string | null; maskedHints: Hints | null; updatedAt: string }
interface Bank { id: string; name: string }
interface Form { bankId: string; environment: Env; label: string; usuario: string; senha: string; token: string; clientId: string; clientSecret: string; storeCode: string }
const emptyForm: Form = { bankId: '', environment: 'HOMOLOGACAO', label: '', usuario: '', senha: '', token: '', clientId: '', clientSecret: '', storeCode: '' }

const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const date = (s: string) => new Date(s).toLocaleDateString('pt-BR')
const HINT_LABEL: Record<string, string> = { usuario: 'Usuário', senha: 'Senha', token: 'Token', clientId: 'Client ID', clientSecret: 'Client Secret', storeCode: 'Cód. loja' }

export default function FiCredentialsPage() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role
  const allowed = !role || CONFIG_ROLES.includes(role)

  const [items, setItems] = useState<Row[]>([])
  const [banks, setBanks] = useState<Bank[]>([])
  const [loading, setLoading] = useState(true)
  const [cryptoReady, setCryptoReady] = useState(true)
  const [modal, setModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Form>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null)

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/settings/financing/credentials', { credentials: 'include' })
      const json = await res.json()
      setItems(json?.data ?? [])
      setCryptoReady(json?.cryptoReady !== false)
    } catch { setItems([]) } finally { setLoading(false) }
  }, [])
  useEffect(() => { if (allowed) load() }, [allowed, load])

  useEffect(() => {
    if (!allowed) return
    (async () => {
      try {
        const b = await fetch('/api/financing/banks?active=true', { credentials: 'include' }).then((r) => r.json())
        setBanks((b?.data ?? []).map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })))
      } catch { /* sem bancos */ }
    })()
  }, [allowed])

  const openNew = () => { setEditingId(null); setForm(emptyForm); setError(null); setModal(true) }
  // Edição: segredos SEMPRE em branco (nunca recebemos texto puro). Em branco = manter.
  const openEdit = (r: Row) => {
    setEditingId(r.id)
    setForm({ ...emptyForm, bankId: r.bankId ?? '', environment: r.environment, label: r.label ?? '' })
    setError(null); setModal(true)
  }

  const save = async () => {
    if (!form.bankId) { setError('Selecione o banco.'); return }
    setSaving(true); setError(null)
    try {
      // Em edição, só enviamos segredos preenchidos (em branco = manter o atual).
      const secretKeys = ['usuario', 'senha', 'token', 'clientId', 'clientSecret', 'storeCode'] as const
      const payload: Record<string, unknown> = { bankId: form.bankId, environment: form.environment, label: form.label || null }
      for (const k of secretKeys) {
        const v = form[k]?.trim()
        if (editingId) { if (v) payload[k] = v } else { payload[k] = v || null }
      }
      const url = editingId ? `/api/settings/financing/credentials/${editingId}` : '/api/settings/financing/credentials'
      const res = await fetch(url, { method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload) })
      const json = await res.json()
      if (!res.ok) { setError(json?.error ?? 'Erro ao salvar.'); return }
      setModal(false); await load()
    } catch { setError('Erro de rede.') } finally { setSaving(false) }
  }

  const remove = async (r: Row) => {
    if (!confirm(`Excluir a credencial de "${r.bankName}"?`)) return
    await fetch(`/api/settings/financing/credentials/${r.id}`, { method: 'DELETE', credentials: 'include' }); await load()
  }

  const test = async (r: Row) => {
    setTesting(r.id); setToast(null)
    try {
      const res = await fetch(`/api/settings/financing/credentials/${r.id}/test`, { method: 'POST', credentials: 'include' })
      const json = await res.json()
      setToast({ ok: !!json?.success, msg: json?.message ?? json?.error ?? 'Sem resposta.' })
    } catch { setToast({ ok: false, msg: 'Erro de rede ao testar.' }) } finally { setTesting(null) }
  }

  if (session && !allowed) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600"><Lock size={24} /></div>
        <div>
          <p className="text-lg font-semibold text-gray-800">Configuração restrita</p>
          <p className="mt-1 max-w-md text-sm text-gray-500">As credenciais de F&amp;I são gerenciadas por administração/gerência/financeiro.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Credenciais e Integrações</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${items.length} credencial(is) — segredos criptografados e mascarados`}</p>
        </div>
        <button onClick={openNew} disabled={!cryptoReady} className="btn-primary text-sm disabled:opacity-50"><Plus size={15} />Nova credencial</button>
      </div>

      {!cryptoReady && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <ShieldAlert size={18} className="mt-0.5 shrink-0" />
          <span>Criptografia não configurada. Defina <code className="rounded bg-red-100 px-1">FINANCE_ENCRYPTION_KEY</code> (≥16 caracteres) no ambiente (local e na Vercel) para cadastrar credenciais com segurança.</span>
        </div>
      )}

      {toast && (
        <div className={cn('flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm', toast.ok ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700')}>
          <Plug size={16} className="shrink-0" /><span>{toast.msg}</span>
          <button onClick={() => setToast(null)} className="ml-auto rounded p-0.5 hover:bg-black/5"><X size={14} /></button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50"><tr>{['Banco', 'Ambiente', 'Identificação', 'Segredos (mascarados)', 'Atualizado', ''].map((h) => (<th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (<tr key={i}>{Array.from({ length: 6 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>))}</tr>))
              ) : items.length === 0 ? (
                <tr><td colSpan={6} className="py-14 text-center"><KeyRound size={32} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Nenhuma credencial cadastrada.</p></td></tr>
              ) : (
                items.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{r.bankName}</td>
                    <td className="px-4 py-3"><span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', r.environment === 'PRODUCAO' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700')}>{r.environment === 'PRODUCAO' ? 'Produção' : 'Homologação'}</span></td>
                    <td className="px-4 py-3 text-gray-600">{r.label || '—'}</td>
                    <td className="px-4 py-3">
                      {r.maskedHints && Object.keys(r.maskedHints).length ? (
                        <div className="flex flex-wrap gap-1">{Object.entries(r.maskedHints).map(([k, v]) => (<span key={k} className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-600">{HINT_LABEL[k] ?? k}: {v}</span>))}</div>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">{date(r.updatedAt)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button onClick={() => test(r)} disabled={testing === r.id} className="mr-1 inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-50" title="Testar conexão"><Plug size={15} /></button>
                      <button onClick={() => openEdit(r)} className="mr-1 inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Editar"><Pencil size={15} /></button>
                      <button onClick={() => remove(r)} className="inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Excluir"><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={() => setModal(false)}>
          <div className="my-4 w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold text-gray-900">{editingId ? 'Editar credencial' : 'Nova credencial'}</h2><button onClick={() => setModal(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X size={18} /></button></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Banco <span className="text-red-500">*</span></label><select className={inputCls} value={form.bankId} onChange={(e) => set('bankId', e.target.value)}><option value="">Selecione...</option>{banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}{editingId && form.bankId && !banks.some((b) => b.id === form.bankId) && <option value={form.bankId}>Banco atual</option>}</select></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Ambiente</label><select className={inputCls} value={form.environment} onChange={(e) => set('environment', e.target.value as Env)}><option value="HOMOLOGACAO">Homologação</option><option value="PRODUCAO">Produção</option></select></div>
              <div className="col-span-2"><label className="mb-1 block text-xs font-medium text-gray-700">Identificação (opcional)</label><input className={inputCls} value={form.label} onChange={(e) => set('label', e.target.value)} placeholder="Ex: Conta principal, Filial centro..." /></div>

              <div className="col-span-2 mt-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-400"><span>Segredos</span><span className="h-px flex-1 bg-gray-100" /></div>
              {editingId && <p className="col-span-2 -mt-1 text-[11px] text-gray-500">Deixe em branco para manter o segredo atual. Preencha apenas o que deseja substituir.</p>}

              <div><label className="mb-1 block text-xs font-medium text-gray-700">Usuário</label><input className={inputCls} value={form.usuario} onChange={(e) => set('usuario', e.target.value)} autoComplete="off" /></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Senha</label><input type="password" className={inputCls} value={form.senha} onChange={(e) => set('senha', e.target.value)} autoComplete="new-password" placeholder={editingId ? '•••••••• (manter)' : ''} /></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Client ID</label><input className={inputCls} value={form.clientId} onChange={(e) => set('clientId', e.target.value)} autoComplete="off" /></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Client Secret</label><input type="password" className={inputCls} value={form.clientSecret} onChange={(e) => set('clientSecret', e.target.value)} autoComplete="new-password" placeholder={editingId ? '•••••••• (manter)' : ''} /></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Token</label><input type="password" className={inputCls} value={form.token} onChange={(e) => set('token', e.target.value)} autoComplete="new-password" placeholder={editingId ? '•••••••• (manter)' : ''} /></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Cód. loja</label><input className={inputCls} value={form.storeCode} onChange={(e) => set('storeCode', e.target.value)} autoComplete="off" /></div>

              {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}
            </div>
            <div className="mt-5 flex justify-end gap-2"><button onClick={() => setModal(false)} className="btn-secondary text-sm">Cancelar</button><button onClick={save} disabled={saving} className="btn-primary text-sm"><Save size={15} />{saving ? 'Salvando...' : 'Salvar'}</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
