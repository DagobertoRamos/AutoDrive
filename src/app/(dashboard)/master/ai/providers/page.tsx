'use client'

// =============================================================================
// Master > IA > Provedores / Conectores. MASTER-only.
// CRUD de provedores de IA: chaves cifradas (mascaradas), capacidades, limites,
// ambiente, testar conexão. Segredos nunca voltam ao front. Consome
// /api/master/ai/providers (+[id], +[id]/test).
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Plug, Plus, Pencil, Trash2, X, Save, Lock, Power, ShieldAlert, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

const KINDS = ['GEMINI', 'OPENAI', 'ANTHROPIC', 'CUSTOM'] as const
type Kind = (typeof KINDS)[number]
const KIND_LABEL: Record<Kind, string> = { GEMINI: 'Gemini', OPENAI: 'OpenAI', ANTHROPIC: 'Anthropic/Claude', CUSTOM: 'Customizado (Mock)' }
type Hints = Record<string, string>
interface Provider { id: string; name: string; code: string; kind: Kind; priority: number; model: string | null; authType: string | null; baseUrl: string | null; active: boolean; environment: 'SANDBOX' | 'PRODUCAO'; maxTokensPerRequest: number | null; dailyLimit: number | null; monthlyLimit: number | null; timeoutMs: number | null; allowPdf: boolean; allowImage: boolean; allowReports: boolean; allowHelpChat: boolean; allowDocAnalysis: boolean; maskedHints: Hints | null; notes: string | null }
interface Form { name: string; code: string; kind: Kind; priority: string; model: string; authType: string; baseUrl: string; active: boolean; environment: 'SANDBOX' | 'PRODUCAO'; maxTokensPerRequest: string; dailyLimit: string; monthlyLimit: string; timeoutMs: string; allowPdf: boolean; allowImage: boolean; allowReports: boolean; allowHelpChat: boolean; allowDocAnalysis: boolean; notes: string; apiKey: string; clientSecret: string }
const empty: Form = { name: '', code: '', kind: 'CUSTOM', priority: '100', model: '', authType: 'API_KEY', baseUrl: '', active: false, environment: 'SANDBOX', maxTokensPerRequest: '', dailyLimit: '', monthlyLimit: '', timeoutMs: '', allowPdf: false, allowImage: false, allowReports: false, allowHelpChat: false, allowDocAnalysis: false, notes: '', apiKey: '', clientSecret: '' }

const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const CAPS: { key: keyof Form; label: string }[] = [
  { key: 'allowPdf', label: 'PDF' }, { key: 'allowImage', label: 'Imagem' }, { key: 'allowReports', label: 'Relatórios' }, { key: 'allowHelpChat', label: 'Chat ajuda' }, { key: 'allowDocAnalysis', label: 'Análise doc' },
]

export default function MasterAiProvidersPage() {
  const { data: session } = useSession()
  const isMaster = !((session?.user as { role?: string })?.role) || (session?.user as { role?: string })?.role === 'MASTER'

  const [items, setItems] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)
  const [cryptoReady, setCryptoReady] = useState(true)
  const [modal, setModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Form>(empty)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [testingGemini, setTestingGemini] = useState(false)
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))

  // Testa o Gemini com a chave do SERVIDOR (process.env.GEMINI_API_KEY) — a
  // chave nunca trafega para o front; o backend só devolve ok/mensagem.
  const testGemini = async () => {
    setTestingGemini(true); setToast(null)
    try {
      const r = await fetch('/api/master/ai/test-gemini', { method: 'POST', credentials: 'include' }).then((x) => x.json())
      setToast({ ok: !!r?.success, msg: r?.message ?? r?.error ?? 'Sem resposta.' })
    } catch { setToast({ ok: false, msg: 'Erro de rede ao testar o Gemini.' }) } finally { setTestingGemini(false) }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await fetch('/api/master/ai/providers', { credentials: 'include' }).then((x) => x.json()); setItems(r?.data ?? []); setCryptoReady(r?.cryptoReady !== false) }
    catch { setItems([]) } finally { setLoading(false) }
  }, [])
  useEffect(() => { if (isMaster) load() }, [isMaster, load])

  const openNew = () => { setEditingId(null); setForm(empty); setError(null); setModal(true) }
  const openEdit = (p: Provider) => {
    setEditingId(p.id)
    setForm({ name: p.name, code: p.code, kind: p.kind, priority: p.priority?.toString() ?? '100', model: p.model ?? '', authType: p.authType ?? '', baseUrl: p.baseUrl ?? '', active: p.active, environment: p.environment, maxTokensPerRequest: p.maxTokensPerRequest?.toString() ?? '', dailyLimit: p.dailyLimit?.toString() ?? '', monthlyLimit: p.monthlyLimit?.toString() ?? '', timeoutMs: p.timeoutMs?.toString() ?? '', allowPdf: p.allowPdf, allowImage: p.allowImage, allowReports: p.allowReports, allowHelpChat: p.allowHelpChat, allowDocAnalysis: p.allowDocAnalysis, notes: p.notes ?? '', apiKey: '', clientSecret: '' })
    setError(null); setModal(true)
  }

  const save = async () => {
    if (!form.name.trim()) { setError('Informe o nome.'); return }
    if (!editingId && !/^[a-z0-9][a-z0-9_-]{1,40}$/.test(form.code)) { setError('Código: minúsculas/números/-/_ (2-41).'); return }
    setSaving(true); setError(null)
    try {
      const num = (s: string) => (s.trim() ? Number(s) : null)
      const base: Record<string, unknown> = { name: form.name, kind: form.kind, priority: Number(form.priority) || 100, model: form.model || null, authType: form.authType || null, baseUrl: form.baseUrl || null, active: form.active, environment: form.environment, maxTokensPerRequest: num(form.maxTokensPerRequest), dailyLimit: num(form.dailyLimit), monthlyLimit: num(form.monthlyLimit), timeoutMs: num(form.timeoutMs), allowPdf: form.allowPdf, allowImage: form.allowImage, allowReports: form.allowReports, allowHelpChat: form.allowHelpChat, allowDocAnalysis: form.allowDocAnalysis, notes: form.notes || null }
      if (!editingId) base.code = form.code
      // segredos: em branco na edição = manter
      if (form.apiKey.trim()) base.apiKey = form.apiKey.trim()
      if (form.clientSecret.trim()) base.clientSecret = form.clientSecret.trim()
      else if (!editingId) base.clientSecret = null
      if (!editingId && !form.apiKey.trim()) base.apiKey = null
      const url = editingId ? `/api/master/ai/providers/${editingId}` : '/api/master/ai/providers'
      const res = await fetch(url, { method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(base) })
      const json = await res.json()
      if (!res.ok) { setError(json?.error ?? 'Erro ao salvar.'); return }
      setModal(false); await load()
    } catch { setError('Erro de rede.') } finally { setSaving(false) }
  }
  const toggle = async (p: Provider) => { await fetch(`/api/master/ai/providers/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ active: !p.active }) }); await load() }
  const remove = async (p: Provider) => { if (!confirm(`Excluir o provedor "${p.name}"?`)) return; await fetch(`/api/master/ai/providers/${p.id}`, { method: 'DELETE', credentials: 'include' }); await load() }
  const test = async (p: Provider) => {
    setTesting(p.id); setToast(null)
    try { const r = await fetch(`/api/master/ai/providers/${p.id}/test`, { method: 'POST', credentials: 'include' }).then((x) => x.json()); setToast({ ok: !!r?.success, msg: r?.message ?? r?.error ?? 'Sem resposta.' }) }
    catch { setToast({ ok: false, msg: 'Erro de rede ao testar.' }) } finally { setTesting(null) }
  }

  if (session && !isMaster) return <div className="flex flex-col items-center justify-center gap-4 py-20 text-center"><div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600"><Lock size={24} /></div><p className="text-lg font-semibold text-gray-800">Área exclusiva do MASTER</p></div>

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><Plug size={20} className="text-brand-600" />Provedores / Conectores de IA</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${items.length} provedor(es) — chaves cifradas e mascaradas`}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={testGemini} disabled={testingGemini} className="btn-secondary text-sm disabled:opacity-50"><Zap size={15} />{testingGemini ? 'Testando...' : 'Testar conexão Gemini'}</button>
          <button onClick={openNew} disabled={!cryptoReady} className="btn-primary text-sm disabled:opacity-50"><Plus size={15} />Novo provedor</button>
        </div>
      </div>

      {!cryptoReady && <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><ShieldAlert size={18} className="mt-0.5 shrink-0" /><span>Defina <code className="rounded bg-red-100 px-1">AI_ENCRYPTION_KEY</code> (≥16) no ambiente para cadastrar provedores com chave.</span></div>}
      {toast && <div className={cn('flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm', toast.ok ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700')}><Zap size={16} className="shrink-0" /><span>{toast.msg}</span><button onClick={() => setToast(null)} className="ml-auto rounded p-0.5 hover:bg-black/5"><X size={14} /></button></div>}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50"><tr>{['Prior.', 'Provedor', 'Tipo', 'Ambiente', 'Capacidades', 'Chave', 'Status', ''].map((h) => (<th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? Array.from({ length: 3 }).map((_, i) => (<tr key={i}>{Array.from({ length: 8 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>))}</tr>))
              : items.length === 0 ? (<tr><td colSpan={8} className="py-14 text-center"><Plug size={30} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Nenhum provedor. Crie um (use “Customizado (Mock)” para testar sem custo).</p></td></tr>)
              : items.map((p) => (
                <tr key={p.id} className={cn('hover:bg-gray-50', !p.active && 'opacity-50')}>
                  <td className="px-4 py-3 text-center"><span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-600">{p.priority}</span></td>
                  <td className="px-4 py-3 font-medium text-gray-900">{p.name}<span className="ml-1 font-mono text-[11px] text-gray-400">{p.code}</span></td>
                  <td className="px-4 py-3 text-gray-600">{KIND_LABEL[p.kind]}</td>
                  <td className="px-4 py-3"><span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', p.environment === 'PRODUCAO' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700')}>{p.environment === 'PRODUCAO' ? 'Produção' : 'Sandbox'}</span></td>
                  <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{CAPS.filter((c) => p[c.key as keyof Provider]).map((c) => <span key={c.key} className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-700">{c.label}</span>)}{!CAPS.some((c) => p[c.key as keyof Provider]) && <span className="text-xs text-gray-400">—</span>}</div></td>
                  <td className="px-4 py-3 font-mono text-[11px] text-gray-500">{p.maskedHints?.apiKey ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{p.active ? 'Ativo' : 'Inativo'}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button onClick={() => test(p)} disabled={testing === p.id} className="mr-1 inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-50" title="Testar conexão"><Zap size={15} /></button>
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
          <div className="my-4 w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold text-gray-900">{editingId ? 'Editar provedor' : 'Novo provedor'}</h2><button onClick={() => setModal(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X size={18} /></button></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Nome <span className="text-red-500">*</span></label><input className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex: Gemini Produção" /></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Código interno <span className="text-red-500">*</span></label><input className={cn(inputCls, 'font-mono')} value={form.code} onChange={(e) => set('code', e.target.value)} disabled={!!editingId} placeholder="gemini-prod" /></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Provedor</label><select className={inputCls} value={form.kind} onChange={(e) => set('kind', e.target.value as Kind)}>{KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Prioridade (failover)</label><input type="number" min={1} max={999} className={inputCls} value={form.priority} onChange={(e) => set('priority', e.target.value)} placeholder="1 = tentado primeiro" /></div>
              <div className="col-span-2"><label className="mb-1 block text-xs font-medium text-gray-700">Modelo padrão</label><input className={inputCls} value={form.model} onChange={(e) => set('model', e.target.value)} placeholder="gemini-2.0-flash" /></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Tipo de auth</label><input className={inputCls} value={form.authType} onChange={(e) => set('authType', e.target.value)} placeholder="API_KEY" /></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Ambiente</label><select className={inputCls} value={form.environment} onChange={(e) => set('environment', e.target.value as 'SANDBOX' | 'PRODUCAO')}><option value="SANDBOX">Sandbox</option><option value="PRODUCAO">Produção</option></select></div>
              <div className="col-span-2"><label className="mb-1 block text-xs font-medium text-gray-700">Endpoint customizado (opcional)</label><input className={inputCls} value={form.baseUrl} onChange={(e) => set('baseUrl', e.target.value)} placeholder="https://api..." /></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">API Key</label><input type="password" className={inputCls} value={form.apiKey} onChange={(e) => set('apiKey', e.target.value)} autoComplete="new-password" placeholder={editingId ? '•••••••• (manter)' : ''} /></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Client Secret</label><input type="password" className={inputCls} value={form.clientSecret} onChange={(e) => set('clientSecret', e.target.value)} autoComplete="new-password" placeholder={editingId ? '•••••••• (manter)' : ''} /></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Máx. tokens/req</label><input type="number" min={1} className={inputCls} value={form.maxTokensPerRequest} onChange={(e) => set('maxTokensPerRequest', e.target.value)} placeholder="4000" /></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Timeout (ms)</label><input type="number" min={1} className={inputCls} value={form.timeoutMs} onChange={(e) => set('timeoutMs', e.target.value)} placeholder="30000" /></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Limite diário</label><input type="number" min={0} className={inputCls} value={form.dailyLimit} onChange={(e) => set('dailyLimit', e.target.value)} /></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Limite mensal</label><input type="number" min={0} className={inputCls} value={form.monthlyLimit} onChange={(e) => set('monthlyLimit', e.target.value)} /></div>
              <div className="col-span-2"><label className="mb-1 block text-xs font-medium text-gray-700">Capacidades permitidas</label><div className="flex flex-wrap gap-3">{CAPS.map((c) => (<label key={c.key} className="flex items-center gap-1.5 text-sm text-gray-700"><input type="checkbox" checked={form[c.key] as boolean} onChange={(e) => set(c.key, e.target.checked as never)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />{c.label}</label>))}</div></div>
              <label className="col-span-2 flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />Ativo</label>
              <div className="col-span-2"><label className="mb-1 block text-xs font-medium text-gray-700">Observações</label><textarea className={cn(inputCls, 'min-h-[48px] resize-y')} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></div>
              {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}
            </div>
            <div className="mt-5 flex justify-end gap-2"><button onClick={() => setModal(false)} className="btn-secondary text-sm">Cancelar</button><button onClick={save} disabled={saving} className="btn-primary text-sm"><Save size={15} />{saving ? 'Salvando...' : 'Salvar'}</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
