'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Archive,
  Bell,
  CheckCircle2,
  Clock,
  Columns3,
  Loader2,
  Lock,
  RefreshCw,
  RotateCcw,
  Save,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PendencyAutoArchiveUnit, PendencySettings } from '@/lib/pendencies/settings'

type AutoArchive = PendencySettings['autoArchive']
type SettingsSection = 'general' | 'notifications' | 'display' | 'permissions' | 'automations'

const UNIT_OPTIONS: Array<{ value: PendencyAutoArchiveUnit; label: string }> = [
  { value: 'minutes', label: 'minutos' },
  { value: 'hours', label: 'horas' },
  { value: 'days', label: 'dias' },
]

const inputClass = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400'

interface SectionSummaryProps {
  id: SettingsSection
  icon: LucideIcon
  label: string
  value: string
  active?: boolean
  onSelect: (section: SettingsSection) => void
}

function SectionSummary({ id, icon: Icon, label, value, active = false, onSelect }: SectionSummaryProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => onSelect(id)}
      className={cn(
        'rounded-lg border bg-white px-3 py-3 text-left transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-200',
        active ? 'border-brand-200 ring-1 ring-brand-100' : 'border-gray-200',
      )}
    >
      <div className="flex items-center gap-2">
        <Icon size={16} className={active ? 'text-brand-600' : 'text-gray-400'} />
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      </div>
      <p className="mt-2 text-sm font-medium text-gray-800">{value}</p>
    </button>
  )
}

function EmptySection({ icon: Icon, label, value }: Omit<SectionSummaryProps, 'id' | 'active' | 'onSelect'>) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white shadow-card">
      <div className="border-b border-gray-100 px-5 py-4">
        <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
          <Icon size={18} className="text-brand-600" />
          {label}
        </h2>
      </div>
      <div className="p-5">
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
          {value}
        </div>
      </div>
    </section>
  )
}

export function PendencyGeneralSettings() {
  const [activeSection, setActiveSection] = useState<SettingsSection>('automations')
  const [settings, setSettings] = useState<PendencySettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const autoArchive = settings?.autoArchive

  const summary = useMemo(() => {
    if (!autoArchive) return 'Carregando'
    if (!autoArchive.enabled) return 'Desativado'
    const unit = UNIT_OPTIONS.find((option) => option.value === autoArchive.afterUnit)?.label ?? 'dias'
    return `${autoArchive.afterValue} ${unit}`
  }, [autoArchive])

  const sections = useMemo<Array<Omit<SectionSummaryProps, 'active' | 'onSelect'>>>(() => [
    { id: 'general', icon: Settings, label: 'Geral', value: 'Padrão da loja' },
    { id: 'notifications', icon: Bell, label: 'Notificações', value: 'Padrões atuais' },
    { id: 'display', icon: Columns3, label: 'Exibição', value: 'Colunas atuais' },
    { id: 'permissions', icon: Lock, label: 'Permissões', value: 'Gerente Geral+' },
    { id: 'automations', icon: Archive, label: 'Automações', value: summary },
  ], [summary])
  const selectedSection = sections.find((section) => section.id === activeSection) ?? sections[0]

  const loadSettings = useCallback(async () => {
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch('/api/pendencies/settings', { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? 'Não foi possível carregar.')
      setSettings(json.data)
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Erro ao carregar.' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  const setAutoArchive = <K extends keyof AutoArchive>(key: K, value: AutoArchive[K]) => {
    setSettings((current) => current
      ? { ...current, autoArchive: { ...current.autoArchive, [key]: value } }
      : current)
  }

  const save = async () => {
    if (!settings) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/pendencies/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ autoArchive: settings.autoArchive }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? 'Não foi possível salvar.')
      setSettings(json.data)
      setMessage({ type: 'success', text: 'Configurações salvas.' })
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Erro ao salvar.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900">
            <ShieldCheck size={20} className="text-brand-600" />
            Configurações Gerais da Central
          </h1>
          <p className="mt-1 text-sm text-gray-500">Ajustes globais da Central de Pendências para a loja.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadSettings()}
          disabled={loading || saving}
          className="btn-secondary text-sm"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : undefined} />
          Atualizar
        </button>
      </div>

      <div role="tablist" className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        {sections.map((section) => (
          <SectionSummary
            key={section.id}
            {...section}
            active={activeSection === section.id}
            onSelect={setActiveSection}
          />
        ))}
      </div>

      {activeSection !== 'automations' ? (
        <EmptySection
          icon={selectedSection.icon}
          label={selectedSection.label}
          value={selectedSection.value}
        />
      ) : (
        <section className="rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <Archive size={18} className="text-brand-600" />
            Arquivamento automático
          </h2>
        </div>

        {loading || !settings || !autoArchive ? (
          <div className="space-y-4 p-5">
            <div className="h-10 animate-pulse rounded-lg bg-gray-100" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="h-16 animate-pulse rounded-lg bg-gray-100" />
              <div className="h-16 animate-pulse rounded-lg bg-gray-100" />
              <div className="h-16 animate-pulse rounded-lg bg-gray-100" />
            </div>
          </div>
        ) : (
          <div className="space-y-5 p-5">
            <label className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
              <input
                type="checkbox"
                checked={autoArchive.enabled}
                onChange={(event) => setAutoArchive('enabled', event.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-sm font-medium text-gray-800">Arquivar automaticamente pendências finalizadas</span>
            </label>

            <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4', !autoArchive.enabled && 'opacity-55')}>
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <Clock size={13} />
                  Depois de
                </label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  disabled={!autoArchive.enabled}
                  className={inputClass}
                  value={autoArchive.afterValue}
                  onChange={(event) => setAutoArchive('afterValue', Math.max(1, Number(event.target.value) || 1))}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Unidade</label>
                <select
                  disabled={!autoArchive.enabled}
                  className={inputClass}
                  value={autoArchive.afterUnit}
                  onChange={(event) => setAutoArchive('afterUnit', event.target.value as PendencyAutoArchiveUnit)}
                >
                  {UNIT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
                <input
                  type="checkbox"
                  checked={autoArchive.onlyAfterManagerApproval}
                  disabled={!autoArchive.enabled}
                  onChange={(event) => setAutoArchive('onlyAfterManagerApproval', event.target.checked)}
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500 disabled:cursor-not-allowed"
                />
                <span className="text-sm text-gray-700">Somente após aprovação da gerência</span>
              </label>

              <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
                <input
                  type="checkbox"
                  checked={autoArchive.onlyIfNotReopened}
                  disabled={!autoArchive.enabled}
                  onChange={(event) => setAutoArchive('onlyIfNotReopened', event.target.checked)}
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500 disabled:cursor-not-allowed"
                />
                <span className="text-sm text-gray-700">Ignorar pendências reabertas</span>
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="flex items-center gap-2 rounded-lg border border-green-100 bg-green-50 px-3 py-2 text-sm text-green-800">
                <CheckCircle2 size={16} />
                Status elegível: Finalizada
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                <RotateCcw size={16} />
                Reabertas ficam fora por padrão
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                <Archive size={16} />
                Arquivo permanece pesquisável
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-h-5">
            {message && (
              <p className={cn('text-sm', message.type === 'success' ? 'text-green-600' : 'text-red-600')}>
                {message.text}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => void save()}
            disabled={loading || saving || !settings}
            className="btn-primary text-sm"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {saving ? 'Salvando...' : 'Salvar configurações'}
          </button>
        </div>
      </section>
      )}
    </div>
  )
}
