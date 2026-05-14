'use client'

// =============================================================================
// Identidade do Sistema — AutoDrive
// Nome, logo, cores e dados gerais da instalação
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Palette, Save, Loader2, CheckCircle2, AlertCircle, Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { injectTheme } from '@/components/layout/ThemeInjector'
import { useIdentityStore } from '@/store/identityStore'

interface IdentityForm {
  appName:        string
  appTagline:     string
  companyName:    string
  companyEmail:   string
  companyPhone:   string
  companyAddress: string
  primaryColor:   string
  logoUrl:        string
  faviconUrl:     string
  supportEmail:   string
  supportPhone:   string
  timezone:       string
  locale:         string
}

const DEFAULTS: IdentityForm = {
  appName:        'AutoDrive',
  appTagline:     'Sua loja no piloto automático',
  companyName:    '',
  companyEmail:   '',
  companyPhone:   '',
  companyAddress: '',
  primaryColor:   '#166534',
  logoUrl:        '',
  faviconUrl:     '',
  supportEmail:   '',
  supportPhone:   '',
  timezone:       'America/Sao_Paulo',
  locale:         'pt-BR',
}

const PRESET_COLORS = [
  { name: 'Verde AutoDrive',  value: '#166534' },
  { name: 'Azul corporativo', value: '#1D4ED8' },
  { name: 'Roxo',             value: '#7C3AED' },
  { name: 'Vermelho',         value: '#B91C1C' },
  { name: 'Laranja',          value: '#C2410C' },
  { name: 'Cinza escuro',     value: '#374151' },
]

export default function IdentidadePage() {
  const [form, setForm]           = useState<IdentityForm>(DEFAULTS)
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [feedback, setFeedback]   = useState<{ ok: boolean; msg: string } | null>(null)
  const setIdentity               = useIdentityStore((s) => s.setIdentity)

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/settings/identity', { credentials: 'include' })
      const data = await res.json()
      if (data.success && data.data) {
        setForm((p) => ({ ...p, ...data.data }))
        // Aplica a cor salva imediatamente ao carregar a página
        if (data.data.primaryColor) injectTheme(data.data.primaryColor)
        // Sincroniza nome/tagline no store
        setIdentity(data.data.appName ?? '', data.data.appTagline ?? '')
      }
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchSettings() }, [fetchSettings])

  const set = (key: keyof IdentityForm, value: string) =>
    setForm((p) => ({ ...p, [key]: value }))

  const handleSave = async () => {
    setSaving(true)
    setFeedback(null)
    try {
      const res  = await fetch('/api/settings/identity', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      setFeedback({
        ok: data.success,
        msg: data.success ? 'Identidade salva com sucesso.' : (data.error ?? 'Erro ao salvar.'),
      })
      if (data.success) {
        // Aplica a nova cor imediatamente ao DOM, sem precisar recarregar a página
        if (form.primaryColor) injectTheme(form.primaryColor)
        // Atualiza nome/tagline na Topbar e demais componentes em tempo real
        setIdentity(form.appName, form.appTagline)
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
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-100" />
        ))}
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Identidade do Sistema</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Personalize o nome, logotipo e dados da empresa exibidos no sistema.
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

      {/* ── Aplicação ─────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="section-header">
          <Palette size={15} className="text-brand-700" />
          <h2 className="text-sm font-semibold text-gray-800">Aplicação</h2>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Nome do sistema *</label>
              <input
                value={form.appName}
                onChange={(e) => set('appName', e.target.value)}
                placeholder="AutoDrive"
                className="input"
              />
            </div>
            <div>
              <label className="label">Slogan / Tagline</label>
              <input
                value={form.appTagline}
                onChange={(e) => set('appTagline', e.target.value)}
                placeholder="Sua loja no piloto automático"
                className="input"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">URL do Logo</label>
              <input
                value={form.logoUrl}
                onChange={(e) => set('logoUrl', e.target.value)}
                placeholder="https://cdn.example.com/logo.png"
                className="input"
              />
            </div>
            <div>
              <label className="label">URL do Favicon</label>
              <input
                value={form.faviconUrl}
                onChange={(e) => set('faviconUrl', e.target.value)}
                placeholder="https://cdn.example.com/favicon.ico"
                className="input"
              />
            </div>
          </div>

          {/* Cor primária */}
          <div>
            <label className="label">Cor primária</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={form.primaryColor}
                onChange={(e) => set('primaryColor', e.target.value)}
                className="h-9 w-16 cursor-pointer rounded border border-gray-300 p-0.5"
              />
              <span className="font-mono text-sm text-gray-700">{form.primaryColor}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => set('primaryColor', c.value)}
                  title={c.name}
                  className={cn(
                    'h-7 w-7 rounded-full border-2 transition-all',
                    form.primaryColor === c.value ? 'border-gray-900 scale-110' : 'border-transparent',
                  )}
                  style={{ backgroundColor: c.value }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Empresa ───────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="section-header">
          <Building2 size={15} className="text-brand-700" />
          <h2 className="text-sm font-semibold text-gray-800">Dados da Empresa</h2>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="label">Razão Social / Nome</label>
            <input
              value={form.companyName}
              onChange={(e) => set('companyName', e.target.value)}
              placeholder="AutoDrive Veículos LTDA"
              className="input"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">E-mail da empresa</label>
              <input
                value={form.companyEmail}
                onChange={(e) => set('companyEmail', e.target.value)}
                placeholder="contato@empresa.com.br"
                type="email"
                className="input"
              />
            </div>
            <div>
              <label className="label">Telefone</label>
              <input
                value={form.companyPhone}
                onChange={(e) => set('companyPhone', e.target.value)}
                placeholder="(11) 99999-0000"
                className="input"
              />
            </div>
          </div>
          <div>
            <label className="label">Endereço</label>
            <input
              value={form.companyAddress}
              onChange={(e) => set('companyAddress', e.target.value)}
              placeholder="Rua das Flores, 123 — São Paulo, SP"
              className="input"
            />
          </div>
        </div>
      </div>

      {/* ── Suporte ───────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="section-header">
          <Building2 size={15} className="text-brand-700" />
          <h2 className="text-sm font-semibold text-gray-800">Suporte ao Usuário</h2>
        </div>
        <div className="p-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">E-mail de suporte</label>
            <input
              value={form.supportEmail}
              onChange={(e) => set('supportEmail', e.target.value)}
              placeholder="suporte@empresa.com.br"
              type="email"
              className="input"
            />
          </div>
          <div>
            <label className="label">Telefone de suporte</label>
            <input
              value={form.supportPhone}
              onChange={(e) => set('supportPhone', e.target.value)}
              placeholder="(11) 98888-0000"
              className="input"
            />
          </div>
        </div>
      </div>

      {/* ── Regional ──────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="section-header">
          <Palette size={15} className="text-brand-700" />
          <h2 className="text-sm font-semibold text-gray-800">Regional</h2>
        </div>
        <div className="p-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Fuso horário</label>
            <select value={form.timezone} onChange={(e) => set('timezone', e.target.value)} className="input">
              <option value="America/Sao_Paulo">America/São_Paulo (BRT, GMT-3)</option>
              <option value="America/Manaus">America/Manaus (AMT, GMT-4)</option>
              <option value="America/Belem">America/Belém (BRT, GMT-3)</option>
              <option value="America/Fortaleza">America/Fortaleza (BRT, GMT-3)</option>
              <option value="America/Recife">America/Recife (BRT, GMT-3)</option>
              <option value="America/Noronha">America/Noronha (FNT, GMT-2)</option>
            </select>
          </div>
          <div>
            <label className="label">Idioma</label>
            <select value={form.locale} onChange={(e) => set('locale', e.target.value)} className="input">
              <option value="pt-BR">Português (Brasil)</option>
              <option value="pt-PT">Português (Portugal)</option>
              <option value="en-US">English (US)</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Salvar ────────────────────────────────────────────────────────── */}
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving
            ? <><Loader2 size={14} className="animate-spin" />Salvando...</>
            : <><Save size={14} />Salvar identidade</>}
        </button>
      </div>
    </div>
  )
}
