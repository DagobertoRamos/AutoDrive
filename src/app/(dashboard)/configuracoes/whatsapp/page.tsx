'use client'

// =============================================================================
// Configurações de WhatsApp — AutoDrive
// Provider Meta/Cloud API + webhook + templates oficiais
// Apenas MASTER pode configurar o gateway. Tenants veem aviso de configuração centralizada.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import {
  MessageSquare, Save, Eye, EyeOff, Loader2,
  CheckCircle2, AlertCircle, RefreshCw, Link2, Lock,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface WhatsAppConfig {
  id?:             string
  provider:        string
  phoneNumberId:   string
  businessAccountId: string
  accessToken:     string
  webhookVerifyToken: string
  active:          boolean
}

const DEFAULTS: WhatsAppConfig = {
  provider: 'META',
  phoneNumberId: '',
  businessAccountId: '',
  accessToken: '',
  webhookVerifyToken: '',
  active: true,
}

export default function WhatsAppConfigPage() {
  const { data: session } = useSession()
  const isMaster = (session?.user as { role?: string })?.role === 'MASTER'

  const [config, setConfig]           = useState<WhatsAppConfig>(DEFAULTS)
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [showToken, setShowToken]     = useState(false)
  const [feedback, setFeedback]       = useState<{ ok: boolean; msg: string } | null>(null)
  const [webhookUrl, setWebhookUrl]   = useState('')

  const fetchConfig = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/settings/whatsapp', { credentials: 'include' })
      const data = await res.json()
      if (data.success && data.data) {
        setConfig({ ...DEFAULTS, ...data.data, accessToken: '' })
      }
      // Monta URL do webhook
      if (typeof window !== 'undefined') {
        setWebhookUrl(`${window.location.origin}/api/webhook/meta`)
      }
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchConfig() }, [fetchConfig])

  if (session && !isMaster) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-green-600">
          <Lock size={24} />
        </div>
        <div>
          <p className="text-lg font-semibold text-gray-800">Configuração centralizada</p>
          <p className="mt-1 max-w-md text-sm text-gray-500">
            As configurações de WhatsApp são gerenciadas globalmente pelo administrador da plataforma.
            Entre em contato com o suporte para ajustes de integração.
          </p>
        </div>
      </div>
    )
  }

  const set = (key: keyof WhatsAppConfig, value: unknown) =>
    setConfig((p) => ({ ...p, [key]: value }))

  const handleSave = async () => {
    setSaving(true)
    setFeedback(null)
    try {
      const res  = await fetch('/api/settings/whatsapp', {
        method:  config.id ? 'PATCH' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      const data = await res.json()
      setFeedback({
        ok:  data.success,
        msg: data.success
          ? 'Configuração do WhatsApp salva com sucesso.'
          : (data.error ?? 'Erro ao salvar.'),
      })
      if (data.success && data.data) {
        setConfig((p) => ({ ...p, id: data.data.id, accessToken: '' }))
      }
    } catch {
      setFeedback({ ok: false, msg: 'Erro de conexão.' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-100" />
        ))}
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Configuração de WhatsApp</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Integração com Meta Cloud API para envio de mensagens WhatsApp Business.
        </p>
      </div>

      {feedback && (
        <div className={cn(
          'flex items-center gap-2 rounded-xl px-4 py-3 text-sm animate-fade-in',
          feedback.ok
            ? 'bg-green-50 border border-green-200 text-green-700'
            : 'bg-red-50 border border-red-200 text-red-700',
        )}>
          {feedback.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
          {feedback.msg}
        </div>
      )}

      {/* ── Provider ──────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="section-header">
          <MessageSquare size={15} className="text-brand-700" />
          <h2 className="text-sm font-semibold text-gray-800">Credenciais Meta (WhatsApp Cloud API)</h2>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Phone Number ID *</label>
              <input
                value={config.phoneNumberId}
                onChange={(e) => set('phoneNumberId', e.target.value)}
                placeholder="123456789012345"
                className="input font-mono"
              />
              <p className="mt-1 text-xs text-gray-400">
                Encontrado em Meta for Developers → WhatsApp → Configuração.
              </p>
            </div>
            <div>
              <label className="label">Business Account ID *</label>
              <input
                value={config.businessAccountId}
                onChange={(e) => set('businessAccountId', e.target.value)}
                placeholder="987654321098765"
                className="input font-mono"
              />
            </div>
          </div>

          <div>
            <label className="label">Access Token (permanente) *</label>
            <div className="relative">
              <input
                value={config.accessToken}
                onChange={(e) => set('accessToken', e.target.value)}
                placeholder={config.id ? '(mantém o token atual)' : 'EAAxxxxxxx...'}
                type={showToken ? 'text' : 'password'}
                className="input pr-10 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setShowToken((p) => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-400">
              Use um token permanente (System User) para não expirar.
            </p>
          </div>
        </div>
      </div>

      {/* ── Webhook ───────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="section-header">
          <Link2 size={15} className="text-brand-700" />
          <h2 className="text-sm font-semibold text-gray-800">Webhook</h2>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="label">URL do Webhook</label>
            <div className="flex gap-2">
              <input
                value={webhookUrl}
                readOnly
                className="input flex-1 bg-gray-50 font-mono text-xs text-gray-600"
              />
              <button
                onClick={() => navigator.clipboard.writeText(webhookUrl)}
                className="btn-secondary text-xs shrink-0"
                title="Copiar URL"
              >
                Copiar
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-400">
              Configure esta URL no painel do Meta for Developers → Webhooks.
            </p>
          </div>

          <div>
            <label className="label">Token de Verificação do Webhook *</label>
            <input
              value={config.webhookVerifyToken}
              onChange={(e) => set('webhookVerifyToken', e.target.value)}
              placeholder="meu_token_secreto_aqui"
              className="input font-mono"
            />
            <p className="mt-1 text-xs text-gray-400">
              Defina este token no Meta for Developers na seção Webhook → Verify Token.
            </p>
          </div>
        </div>
      </div>

      {/* ── Status ────────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="p-4">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="whatsapp_active"
              checked={config.active}
              onChange={(e) => set('active', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            <div>
              <label htmlFor="whatsapp_active" className="text-sm font-medium text-gray-700">
                Integração WhatsApp ativa
              </label>
              <p className="text-xs text-gray-400">
                Desativando, nenhuma mensagem WhatsApp será disparada pelo sistema.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Botão salvar ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <button onClick={fetchConfig} disabled={loading} className="btn-secondary text-xs">
          <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
          Recarregar
        </button>
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving
            ? <><Loader2 size={14} className="animate-spin" />Salvando...</>
            : <><Save size={14} />Salvar configuração</>}
        </button>
      </div>

      {/* ── Nota de configuração ──────────────────────────────────────────── */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
        <p className="font-semibold mb-1">Passos para configurar a integração</p>
        <ol className="space-y-1 text-xs list-decimal list-inside text-amber-600">
          <li>Acesse <span className="font-mono">developers.facebook.com</span> e crie um aplicativo tipo "Business".</li>
          <li>Adicione o produto "WhatsApp" ao aplicativo.</li>
          <li>Copie o Phone Number ID e o Business Account ID.</li>
          <li>Gere um token permanente com um System User de nível Admin.</li>
          <li>Configure o webhook com a URL acima e o token de verificação.</li>
          <li>Assine os eventos: <span className="font-mono">messages</span> e <span className="font-mono">message_status</span>.</li>
        </ol>
      </div>
    </div>
  )
}
