'use client'

// =============================================================================
// Configurações de E-mail — AutoDrive
// SMTP settings para envio de notificações e relatórios por e-mail
// Apenas MASTER pode configurar. Tenants são redirecionados para /master/communication.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Mail, Save, Eye, EyeOff, Loader2, CheckCircle2, AlertCircle, Send, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EmailConfig {
  id?:          string
  host:         string
  port:         number
  secure:       boolean
  user:         string
  password:     string
  fromName:     string
  fromEmail:    string
  active:       boolean
}

const DEFAULTS: EmailConfig = {
  host: '', port: 587, secure: false,
  user: '', password: '', fromName: 'AutoDrive', fromEmail: '', active: true,
}

export default function EmailConfigPage() {
  const { data: session } = useSession()
  const isMaster = (session?.user as { role?: string })?.role === 'MASTER'

  const [config, setConfig]             = useState<EmailConfig>(DEFAULTS)
  const [loading, setLoading]           = useState(true)
  const [saving, setSaving]             = useState(false)
  const [testing, setTesting]           = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [testEmail, setTestEmail]       = useState('')
  const [feedback, setFeedback]         = useState<{ ok: boolean; msg: string } | null>(null)

  const fetchConfig = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/settings/email', { credentials: 'include' })
      const data = await res.json()
      if (data.success && data.data) {
        setConfig({ ...DEFAULTS, ...data.data, password: '' })
      }
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchConfig() }, [fetchConfig])

  // Tenants não-MASTER não acessam esta página — a config é gerenciada pelo MASTER
  if (session && !isMaster) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <Lock size={24} />
        </div>
        <div>
          <p className="text-lg font-semibold text-gray-800">Configuração centralizada</p>
          <p className="mt-1 max-w-md text-sm text-gray-500">
            As configurações de e-mail são gerenciadas globalmente pelo administrador da plataforma.
            Entre em contato com o suporte se precisar alterar as configurações.
          </p>
        </div>
      </div>
    )
  }

  const set = (key: keyof EmailConfig, value: unknown) =>
    setConfig((p) => ({ ...p, [key]: value }))

  const handleSave = async () => {
    setSaving(true)
    setFeedback(null)
    try {
      const res  = await fetch('/api/settings/email', {
        method:  config.id ? 'PATCH' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      const data = await res.json()
      setFeedback({ ok: data.success, msg: data.success ? 'Configuração salva com sucesso.' : (data.error ?? 'Erro ao salvar.') })
      if (data.success && data.data) setConfig((p) => ({ ...p, id: data.data.id, password: '' }))
    } catch {
      setFeedback({ ok: false, msg: 'Erro de conexão.' })
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    if (!testEmail.trim()) return
    setTesting(true)
    setFeedback(null)
    try {
      const res  = await fetch('/api/settings/email/test', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testEmail }),
      })
      const data = await res.json()
      setFeedback({ ok: data.success, msg: data.success ? `E-mail de teste enviado para ${testEmail}.` : (data.error ?? 'Falha no teste.') })
    } catch {
      setFeedback({ ok: false, msg: 'Erro ao testar conexão.' })
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100" />
        ))}
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Configuração de E-mail</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Configure o servidor SMTP para envio de notificações e relatórios por e-mail.
        </p>
      </div>

      {/* ── Feedback ──────────────────────────────────────────────────────── */}
      {feedback && (
        <div className={cn(
          'flex items-center gap-2 rounded-xl px-4 py-3 text-sm animate-fade-in',
          feedback.ok
            ? 'bg-green-50 border border-green-200 text-green-700'
            : 'bg-red-50 border border-red-200 text-red-700',
        )}>
          {feedback.ok ? <CheckCircle2 size={15} className="shrink-0" /> : <AlertCircle size={15} className="shrink-0" />}
          {feedback.msg}
        </div>
      )}

      {/* ── Servidor SMTP ─────────────────────────────────────────────────── */}
      <div className="card">
        <div className="section-header">
          <Mail size={15} className="text-brand-700" />
          <h2 className="text-sm font-semibold text-gray-800">Servidor SMTP</h2>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="label">Host SMTP *</label>
              <input
                value={config.host}
                onChange={(e) => set('host', e.target.value)}
                placeholder="smtp.gmail.com"
                className="input"
              />
            </div>
            <div>
              <label className="label">Porta *</label>
              <input
                type="number"
                value={config.port}
                onChange={(e) => set('port', Number(e.target.value))}
                placeholder="587"
                className="input"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Usuário / E-mail *</label>
              <input
                value={config.user}
                onChange={(e) => set('user', e.target.value)}
                placeholder="seu@email.com"
                type="email"
                className="input"
              />
            </div>
            <div>
              <label className="label">Senha / App Password *</label>
              <div className="relative">
                <input
                  value={config.password}
                  onChange={(e) => set('password', e.target.value)}
                  placeholder={config.id ? '(mantém a senha atual)' : 'senha do app'}
                  type={showPassword ? 'text' : 'password'}
                  className="input pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="secure"
              checked={config.secure}
              onChange={(e) => set('secure', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            <label htmlFor="secure" className="text-sm text-gray-700">
              Usar TLS/SSL (porta 465)
            </label>
          </div>
        </div>
      </div>

      {/* ── Remetente ─────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="section-header">
          <Mail size={15} className="text-brand-700" />
          <h2 className="text-sm font-semibold text-gray-800">Dados do Remetente</h2>
        </div>
        <div className="p-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Nome do remetente</label>
            <input
              value={config.fromName}
              onChange={(e) => set('fromName', e.target.value)}
              placeholder="AutoDrive"
              className="input"
            />
          </div>
          <div>
            <label className="label">E-mail do remetente</label>
            <input
              value={config.fromEmail}
              onChange={(e) => set('fromEmail', e.target.value)}
              placeholder="noreply@autodrive.com.br"
              type="email"
              className="input"
            />
          </div>
        </div>
      </div>

      {/* ── Status ────────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="p-4">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="active"
              checked={config.active}
              onChange={(e) => set('active', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            <div>
              <label htmlFor="active" className="text-sm font-medium text-gray-700">
                Envio de e-mail ativo
              </label>
              <p className="text-xs text-gray-400">
                Desativando, nenhum e-mail será enviado pelo sistema.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Botão salvar ──────────────────────────────────────────────────── */}
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving
            ? <><Loader2 size={14} className="animate-spin" />Salvando...</>
            : <><Save size={14} />Salvar configuração</>}
        </button>
      </div>

      {/* ── Teste de conexão ──────────────────────────────────────────────── */}
      {config.id && (
        <div className="card">
          <div className="section-header">
            <Send size={15} className="text-brand-700" />
            <h2 className="text-sm font-semibold text-gray-800">Testar Configuração</h2>
          </div>
          <div className="p-4 space-y-3">
            <p className="text-sm text-gray-500">
              Envie um e-mail de teste para verificar se as configurações estão corretas.
            </p>
            <div className="flex gap-2">
              <input
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="destinatario@email.com"
                type="email"
                className="input flex-1"
              />
              <button onClick={handleTest} disabled={testing || !testEmail.trim()} className="btn-secondary">
                {testing
                  ? <><Loader2 size={13} className="animate-spin" />Testando...</>
                  : <><Send size={13} />Testar</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
