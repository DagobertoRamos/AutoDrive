'use client'

// =============================================================================
// Configurações do Sistema — AutoDrive
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import {
  Settings,
  Clock,
  AlertTriangle,
  MessageCircle,
  Upload,
  ChevronDown,
  ChevronUp,
  Save,
  CheckCircle,
  AlertCircle,
  Lock,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

const DAYS_OF_WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

interface SystemSettings {
  // Geral
  systemName: string
  companyName: string
  defaultUnit: string
  timezone: string
  mode: 'NORMAL' | 'MAINTENANCE'
  environment: 'PRODUCTION' | 'TEST'
  // Horários
  scheduleEnabled: boolean
  scheduleDays: number[]
  scheduleStart: string
  scheduleEnd: string
  toleranceMinutes: number
  dailySendsByPriority: { LOW: number; MEDIUM: number; HIGH: number; CRITICAL: number }
  // Pendências
  defaultStatus: string
  defaultPriority: string
  frequency: number
  maxSends: number
  autoSend: boolean
  allowedDays: number[]
  // WhatsApp
  whatsappProvider: string
  phoneNumberId: string
  accessToken: string
  webhookVerifyToken: string
  officialTemplates: boolean
  language: string
  // Importação
  spreadsheetId: string
  autoImport: boolean
  importIntervalMinutes: number
  importDelaySeconds: number
}

const defaultSettings: SystemSettings = {
  systemName: 'AutoDrive',
  companyName: 'AutoDrive',
  defaultUnit: '',
  timezone: 'America/Sao_Paulo',
  mode: 'NORMAL',
  environment: 'PRODUCTION',
  scheduleEnabled: false,
  scheduleDays: [1, 2, 3, 4, 5],
  scheduleStart: '08:00',
  scheduleEnd: '18:00',
  toleranceMinutes: 15,
  dailySendsByPriority: { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 5 },
  defaultStatus: 'PENDENTE',
  defaultPriority: 'MEDIA',
  frequency: 24,
  maxSends: 5,
  autoSend: true,
  allowedDays: [1, 2, 3, 4, 5],
  whatsappProvider: 'META',
  phoneNumberId: '',
  accessToken: '',
  webhookVerifyToken: '',
  officialTemplates: false,
  language: 'pt_BR',
  spreadsheetId: '',
  autoImport: false,
  importIntervalMinutes: 30,
  importDelaySeconds: 5,
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function inputClass(extra?: string) {
  return cn(
    'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500',
    extra
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2',
        checked ? 'bg-brand-600' : 'bg-gray-200'
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1'
        )}
      />
    </button>
  )
}

function DayCheckboxes({
  selected,
  onChange,
}: {
  selected: number[]
  onChange: (days: number[]) => void
}) {
  const toggle = (day: number) => {
    if (selected.includes(day)) {
      onChange(selected.filter((d) => d !== day))
    } else {
      onChange([...selected, day].sort())
    }
  }
  return (
    <div className="flex flex-wrap gap-2">
      {DAYS_OF_WEEK.map((label, idx) => (
        <button
          key={idx}
          type="button"
          onClick={() => toggle(idx)}
          className={cn(
            'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
            selected.includes(idx)
              ? 'bg-brand-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Accordion section
// -----------------------------------------------------------------------------

function AccordionSection({
  icon: Icon,
  title,
  defaultOpen = false,
  children,
}: {
  icon: React.ElementType
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors rounded-xl"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50">
            <Icon className="h-5 w-5 text-brand-700" />
          </div>
          <span className="text-base font-semibold text-gray-900">{title}</span>
        </div>
        {open ? (
          <ChevronUp className="h-5 w-5 text-gray-400" />
        ) : (
          <ChevronDown className="h-5 w-5 text-gray-400" />
        )}
      </button>
      {open && (
        <div className="border-t border-gray-100 px-6 py-5">
          {children}
        </div>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Main page
// -----------------------------------------------------------------------------

export default function ConfiguracoesSistemaPage() {
  const { data: session } = useSession()
  const isMaster = (session?.user as { role?: string })?.role === 'MASTER'
  const [settings, setSettings] = useState<SystemSettings>(defaultSettings)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const set = useCallback(<K extends keyof SystemSettings>(key: K, value: SystemSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }, [])

  useEffect(() => {
    fetch('/api/settings/system')
      .then((r) => r.json())
      .then((d) => {
        if (d?.data) setSettings((prev) => ({ ...prev, ...d.data }))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setAlert(null)
    try {
      const res = await fetch('/api/settings/system', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!res.ok) throw new Error('Erro ao salvar')
      setAlert({ type: 'success', message: 'Configurações salvas com sucesso!' })
    } catch {
      setAlert({ type: 'error', message: 'Erro ao salvar configurações. Tente novamente.' })
    } finally {
      setSaving(false)
    }
  }

  // Página de configuração GLOBAL da plataforma — exclusiva do MASTER.
  // ADM/gerência gerenciam a própria loja em /configuracoes/loja.
  if (session && !isMaster) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <Lock size={24} />
        </div>
        <div>
          <p className="text-lg font-semibold text-gray-800">Configuração global da plataforma</p>
          <p className="mt-1 max-w-md text-sm text-gray-500">
            Estes parâmetros são globais e gerenciados pelo administrador da plataforma (MASTER).
            Para ajustes da sua loja, use <span className="font-medium">Configurações › Loja</span>.
          </p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-200" />
        ))}
      </div>
    )
  }

  return (
    <div className="pb-24">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Configurações do Sistema</h1>
        <p className="mt-1 text-sm text-gray-500">Gerencie os parâmetros globais do AutoDrive.</p>
      </div>

      <div className="space-y-4">
        {/* ── Geral ── */}
        <AccordionSection icon={Settings} title="Geral" defaultOpen>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Nome do sistema</label>
              <input className={inputClass()} value={settings.systemName} onChange={(e) => set('systemName', e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Nome da empresa</label>
              <input className={inputClass()} value={settings.companyName} onChange={(e) => set('companyName', e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Unidade padrão</label>
              <input className={inputClass()} value={settings.defaultUnit} onChange={(e) => set('defaultUnit', e.target.value)} placeholder="ID da unidade padrão" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Timezone</label>
              <select className={inputClass()} value={settings.timezone} onChange={(e) => set('timezone', e.target.value)}>
                <option value="America/Sao_Paulo">America/Sao_Paulo</option>
                <option value="America/Manaus">America/Manaus</option>
                <option value="America/Belem">America/Belem</option>
                <option value="America/Fortaleza">America/Fortaleza</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Modo</label>
              <select className={inputClass()} value={settings.mode} onChange={(e) => set('mode', e.target.value as SystemSettings['mode'])}>
                <option value="NORMAL">Normal</option>
                <option value="MAINTENANCE">Manutenção</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Ambiente</label>
              <select className={inputClass()} value={settings.environment} onChange={(e) => set('environment', e.target.value as SystemSettings['environment'])}>
                <option value="PRODUCTION">Produção</option>
                <option value="TEST">Teste</option>
              </select>
            </div>
          </div>
        </AccordionSection>

        {/* ── Horários ── */}
        <AccordionSection icon={Clock} title="Horários">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Trava de horário ativa</label>
              <Toggle checked={settings.scheduleEnabled} onChange={(v) => set('scheduleEnabled', v)} />
            </div>

            <div>
              <label className="mb-2 block text-xs font-medium text-gray-700">Dias da semana</label>
              <DayCheckboxes selected={settings.scheduleDays} onChange={(v) => set('scheduleDays', v)} />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700">Horário inicial</label>
                <input type="time" className={inputClass()} value={settings.scheduleStart} onChange={(e) => set('scheduleStart', e.target.value)} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700">Horário final</label>
                <input type="time" className={inputClass()} value={settings.scheduleEnd} onChange={(e) => set('scheduleEnd', e.target.value)} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700">Tolerância (minutos)</label>
                <input type="number" min={0} className={inputClass()} value={settings.toleranceMinutes} onChange={(e) => set('toleranceMinutes', Number(e.target.value))} />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-medium text-gray-700">Envios por dia por prioridade</label>
              <div className="grid gap-3 sm:grid-cols-4">
                {(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map((p) => {
                  const labels = { LOW: 'Baixa', MEDIUM: 'Média', HIGH: 'Alta', CRITICAL: 'Crítica' }
                  return (
                    <div key={p}>
                      <label className="mb-1 block text-xs text-gray-500">{labels[p]}</label>
                      <input
                        type="number"
                        min={1}
                        className={inputClass()}
                        value={settings.dailySendsByPriority[p]}
                        onChange={(e) =>
                          set('dailySendsByPriority', { ...settings.dailySendsByPriority, [p]: Number(e.target.value) })
                        }
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </AccordionSection>

        {/* ── Pendências ── */}
        <AccordionSection icon={AlertTriangle} title="Pendências">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700">Status padrão</label>
                <select className={inputClass()} value={settings.defaultStatus} onChange={(e) => set('defaultStatus', e.target.value)}>
                  <option value="PENDENTE">Pendente</option>
                  <option value="EM_ANDAMENTO">Em andamento</option>
                  <option value="RESOLVIDO">Resolvido</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700">Prioridade padrão</label>
                <select className={inputClass()} value={settings.defaultPriority} onChange={(e) => set('defaultPriority', e.target.value)}>
                  <option value="BAIXA">Baixa</option>
                  <option value="MEDIA">Média</option>
                  <option value="ALTA">Alta</option>
                  <option value="CRITICA">Crítica</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700">Frequência (horas)</label>
                <input type="number" min={1} className={inputClass()} value={settings.frequency} onChange={(e) => set('frequency', Number(e.target.value))} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700">Máx. envios</label>
                <input type="number" min={1} className={inputClass()} value={settings.maxSends} onChange={(e) => set('maxSends', Number(e.target.value))} />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Envio automático</label>
              <Toggle checked={settings.autoSend} onChange={(v) => set('autoSend', v)} />
            </div>

            <div>
              <label className="mb-2 block text-xs font-medium text-gray-700">Dias permitidos</label>
              <DayCheckboxes selected={settings.allowedDays} onChange={(v) => set('allowedDays', v)} />
            </div>
          </div>
        </AccordionSection>

        {/* ── WhatsApp/Meta ── */}
        <AccordionSection icon={MessageCircle} title="WhatsApp / Meta">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700">Provedor ativo</label>
                <select className={inputClass()} value={settings.whatsappProvider} onChange={(e) => set('whatsappProvider', e.target.value)}>
                  <option value="META">Meta (WhatsApp Business API)</option>
                  <option value="TWILIO">Twilio</option>
                  <option value="WPPCONNECT">WPPConnect</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700">Idioma</label>
                <select className={inputClass()} value={settings.language} onChange={(e) => set('language', e.target.value)}>
                  <option value="pt_BR">pt_BR (Português Brasil)</option>
                  <option value="en_US">en_US (English)</option>
                  <option value="es_ES">es_ES (Español)</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700">Phone Number ID</label>
                <input className={inputClass()} value={settings.phoneNumberId} onChange={(e) => set('phoneNumberId', e.target.value)} placeholder="123456789" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700">Webhook Verify Token</label>
                <input className={inputClass()} value={settings.webhookVerifyToken} onChange={(e) => set('webhookVerifyToken', e.target.value)} placeholder="meu_token_secreto" />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Access Token</label>
              <input
                type="password"
                className={inputClass()}
                value={settings.accessToken}
                onChange={(e) => set('accessToken', e.target.value)}
                placeholder="EAAxxxxxxxx..."
                autoComplete="new-password"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Usar templates oficiais</label>
              <Toggle checked={settings.officialTemplates} onChange={(v) => set('officialTemplates', v)} />
            </div>
          </div>
        </AccordionSection>

        {/* ── Importação Planilha ── */}
        <AccordionSection icon={Upload} title="Importação de Planilha">
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Planilha ID (Google Sheets)</label>
              <input className={inputClass()} value={settings.spreadsheetId} onChange={(e) => set('spreadsheetId', e.target.value)} placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms" />
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Importação automática</label>
              <Toggle checked={settings.autoImport} onChange={(v) => set('autoImport', v)} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700">Intervalo (minutos)</label>
                <input type="number" min={5} className={inputClass()} value={settings.importIntervalMinutes} onChange={(e) => set('importIntervalMinutes', Number(e.target.value))} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700">Delay entre itens (segundos)</label>
                <input type="number" min={0} className={inputClass()} value={settings.importDelaySeconds} onChange={(e) => set('importDelaySeconds', Number(e.target.value))} />
              </div>
            </div>
          </div>
        </AccordionSection>
      </div>

      {/* Fixed save bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white px-6 py-4 shadow-lg">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          {alert ? (
            <div className={cn('flex items-center gap-2 text-sm font-medium', alert.type === 'success' ? 'text-green-700' : 'text-red-700')}>
              {alert.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              {alert.message}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Lembre-se de salvar as alterações.</p>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-brand-700 px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60 transition-colors"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Salvando...' : 'Salvar configurações'}
          </button>
        </div>
      </div>
    </div>
  )
}
