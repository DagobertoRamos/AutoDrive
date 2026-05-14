'use client'

// =============================================================================
// /master/identity — Identidade global do sistema (MASTER only)
// =============================================================================

import { useState, useEffect } from 'react'
import { useSession }          from 'next-auth/react'
import { useRouter }           from 'next/navigation'
import {
  Palette, Loader2, AlertCircle, CheckCircle2, Save, Globe,
  Mail, Phone, Link as LinkIcon, Clock,
} from 'lucide-react'

interface Identity {
  id:             string
  systemName:     string
  systemSlogan:   string | null
  logoUrl:        string | null
  faviconUrl:     string | null
  primaryColor:   string
  secondaryColor: string | null
  accentColor:    string | null
  footerText:     string | null
  supportEmail:   string | null
  supportPhone:   string | null
  supportUrl:     string | null
  termsUrl:       string | null
  privacyUrl:     string | null
  customDomain:   string | null
  timezone:       string
  locale:         string
  currency:       string
}

const TIMEZONES = [
  'America/Sao_Paulo', 'America/Manaus', 'America/Belem',
  'America/Fortaleza', 'America/Recife', 'America/Maceio',
  'America/Bahia', 'America/Campo_Grande', 'America/Cuiaba',
  'America/Porto_Velho', 'America/Boa_Vista', 'America/Rio_Branco',
  'America/Noronha', 'UTC',
]

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const labelCls = 'text-xs font-medium text-gray-600 block mb-1'

export default function SystemIdentityPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [form,    setForm]    = useState<Partial<Identity>>({})
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role !== 'MASTER') router.replace('/inicio')
  }, [session, status, router])

  useEffect(() => {
    if (session?.user?.role !== 'MASTER') return
    fetch('/api/master/system-identity')
      .then(r => r.json())
      .then(d => setForm(d.data ?? {}))
      .catch(() => setError('Erro ao carregar identidade.'))
      .finally(() => setLoading(false))
  }, [session])

  function set(k: keyof Identity) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(p => ({ ...p, [k]: e.target.value }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setSuccess('')
    setSaving(true)
    try {
      const res  = await fetch('/api/master/system-identity', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao salvar.')
      setSuccess('Identidade do sistema atualizada com sucesso.')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro.')
    } finally {
      setSaving(false)
    }
  }

  if (status === 'loading' || loading) {
    return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" /></div>
  }

  return (
    <div className="max-w-3xl space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-600">
          <Palette size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Identidade do Sistema</h1>
          <p className="text-xs text-gray-400">Nome, marca, cores e informações globais da plataforma</p>
        </div>
      </div>

      {error   && <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle size={15} />{error}</div>}
      {success && <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"><CheckCircle2 size={15} />{success}</div>}

      <form onSubmit={handleSave} className="space-y-5">

        {/* Identidade */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <h2 className="font-semibold text-gray-800 text-sm">Identidade da Plataforma</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Nome do sistema *</label>
              <input className={inputCls} value={form.systemName ?? ''} onChange={set('systemName')} placeholder="AutoDrive" />
            </div>
            <div>
              <label className={labelCls}>Slogan</label>
              <input className={inputCls} value={form.systemSlogan ?? ''} onChange={set('systemSlogan')} placeholder="Sua loja no piloto automático" />
            </div>
            <div>
              <label className={labelCls}>URL do logotipo</label>
              <input className={inputCls} value={form.logoUrl ?? ''} onChange={set('logoUrl')} placeholder="https://cdn.seudominio.com/logo.png" />
            </div>
            <div>
              <label className={labelCls}>URL do favicon</label>
              <input className={inputCls} value={form.faviconUrl ?? ''} onChange={set('faviconUrl')} placeholder="https://cdn.seudominio.com/favicon.ico" />
            </div>
          </div>
          <div>
            <label className={labelCls}>Rodapé (footer)</label>
            <input className={inputCls} value={form.footerText ?? ''} onChange={set('footerText')} placeholder="© 2026 AutoDrive — Todos os direitos reservados" />
          </div>
        </div>

        {/* Cores */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <h2 className="flex items-center gap-2 font-semibold text-gray-800 text-sm"><Palette size={14} className="text-rose-600" />Cores</h2>
          <div className="grid grid-cols-3 gap-4">
            {([
              ['primaryColor',   'Cor primária'],
              ['secondaryColor', 'Cor secundária'],
              ['accentColor',    'Cor de destaque'],
            ] as [keyof Identity, string][]).map(([k, label]) => (
              <div key={k}>
                <label className={labelCls}>{label}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    className="h-9 w-12 cursor-pointer rounded border border-gray-300"
                    value={form[k] as string || '#166534'}
                    onChange={set(k)}
                  />
                  <input
                    className={inputCls}
                    value={form[k] as string || ''}
                    onChange={set(k)}
                    placeholder="#166534"
                    maxLength={7}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Suporte */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <h2 className="flex items-center gap-2 font-semibold text-gray-800 text-sm"><Mail size={14} className="text-rose-600" />Contato e Suporte</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}><span className="flex items-center gap-1"><Mail size={11} />E-mail de suporte</span></label>
              <input type="email" className={inputCls} value={form.supportEmail ?? ''} onChange={set('supportEmail')} placeholder="suporte@seudominio.com.br" />
            </div>
            <div>
              <label className={labelCls}><span className="flex items-center gap-1"><Phone size={11} />Telefone de suporte</span></label>
              <input className={inputCls} value={form.supportPhone ?? ''} onChange={set('supportPhone')} placeholder="(11) 9 0000-0000" />
            </div>
            <div>
              <label className={labelCls}><span className="flex items-center gap-1"><LinkIcon size={11} />URL de suporte / help center</span></label>
              <input className={inputCls} value={form.supportUrl ?? ''} onChange={set('supportUrl')} placeholder="https://ajuda.seudominio.com" />
            </div>
            <div>
              <label className={labelCls}><span className="flex items-center gap-1"><Globe size={11} />Domínio padrão</span></label>
              <input className={inputCls} value={form.customDomain ?? ''} onChange={set('customDomain')} placeholder="app.seudominio.com.br" />
            </div>
          </div>
        </div>

        {/* Links legais */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <h2 className="font-semibold text-gray-800 text-sm">Links Legais</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Termos de Uso</label>
              <input className={inputCls} value={form.termsUrl ?? ''} onChange={set('termsUrl')} placeholder="https://seudominio.com/termos" />
            </div>
            <div>
              <label className={labelCls}>Política de Privacidade</label>
              <input className={inputCls} value={form.privacyUrl ?? ''} onChange={set('privacyUrl')} placeholder="https://seudominio.com/privacidade" />
            </div>
          </div>
        </div>

        {/* Localização */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <h2 className="flex items-center gap-2 font-semibold text-gray-800 text-sm"><Clock size={14} className="text-rose-600" />Localização Padrão</h2>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Fuso horário</label>
              <select className={inputCls} value={form.timezone ?? 'America/Sao_Paulo'} onChange={set('timezone')}>
                {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Locale</label>
              <select className={inputCls} value={form.locale ?? 'pt-BR'} onChange={set('locale')}>
                <option value="pt-BR">pt-BR (Português do Brasil)</option>
                <option value="en-US">en-US (English)</option>
                <option value="es-ES">es-ES (Español)</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Moeda</label>
              <select className={inputCls} value={form.currency ?? 'BRL'} onChange={set('currency')}>
                <option value="BRL">BRL — Real Brasileiro</option>
                <option value="USD">USD — Dólar Americano</option>
                <option value="EUR">EUR — Euro</option>
              </select>
            </div>
          </div>
        </div>

        <div>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-rose-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Salvando...' : 'Salvar identidade'}
          </button>
        </div>
      </form>
    </div>
  )
}
