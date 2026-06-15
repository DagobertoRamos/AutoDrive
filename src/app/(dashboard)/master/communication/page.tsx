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
  Phone, Plus, X, Pencil, Star, Power, FileText, Image as ImageIcon,
  Server, Layers, Sparkles,
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
// TAB: E-MAIL (Servidores + Templates)
// ─────────────────────────────────────────────────────────────────────────────

type EmailPurpose = 'SYSTEM' | 'NOTICES' | 'PASSWORD_RESET' | 'TRANSACTIONAL'

const EMAIL_PURPOSES: { value: EmailPurpose; label: string; desc: string; color: string }[] = [
  { value: 'SYSTEM',         label: 'Sistema',         desc: 'Comunicação geral, notificações internas', color: 'bg-slate-100 text-slate-700' },
  { value: 'NOTICES',        label: 'Avisos',          desc: 'Sistema de avisos / notícias',             color: 'bg-blue-100 text-blue-700' },
  { value: 'PASSWORD_RESET', label: 'Recuperar senha', desc: 'Esqueci minha senha',                       color: 'bg-amber-100 text-amber-700' },
  { value: 'TRANSACTIONAL',  label: 'Transacional',    desc: 'Recibos, confirmações, alterações',         color: 'bg-emerald-100 text-emerald-700' },
]

function purposeBadge(p: string) {
  const found = EMAIL_PURPOSES.find(x => x.value === p)
  return found ?? { value: p, label: p, desc: '', color: 'bg-gray-100 text-gray-700' }
}

type EmailProvider = 'smtp' | 'sendgrid' | 'resend' | 'mailgun' | 'ses'

const EMAIL_PROVIDERS: { value: EmailProvider; label: string; color: string }[] = [
  { value: 'smtp',     label: 'SMTP',     color: 'bg-slate-100 text-slate-700' },
  { value: 'sendgrid', label: 'SendGrid', color: 'bg-sky-100 text-sky-700' },
  { value: 'resend',   label: 'Resend',   color: 'bg-violet-100 text-violet-700' },
  { value: 'mailgun',  label: 'Mailgun',  color: 'bg-rose-100 text-rose-700' },
  { value: 'ses',      label: 'AWS SES',  color: 'bg-amber-100 text-amber-700' },
]

interface EmailConfigRow {
  id:           string
  tenantId:     string | null
  name:         string
  purpose:      EmailPurpose
  isDefault:    boolean
  provider:     EmailProvider
  smtpHost:     string | null
  smtpPort:     number
  smtpSecure:   boolean
  smtpUser:     string | null
  smtpPass:     string
  apiKey:       string
  domain:       string | null
  region:       string | null
  fromName:     string
  fromEmail:    string
  replyTo:      string | null
  active:       boolean
  lastTestedAt: string | null
  lastTestOk:   boolean
}

interface EmailTemplateRow {
  id:          string
  tenantId:    string | null
  purpose:     EmailPurpose
  key:         string
  name:        string
  description: string | null
  subject:     string
  bodyHtml:    string
  bodyText:    string | null
  variables:   string[]
  active:      boolean
}

// ── Drawer reutilizável ───────────────────────────────────────────────────────

function Drawer({ open, onClose, title, children, width = 'max-w-xl' }: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  width?: string
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={`relative ml-auto h-full w-full ${width} bg-white shadow-2xl flex flex-col`}>
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  )
}

// ── Form: Servidor de e-mail ──────────────────────────────────────────────────

function EmailConfigForm({ initial, onSubmit, onCancel, submitting }: {
  initial?: Partial<EmailConfigRow>
  onSubmit: (data: Partial<EmailConfigRow> & { testEmail?: string }) => Promise<void>
  onCancel: () => void
  submitting: boolean
}) {
  const [form, setForm] = useState<Partial<EmailConfigRow> & { testEmail?: string }>({
    name:       initial?.name       ?? '',
    purpose:    initial?.purpose    ?? 'SYSTEM',
    provider:   initial?.provider   ?? 'smtp',
    smtpHost:   initial?.smtpHost   ?? '',
    smtpPort:   initial?.smtpPort   ?? 587,
    smtpSecure: initial?.smtpSecure ?? false,
    smtpUser:   initial?.smtpUser   ?? '',
    smtpPass:   initial?.smtpPass   ?? '',
    apiKey:     initial?.apiKey     ?? '',
    domain:     initial?.domain     ?? '',
    region:     initial?.region     ?? '',
    fromName:   initial?.fromName   ?? '',
    fromEmail:  initial?.fromEmail  ?? '',
    replyTo:    initial?.replyTo    ?? '',
    active:     initial?.active     ?? true,
    isDefault:  initial?.isDefault  ?? false,
  })
  const [reveal, setReveal] = useState(false)
  const [revealApi, setRevealApi] = useState(false)
  const isMaskedPass = (form.smtpPass ?? '') === '••••••••'
  const isMaskedApi  = (form.apiKey   ?? '') === '••••••••'
  const provider = (form.provider ?? 'smtp') as EmailProvider

  function up<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm(p => ({ ...p, [k]: v }))
  }

  return (
    <form
      onSubmit={async e => { e.preventDefault(); await onSubmit(form) }}
      className="space-y-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Nome *</label>
          <input className={inputCls} value={form.name ?? ''} onChange={e => up('name', e.target.value)} placeholder="Servidor principal" required />
        </div>
        <div>
          <label className={labelCls}>Propósito *</label>
          <select className={inputCls} value={form.purpose ?? 'SYSTEM'} onChange={e => up('purpose', e.target.value as EmailPurpose)}>
            {EMAIL_PURPOSES.map(p => <option key={p.value} value={p.value}>{p.label} — {p.desc}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className={labelCls}>Provedor *</label>
        <select className={inputCls} value={provider} onChange={e => up('provider', e.target.value as EmailProvider)}>
          {EMAIL_PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>

      {provider === 'smtp' && (
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className={labelCls}>Host SMTP *</label>
            <input className={inputCls} value={form.smtpHost ?? ''} onChange={e => up('smtpHost', e.target.value)} placeholder="smtp.exemplo.com" required />
          </div>
          <div>
            <label className={labelCls}>Porta</label>
            <input type="number" className={inputCls} value={form.smtpPort ?? 587} onChange={e => up('smtpPort', Number(e.target.value))} />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Usuário SMTP *</label>
            <input className={inputCls} value={form.smtpUser ?? ''} onChange={e => up('smtpUser', e.target.value)} placeholder="user@dominio.com" required />
          </div>
          <div>
            <label className={labelCls}>TLS/SSL</label>
            <select className={inputCls} value={form.smtpSecure ? 'true' : 'false'} onChange={e => up('smtpSecure', e.target.value === 'true')}>
              <option value="false">STARTTLS</option>
              <option value="true">SSL/TLS</option>
            </select>
          </div>
          <div className="col-span-3">
            <label className={labelCls}>Senha SMTP {isMaskedPass ? '(configurada)' : '*'}</label>
            <div className="relative">
              <input
                type={reveal && !isMaskedPass ? 'text' : 'password'}
                className={`${inputCls} pr-9 ${isMaskedPass ? 'bg-gray-50 text-gray-400' : ''}`}
                value={form.smtpPass ?? ''}
                onChange={e => up('smtpPass', e.target.value)}
                placeholder={isMaskedPass ? '(clique para substituir)' : '••••••••'}
                onFocus={() => isMaskedPass && up('smtpPass', '')}
                required={!initial?.id}
              />
              {!isMaskedPass && (
                <button type="button" onClick={() => setReveal(p => !p)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {reveal ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {(provider === 'sendgrid' || provider === 'resend') && (
        <div>
          <label className={labelCls}>API Key {isMaskedApi ? '(configurada)' : '*'}</label>
          <div className="relative">
            <input
              type={revealApi && !isMaskedApi ? 'text' : 'password'}
              className={`${inputCls} pr-9 ${isMaskedApi ? 'bg-gray-50 text-gray-400' : ''}`}
              value={form.apiKey ?? ''}
              onChange={e => up('apiKey', e.target.value)}
              placeholder={isMaskedApi ? '(clique para substituir)' : (provider === 'sendgrid' ? 'SG.xxxxxxxxxxxx' : 're_xxxxxxxxxxxx')}
              onFocus={() => isMaskedApi && up('apiKey', '')}
              required={!initial?.id}
            />
            {!isMaskedApi && (
              <button type="button" onClick={() => setRevealApi(p => !p)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {revealApi ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            )}
          </div>
        </div>
      )}

      {provider === 'mailgun' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Domínio Mailgun *</label>
            <input className={inputCls} value={form.domain ?? ''} onChange={e => up('domain', e.target.value)} placeholder="mg.suaempresa.com" required />
          </div>
          <div>
            <label className={labelCls}>API Key {isMaskedApi ? '(configurada)' : '*'}</label>
            <div className="relative">
              <input
                type={revealApi && !isMaskedApi ? 'text' : 'password'}
                className={`${inputCls} pr-9 ${isMaskedApi ? 'bg-gray-50 text-gray-400' : ''}`}
                value={form.apiKey ?? ''}
                onChange={e => up('apiKey', e.target.value)}
                placeholder={isMaskedApi ? '(clique para substituir)' : 'key-xxxxxxxxxxxx'}
                onFocus={() => isMaskedApi && up('apiKey', '')}
                required={!initial?.id}
              />
              {!isMaskedApi && (
                <button type="button" onClick={() => setRevealApi(p => !p)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {revealApi ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {provider === 'ses' && (
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Region *</label>
            <input className={inputCls} value={form.region ?? ''} onChange={e => up('region', e.target.value)} placeholder="us-east-1" required />
          </div>
          <div>
            <label className={labelCls}>Access Key (IAM) *</label>
            <input className={inputCls} value={form.smtpUser ?? ''} onChange={e => up('smtpUser', e.target.value)} placeholder="AKIA..." required />
          </div>
          <div>
            <label className={labelCls}>Secret Key {isMaskedPass ? '(configurada)' : '*'}</label>
            <div className="relative">
              <input
                type={reveal && !isMaskedPass ? 'text' : 'password'}
                className={`${inputCls} pr-9 ${isMaskedPass ? 'bg-gray-50 text-gray-400' : ''}`}
                value={form.smtpPass ?? ''}
                onChange={e => up('smtpPass', e.target.value)}
                placeholder={isMaskedPass ? '(clique para substituir)' : '••••••••'}
                onFocus={() => isMaskedPass && up('smtpPass', '')}
                required={!initial?.id}
              />
              {!isMaskedPass && (
                <button type="button" onClick={() => setReveal(p => !p)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {reveal ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={labelCls}>Nome do remetente *</label>
          <input className={inputCls} value={form.fromName ?? ''} onChange={e => up('fromName', e.target.value)} placeholder="AutoDrive" required />
        </div>
        <div>
          <label className={labelCls}>E-mail remetente *</label>
          <input type="email" className={inputCls} value={form.fromEmail ?? ''} onChange={e => up('fromEmail', e.target.value)} placeholder="noreply@autodrive.com.br" required />
        </div>
        <div>
          <label className={labelCls}>Reply-To</label>
          <input type="email" className={inputCls} value={form.replyTo ?? ''} onChange={e => up('replyTo', e.target.value)} placeholder="suporte@..." />
        </div>
      </div>

      <div className="flex flex-wrap gap-4 pt-2">
        <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
          <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-brand-600"
            checked={form.active ?? true} onChange={e => up('active', e.target.checked)} />
          Ativo
        </label>
        <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
          <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-brand-600"
            checked={form.isDefault ?? false} onChange={e => up('isDefault', e.target.checked)} />
          Definir como padrão para o propósito
        </label>
      </div>

      <div className="border-t border-gray-100 pt-3">
        <label className={labelCls}>E-mail para teste (opcional)</label>
        <input type="email" className={inputCls} value={form.testEmail ?? ''} onChange={e => up('testEmail' as never, e.target.value as never)} placeholder="destinatario@exemplo.com — disparado após salvar via 'Testar'" />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancelar</button>
        <button type="submit" disabled={submitting} className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {submitting ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </form>
  )
}

// ── Form: Template de e-mail ─────────────────────────────────────────────────

function VarChips({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [input, setInput] = useState('')
  function add() {
    const v = input.trim().replace(/[^a-zA-Z0-9_]/g, '')
    if (!v || value.includes(v)) return
    onChange([...value, v])
    setInput('')
  }
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {value.map(v => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-mono text-brand-700">
            {`{{${v}}}`}
            <button type="button" onClick={() => onChange(value.filter(x => x !== v))} className="hover:text-brand-900">
              <X size={10} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className={`${inputCls} font-mono text-xs`}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder="nome_da_variavel"
        />
        <button type="button" onClick={add} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs hover:bg-gray-50">+ Adicionar</button>
      </div>
    </div>
  )
}

function EmailTemplateForm({ initial, onSubmit, onCancel, submitting }: {
  initial?: Partial<EmailTemplateRow>
  onSubmit: (data: Partial<EmailTemplateRow>) => Promise<void>
  onCancel: () => void
  submitting: boolean
}) {
  const [form, setForm] = useState<Partial<EmailTemplateRow>>({
    purpose:     initial?.purpose     ?? 'SYSTEM',
    key:         initial?.key         ?? '',
    name:        initial?.name        ?? '',
    description: initial?.description ?? '',
    subject:     initial?.subject     ?? '',
    bodyHtml:    initial?.bodyHtml    ?? '',
    bodyText:    initial?.bodyText    ?? '',
    variables:   initial?.variables   ?? [],
    active:      initial?.active      ?? true,
  })
  const [tab, setTab] = useState<'edit' | 'preview'>('edit')
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null)
  const [previewing, setPreviewing] = useState(false)

  function up<K extends keyof typeof form>(k: K, v: (typeof form)[K]) { setForm(p => ({ ...p, [k]: v })) }

  async function loadPreview() {
    if (!initial?.id) {
      setPreview({
        subject: form.subject ?? '',
        html:    `<div style="padding:24px;font-family:Arial">${form.bodyHtml ?? ''}</div>`,
      })
      return
    }
    setPreviewing(true)
    const vars = Object.fromEntries((form.variables ?? []).map(v => [v, `[exemplo de ${v}]`]))
    const res = await fetch(`/api/master/communication/email/templates/${initial.id}/preview`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ vars }),
    })
    const data = await res.json()
    if (data.success) setPreview({ subject: data.data.subject, html: data.data.html })
    setPreviewing(false)
  }

  return (
    <form onSubmit={async e => { e.preventDefault(); await onSubmit(form) }} className="space-y-4">
      <div className="flex gap-1 border-b border-gray-200">
        <button type="button" onClick={() => setTab('edit')} className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px ${tab === 'edit' ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500'}`}>Editar</button>
        <button type="button" onClick={() => { setTab('preview'); loadPreview() }} className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px ${tab === 'preview' ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500'}`}>Preview</button>
      </div>

      {tab === 'edit' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Propósito *</label>
              <select className={inputCls} value={form.purpose ?? 'SYSTEM'} onChange={e => up('purpose', e.target.value as EmailPurpose)}>
                {EMAIL_PURPOSES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Key (identificador) *</label>
              <input className={`${inputCls} font-mono`} value={form.key ?? ''} onChange={e => up('key', e.target.value)} placeholder="password_reset" required pattern="[a-zA-Z0-9_]+" />
            </div>
          </div>
          <div>
            <label className={labelCls}>Nome *</label>
            <input className={inputCls} value={form.name ?? ''} onChange={e => up('name', e.target.value)} required />
          </div>
          <div>
            <label className={labelCls}>Descrição</label>
            <input className={inputCls} value={form.description ?? ''} onChange={e => up('description', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Assunto * <span className="text-gray-400 font-normal">— use {`{{var}}`} para variáveis</span></label>
            <input className={inputCls} value={form.subject ?? ''} onChange={e => up('subject', e.target.value)} required />
          </div>
          <div>
            <label className={labelCls}>Corpo HTML *</label>
            <textarea
              className={`${inputCls} font-mono text-xs`}
              rows={10}
              value={form.bodyHtml ?? ''}
              onChange={e => up('bodyHtml', e.target.value)}
              placeholder="<h2>Olá, {{userName}}</h2>"
              required
            />
          </div>
          <div>
            <label className={labelCls}>Corpo texto (fallback)</label>
            <textarea className={`${inputCls} font-mono text-xs`} rows={3} value={form.bodyText ?? ''} onChange={e => up('bodyText', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Variáveis</label>
            <VarChips value={form.variables ?? []} onChange={v => up('variables', v)} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
            <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-brand-600"
              checked={form.active ?? true} onChange={e => up('active', e.target.checked)} />
            Ativo
          </label>
        </>
      )}

      {tab === 'preview' && (
        <div className="space-y-3">
          {previewing ? (
            <div className="flex h-48 items-center justify-center"><Loader2 size={20} className="animate-spin text-gray-400" /></div>
          ) : preview ? (
            <>
              <div className="text-xs text-gray-500">Assunto: <strong className="text-gray-900">{preview.subject}</strong></div>
              <iframe srcDoc={preview.html} className="w-full h-[480px] rounded-lg border border-gray-200 bg-white" title="Preview" />
            </>
          ) : (
            <p className="text-xs text-gray-400">Salve o template primeiro para gerar o preview com o layout completo.</p>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
        <button type="button" onClick={onCancel} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancelar</button>
        <button type="submit" disabled={submitting} className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {submitting ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </form>
  )
}

// ── EmailTab principal ────────────────────────────────────────────────────────

function EmailTab() {
  const [configs,  setConfigs]  = useState<EmailConfigRow[]>([])
  const [templates, setTemplates] = useState<EmailTemplateRow[]>([])
  const [loading,  setLoading]  = useState(true)
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; msg: string } | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [seeding,  setSeeding]  = useState(false)

  const [configDrawer, setConfigDrawer] = useState<{ open: boolean; editing?: EmailConfigRow } | null>(null)
  const [templateDrawer, setTemplateDrawer] = useState<{ open: boolean; editing?: EmailTemplateRow } | null>(null)
  const [saving, setSaving] = useState(false)

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [c, t] = await Promise.all([
        fetch('/api/master/communication/email/configs').then(r => r.json()),
        fetch('/api/master/communication/email/templates').then(r => r.json()),
      ])
      setConfigs(c.data ?? [])
      setTemplates(t.data ?? [])
    } catch {
      setFeedback({ type: 'error', msg: 'Erro ao carregar dados.' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Ações sobre EmailConfig ───────────────────────────────
  async function saveConfig(data: Partial<EmailConfigRow> & { testEmail?: string }) {
    setSaving(true)
    setFeedback(null)
    try {
      const editingId = configDrawer?.editing?.id
      const url    = editingId ? `/api/master/communication/email/configs/${editingId}` : '/api/master/communication/email/configs'
      const method = editingId ? 'PATCH' : 'POST'
      const body   = { ...data }
      delete (body as { testEmail?: string }).testEmail
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const dat = await res.json()
      if (!res.ok || !dat.success) throw new Error(dat.error ?? 'Erro ao salvar.')
      setFeedback({ type: 'success', msg: 'Servidor salvo com sucesso.' })
      setConfigDrawer(null)
      await loadAll()
      if (data.testEmail) {
        const id = editingId ?? dat.data.id
        await testConfig(id, data.testEmail)
      }
    } catch (err) {
      setFeedback({ type: 'error', msg: err instanceof Error ? err.message : 'Erro.' })
    } finally {
      setSaving(false)
    }
  }

  async function testConfig(id: string, testEmail?: string) {
    setTestingId(id)
    try {
      const res = await fetch(`/api/master/communication/email/configs/${id}/test`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ testEmail }),
      })
      const dat = await res.json()
      if (dat.success) setFeedback({ type: 'success', msg: dat.message ?? 'Teste OK.' })
      else setFeedback({ type: 'error', msg: dat.error ?? 'Falha no teste.' })
      await loadAll()
    } catch (err) {
      setFeedback({ type: 'error', msg: err instanceof Error ? err.message : 'Erro.' })
    } finally {
      setTestingId(null)
    }
  }

  async function toggleConfig(id: string) {
    await fetch(`/api/master/communication/email/configs/${id}/toggle`, { method: 'POST' })
    await loadAll()
  }
  async function setDefaultConfig(c: EmailConfigRow) {
    await fetch(`/api/master/communication/email/configs/${c.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDefault: true }),
    })
    await loadAll()
  }
  async function deleteConfig(c: EmailConfigRow) {
    if (!confirm(`Excluir servidor "${c.name}"?`)) return
    await fetch(`/api/master/communication/email/configs/${c.id}`, { method: 'DELETE' })
    await loadAll()
  }

  // ── Ações sobre Templates ────────────────────────────────
  async function saveTemplate(data: Partial<EmailTemplateRow>) {
    setSaving(true)
    setFeedback(null)
    try {
      const editingId = templateDrawer?.editing?.id
      const url    = editingId ? `/api/master/communication/email/templates/${editingId}` : '/api/master/communication/email/templates'
      const method = editingId ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      const dat = await res.json()
      if (!res.ok || !dat.success) throw new Error(dat.error ?? 'Erro ao salvar.')
      setFeedback({ type: 'success', msg: 'Template salvo.' })
      setTemplateDrawer(null)
      await loadAll()
    } catch (err) {
      setFeedback({ type: 'error', msg: err instanceof Error ? err.message : 'Erro.' })
    } finally {
      setSaving(false)
    }
  }
  async function toggleTemplate(id: string) {
    await fetch(`/api/master/communication/email/templates/${id}/toggle`, { method: 'POST' })
    await loadAll()
  }
  async function deleteTemplate(t: EmailTemplateRow) {
    if (!confirm(`Excluir template "${t.name}"?`)) return
    await fetch(`/api/master/communication/email/templates/${t.id}`, { method: 'DELETE' })
    await loadAll()
  }
  async function seedDefaults() {
    setSeeding(true)
    try {
      const res = await fetch('/api/master/communication/email/templates/seed', { method: 'POST' })
      const dat = await res.json()
      if (dat.success) {
        setFeedback({ type: 'success', msg: `${dat.created} criados, ${dat.skipped} já existiam.` })
        await loadAll()
      } else {
        setFeedback({ type: 'error', msg: dat.error ?? 'Erro ao criar templates padrão.' })
      }
    } finally { setSeeding(false) }
  }

  if (loading) return <div className="flex h-48 items-center justify-center"><Loader2 size={20} className="animate-spin text-gray-400" /></div>

  // Agrupar por propósito
  const configsByPurpose = EMAIL_PURPOSES.map(p => ({ p, items: configs.filter(c => c.purpose === p.value) }))
  const templatesByPurpose = EMAIL_PURPOSES.map(p => ({ p, items: templates.filter(t => t.purpose === p.value) }))

  return (
    <div className="space-y-8">
      {feedback && <Alert type={feedback.type} msg={feedback.msg} />}

      {/* ── SECTION A — SERVIDORES ─────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Server size={16} className="text-brand-600" />
            <h2 className="text-sm font-semibold text-gray-900">Servidores de E-mail</h2>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{configs.length}</span>
          </div>
          <button
            onClick={() => setConfigDrawer({ open: true })}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
          >
            <Plus size={13} /> Novo servidor
          </button>
        </div>

        {configs.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-gray-200 p-8 text-center">
            <Mail size={28} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm text-gray-500">Nenhum servidor cadastrado.</p>
            <p className="text-xs text-gray-400 mt-1">Crie pelo menos um servidor para o propósito SYSTEM.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {configsByPurpose.map(({ p, items }) => items.length === 0 ? null : (
              <div key={p.value}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${p.color}`}>{p.label}</span>
                  <span className="text-xs text-gray-400">{p.desc}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {items.map(c => (
                    <div key={c.id} className="rounded-xl border border-gray-200 bg-white p-4 hover:border-brand-300 transition-colors">
                      <div className="flex items-start justify-between mb-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h3 className="text-sm font-semibold text-gray-900 truncate">{c.name}</h3>
                            {c.isDefault && <Star size={12} className="text-amber-500 fill-amber-500" />}
                            {(() => {
                              const pr = EMAIL_PROVIDERS.find(p => p.value === (c.provider ?? 'smtp')) ?? EMAIL_PROVIDERS[0]
                              return <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${pr.color}`}>{pr.label}</span>
                            })()}
                          </div>
                          <p className="text-xs text-gray-500 truncate">{c.fromEmail}</p>
                          <p className="text-xs text-gray-400 truncate">
                            {c.provider === 'smtp' || !c.provider
                              ? `${c.smtpHost ?? '—'}:${c.smtpPort}`
                              : c.provider === 'mailgun'
                              ? (c.domain ?? '—')
                              : c.provider === 'ses'
                              ? `region: ${c.region ?? '—'}`
                              : 'API'}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                            c.active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
                          }`}>
                            <Power size={9} /> {c.active ? 'Ativo' : 'Inativo'}
                          </span>
                          {c.lastTestedAt && (
                            <span className={`text-xs ${c.lastTestOk ? 'text-emerald-600' : 'text-red-600'}`}>
                              {c.lastTestOk ? '✓' : '✗'} testado
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t border-gray-100">
                        <button onClick={() => setConfigDrawer({ open: true, editing: c })}
                          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100">
                          <Pencil size={11} /> Editar
                        </button>
                        <button onClick={() => testConfig(c.id)} disabled={testingId === c.id}
                          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-brand-600 hover:bg-brand-50 disabled:opacity-50">
                          {testingId === c.id ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />} Testar
                        </button>
                        <button onClick={() => toggleConfig(c.id)}
                          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100">
                          <Power size={11} /> {c.active ? 'Desativar' : 'Ativar'}
                        </button>
                        {!c.isDefault && (
                          <button onClick={() => setDefaultConfig(c)}
                            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-amber-600 hover:bg-amber-50">
                            <Star size={11} /> Padrão
                          </button>
                        )}
                        <button onClick={() => deleteConfig(c)}
                          className="ml-auto flex items-center gap-1 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50">
                          <Trash2 size={11} /> Excluir
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── SECTION B — TEMPLATES ──────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Layers size={16} className="text-brand-600" />
            <h2 className="text-sm font-semibold text-gray-900">Templates de E-mail</h2>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{templates.length}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={seedDefaults} disabled={seeding}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
              {seeding ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              Criar padrões
            </button>
            <button onClick={() => setTemplateDrawer({ open: true })}
              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">
              <Plus size={13} /> Novo template
            </button>
          </div>
        </div>

        {templates.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-gray-200 p-8 text-center">
            <FileText size={28} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm text-gray-500">Nenhum template criado.</p>
            <p className="text-xs text-gray-400 mt-1">Clique em &quot;Criar padrões&quot; para gerar os templates base do AutoDrive.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {templatesByPurpose.map(({ p, items }) => items.length === 0 ? null : (
              <div key={p.value}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${p.color}`}>{p.label}</span>
                </div>
                <div className="overflow-hidden rounded-xl border border-gray-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-500">
                        <th className="px-3 py-2 text-left">Nome</th>
                        <th className="px-3 py-2 text-left">Key</th>
                        <th className="px-3 py-2 text-left">Assunto</th>
                        <th className="px-3 py-2 text-center">Variáveis</th>
                        <th className="px-3 py-2 text-center">Ativo</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {items.map(t => (
                        <tr key={t.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium text-gray-900">{t.name}</td>
                          <td className="px-3 py-2 font-mono text-xs text-gray-500">{t.key}</td>
                          <td className="px-3 py-2 text-xs text-gray-600 max-w-[260px] truncate" title={t.subject}>{t.subject}</td>
                          <td className="px-3 py-2 text-center text-xs text-gray-600">{t.variables.length}</td>
                          <td className="px-3 py-2 text-center">
                            <button onClick={() => toggleTemplate(t.id)}
                              className={`inline-flex h-5 w-9 items-center rounded-full transition ${t.active ? 'bg-brand-600' : 'bg-gray-300'}`}>
                              <span className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${t.active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                            </button>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex justify-end gap-1">
                              <button onClick={() => setTemplateDrawer({ open: true, editing: t })}
                                className="rounded p-1 text-gray-500 hover:bg-gray-100" title="Editar">
                                <Pencil size={12} />
                              </button>
                              <button onClick={() => deleteTemplate(t)}
                                className="rounded p-1 text-red-500 hover:bg-red-50" title="Excluir">
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Painel legado para teste rápido global ─────────────────────── */}
      <details className="rounded-xl border border-dashed border-gray-200 p-4">
        <summary className="cursor-pointer text-xs font-medium text-gray-500">Teste rápido (config legada via SystemSetting)</summary>
        <div className="mt-3">
          <TestPanel
            channel="email"
            placeholder="destinatario@exemplo.com"
            label="Usa a configuração legada (SystemSetting group='email') ou faz fallback automático para o servidor SYSTEM padrão."
            inputType="email"
            icon={Mail}
            onTest={async to => {
              const res = await fetch('/api/master/communication/email/test', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to }),
              })
              return res.json()
            }}
          />
        </div>
      </details>

      {/* ── Drawers ────────────────────────────────────────────────────── */}
      <Drawer
        open={!!configDrawer?.open}
        onClose={() => setConfigDrawer(null)}
        title={configDrawer?.editing ? 'Editar servidor de e-mail' : 'Novo servidor de e-mail'}
      >
        <EmailConfigForm
          initial={configDrawer?.editing}
          submitting={saving}
          onCancel={() => setConfigDrawer(null)}
          onSubmit={saveConfig}
        />
      </Drawer>

      <Drawer
        open={!!templateDrawer?.open}
        onClose={() => setTemplateDrawer(null)}
        title={templateDrawer?.editing ? 'Editar template' : 'Novo template'}
        width="max-w-2xl"
      >
        <EmailTemplateForm
          initial={templateDrawer?.editing}
          submitting={saving}
          onCancel={() => setTemplateDrawer(null)}
          onSubmit={saveTemplate}
        />
      </Drawer>
    </div>
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
    <div className="space-y-6">
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
          <p className="text-xs text-gray-400">Clique em &quot;Testar conexão Meta&quot; para validar token e Phone Number ID sem enviar mensagem.</p>
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
    {/* ── SECTION: Templates de WhatsApp (fora do form para evitar form aninhado) ── */}
    <WhatsappTemplatesSection />
    </div>
  )
}

// ── Section: Templates de WhatsApp ───────────────────────────────────────────

type WhatsappPurpose = 'GENERAL' | 'NOTICES' | 'PROFILE_CHANGED' | 'PASSWORD_RESET' | 'PENDENCY' | 'NEGOTIATION'

const WHATSAPP_PURPOSES: { value: WhatsappPurpose; label: string; color: string }[] = [
  { value: 'GENERAL',         label: 'Geral',             color: 'bg-slate-100 text-slate-700' },
  { value: 'NOTICES',         label: 'Avisos',            color: 'bg-blue-100 text-blue-700' },
  { value: 'PROFILE_CHANGED', label: 'Alteração perfil',  color: 'bg-emerald-100 text-emerald-700' },
  { value: 'PASSWORD_RESET',  label: 'Recuperar senha',   color: 'bg-amber-100 text-amber-700' },
  { value: 'PENDENCY',        label: 'Pendência',         color: 'bg-violet-100 text-violet-700' },
  { value: 'NEGOTIATION',     label: 'Negociação',        color: 'bg-rose-100 text-rose-700' },
]

interface WhatsappTemplateRow {
  id:                  string
  tenantId:            string | null
  name:                string
  description:         string | null
  templateName:        string
  purpose:             string | null
  bodyText:            string | null
  variables:           string[]
  hasHeaderImage:      boolean
  headerImageUrl:      string | null
  expectedParamsCount: number
  active:              boolean
}

function WhatsappTemplateForm({ initial, onSubmit, onCancel, submitting }: {
  initial?: Partial<WhatsappTemplateRow>
  onSubmit: (data: Partial<WhatsappTemplateRow>) => Promise<void>
  onCancel: () => void
  submitting: boolean
}) {
  const [form, setForm] = useState<Partial<WhatsappTemplateRow>>({
    name:           initial?.name           ?? '',
    description:    initial?.description    ?? '',
    templateName:   initial?.templateName   ?? '',
    purpose:        initial?.purpose        ?? 'GENERAL',
    bodyText:       initial?.bodyText       ?? '',
    variables:      initial?.variables      ?? [],
    hasHeaderImage: initial?.hasHeaderImage ?? false,
    headerImageUrl: initial?.headerImageUrl ?? '',
    active:         initial?.active         ?? true,
  })
  function up<K extends keyof typeof form>(k: K, v: (typeof form)[K]) { setForm(p => ({ ...p, [k]: v })) }
  return (
    <form onSubmit={async e => { e.preventDefault(); await onSubmit(form) }} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Nome (exibição) *</label>
          <input className={inputCls} value={form.name ?? ''} onChange={e => up('name', e.target.value)} required />
        </div>
        <div>
          <label className={labelCls}>Propósito *</label>
          <select className={inputCls} value={form.purpose ?? 'GENERAL'} onChange={e => up('purpose', e.target.value as WhatsappPurpose)}>
            {WHATSAPP_PURPOSES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className={labelCls}>Nome técnico (template Meta aprovado) *</label>
        <input className={`${inputCls} font-mono`} value={form.templateName ?? ''} onChange={e => up('templateName', e.target.value)} placeholder="welcome_message" required />
      </div>
      <div>
        <label className={labelCls}>Descrição</label>
        <input className={inputCls} value={form.description ?? ''} onChange={e => up('description', e.target.value)} />
      </div>
      <div>
        <label className={labelCls}>Body text (use {`{{1}}`}, {`{{2}}`}...) </label>
        <textarea className={`${inputCls} font-mono text-xs`} rows={5} value={form.bodyText ?? ''} onChange={e => up('bodyText', e.target.value)} placeholder="Olá {{1}}, seu pedido foi atualizado." />
      </div>
      <div>
        <label className={labelCls}>Variáveis</label>
        <VarChips value={form.variables ?? []} onChange={v => up('variables', v)} />
      </div>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
          <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-brand-600"
            checked={form.hasHeaderImage ?? false} onChange={e => up('hasHeaderImage', e.target.checked)} />
          <ImageIcon size={12} /> Tem header de imagem
        </label>
        <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
          <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-brand-600"
            checked={form.active ?? true} onChange={e => up('active', e.target.checked)} />
          Ativo
        </label>
      </div>
      {form.hasHeaderImage && (
        <div>
          <label className={labelCls}>URL da imagem de header</label>
          <input className={inputCls} value={form.headerImageUrl ?? ''} onChange={e => up('headerImageUrl', e.target.value)} placeholder="https://..." />
        </div>
      )}
      <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
        <button type="button" onClick={onCancel} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancelar</button>
        <button type="submit" disabled={submitting} className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {submitting ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </form>
  )
}

function WhatsappTemplatesSection() {
  const [rows, setRows] = useState<WhatsappTemplateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [drawer, setDrawer] = useState<{ open: boolean; editing?: WhatsappTemplateRow } | null>(null)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; msg: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/master/communication/whatsapp/templates').then(r => r.json())
      setRows(r.data ?? [])
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  async function save(data: Partial<WhatsappTemplateRow>) {
    setSaving(true); setFeedback(null)
    try {
      const editingId = drawer?.editing?.id
      const url    = editingId ? `/api/master/communication/whatsapp/templates/${editingId}` : '/api/master/communication/whatsapp/templates'
      const method = editingId ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      const dat = await res.json()
      if (!res.ok || !dat.success) throw new Error(dat.error ?? 'Erro ao salvar.')
      setFeedback({ type: 'success', msg: 'Template salvo.' })
      setDrawer(null)
      await load()
    } catch (err) {
      setFeedback({ type: 'error', msg: err instanceof Error ? err.message : 'Erro.' })
    } finally { setSaving(false) }
  }
  async function toggle(id: string) {
    await fetch(`/api/master/communication/whatsapp/templates/${id}/toggle`, { method: 'POST' })
    await load()
  }
  async function remove(t: WhatsappTemplateRow) {
    if (!confirm(`Excluir template "${t.name}"?`)) return
    await fetch(`/api/master/communication/whatsapp/templates/${t.id}`, { method: 'DELETE' })
    await load()
  }

  const byPurpose = WHATSAPP_PURPOSES.map(p => ({ p, items: rows.filter(r => (r.purpose ?? 'GENERAL') === p.value) }))

  return (
    <div className="rounded-xl border border-gray-200 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers size={15} className="text-brand-600" />
          <p className="text-sm font-semibold text-gray-800">Templates de WhatsApp</p>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{rows.length}</span>
        </div>
        <button type="button" onClick={() => setDrawer({ open: true })}
          className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">
          <Plus size={12} /> Novo template
        </button>
      </div>

      {feedback && <Alert type={feedback.type} msg={feedback.msg} />}

      {loading ? (
        <div className="flex h-24 items-center justify-center"><Loader2 size={18} className="animate-spin text-gray-400" /></div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-gray-400 py-4 text-center">Nenhum template cadastrado.</p>
      ) : (
        <div className="space-y-4">
          {byPurpose.map(({ p, items }) => items.length === 0 ? null : (
            <div key={p.value}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${p.color}`}>{p.label}</span>
              </div>
              <div className="overflow-hidden rounded-lg border border-gray-200">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-gray-50 text-gray-500">
                      <th className="px-3 py-2 text-left">Nome</th>
                      <th className="px-3 py-2 text-left">Template Meta</th>
                      <th className="px-3 py-2 text-center">Vars</th>
                      <th className="px-3 py-2 text-center">Img</th>
                      <th className="px-3 py-2 text-center">Ativo</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {items.map(t => (
                      <tr key={t.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium text-gray-800">{t.name}</td>
                        <td className="px-3 py-2 font-mono text-gray-600">{t.templateName}</td>
                        <td className="px-3 py-2 text-center text-gray-600">{t.variables.length}</td>
                        <td className="px-3 py-2 text-center">{t.hasHeaderImage ? <CheckCircle2 size={12} className="inline text-emerald-500" /> : '—'}</td>
                        <td className="px-3 py-2 text-center">
                          <button type="button" onClick={() => toggle(t.id)}
                            className={`inline-flex h-5 w-9 items-center rounded-full transition ${t.active ? 'bg-brand-600' : 'bg-gray-300'}`}>
                            <span className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${t.active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                          </button>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex justify-end gap-1">
                            <button type="button" onClick={() => setDrawer({ open: true, editing: t })} className="rounded p-1 text-gray-500 hover:bg-gray-100" title="Editar"><Pencil size={11} /></button>
                            <button type="button" onClick={() => remove(t)} className="rounded p-1 text-red-500 hover:bg-red-50" title="Excluir"><Trash2 size={11} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      <Drawer
        open={!!drawer?.open}
        onClose={() => setDrawer(null)}
        title={drawer?.editing ? 'Editar template WhatsApp' : 'Novo template WhatsApp'}
      >
        <WhatsappTemplateForm
          initial={drawer?.editing}
          submitting={saving}
          onCancel={() => setDrawer(null)}
          onSubmit={save}
        />
      </Drawer>
    </div>
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
