'use client'

// =============================================================================
// Configurações de WhatsApp da LOJA (BYOC, multi-provedor).
// Cada loja escolhe o provedor (Meta Cloud API, Twilio, ...) e informa as
// próprias credenciais. Os campos do formulário vêm do registry de adaptadores
// (/api/settings/whatsapp/providers). Webhook só aparece p/ Meta.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { MessageSquare, Save, Eye, EyeOff, Loader2, CheckCircle2, AlertCircle, RefreshCw, Link2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Field { key: string; label: string; secret?: boolean; required?: boolean; placeholder?: string; help?: string }
interface Provider { kind: string; label: string; fields: Field[] }

export default function WhatsAppConfigPage() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [provider, setProvider] = useState('META')
  const [values, setValues] = useState<Record<string, string>>({})
  const [active, setActive] = useState(true)
  const [hasConfig, setHasConfig] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [show, setShow] = useState<Record<string, boolean>>({})
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null)
  const [webhookUrl, setWebhookUrl] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [pRes, cRes] = await Promise.all([
        fetch('/api/settings/whatsapp/providers', { credentials: 'include' }).then((r) => r.json()).catch(() => ({})),
        fetch('/api/settings/whatsapp', { credentials: 'include' }).then((r) => r.json()).catch(() => ({})),
      ])
      const provs: Provider[] = pRes?.data ?? []
      setProviders(provs)
      const cfg = cRes?.data
      if (cfg) {
        setHasConfig(true)
        const kind = String(cfg.provider ?? provs[0]?.kind ?? 'META').toUpperCase()
        setProvider(kind)
        setActive(cfg.active !== false)
        // valores não-secretos do provedor atual; segredos ficam em branco (mantêm).
        const secretKeys = new Set((provs.find((p) => p.kind === kind)?.fields ?? []).filter((f) => f.secret).map((f) => f.key))
        const v: Record<string, string> = {}
        for (const [k, val] of Object.entries(cfg)) {
          if (['id', 'provider', 'active'].includes(k) || secretKeys.has(k)) continue
          v[k] = val == null ? '' : String(val)
        }
        setValues(v)
      } else if (provs.length) {
        setProvider(provs[0].kind)
      }
      if (typeof window !== 'undefined') setWebhookUrl(`${window.location.origin}/api/webhook/meta`)
    } catch { /* silent */ } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const current = providers.find((p) => p.kind === provider)
  const set = (k: string, v: string) => setValues((s) => ({ ...s, [k]: v }))

  const save = async () => {
    setSaving(true); setFeedback(null)
    try {
      const body: Record<string, unknown> = { provider, active }
      for (const f of current?.fields ?? []) body[f.key] = values[f.key] ?? ''
      const res = await fetch('/api/settings/whatsapp', {
        method: hasConfig ? 'PATCH' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      setFeedback({ ok: !!data.success, msg: data.success ? 'Configuração de WhatsApp salva.' : (data.error ?? 'Erro ao salvar.') })
      if (data.success) { setHasConfig(true); /* limpa segredos digitados */ setValues((s) => { const c = { ...s }; for (const f of current?.fields ?? []) if (f.secret) c[f.key] = ''; return c }) }
    } catch { setFeedback({ ok: false, msg: 'Erro de conexão.' }) } finally { setSaving(false) }
  }

  if (loading) {
    return <div className="max-w-2xl space-y-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-100" />)}</div>
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">WhatsApp da loja</h1>
        <p className="mt-0.5 text-sm text-gray-500">Cada loja usa o próprio provedor e credenciais. Os avisos (fila, notificações) saem por este número.</p>
      </div>

      {feedback && (
        <div className={cn('flex items-center gap-2 rounded-xl px-4 py-3 text-sm', feedback.ok ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700')}>
          {feedback.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}{feedback.msg}
        </div>
      )}

      <div className="card">
        <div className="section-header"><MessageSquare size={15} className="text-brand-700" /><h2 className="text-sm font-semibold text-gray-800">Provedor</h2></div>
        <div className="space-y-4 p-4">
          <div>
            <label className="label">Provedor de WhatsApp</label>
            <select value={provider} onChange={(e) => setProvider(e.target.value)} className="input">
              {providers.map((p) => <option key={p.kind} value={p.kind}>{p.label}</option>)}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {(current?.fields ?? []).map((f) => (
              <div key={f.key} className={cn(f.secret && 'sm:col-span-2')}>
                <label className="label">{f.label}{f.required && ' *'}</label>
                {f.secret ? (
                  <div className="relative">
                    <input value={values[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} type={show[f.key] ? 'text' : 'password'} placeholder={hasConfig ? '(mantém o valor atual)' : f.placeholder} className="input pr-10 font-mono text-xs" />
                    <button type="button" onClick={() => setShow((s) => ({ ...s, [f.key]: !s[f.key] }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">{show[f.key] ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                  </div>
                ) : (
                  <input value={values[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder} className="input font-mono" />
                )}
                {f.help && <p className="mt-1 text-xs text-gray-400">{f.help}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {provider === 'META' && (
        <div className="card">
          <div className="section-header"><Link2 size={15} className="text-brand-700" /><h2 className="text-sm font-semibold text-gray-800">Webhook (Meta)</h2></div>
          <div className="p-4">
            <label className="label">URL do Webhook</label>
            <div className="flex gap-2">
              <input value={webhookUrl} readOnly className="input flex-1 bg-gray-50 font-mono text-xs text-gray-600" />
              <button onClick={() => navigator.clipboard.writeText(webhookUrl)} className="btn-secondary shrink-0 text-xs" title="Copiar URL">Copiar</button>
            </div>
            <p className="mt-1 text-xs text-gray-400">Configure no Meta for Developers → Webhooks, usando o Webhook Verify Token acima. Assine <span className="font-mono">messages</span> e <span className="font-mono">message_status</span>.</p>
          </div>
        </div>
      )}

      <div className="card">
        <div className="flex items-center gap-3 p-4">
          <input type="checkbox" id="wa_active" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
          <div>
            <label htmlFor="wa_active" className="text-sm font-medium text-gray-700">WhatsApp ativo nesta loja</label>
            <p className="text-xs text-gray-400">Desativado, nenhuma mensagem WhatsApp é disparada por esta loja.</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button onClick={load} disabled={loading} className="btn-secondary text-xs"><RefreshCw size={13} className={cn(loading && 'animate-spin')} />Recarregar</button>
        <button onClick={save} disabled={saving} className="btn-primary">{saving ? <><Loader2 size={14} className="animate-spin" />Salvando...</> : <><Save size={14} />Salvar configuração</>}</button>
      </div>
    </div>
  )
}
