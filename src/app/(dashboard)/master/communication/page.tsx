'use client'

// =============================================================================
// /master/communication — Central de Comunicação (MASTER only)
//
// Tabs:
//   • E-mail    — SMTP config + teste real com log
//   • WhatsApp  — Gateway config + teste real com log
//   • Avisos    — Criar e listar avisos internos
//   • Logs      — Histórico de todos os testes de conexão
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useSession }   from 'next-auth/react'
import { useRouter }    from 'next/navigation'
import {
  Mail, MessageSquare, Bell, Loader2, AlertCircle, CheckCircle2,
  Save, Eye, EyeOff, Send, ClipboardList, RefreshCw,
  Wifi, WifiOff, Clock, ChevronDown, ChevronRight, Trash2,
  Phone,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import NoticesTab from './NoticesTab'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface EmailConfig {
  provider:      string
  smtpHost:      string
  smtpPort:      string
  smtpSecure:    string
  smtpUser:      string
  smtpPass:      string
  fromName:      string
  fromEmail:     string
  replyTo:       string
  apiKey:        string
  domain:        string
  monthlyLimit:  string
  active:        string
}

interface WaConfig {
  provider:              string
  apiUrl:                string
  token:                 string
  phoneNumberId:         string
  businessAccountId:     string
  webhookVerifyToken:    string
  webhookCallbackUrl:    string
  apiVersion:            string
  monthlyLimit:          string
  active:                string
  // Extended Meta / enterprise fields
  environment:           string
  businessManagerId:     string
  appId:                 string
  appSecret:             string
  webhookFields:         string
  defaultLanguage:       string
  useOfficialTemplates:  string
  fallbackToText:        string
  defaultHeaderImageUrl: string
  defaultHeaderMediaId:  string
  testPhone:             string
}

interface TestLog {
  id:           string
  channel:      string
  provider:     string | null
  triggeredBy:  string
  target:       string
  success:      boolean
  errorCode:    string | null
  errorMessage: string | null
  errorDetails: string | null
  responseMs:   number | null
  messageId:    string | null
  createdAt:    string
  user:         { id: string; name: string; email: string }
}

interface TestResult {
  success:      boolean
  message?:     string
  error?:       string
  errorCode?:   string
  errorDetails?: string
  messageId?:   string
  responseMs?:  number
}

type Tab = 'email' | 'whatsapp' | 'notices' | 'logs'

// ── Helpers de UI ─────────────────────────────────────────────────────────────

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const labelCls = 'text-xs font-medium text-gray-600 block mb-1'

function Alert({ type, msg, code, details }: { type: 'error' | 'success' | 'warning'; msg: string; code?: string; details?: string }) {
  const [expanded, setExpanded] = useState(false)

  const cls =
    type === 'error'   ? 'border-red-200 bg-red-50 text-red-700' :
    type === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-700' :
                         'border-emerald-200 bg-emerald-50 text-emerald-700'
  const Icon = type === 'error' ? AlertCircle : type === 'warning' ? AlertCircle : CheckCircle2

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${cls}`}>
      <div className="flex items-start gap-2">
        <Icon size={15} className="mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="font-medium">{msg}</span>
          {code && (
            <span className="ml-2 rounded bg-black/10 px-1.5 py-0.5 font-mono text-xs">{code}</span>
          )}
          {details && (
            <button
              onClick={() => setExpanded(p => !p)}
              className="ml-2 text-xs underline opacity-70 hover:opacity-100 flex items-center gap-0.5 inline-flex"
            >
              {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              {expanded ? 'Ocultar detalhes' : 'Ver detalhes'}
            </button>
          )}
          {expanded && details && (
            <pre className="mt-2 overflow-x-auto rounded bg-black/10 p-2 text-xs whitespace-pre-wrap break-all max-h-40">
              {details}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Componente TestPanel reutilizável ─────────────────────────────────────────

interface TestPanelProps {
  channel:     'email' | 'whatsapp'
  placeholder: string
  label:       string
  inputType?:  string
  icon:        React.ElementType
  onTest:      (target: string) => Promise<TestResult>
}

function TestPanel({ channel, placeholder, label, inputType = 'text', icon: Icon, onTest }: TestPanelProps) {
  const [target,   setTarget]   = useState('')
  const [testing,  setTesting]  = useState(false)
  const [result,   setResult]   = useState<TestResult | null>(null)

  async function run() {
    if (!target.trim()) return
    setTesting(true)
    setResult(null)
    const res = await onTest(target.trim())
    setResult(res)
    setTesting(false)
  }

  return (
    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <Send size={14} className="text-brand-600" />
        Testar {channel === 'email' ? 'envio de e-mail' : 'envio de WhatsApp'}
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Icon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type={inputType}
            value={target}
            onChange={e => setTarget(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && run()}
            placeholder={placeholder}
            className={`${inputCls} pl-8`}
            disabled={testing}
          />
        </div>
        <button
          onClick={run}
          disabled={testing || !target.trim()}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 whitespace-nowrap"
        >
          {testing ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          {testing ? 'Testando...' : 'Testar agora'}
        </button>
      </div>

      <p className="text-xs text-gray-400">{label}</p>

      {/* Resultado do teste */}
      {result && (
        <div className={cn(
          'rounded-lg border p-3 text-sm',
          result.success
            ? 'border-emerald-200 bg-emerald-50'
            : 'border-red-200 bg-red-50',
        )}>
          <div className="flex items-start gap-2">
            {result.success
              ? <CheckCircle2 size={16} className="shrink-0 text-emerald-600 mt-0.5" />
              : <WifiOff     size={16} className="shrink-0 text-red-600 mt-0.5" />
            }
            <div className="flex-1 min-w-0">
              {result.success ? (
                <>
                  <p className="font-semibold text-emerald-800">✅ Enviado com sucesso!</p>
                  {result.message && <p className="text-emerald-700 mt-0.5">{result.message}</p>}
                  <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-emerald-600">
                    {result.messageId && (
                      <span>ID: <code className="rounded bg-emerald-100 px-1">{result.messageId}</code></span>
                    )}
                    {result.responseMs !== undefined && (
                      <span className="flex items-center gap-1">
                        <Clock size={11} /> {result.responseMs} ms
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <p className="font-semibold text-red-800">❌ Falha no envio</p>
                  <p className="text-red-700 mt-0.5">{result.error}</p>
                  {result.errorCode && (
                    <p className="mt-1 text-xs">
                      Código: <code className="rounded bg-red-100 px-1 font-mono">{result.errorCode}</code>
                    </p>
                  )}
                  {result.errorDetails && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-red-500 hover:text-red-700">Ver detalhes técnicos</summary>
                      <pre className="mt-1 overflow-x-auto rounded bg-red-100 p-2 text-xs whitespace-pre-wrap break-all max-h-40">
                        {result.errorDetails}
                      </pre>
                    </details>
                  )}
                  {result.responseMs !== undefined && (
                    <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                      <Clock size={11} /> {result.responseMs} ms
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: E-MAIL
// ─────────────────────────────────────────────────────────────────────────────

function EmailTab() {
  const [config,   setConfig]   = useState<Partial<EmailConfig>>({})
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; msg: string } | null>(null)
  const [showPass, setShowPass] = useState(false)

  useEffect(() => {
    fetch('/api/master/communication/email')
      .then(r => r.json())
      .then(d => setConfig(d.data ?? {}))
      .catch(() => setFeedback({ type: 'error', msg: 'Erro ao carregar configuração.' }))
      .finally(() => setLoading(false))
  }, [])

  function set(k: keyof EmailConfig) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setConfig(p => ({ ...p, [k]: e.target.value }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setFeedback(null)
    setSaving(true)
    try {
      const res  = await fetch('/api/master/communication/email', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(config),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao salvar.')
      setFeedback({ type: 'success', msg: 'Configurações salvas com sucesso.' })
    } catch (err: unknown) {
      setFeedback({ type: 'error', msg: err instanceof Error ? err.message : 'Erro.' })
    } finally {
      setSaving(false)
    }
  }

  async function runEmailTest(to: string): Promise<TestResult> {
    const res  = await fetch('/api/master/communication/email/test', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ to }),
    })
    return res.json()
  }

  if (loading) return <div className="flex h-48 items-center justify-center"><Loader2 size={20} className="animate-spin text-gray-400" /></div>

  const isApiProvider = ['sendgrid', 'ses', 'mailgun', 'resend'].includes(config.provider ?? '')

  return (
    <form onSubmit={handleSave} className="space-y-5">
      {feedback && <Alert type={feedback.type} msg={feedback.msg} />}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Provedor</label>
          <select className={inputCls} value={config.provider ?? ''} onChange={set('provider')}>
            <option value="">Selecione...</option>
            <option value="smtp">SMTP (próprio)</option>
            <option value="sendgrid">SendGrid</option>
            <option value="ses">Amazon SES</option>
            <option value="mailgun">Mailgun</option>
            <option value="resend">Resend</option>
          </select>
        </div>
        <div className="flex flex-col justify-end">
          <label className="flex items-center gap-2 cursor-pointer pb-1.5">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-brand-600"
              checked={config.active === 'true'}
              onChange={e => setConfig(p => ({ ...p, active: e.target.checked ? 'true' : 'false' }))}
            />
            <span className="text-sm text-gray-700">Envio de e-mails habilitado</span>
          </label>
        </div>
      </div>

      {/* SMTP */}
      {!isApiProvider && (
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className={labelCls}>Host SMTP</label>
            <input className={inputCls} value={config.smtpHost ?? ''} onChange={set('smtpHost')} placeholder="smtp.exemplo.com" />
          </div>
          <div>
            <label className={labelCls}>Porta</label>
            <input type="number" className={inputCls} value={config.smtpPort ?? ''} onChange={set('smtpPort')} placeholder="587" />
          </div>
          <div>
            <label className={labelCls}>Usuário SMTP</label>
            <input className={inputCls} value={config.smtpUser ?? ''} onChange={set('smtpUser')} placeholder="usuario@dominio.com" />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Senha SMTP</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                className={`${inputCls} pr-9`}
                value={config.smtpPass ?? ''}
                onChange={set('smtpPass')}
                placeholder="••••••••"
              />
              <button type="button" onClick={() => setShowPass(p => !p)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          <div>
            <label className={labelCls}>TLS/SSL</label>
            <select className={inputCls} value={config.smtpSecure ?? ''} onChange={set('smtpSecure')}>
              <option value="false">Não (STARTTLS)</option>
              <option value="true">Sim (SSL/TLS)</option>
            </select>
          </div>
        </div>
      )}

      {/* API Key */}
      {isApiProvider && (
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={labelCls}>API Key</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                className={`${inputCls} pr-9`}
                value={config.apiKey ?? ''}
                onChange={set('apiKey')}
                placeholder="••••••••"
              />
              <button type="button" onClick={() => setShowPass(p => !p)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          {['ses', 'mailgun'].includes(config.provider ?? '') && (
            <div>
              <label className={labelCls}>Domínio de envio</label>
              <input className={inputCls} value={config.domain ?? ''} onChange={set('domain')} placeholder="mg.suaempresa.com.br" />
            </div>
          )}
        </div>
      )}

      {/* Remetente */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={labelCls}>Nome do remetente</label>
          <input className={inputCls} value={config.fromName ?? ''} onChange={set('fromName')} placeholder="EasyCar" />
        </div>
        <div>
          <label className={labelCls}>E-mail remetente</label>
          <input type="email" className={inputCls} value={config.fromEmail ?? ''} onChange={set('fromEmail')} placeholder="noreply@easycar.com.br" />
        </div>
        <div>
          <label className={labelCls}>Reply-To</label>
          <input type="email" className={inputCls} value={config.replyTo ?? ''} onChange={set('replyTo')} placeholder="suporte@easycar.com.br" />
        </div>
      </div>

      {/* Limite */}
      <div className="max-w-[220px]">
        <label className={labelCls}>Limite mensal de envios</label>
        <input type="number" min={0} className={inputCls} value={config.monthlyLimit ?? ''} onChange={set('monthlyLimit')} placeholder="10000" />
      </div>

      {/* Salvar */}
      <div className="border-t border-gray-100 pt-4">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? 'Salvando...' : 'Salvar configurações'}
        </button>
      </div>

      {/* Painel de teste */}
      <TestPanel
        channel="email"
        placeholder="destinatario@exemplo.com"
        label="Será enviado um e-mail de teste usando as configurações acima. Salve antes de testar."
        inputType="email"
        icon={Mail}
        onTest={runEmailTest}
      />
    </form>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: WHATSAPP (Enhanced — Meta Cloud API + multi-provider)
// ─────────────────────────────────────────────────────────────────────────────

interface ConnectResult {
  success:       boolean
  message?:      string
  error?:        string
  errorCode?:    string
  errorDetails?: string
  httpStatus?:   number
  responseMs?:   number
  phoneInfo?: {
    displayNumber: string
    verifiedName:  string
    qualityRating: string
    platformType:  string
    throughput?:   string
  }
}

interface MetaTemplate {
  id:            string
  name:          string
  status:        string
  category:      string
  language:      string
  headerType:    string
  bodyText:      string | null
  variableCount: number
  qualityScore:  string | null
}

function SecretInput({ label, name, value, onChange, placeholder, helpText }: {
  label: string
  name:  string
  value: string
  onChange: (val: string) => void
  placeholder?: string
  helpText?: string
}) {
  const [reveal, setReveal] = useState(false)
  const isMasked = value === '••••••••'

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className={labelCls}>{label}</label>
        {isMasked && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-xs text-brand-600 hover:text-brand-800 underline"
          >
            Substituir
          </button>
        )}
      </div>
      <div className="relative">
        <input
          type={reveal && !isMasked ? 'text' : 'password'}
          name={name}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={isMasked ? '(configurado — clique em "Substituir" para alterar)' : (placeholder ?? '••••••••')}
          disabled={isMasked}
          className={`${inputCls} pr-9 ${isMasked ? 'bg-gray-50 text-gray-400' : ''}`}
        />
        {!isMasked && (
          <button type="button" onClick={() => setReveal(p => !p)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            {reveal ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
      </div>
      {helpText && <p className="mt-1 text-xs text-gray-400">{helpText}</p>}
    </div>
  )
}

function WhatsAppTab() {
  const [config,    setConfig]    = useState<Partial<WaConfig>>({})
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [feedback,  setFeedback]  = useState<{ type: 'error' | 'success'; msg: string; code?: string } | null>(null)

  // Estados dos botões de ação
  const [connecting,       setConnecting]       = useState(false)
  const [connectResult,    setConnectResult]    = useState<ConnectResult | null>(null)
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [templates,        setTemplates]        = useState<MetaTemplate[] | null>(null)
  const [templatesError,   setTemplatesError]   = useState<string | null>(null)
  const [validatingWebhook, setValidatingWebhook] = useState(false)
  const [webhookResult,    setWebhookResult]    = useState<ConnectResult | null>(null)

  useEffect(() => {
    fetch('/api/master/communication/whatsapp')
      .then(r => r.json())
      .then(d => setConfig(d.data ?? {}))
      .catch(() => setFeedback({ type: 'error', msg: 'Erro ao carregar configuração.' }))
      .finally(() => setLoading(false))
  }, [])

  function setField(k: keyof WaConfig) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setConfig(p => ({ ...p, [k]: e.target.value }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setFeedback(null)
    setSaving(true)
    try {
      const res  = await fetch('/api/master/communication/whatsapp', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(config),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao salvar.')
      setFeedback({ type: 'success', msg: 'Configurações salvas com sucesso.' })
      // Recarrega para refletir mascaramento dos novos segredos
      const fresh = await fetch('/api/master/communication/whatsapp').then(r => r.json())
      setConfig(fresh.data ?? {})
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro.'
      setFeedback({ type: 'error', msg })
    } finally {
      setSaving(false)
    }
  }

  async function handleConnectTest() {
    setConnecting(true)
    setConnectResult(null)
    const res = await fetch('/api/master/communication/whatsapp/connect-test', { method: 'POST' })
    setConnectResult(await res.json())
    setConnecting(false)
  }

  async function handleListTemplates() {
    setLoadingTemplates(true)
    setTemplates(null)
    setTemplatesError(null)
    const res  = await fetch('/api/master/communication/whatsapp/meta-templates')
    const data = await res.json()
    if (data.success) setTemplates(data.data)
    else setTemplatesError(data.error ?? 'Falha ao buscar templates.')
    setLoadingTemplates(false)
  }

  async function handleValidateWebhook() {
    setValidatingWebhook(true)
    setWebhookResult(null)
    const res = await fetch('/api/master/communication/whatsapp/webhook-validate', { method: 'POST' })
    setWebhookResult(await res.json())
    setValidatingWebhook(false)
  }

  async function runWaTest(to: string): Promise<TestResult> {
    const res = await fetch('/api/master/communication/whatsapp/test', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ to }),
    })
    return res.json()
  }

  if (loading) return <div className="flex h-48 items-center justify-center"><Loader2 size={20} className="animate-spin text-gray-400" /></div>

  const isMeta = !config.provider || config.provider === 'meta'

  return (
    <form onSubmit={handleSave} className="space-y-5">
      {feedback && <Alert type={feedback.type} msg={feedback.msg} code={feedback.code} />}

      {/* ── Card: Status da conexão ─────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <Wifi size={15} className={connectResult?.success ? 'text-emerald-500' : 'text-gray-400'} />
            Status da conexão
          </p>
          <button
            type="button"
            onClick={handleConnectTest}
            disabled={connecting}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            {connecting ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Testar conexão Meta
          </button>
        </div>

        {connectResult ? (
          <div className={`rounded-lg border p-3 text-xs ${connectResult.success ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
            {connectResult.success ? (
              <>
                <p className="font-semibold text-emerald-800 flex items-center gap-1.5"><CheckCircle2 size={12} /> Conectado com sucesso</p>
                {connectResult.phoneInfo && (
                  <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-emerald-700">
                    <span>Número: <strong>{connectResult.phoneInfo.displayNumber}</strong></span>
                    <span>Nome: <strong>{connectResult.phoneInfo.verifiedName}</strong></span>
                    <span>Qualidade: <strong>{connectResult.phoneInfo.qualityRating}</strong></span>
                    <span>Plataforma: <strong>{connectResult.phoneInfo.platformType}</strong></span>
                    {connectResult.phoneInfo.throughput && <span>Throughput: <strong>{connectResult.phoneInfo.throughput}</strong></span>}
                  </div>
                )}
                <p className="mt-1 text-emerald-600 flex items-center gap-1"><Clock size={10} /> {connectResult.responseMs} ms</p>
              </>
            ) : (
              <>
                <p className="font-semibold text-red-800 flex items-center gap-1.5"><WifiOff size={12} /> Falha na conexão</p>
                <p className="text-red-700 mt-0.5">{connectResult.error}</p>
                {connectResult.errorCode && <p className="mt-0.5 text-red-500">Código: <code className="rounded bg-red-100 px-1 font-mono">{connectResult.errorCode}</code></p>}
                {connectResult.errorDetails && (
                  <details className="mt-1"><summary className="cursor-pointer text-xs text-red-400">Detalhes técnicos</summary>
                    <pre className="mt-1 whitespace-pre-wrap break-all text-xs bg-red-100 rounded p-2 max-h-28 overflow-auto">{connectResult.errorDetails}</pre>
                  </details>
                )}
              </>
            )}
          </div>
        ) : (
          <p className="text-xs text-gray-400">Clique em "Testar conexão Meta" para validar token e Phone Number ID sem enviar mensagem.</p>
        )}
      </div>

      {/* ── Card: Provedor e ambiente ───────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 p-4 space-y-4">
        <p className="text-sm font-semibold text-gray-800">Provedor e ambiente</p>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Provedor</label>
            <select className={inputCls} value={config.provider ?? ''} onChange={setField('provider')}>
              <option value="">Selecione...</option>
              <option value="meta">Meta (WhatsApp Cloud API)</option>
              <option value="evolution">Evolution API</option>
              <option value="zapi">Z-API</option>
              <option value="twilio">Twilio</option>
              <option value="other">Outro</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Ambiente</label>
            <select className={inputCls} value={config.environment ?? ''} onChange={setField('environment')}>
              <option value="">Selecione...</option>
              <option value="TEST">Teste</option>
              <option value="REAL">Real</option>
              <option value="PRODUCTION">Produção</option>
            </select>
          </div>
          <div className="flex flex-col justify-end pb-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-brand-600"
                checked={config.active === 'true'}
                onChange={e => setConfig(p => ({ ...p, active: e.target.checked ? 'true' : 'false' }))}
              />
              <span className="text-sm text-gray-700">Envios habilitados</span>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className={labelCls}>URL base da API</label>
            <input
              className={inputCls}
              value={config.apiUrl ?? ''}
              onChange={setField('apiUrl')}
              placeholder="https://graph.facebook.com"
            />
            <p className="mt-1 text-xs text-gray-400">Deve ser HTTPS. Para Meta, usar https://graph.facebook.com</p>
          </div>
          <div>
            <label className={labelCls}>Versão da API</label>
            <input className={inputCls} value={config.apiVersion ?? ''} onChange={setField('apiVersion')} placeholder="v20.0" />
            <p className="mt-1 text-xs text-gray-400">Ex: v20.0, v21.0, v25.0</p>
          </div>
        </div>
      </div>

      {/* ── Card: Credenciais Meta ──────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 p-4 space-y-4">
        <p className="text-sm font-semibold text-gray-800">Credenciais Meta</p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Phone Number ID *</label>
            <input className={`${inputCls} font-mono`} value={config.phoneNumberId ?? ''} onChange={setField('phoneNumberId')} placeholder="123456789012345 (somente números)" />
          </div>
          <div>
            <label className={labelCls}>WABA ID (Business Account ID) *</label>
            <input className={`${inputCls} font-mono`} value={config.businessAccountId ?? ''} onChange={setField('businessAccountId')} placeholder="123456789012345" />
          </div>
          <div>
            <label className={labelCls}>Business Manager ID</label>
            <input className={`${inputCls} font-mono`} value={config.businessManagerId ?? ''} onChange={setField('businessManagerId')} placeholder="somente números" />
          </div>
          <div>
            <label className={labelCls}>App ID</label>
            <input className={`${inputCls} font-mono`} value={config.appId ?? ''} onChange={setField('appId')} placeholder="somente números" />
          </div>
        </div>

        <SecretInput
          label="Access Token *"
          name="token"
          value={config.token ?? ''}
          onChange={val => setConfig(p => ({ ...p, token: val }))}
          placeholder="EAAxxxxxxx..."
          helpText="Token de acesso permanente ou temporário. Armazenado criptografado."
        />
        <SecretInput
          label="App Secret"
          name="appSecret"
          value={config.appSecret ?? ''}
          onChange={val => setConfig(p => ({ ...p, appSecret: val }))}
          helpText="Necessário para verificação de assinatura do webhook. Armazenado criptografado."
        />
      </div>

      {/* ── Card: Webhook ───────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-800">Webhook</p>
          <button
            type="button"
            onClick={handleValidateWebhook}
            disabled={validatingWebhook}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            {validatingWebhook ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Validar webhook
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <SecretInput
            label="Webhook Verify Token"
            name="webhookVerifyToken"
            value={config.webhookVerifyToken ?? ''}
            onChange={val => setConfig(p => ({ ...p, webhookVerifyToken: val }))}
            helpText="Token de verificação enviado pela Meta no handshake do webhook."
          />
          <div>
            <label className={labelCls}>Webhook Callback URL</label>
            <input className={inputCls} value={config.webhookCallbackUrl ?? ''} onChange={setField('webhookCallbackUrl')} placeholder="https://app.easycar.com.br/api/webhook/meta" />
          </div>
        </div>

        <div>
          <label className={labelCls}>Webhook Fields</label>
          <input className={inputCls} value={config.webhookFields ?? 'messages,message_template_status_update'} onChange={setField('webhookFields')} />
          <p className="mt-1 text-xs text-gray-400">Campos assinados no webhook Meta (separados por vírgula)</p>
        </div>

        {webhookResult && (
          <div className={`rounded-lg border p-3 text-xs ${webhookResult.success ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
            {webhookResult.success ? (
              <p className="font-semibold text-emerald-800 flex items-center gap-1.5"><CheckCircle2 size={12} /> {webhookResult.message}</p>
            ) : (
              <>
                <p className="font-semibold text-red-800 flex items-center gap-1.5"><WifiOff size={12} /> {webhookResult.error}</p>
                {webhookResult.errorCode && <p className="mt-0.5 text-red-500">Código: <code className="rounded bg-red-100 px-1 font-mono">{webhookResult.errorCode}</code></p>}
                {webhookResult.errorDetails && (
                  <details className="mt-1"><summary className="cursor-pointer text-xs text-red-400">Detalhes</summary>
                    <pre className="mt-1 whitespace-pre-wrap break-all text-xs bg-red-100 rounded p-2 max-h-24 overflow-auto">{webhookResult.errorDetails}</pre>
                  </details>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Card: Templates e configurações adicionais ──────────────────── */}
      {isMeta && (
        <div className="rounded-xl border border-gray-200 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-800">Templates Meta</p>
            <button
              type="button"
              onClick={handleListTemplates}
              disabled={loadingTemplates}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              {loadingTemplates ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              Listar templates da Meta
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Idioma padrão dos templates</label>
              <select className={inputCls} value={config.defaultLanguage ?? 'pt_BR'} onChange={setField('defaultLanguage')}>
                <option value="pt_BR">pt_BR (Português Brasil)</option>
                <option value="en_US">en_US (English)</option>
                <option value="es_ES">es_ES (Español)</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Limite mensal de disparos</label>
              <input type="number" min={0} className={inputCls} value={config.monthlyLimit ?? ''} onChange={setField('monthlyLimit')} placeholder="99999" />
            </div>
            <div>
              <label className={labelCls}>URL imagem padrão (header templates)</label>
              <input className={inputCls} value={config.defaultHeaderImageUrl ?? ''} onChange={setField('defaultHeaderImageUrl')} placeholder="https://cdn.easycar.com.br/logo.png" />
            </div>
            <div>
              <label className={labelCls}>Header Media ID padrão</label>
              <input className={`${inputCls} font-mono`} value={config.defaultHeaderMediaId ?? ''} onChange={setField('defaultHeaderMediaId')} placeholder="ID do media upload" />
            </div>
            <div>
              <label className={labelCls}>Número de teste padrão</label>
              <input className={`${inputCls} font-mono`} value={config.testPhone ?? ''} onChange={setField('testPhone')} placeholder="5511999999999" />
            </div>
          </div>

          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-brand-600"
                checked={config.useOfficialTemplates === 'true'}
                onChange={e => setConfig(p => ({ ...p, useOfficialTemplates: e.target.checked ? 'true' : 'false' }))} />
              <span className="text-sm text-gray-700">Usar templates oficiais Meta</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-brand-600"
                checked={config.fallbackToText === 'true'}
                onChange={e => setConfig(p => ({ ...p, fallbackToText: e.target.checked ? 'true' : 'false' }))} />
              <span className="text-sm text-gray-700">Fallback para texto livre se template falhar</span>
            </label>
          </div>

          {/* Lista de templates */}
          {templatesError && <Alert type="error" msg={templatesError} />}
          {templates && templates.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-gray-50 text-gray-500">
                    <th className="px-3 py-2 text-left font-medium">Nome</th>
                    <th className="px-3 py-2 text-left font-medium">Categoria</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-left font-medium">Header</th>
                    <th className="px-3 py-2 text-center font-medium">Variáveis</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {templates.map(t => (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono font-medium text-gray-800">{t.name}</td>
                      <td className="px-3 py-2 text-gray-500">{t.category}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          t.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700' :
                          t.status === 'REJECTED' ? 'bg-red-50 text-red-700' :
                          'bg-amber-50 text-amber-700'
                        }`}>{t.status}</span>
                      </td>
                      <td className="px-3 py-2 text-gray-500 capitalize">{t.headerType}</td>
                      <td className="px-3 py-2 text-center text-gray-700 font-medium">{t.variableCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Salvar ──────────────────────────────────────────────────────── */}
      <div className="border-t border-gray-100 pt-4">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? 'Salvando...' : 'Salvar configurações'}
        </button>
      </div>

      {/* ── Teste de envio ──────────────────────────────────────────────── */}
      <TestPanel
        channel="whatsapp"
        placeholder={config.testPhone ? `Padrão: ${config.testPhone}` : '5511999999999 (com DDI+DDD)'}
        label="Envia mensagem de texto real para o número informado. Salve as configurações antes de testar."
        icon={Phone}
        onTest={runWaTest}
      />
    </form>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: LOGS
// ─────────────────────────────────────────────────────────────────────────────

function LogsTab() {
  const [logs,       setLogs]       = useState<TestLog[]>([])
  const [total,      setTotal]      = useState(0)
  const [loading,    setLoading]    = useState(true)
  const [page,       setPage]       = useState(1)
  const [channel,    setChannel]    = useState('')
  const [successFilter, setSuccessFilter] = useState('')
  const [expanded,   setExpanded]   = useState<string | null>(null)
  const [purging,    setPurging]    = useState(false)
  const perPage = 20

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({
        page:    String(p),
        perPage: String(perPage),
        ...(channel       ? { channel }                : {}),
        ...(successFilter ? { success: successFilter } : {}),
      })
      const res  = await fetch(`/api/master/communication/logs?${qs}`)
      const data = await res.json()
      setLogs(data.data ?? [])
      setTotal(data.meta?.total ?? 0)
      setPage(p)
    } catch { /* silencioso */ } finally {
      setLoading(false)
    }
  }, [channel, successFilter])

  useEffect(() => { load(1) }, [load])

  async function handlePurge() {
    if (!confirm('Apagar todos os logs com mais de 30 dias? Esta ação não pode ser desfeita.')) return
    setPurging(true)
    try {
      const res  = await fetch('/api/master/communication/logs?olderThanDays=30', { method: 'DELETE' })
      const data = await res.json()
      if (data.success) { alert(`${data.deletedCount} logs removidos.`); load(1) }
    } catch { /* silencioso */ } finally {
      setPurging(false)
    }
  }

  const totalPages = Math.ceil(total / perPage)

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <select value={channel} onChange={e => setChannel(e.target.value)} className={`${inputCls} w-auto`}>
          <option value="">Todos os canais</option>
          <option value="EMAIL">E-mail</option>
          <option value="WHATSAPP">WhatsApp</option>
        </select>
        <select value={successFilter} onChange={e => setSuccessFilter(e.target.value)} className={`${inputCls} w-auto`}>
          <option value="">Todos os resultados</option>
          <option value="true">Sucesso</option>
          <option value="false">Falha</option>
        </select>
        <button onClick={() => load(1)} className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50">
          <RefreshCw size={12} />
          Atualizar
        </button>
        <button onClick={handlePurge} disabled={purging} className="ml-auto flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50">
          {purging ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
          Limpar &gt;30 dias
        </button>
      </div>

      {/* Contador */}
      <p className="text-xs text-gray-400">{total} registro{total !== 1 ? 's' : ''} encontrado{total !== 1 ? 's' : ''}</p>

      {/* Tabela */}
      {loading ? (
        <div className="flex h-48 items-center justify-center"><Loader2 size={20} className="animate-spin text-gray-400" /></div>
      ) : logs.length === 0 ? (
        <div className="flex h-36 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 text-gray-400">
          <ClipboardList size={24} />
          <p className="text-sm">Nenhum log encontrado</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-500">
                <th className="px-4 py-3 text-left">Data/Hora</th>
                <th className="px-4 py-3 text-left">Canal</th>
                <th className="px-4 py-3 text-left">Destino</th>
                <th className="px-4 py-3 text-left">Provedor</th>
                <th className="px-4 py-3 text-center">Resultado</th>
                <th className="px-4 py-3 text-right">Latência</th>
                <th className="px-4 py-3 text-left">Por</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map(log => (
                <>
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                        log.channel === 'EMAIL' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700',
                      )}>
                        {log.channel === 'EMAIL' ? <Mail size={10} /> : <MessageSquare size={10} />}
                        {log.channel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-gray-700 max-w-[180px] truncate" title={log.target}>
                      {log.target}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{log.provider ?? '—'}</td>
                    <td className="px-4 py-3 text-center">
                      {log.success ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          <Wifi size={10} /> OK
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                          <WifiOff size={10} /> Erro
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-gray-500">
                      {log.responseMs !== null ? `${log.responseMs} ms` : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-[120px] truncate" title={log.user.name}>
                      {log.user.name}
                    </td>
                    <td className="px-4 py-3">
                      {(!log.success || log.messageId || log.errorCode) && (
                        <button
                          onClick={() => setExpanded(e => e === log.id ? null : log.id)}
                          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        >
                          {expanded === log.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      )}
                    </td>
                  </tr>
                  {expanded === log.id && (
                    <tr key={`${log.id}-detail`} className="bg-gray-50">
                      <td colSpan={8} className="px-4 pb-3 pt-1">
                        <div className="rounded-lg border border-gray-200 bg-white p-3 text-xs space-y-2">
                          {log.success ? (
                            <div className="flex items-center gap-2 text-emerald-700">
                              <CheckCircle2 size={13} />
                              <span className="font-medium">Enviado com sucesso</span>
                              {log.messageId && <code className="rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-emerald-600">{log.messageId}</code>}
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2">
                                <WifiOff size={13} className="text-red-500 shrink-0" />
                                <span className="font-medium text-red-700">{log.errorMessage ?? 'Erro desconhecido'}</span>
                                {log.errorCode && (
                                  <code className="rounded bg-red-50 px-1.5 py-0.5 font-mono text-red-600">{log.errorCode}</code>
                                )}
                              </div>
                              {log.errorDetails && (
                                <pre className="overflow-x-auto rounded bg-gray-100 p-2 whitespace-pre-wrap break-all max-h-32 text-gray-600">
                                  {log.errorDetails}
                                </pre>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">Página {page} de {totalPages}</span>
          <div className="flex gap-2">
            <button onClick={() => load(page - 1)} disabled={page <= 1}  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40">Anterior</button>
            <button onClick={() => load(page + 1)} disabled={page >= totalPages} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40">Próxima</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'email',     label: 'E-mail',    icon: Mail          },
  { id: 'whatsapp',  label: 'WhatsApp',  icon: MessageSquare },
  { id: 'notices',   label: 'Avisos',    icon: Bell          },
  { id: 'logs',      label: 'Logs',      icon: ClipboardList },
]

export default function CommunicationPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('email')

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role !== 'MASTER') {
      router.replace('/inicio')
    }
  }, [session, status, router])

  if (status === 'loading') {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600">
          <Mail size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Central de Comunicação</h1>
          <p className="text-xs text-gray-400">Configure canais de e-mail, WhatsApp, avisos internos e veja os logs de testes</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.id
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      <div>
        {tab === 'email'     && <EmailTab />}
        {tab === 'whatsapp'  && <WhatsAppTab />}
        {tab === 'notices'   && <NoticesTab />}
        {tab === 'logs'      && <LogsTab />}
      </div>
    </div>
  )
}
