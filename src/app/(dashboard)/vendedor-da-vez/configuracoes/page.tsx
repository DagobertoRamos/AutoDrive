'use client'

// =============================================================================
// Comercial › Fila de Atendimento › Configurações — organização operacional da
// fila por unidade, mantendo as regras já existentes de presença, alertas,
// escalonamento, conformidade e automações.
// =============================================================================

import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import { useSession } from 'next-auth/react'
import {
  Bell,
  BellRing,
  ChevronRight,
  Clock,
  MapPin,
  Palmtree,
  PhoneCall,
  Plus,
  RefreshCw,
  Save,
  Settings,
  Shield,
  ShieldAlert,
  Stethoscope,
  Trash2,
  Volume2,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { canAccessModule } from '@/lib/permissions'
import AlertSetup from '@/components/seller-queue/AlertSetup'
import EscalationConfigCard from '@/components/seller-queue/EscalationConfigCard'
import AttendanceTypesConfigCard from '@/components/seller-queue/AttendanceTypesConfigCard'
import VacationManagerCard from '@/components/seller-queue/VacationManagerCard'
import QueueParticipantsCard from '@/components/seller-queue/QueueParticipantsCard'
import QueueDiagnosticsCard from '@/components/seller-queue/QueueDiagnosticsCard'
import { SOUND_OPTIONS, playSound, unlockAudio } from '@/lib/seller-queue/alert-client'
import { QUEUE_CONFIG_LIMITS } from '@/lib/seller-queue/config-limits'
import { getAlertStatus, isNativeAndroid } from '@/lib/mobile/push-bridge'
import { isIOS, isStandalonePWA, notificationPermission, webPushSupported } from '@/lib/mobile/web-push-client'

const DAYS: [string, string][] = [['MON', 'Seg'], ['TUE', 'Ter'], ['WED', 'Qua'], ['THU', 'Qui'], ['FRI', 'Sex'], ['SAT', 'Sáb'], ['SUN', 'Dom']]
const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const METHODS = [
  ['GPS', 'GPS / geofence', 'Confirma a presença pela área permitida da unidade.'],
  ['QR_CODE', 'QR Code', 'Exige leitura do QR físico configurado para a loja.'],
  ['DEVICE_CHECK', 'Dispositivo autorizado', 'Valida pelo aparelho liberado para uso nesta unidade.'],
] as const

type StatusTone = 'success' | 'warning' | 'danger' | 'neutral'
type SectionId = 'overview' | 'alerts' | 'availability' | 'presence' | 'calls' | 'security' | 'diagnostics'

interface AutoBlock {
  enabled: boolean
  strikesForCooldown: number
  cooldownHours: number
  strikesForDailyBlock: number
}

interface AttendanceReminderConfig {
  enabled: boolean
  firstAfterMinutes: number
  repeatIntervalSeconds: number
  maxReminders: number
  escalateAfter: number
  autoEscalate: boolean
  requireFinishOnNo: boolean
  allowSnooze: boolean
  logEveryReminder: boolean
}

interface QueuePushConfig {
  enabled: boolean
  intervalSeconds: number
  targetScope: string
  maxRetries: number
  resendUntil: string
  antiSpamUserLimit: number
  antiSpamAttendanceLimit: number
  antiSpamQueueLimit: number
  antiSpamWindowMinutes: number
  allowedStartTime: string | null
  allowedEndTime: string | null
  allowOutsideHoursForAdmins: boolean
  urgency: string
  sound: boolean
}

interface PanelSoundConfig {
  enabled: boolean
  repeatUntilAccepted: boolean
  repeatSeconds: number
  refreshSeconds: number
  volume: number
  soundType: string
  playOnDashboard: boolean
  onlyStorePanel: boolean
  muteOutsideHours: boolean
  requireManualActivation: boolean
  wakeLock: boolean
  showHiddenWarning: boolean
}

interface CompliancePilotConfig {
  enabled: boolean
  notifyManagers: boolean
  autoCreateManagerPendency: boolean
  requireConfirmedFraudForRanking: boolean
  timeoutPoints: number
  confirmedFraudMediumPoints: number
  confirmedFraudHighPoints: number
  reviewWindowDays: number
}

interface QualityThresholds {
  popupAt: number
  warnAt: number
  blockPendencyCreateAt: number
  blockLeadsAt: number
  blockNewSalesAt: number
  blockQueueAt: number
  maxUnresolvedPendencies: number
}

interface QualityPointCosts {
  pendency_sla_breach: number
  pendency_overdue_daily: number
  lead_no_response_24h: number
  lead_no_response_48h: number
  lead_no_summary_48h: number
  attendance_not_finalized: number
  attendance_no_registration: number
  admin_procedure_missed: number
  manual_warning: number
  manual_penalty: number
}

interface QualityConfig {
  enabled: boolean
  scorePeriodDays: number
  autoSweepEnabled: boolean
  thresholds: QualityThresholds
  pointCosts: Partial<QualityPointCosts>
}

interface Cfg {
  active: boolean
  presenceMethods: string[]
  geofenceLat: number | null
  geofenceLng: number | null
  geofenceRadiusM: number
  qrSecret: string | null
  acceptTimeoutSeconds: number
  requireRevalidationOnAccept: boolean
  recurringCustomerRule: string
  requestByNameRequiresApproval: boolean
  alertSound: boolean
  alertSoundType: string
  alertBrowserPush: boolean
  alertWhatsapp: boolean
  alertWhatsappManagers: boolean
  alertRepeatSeconds: number
  allowChooseSeller: boolean
  allowSellerFinish: boolean
  leadCloseReasons: string[]
  negotiationReasons: string[]
  openTime: string | null
  closeTime: string | null
  allowedDays: string[]
  maxPauseMinutes: number
  autoSchedule: boolean
  infoRapidaConsumesTurn: string
  infoRapidaTimeLimitMinutes: number
  allowWaitWithOpenAttendance: string
  responsibleUserIds: string[]
  autoBlock: AutoBlock
  attendanceReminder: AttendanceReminderConfig
  queuePush: QueuePushConfig
  panelSound: PanelSoundConfig
  compliancePilot: CompliancePilotConfig
  quality: QualityConfig
}

interface BlockedSeller {
  sellerId: string
  name: string
  type: 'COOLDOWN' | 'DAILY_BLOCK' | 'MANUAL'
  endsAt: string | null
  strikes: number
}

interface DeviceAlertSummary {
  label: string
  detail: string
  tone: StatusTone
  supported: boolean
  scope: string
}

const DEFAULT_AUTO_BLOCK: AutoBlock = { enabled: true, strikesForCooldown: 3, cooldownHours: 3, strikesForDailyBlock: 6 }
const DEFAULT_ATTENDANCE_REMINDER: AttendanceReminderConfig = { enabled: true, firstAfterMinutes: 15, repeatIntervalSeconds: 300, maxReminders: 6, escalateAfter: 3, autoEscalate: true, requireFinishOnNo: true, allowSnooze: false, logEveryReminder: true }
const DEFAULT_QUEUE_PUSH: QueuePushConfig = { enabled: true, intervalSeconds: 300, targetScope: 'CURRENT_SELLER', maxRetries: 6, resendUntil: 'ACKNOWLEDGED', antiSpamUserLimit: 8, antiSpamAttendanceLimit: 6, antiSpamQueueLimit: 60, antiSpamWindowMinutes: 10, allowedStartTime: null, allowedEndTime: null, allowOutsideHoursForAdmins: true, urgency: 'HIGH', sound: true }
const DEFAULT_PANEL_SOUND: PanelSoundConfig = { enabled: true, repeatUntilAccepted: true, repeatSeconds: 3, refreshSeconds: 3, volume: 80, soundType: 'siren', playOnDashboard: false, onlyStorePanel: true, muteOutsideHours: false, requireManualActivation: true, wakeLock: true, showHiddenWarning: true }
const DEFAULT_COMPLIANCE_PILOT: CompliancePilotConfig = { enabled: false, notifyManagers: true, autoCreateManagerPendency: true, requireConfirmedFraudForRanking: true, timeoutPoints: 2, confirmedFraudMediumPoints: 8, confirmedFraudHighPoints: 20, reviewWindowDays: 7 }
const DEFAULT_QUALITY_THRESHOLDS: QualityThresholds = { popupAt: -5, warnAt: -10, blockPendencyCreateAt: -20, blockLeadsAt: -30, blockNewSalesAt: -35, blockQueueAt: -50, maxUnresolvedPendencies: 8 }
const DEFAULT_QUALITY_POINT_COSTS: QualityPointCosts = { pendency_sla_breach: 5, pendency_overdue_daily: 2, lead_no_response_24h: 3, lead_no_response_48h: 5, lead_no_summary_48h: 2, attendance_not_finalized: 5, attendance_no_registration: 4, admin_procedure_missed: 6, manual_warning: 3, manual_penalty: 10 }
const DEFAULT_QUALITY: QualityConfig = { enabled: false, scorePeriodDays: 30, autoSweepEnabled: true, thresholds: DEFAULT_QUALITY_THRESHOLDS, pointCosts: DEFAULT_QUALITY_POINT_COSTS }
const limits = QUEUE_CONFIG_LIMITS

const DEFAULTS: Cfg = {
  active: false,
  presenceMethods: ['GPS'],
  geofenceLat: null,
  geofenceLng: null,
  geofenceRadiusM: 150,
  qrSecret: '',
  acceptTimeoutSeconds: 60,
  requireRevalidationOnAccept: true,
  recurringCustomerRule: 'RESPONSIBLE',
  requestByNameRequiresApproval: true,
  alertSound: true,
  alertSoundType: 'siren',
  alertBrowserPush: true,
  alertWhatsapp: true,
  alertWhatsappManagers: true,
  alertRepeatSeconds: 10,
  allowChooseSeller: true,
  allowSellerFinish: true,
  leadCloseReasons: [],
  negotiationReasons: [],
  openTime: null,
  closeTime: null,
  allowedDays: [],
  maxPauseMinutes: 0,
  autoSchedule: false,
  infoRapidaConsumesTurn: 'NO',
  infoRapidaTimeLimitMinutes: 3,
  allowWaitWithOpenAttendance: 'NO',
  responsibleUserIds: [],
  autoBlock: DEFAULT_AUTO_BLOCK,
  attendanceReminder: DEFAULT_ATTENDANCE_REMINDER,
  queuePush: DEFAULT_QUEUE_PUSH,
  panelSound: DEFAULT_PANEL_SOUND,
  compliancePilot: DEFAULT_COMPLIANCE_PILOT,
  quality: DEFAULT_QUALITY,
}

function normalizeCfg(data: Record<string, unknown> | null | undefined): Cfg {
  const raw = (data ?? {}) as Record<string, unknown> & { config?: Record<string, unknown> }
  const config = (raw.config ?? {}) as Record<string, unknown>
  return {
    ...DEFAULTS,
    ...raw,
    qrSecret: (raw.qrSecret as string | null | undefined) ?? '',
    allowSellerFinish: (config.allowSellerFinish as boolean | undefined) ?? true,
    leadCloseReasons: (config.leadCloseReasons as string[] | undefined) ?? [],
    negotiationReasons: (config.negotiationReasons as string[] | undefined) ?? [],
    openTime: (raw.openTime as string | null | undefined) ?? null,
    closeTime: (raw.closeTime as string | null | undefined) ?? null,
    allowedDays: (raw.allowedDays as string[] | undefined) ?? [],
    maxPauseMinutes: (config.maxPauseMinutes as number | undefined) ?? 0,
    autoSchedule: (config.autoSchedule as boolean | undefined) ?? false,
    infoRapidaConsumesTurn: (config.infoRapidaConsumesTurn as string | undefined) ?? 'NO',
    infoRapidaTimeLimitMinutes: (config.infoRapidaTimeLimitMinutes as number | undefined) ?? 3,
    allowWaitWithOpenAttendance: (config.allowWaitWithOpenAttendance as string | undefined) ?? 'NO',
    responsibleUserIds: (config.responsibleUserIds as string[] | undefined) ?? [],
    autoBlock: { ...DEFAULT_AUTO_BLOCK, ...((config.autoBlock as Partial<AutoBlock> | undefined) ?? {}) },
    attendanceReminder: { ...DEFAULT_ATTENDANCE_REMINDER, ...((config.attendanceReminder as Partial<AttendanceReminderConfig> | undefined) ?? {}) },
    queuePush: { ...DEFAULT_QUEUE_PUSH, ...((config.queuePush as Partial<QueuePushConfig> | undefined) ?? {}) },
    panelSound: { ...DEFAULT_PANEL_SOUND, ...((config.panelSound as Partial<PanelSoundConfig> | undefined) ?? {}) },
    compliancePilot: { ...DEFAULT_COMPLIANCE_PILOT, ...((config.compliancePilot as Partial<CompliancePilotConfig> | undefined) ?? {}) },
    quality: {
      ...DEFAULT_QUALITY,
      ...((config.quality as Partial<QualityConfig> | undefined) ?? {}),
      thresholds: { ...DEFAULT_QUALITY_THRESHOLDS, ...((((config.quality as Partial<QualityConfig> | undefined)?.thresholds) as Partial<QualityThresholds> | undefined) ?? {}) },
      pointCosts: { ...DEFAULT_QUALITY_POINT_COSTS, ...((((config.quality as Partial<QualityConfig> | undefined)?.pointCosts) as Partial<QualityPointCosts> | undefined) ?? {}) },
    },
  }
}

function cloneCfg(value: Cfg): Cfg {
  return JSON.parse(JSON.stringify(value)) as Cfg
}

function untilText(b: BlockedSeller): string {
  if (b.type === 'MANUAL') return 'bloqueio manual'
  if (b.type === 'DAILY_BLOCK') return 'até o fim do dia'
  if (!b.endsAt) return 'temporário'
  const mins = Math.max(0, Math.ceil((new Date(b.endsAt).getTime() - Date.now()) / 60000))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `~${h}h${m > 0 ? ` ${m}min` : ''} restantes` : `~${m}min restantes`
}

function validateRange(value: number, label: string, min: number, max: number, unit: string): string | null {
  if (!Number.isInteger(value)) return `${label} deve ser um número inteiro.`
  if (value < min) return `${label} deve ser no mínimo ${min} ${unit}.`
  if (value > max) return `${label} deve ser no máximo ${max} ${unit}.`
  return null
}

function validateOptionalRange(value: number | null, label: string, min: number, max: number): string | null {
  if (value === null) return null
  if (!Number.isFinite(value)) return `${label} deve ser um número válido.`
  if (value < min || value > max) return `${label} deve estar entre ${min} e ${max}.`
  return null
}

function validateCfg(c: Cfg): string | null {
  return (
    validateOptionalRange(c.geofenceLat, 'Latitude', -90, 90) ??
    validateOptionalRange(c.geofenceLng, 'Longitude', -180, 180) ??
    validateRange(c.geofenceRadiusM, 'Raio permitido', 10, 5000, 'metros') ??
    validateRange(c.acceptTimeoutSeconds, 'Tempo de aceite', 10, 600, 'segundos') ??
    validateRange(c.alertRepeatSeconds, 'Repetição do alerta do vendedor', 5, 120, 'segundos') ??
    validateRange(c.attendanceReminder.firstAfterMinutes, 'Primeiro lembrete', limits.attendanceFirstAfterMinutes.min, limits.attendanceFirstAfterMinutes.max, 'minutos') ??
    validateRange(c.attendanceReminder.repeatIntervalSeconds, 'Intervalo de repetição dos lembretes', limits.attendanceRepeatIntervalSeconds.min, limits.attendanceRepeatIntervalSeconds.max, 'segundos') ??
    validateRange(c.attendanceReminder.maxReminders, 'Quantidade máxima de lembretes', limits.attendanceMaxReminders.min, limits.attendanceMaxReminders.max, 'lembretes') ??
    validateRange(c.attendanceReminder.escalateAfter, 'Quantidade de lembretes para escalar', limits.attendanceEscalateAfter.min, limits.attendanceEscalateAfter.max, 'lembretes') ??
    validateRange(c.queuePush.intervalSeconds, 'Intervalo mínimo de push', limits.queuePushIntervalSeconds.min, limits.queuePushIntervalSeconds.max, 'segundos') ??
    validateRange(c.queuePush.maxRetries, 'Quantidade máxima de tentativas', limits.queuePushMaxRetries.min, limits.queuePushMaxRetries.max, 'tentativas') ??
    validateRange(c.queuePush.antiSpamUserLimit, 'Limite por vendedor', limits.queuePushAntiSpamUserLimit.min, limits.queuePushAntiSpamUserLimit.max, 'envios') ??
    validateRange(c.queuePush.antiSpamAttendanceLimit, 'Limite por atendimento', limits.queuePushAntiSpamAttendanceLimit.min, limits.queuePushAntiSpamAttendanceLimit.max, 'envios') ??
    validateRange(c.queuePush.antiSpamQueueLimit, 'Limite por fila', limits.queuePushAntiSpamQueueLimit.min, limits.queuePushAntiSpamQueueLimit.max, 'envios') ??
    validateRange(c.queuePush.antiSpamWindowMinutes, 'Janela anti-spam', limits.queuePushAntiSpamWindowMinutes.min, limits.queuePushAntiSpamWindowMinutes.max, 'minutos') ??
    validateRange(c.panelSound.repeatSeconds, 'Intervalo do toque do Painel da Loja', 1, 30, 'segundos') ??
    validateRange(c.panelSound.refreshSeconds, 'Intervalo de atualização do Painel da Loja', 3, 60, 'segundos') ??
    validateRange(c.panelSound.volume, 'Volume do alerta do Painel da Loja', 0, 100, '%') ??
    validateRange(c.compliancePilot.timeoutPoints, 'Pontos por timeout', limits.complianceTimeoutPoints.min, limits.complianceTimeoutPoints.max, 'pontos') ??
    validateRange(c.compliancePilot.confirmedFraudMediumPoints, 'Pontos por fraude média confirmada', limits.complianceFraudMediumPoints.min, limits.complianceFraudMediumPoints.max, 'pontos') ??
    validateRange(c.compliancePilot.confirmedFraudHighPoints, 'Pontos por fraude alta confirmada', limits.complianceFraudHighPoints.min, limits.complianceFraudHighPoints.max, 'pontos') ??
    validateRange(c.compliancePilot.reviewWindowDays, 'Janela de revisão de conformidade', limits.complianceReviewWindowDays.min, limits.complianceReviewWindowDays.max, 'dias') ??
    validateRange(c.maxPauseMinutes, 'Tempo de pausa/ausência', limits.maxPauseMinutes.min, limits.maxPauseMinutes.max, 'minutos') ??
    validateRange(c.infoRapidaTimeLimitMinutes, 'Limite de tempo da informação rápida', 1, 120, 'minutos')
  )
}

function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  const toneCls = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-700',
    danger: 'border-red-200 bg-red-50 text-red-700',
    neutral: 'border-gray-200 bg-gray-50 text-gray-600',
  } satisfies Record<StatusTone, string>

  return (
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold', toneCls[tone])}>
      {children}
    </span>
  )
}

function ScopeBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-medium text-gray-600">
      {children}
    </span>
  )
}

function FeedbackBanner({ message }: { message: string | null }) {
  if (!message) return null
  const success = /salv|liberad|ativado|desativado|reiniciada|deletado|descartadas/i.test(message)
  return (
    <div
      aria-live="polite"
      className={cn(
        'rounded-2xl border px-4 py-3 text-sm font-medium shadow-sm',
        success ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800',
      )}
    >
      {message}
    </div>
  )
}

function OverviewCard({
  icon,
  title,
  value,
  detail,
  tone,
  scope,
}: {
  icon: ReactNode
  title: string
  value: string
  detail: string
  tone: StatusTone
  scope: string
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
            <p className="mt-1 text-base font-semibold text-gray-900">{value}</p>
            <p className="mt-1 text-sm text-gray-500">{detail}</p>
          </div>
        </div>
        <StatusBadge tone={tone}>{value}</StatusBadge>
      </div>
      <div className="mt-3">
        <ScopeBadge>{scope}</ScopeBadge>
      </div>
    </div>
  )
}

function SettingRow({
  icon,
  title,
  description,
  status,
  statusTone = 'neutral',
  scope,
  control,
  children,
}: {
  icon?: ReactNode
  title: string
  description: string
  status?: string
  statusTone?: StatusTone
  scope?: string
  control?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="border-b border-gray-100 py-4 last:border-b-0 last:pb-0 first:pt-0">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {icon && <span className="text-gray-400">{icon}</span>}
            <p className="text-sm font-semibold text-gray-900">{title}</p>
            {scope && <ScopeBadge>{scope}</ScopeBadge>}
          </div>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          {status && <StatusBadge tone={statusTone}>{status}</StatusBadge>}
          {control}
        </div>
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}

function SettingsSection({
  title,
  description,
  scope,
  children,
  action,
}: {
  title: string
  description: string
  scope?: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-card md:p-6">
      <div className="flex flex-col gap-3 border-b border-gray-100 pb-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            {scope && <ScopeBadge>{scope}</ScopeBadge>}
          </div>
          <p className="mt-1 max-w-3xl text-sm text-gray-500">{description}</p>
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  )
}

function SettingsPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="h-4 w-28 animate-pulse rounded bg-gray-200" />
        <div className="h-8 w-64 animate-pulse rounded bg-gray-200" />
        <div className="h-4 w-80 animate-pulse rounded bg-gray-100" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-36 animate-pulse rounded-3xl border border-gray-200 bg-white shadow-card" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <div className="hidden space-y-3 lg:block">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-16 animate-pulse rounded-2xl bg-gray-100" />
          ))}
        </div>
        <div className="h-[540px] animate-pulse rounded-3xl border border-gray-200 bg-white shadow-card" />
      </div>
    </div>
  )
}

function SettingsSectionNav({
  items,
  activeSection,
  onSelect,
  mobile = false,
}: {
  items: Array<{ id: SectionId; title: string; description: string; icon: ReactNode }>
  activeSection: SectionId
  onSelect: (section: SectionId) => void
  mobile?: boolean
}) {
  if (mobile) {
    return (
      <div className="-mx-1 overflow-x-auto pb-1">
        <div className="flex min-w-max gap-2 px-1">
          {items.map((item) => {
            const active = item.id === activeSection
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-medium transition',
                  active ? 'border-brand-500 bg-brand-50 text-brand-700 shadow-sm' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
                )}
                aria-pressed={active}
              >
                {item.icon}
                <span>{item.title}</span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <nav aria-label="Seções das configurações" className="sticky top-24 space-y-2">
      {items.map((item) => {
        const active = item.id === activeSection
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            aria-pressed={active}
            className={cn(
              'flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition',
              active ? 'border-brand-500 bg-brand-50 text-brand-700 shadow-sm' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50',
            )}
          >
            <span className={cn('mt-0.5', active ? 'text-brand-700' : 'text-gray-400')}>{item.icon}</span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{item.title}</span>
              <span className={cn('mt-1 block text-xs', active ? 'text-brand-600' : 'text-gray-500')}>{item.description}</span>
            </span>
          </button>
        )
      })}
    </nav>
  )
}

function UnsavedChangesBar({
  saving,
  onDiscard,
  onSave,
}: {
  saving: boolean
  onDiscard: () => void
  onSave: () => void
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 px-4 pb-4">
      <div
        className="pointer-events-auto mx-auto flex w-full max-w-4xl flex-col gap-3 rounded-3xl border border-amber-200 bg-white px-4 py-4 shadow-2xl md:flex-row md:items-center md:justify-between"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
      >
        <div>
          <p className="text-sm font-semibold text-gray-900">Alterações não salvas</p>
          <p className="text-sm text-gray-500">Revise esta seção e salve quando estiver tudo certo.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onDiscard} className="btn-secondary text-sm">
            Descartar
          </button>
          <button type="button" onClick={onSave} disabled={saving} className="btn-primary text-sm">
            <Save size={15} />
            {saving ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ReasonsEditor({
  title,
  hint,
  items,
  onChange,
}: {
  title: string
  hint: string
  items: string[]
  onChange: (value: string[]) => void
}) {
  const [val, setVal] = useState('')

  const add = () => {
    const trimmed = val.trim()
    if (trimmed && !items.includes(trimmed)) {
      onChange([...items, trimmed])
      setVal('')
    }
  }

  return (
    <div>
      <p className="text-sm font-semibold text-gray-800">{title}</p>
      <p className="mb-2 text-[11px] text-gray-400">{hint}</p>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {items.length === 0 && <span className="text-xs text-gray-400">Nenhum motivo cadastrado.</span>}
        {items.map((item) => (
          <span key={item} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
            {item}
            <button type="button" onClick={() => onChange(items.filter((value) => value !== item))} className="text-brand-400 hover:text-red-600">
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          placeholder="Novo motivo..."
          className={inputCls}
        />
        <button type="button" onClick={add} className="btn-secondary shrink-0 text-xs">
          <Plus size={14} />
          Adicionar
        </button>
      </div>
    </div>
  )
}

export default function ConfiguracoesFilaPage() {
  const { data: session } = useSession()
  const user = session?.user as { role?: string; unitId?: string | null } | undefined
  const role = user?.role
  const canSettings = !!role && canAccessModule(role, 'sellerQueue.settings')

  const [cfg, setCfg] = useState<Cfg>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [blocks, setBlocks] = useState<BlockedSeller[]>([])
  const [blocksBusy, setBlocksBusy] = useState<string | null>(null)
  const [onVacation, setOnVacation] = useState(false)
  const [vacBusy, setVacBusy] = useState(false)
  const [sellers, setSellers] = useState<{ sellerId: string; name: string }[]>([])
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<SectionId>('overview')
  const [advancedGeoOpen, setAdvancedGeoOpen] = useState(false)
  const [deviceAlertSummary, setDeviceAlertSummary] = useState<DeviceAlertSummary>({
    label: 'Verificando',
    detail: 'Estamos conferindo o estado dos alertas neste aparelho.',
    tone: 'neutral',
    supported: true,
    scope: 'Neste aparelho',
  })

  const set = <K extends keyof Cfg>(key: K, value: Cfg[K]) => setCfg((current) => ({ ...current, [key]: value }))
  const currentSnapshot = useMemo(() => JSON.stringify(cfg), [cfg])
  const hasPendingChanges = canSettings && !denied && savedSnapshot !== null && currentSnapshot !== savedSnapshot

  const sections = useMemo<Array<{ id: SectionId; title: string; description: string; icon: ReactNode }>>(() => {
    const base = [
      { id: 'overview' as const, title: 'Visão geral', description: 'Resumo do estado atual e do escopo desta tela.', icon: <Settings size={16} /> },
      { id: 'alerts' as const, title: 'Alertas', description: 'Como este aparelho e a unidade recebem chamadas.', icon: <BellRing size={16} /> },
      { id: 'availability' as const, title: 'Disponibilidade', description: 'Modo férias, equipe ativa e rotina da fila.', icon: <Palmtree size={16} /> },
    ]

    if (!canSettings) return base

    return [
      ...base,
      { id: 'presence' as const, title: 'Presença', description: 'Validação física, métodos e geolocalização.', icon: <MapPin size={16} /> },
      { id: 'calls' as const, title: 'Chamadas', description: 'Aceite, escalonamento, push, painel e regras rápidas.', icon: <PhoneCall size={16} /> },
      { id: 'security' as const, title: 'Segurança', description: 'Permissões, bloqueios, conformidade e score.', icon: <Shield size={16} /> },
      { id: 'diagnostics' as const, title: 'Diagnóstico', description: 'Testes, status dos dispositivos e ações administrativas.', icon: <Stethoscope size={16} /> },
    ]
  }, [canSettings])

  const visibleSection = sections.some((section) => section.id === activeSection) ? activeSection : 'overview'

  const refreshDeviceAlertSummary = useCallback(async () => {
    if (isNativeAndroid()) {
      const status = await getAlertStatus().catch(() => null)
      if (!status) {
        setDeviceAlertSummary({
          label: 'Não foi possível verificar',
          detail: 'Abra novamente a tela para atualizar o estado do aparelho.',
          tone: 'warning',
          supported: true,
          scope: 'Neste aparelho',
        })
        return
      }

      const allOk = status.notifications && status.batteryUnrestricted && status.fullScreen
      if (allOk) {
        setDeviceAlertSummary({
          label: 'Ativado',
          detail: 'Notificações, bateria e tela cheia estão liberadas neste Android.',
          tone: 'success',
          supported: true,
          scope: 'Neste aparelho',
        })
        return
      }

      if (!status.notifications) {
        setDeviceAlertSummary({
          label: 'Permissão bloqueada',
          detail: 'As notificações ainda precisam ser liberadas neste aparelho.',
          tone: 'danger',
          supported: true,
          scope: 'Neste aparelho',
        })
        return
      }

      setDeviceAlertSummary({
        label: 'Configuração parcial',
        detail: 'O alerta ainda depende de bateria sem restrição ou da permissão de tela cheia.',
        tone: 'warning',
        supported: true,
        scope: 'Neste aparelho',
      })
      return
    }

    const supported = webPushSupported()
    const ios = isIOS()
    const standalone = isStandalonePWA()
    const permission = notificationPermission()

    if (!supported) {
      setDeviceAlertSummary({
        label: 'Não suportado',
        detail: 'Este navegador não suporta notificações para a fila.',
        tone: 'neutral',
        supported: false,
        scope: 'Neste aparelho',
      })
      return
    }

    if (ios && !standalone) {
      setDeviceAlertSummary({
        label: 'Adicionar à Tela de Início',
        detail: 'No iPhone, abra o AutoDrive pela Tela de Início para ativar os alertas.',
        tone: 'warning',
        supported: true,
        scope: 'Neste aparelho',
      })
      return
    }

    if (permission === 'granted') {
      setDeviceAlertSummary({
        label: 'Ativado',
        detail: ios ? 'Web Push ativo neste aparelho.' : 'Notificações do navegador ativas neste aparelho.',
        tone: 'success',
        supported: true,
        scope: 'Neste aparelho',
      })
      return
    }

    if (permission === 'denied') {
      setDeviceAlertSummary({
        label: 'Permissão bloqueada',
        detail: 'As notificações foram bloqueadas no navegador deste aparelho.',
        tone: 'danger',
        supported: true,
        scope: 'Neste aparelho',
      })
      return
    }

    setDeviceAlertSummary({
      label: 'Não configurado',
      detail: 'Ative as notificações para receber chamadas da fila fora da tela.',
      tone: 'warning',
      supported: true,
      scope: 'Neste aparelho',
    })
  }, [])

  const load = useCallback(async () => {
    if (!canSettings) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/seller-queue/config', { credentials: 'include' })
      if (res.status === 403 || res.status === 400) {
        const data = await res.json().catch(() => ({}))
        setDenied(data?.error ?? 'Sem acesso.')
        setSavedSnapshot(null)
        return
      }

      setDenied(null)
      const data = await res.json()
      const nextCfg = normalizeCfg(data?.data)
      setCfg(nextCfg)
      setSavedSnapshot(JSON.stringify(nextCfg))
      setAdvancedGeoOpen(Boolean(nextCfg.geofenceLat || nextCfg.geofenceLng || nextCfg.qrSecret))
    } catch {
      setMsg('Não foi possível carregar as configurações da fila.')
    } finally {
      setLoading(false)
    }
  }, [canSettings])

  const loadBlocks = useCallback(async () => {
    try {
      const res = await fetch('/api/seller-queue/blocks', { credentials: 'include' })
      if (res.ok) setBlocks((await res.json())?.data ?? [])
    } catch {
      // noop
    }
  }, [])

  const loadSellers = useCallback(async () => {
    try {
      const res = await fetch('/api/seller-queue/callable', { credentials: 'include' })
      if (res.ok) setSellers((await res.json())?.data ?? [])
    } catch {
      // noop
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (canSettings) {
        void load()
        void loadBlocks()
        void loadSellers()
        return
      }

      setLoading(false)
    }, 0)

    return () => window.clearTimeout(timer)
  }, [canSettings, load, loadBlocks, loadSellers])

  useEffect(() => {
    fetch('/api/seller-queue/vacation', { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data?.success) setOnVacation(!!data.data.onVacation)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshDeviceAlertSummary()
    }, 0)
    const onVisible = () => {
      if (!document.hidden) void refreshDeviceAlertSummary()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [refreshDeviceAlertSummary])

  const toggleVacation = async () => {
    if (!onVacation) {
      const confirmed = window.confirm('Ao ativar o modo férias, você será removido da fila desta unidade e não receberá novas chamadas. Deseja continuar?')
      if (!confirmed) return
    }

    setVacBusy(true)
    try {
      const res = await fetch('/api/seller-queue/vacation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ on: !onVacation }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setOnVacation(!!data.data.onVacation)
        setMsg(data.data.onVacation ? 'Modo férias ativado — você está fora da fila.' : 'Modo férias desativado.')
      } else {
        setMsg(data?.error ?? 'Falha ao atualizar.')
      }
      setTimeout(() => setMsg(null), 3000)
    } catch {
      setMsg('Erro de rede.')
    } finally {
      setVacBusy(false)
    }
  }

  const release = async (sellerId?: string) => {
    const reason = prompt('Informe o motivo da liberação:')
    if (!reason?.trim()) {
      setMsg('Motivo obrigatório.')
      setTimeout(() => setMsg(null), 3000)
      return
    }

    setBlocksBusy(sellerId ?? 'ALL')
    try {
      const body = sellerId ? { sellerId, reason: reason.trim() } : { all: true, reason: reason.trim() }
      const res = await fetch('/api/seller-queue/blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      setMsg(res.ok ? (sellerId ? 'Vendedor liberado.' : 'Todos liberados.') : (data?.error ?? 'Falha ao liberar.'))
      setTimeout(() => setMsg(null), 3000)
      await loadBlocks()
    } catch {
      setMsg('Erro de rede.')
    } finally {
      setBlocksBusy(null)
    }
  }

  const useMyLocation = () => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition((position) => {
      setCfg((current) => ({
        ...current,
        geofenceLat: position.coords.latitude,
        geofenceLng: position.coords.longitude,
      }))
    })
  }

  const discardChanges = () => {
    if (!savedSnapshot) return
    setCfg(cloneCfg(JSON.parse(savedSnapshot) as Cfg))
    setMsg('Alterações descartadas.')
    setTimeout(() => setMsg(null), 2500)
  }

  const blockConfigInvalid = cfg.autoBlock.enabled && cfg.autoBlock.strikesForDailyBlock <= cfg.autoBlock.strikesForCooldown

  const save = async () => {
    const rangeError = validateCfg(cfg)
    if (rangeError) {
      setMsg(rangeError)
      setTimeout(() => setMsg(null), 5000)
      return
    }

    if (blockConfigInvalid) {
      setMsg('O "bloqueio diário" deve exigir mais perdas que o "bloqueio temporário".')
      setTimeout(() => setMsg(null), 4000)
      return
    }

    setSaving(true)
    setMsg(null)
    try {
      const body = { ...cfg, qrSecret: cfg.qrSecret || null, openTime: cfg.openTime || null, closeTime: cfg.closeTime || null }
      const res = await fetch('/api/seller-queue/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setSavedSnapshot(JSON.stringify(cfg))
        setMsg('Configurações salvas.')
      } else {
        setMsg(data?.error ?? 'Erro ao salvar.')
      }
      setTimeout(() => setMsg(null), 3000)
    } catch {
      setMsg('Erro de rede.')
    } finally {
      setSaving(false)
    }
  }

  const geoErrors = {
    lat: validateOptionalRange(cfg.geofenceLat, 'Latitude', -90, 90),
    lng: validateOptionalRange(cfg.geofenceLng, 'Longitude', -180, 180),
    radius: validateRange(cfg.geofenceRadiusM, 'Raio permitido', 10, 5000, 'metros'),
  }

  const availabilityStatus = onVacation
    ? { value: 'Modo férias ativo', detail: 'Você não recebe novas chamadas enquanto estiver afastado.', tone: 'warning' as StatusTone }
    : { value: 'Disponível para chamadas', detail: 'Você pode entrar ou permanecer na fila conforme a operação da unidade.', tone: 'success' as StatusTone }

  const overviewCards: Array<{ title: string; value: string; detail: string; tone: StatusTone; icon: ReactNode; scope: string }> = canSettings
    ? [
        {
          title: 'Disponibilidade',
          value: availabilityStatus.value,
          detail: availabilityStatus.detail,
          tone: availabilityStatus.tone,
          icon: <PhoneCall size={18} />,
          scope: 'Minha disponibilidade',
        },
        {
          title: 'Alertas neste aparelho',
          value: deviceAlertSummary.label,
          detail: deviceAlertSummary.detail,
          tone: deviceAlertSummary.tone,
          icon: <BellRing size={18} />,
          scope: deviceAlertSummary.scope,
        },
        {
          title: 'Presença na unidade',
          value: cfg.active ? 'Obrigatória' : 'Desativada',
          detail: cfg.active ? `${cfg.presenceMethods.length} método(s) habilitado(s) para check-in.` : 'A fila desta unidade não exige confirmação física para entrar.',
          tone: cfg.active ? 'success' : 'neutral',
          icon: <MapPin size={18} />,
          scope: 'Configuração da unidade',
        },
        {
          title: 'Escopo desta tela',
          value: user?.unitId ? 'Unidade atual vinculada' : 'Configuração da unidade',
          detail: hasPendingChanges ? 'Existem alterações pendentes de salvamento nesta unidade.' : 'Sem alterações pendentes no momento.',
          tone: hasPendingChanges ? 'warning' : 'neutral',
          icon: <Shield size={18} />,
          scope: 'Somente administradores',
        },
      ]
    : [
        {
          title: 'Disponibilidade',
          value: availabilityStatus.value,
          detail: availabilityStatus.detail,
          tone: availabilityStatus.tone,
          icon: <PhoneCall size={18} />,
          scope: 'Minha disponibilidade',
        },
        {
          title: 'Alertas neste aparelho',
          value: deviceAlertSummary.label,
          detail: deviceAlertSummary.detail,
          tone: deviceAlertSummary.tone,
          icon: <BellRing size={18} />,
          scope: deviceAlertSummary.scope,
        },
        {
          title: 'Configurações da unidade',
          value: 'Gerenciadas pela gestão',
          detail: 'As regras de presença, chamadas e segurança ficam protegidas para cargos autorizados.',
          tone: 'neutral' as StatusTone,
          icon: <Shield size={18} />,
          scope: 'Somente administradores',
        },
      ]

  const sectionIntro = sections.find((section) => section.id === visibleSection)

  let sectionContent: ReactNode = null

  if (visibleSection === 'overview') {
    sectionContent = (
      <div className="space-y-5">
        <SettingsSection
          title="Status da fila"
          description="Veja o que está ativo agora neste aparelho e o que depende das configurações da unidade."
        >
          <div className="grid gap-4 md:grid-cols-2">
            {overviewCards.map((card) => (
              <OverviewCard
                key={card.title}
                icon={card.icon}
                title={card.title}
                value={card.value}
                detail={card.detail}
                tone={card.tone}
                scope={card.scope}
              />
            ))}
          </div>
        </SettingsSection>

        <SettingsSection
          title="Como usar esta tela"
          description="As seções abaixo separam o que é configuração permanente, o que é ajuste deste aparelho e o que serve apenas para teste e diagnóstico."
        >
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-semibold text-gray-900">Configurações permanentes</p>
              <p className="mt-1 text-sm text-gray-500">
                Alterações de unidade, presença, chamadas, conformidade e permissões só entram em vigor quando você salvar.
              </p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-semibold text-gray-900">Testes e verificações</p>
              <p className="mt-1 text-sm text-gray-500">
                Enviar alerta de teste, conferir dispositivos e tocar sons não mudam a regra da fila; servem apenas para validação operacional.
              </p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-semibold text-gray-900">Escopos desta página</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <ScopeBadge>Neste aparelho</ScopeBadge>
                <ScopeBadge>Minha disponibilidade</ScopeBadge>
                {canSettings && <ScopeBadge>Configuração da unidade</ScopeBadge>}
                {canSettings && <ScopeBadge>Somente administradores</ScopeBadge>}
              </div>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-semibold text-gray-900">Alterações pendentes</p>
              <p className="mt-1 text-sm text-gray-500">
                {hasPendingChanges
                  ? 'Há mudanças aguardando confirmação. Use a barra fixa no final da tela para salvar ou descartar.'
                  : 'No momento não há alterações pendentes nesta configuração.'}
              </p>
            </div>
          </div>
        </SettingsSection>
      </div>
    )
  }

  if (visibleSection === 'alerts') {
    sectionContent = (
      <div className="space-y-5">
        <SettingsSection
          title="Alertas neste aparelho"
          description="Ative e valide como este aparelho recebe as chamadas da fila sem alterar as regras gerais da unidade."
          scope="Neste aparelho"
        >
          <SettingRow
            icon={<BellRing size={16} />}
            title="Estado atual do aparelho"
            description={deviceAlertSummary.detail}
            status={deviceAlertSummary.label}
            statusTone={deviceAlertSummary.tone}
            scope="Neste aparelho"
          />
          <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4">
            <AlertSetup scope="queue" testButtonVariant="secondary" />
          </div>
        </SettingsSection>

        {canSettings && (
          <SettingsSection
            title="Canais e comportamento do alerta"
            description="Define como a unidade avisa o vendedor da vez e a gestão quando a chamada acontece ou fica sem resposta."
            scope="Configuração da unidade"
          >
            <SettingRow
              icon={<Bell size={16} />}
              title="Som em loop no app do vendedor"
              description="Toca o alerta dentro do app quando o vendedor da vez for chamado."
              status={cfg.alertSound ? 'Ativado' : 'Desativado'}
              statusTone={cfg.alertSound ? 'success' : 'neutral'}
              scope="Configuração da unidade"
              control={
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={cfg.alertSound}
                    onChange={(e) => set('alertSound', e.target.checked)}
                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span>Ativado</span>
                </label>
              }
            >
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Modelo do som</label>
                  <div className="flex gap-2">
                    <select className={inputCls} value={cfg.alertSoundType} onChange={(e) => set('alertSoundType', e.target.value)}>
                      {SOUND_OPTIONS.map((sound) => (
                        <option key={sound.value} value={sound.value}>
                          {sound.label}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={() => { unlockAudio(); playSound(cfg.alertSoundType) }} className="btn-secondary shrink-0 text-xs">
                      <Volume2 size={14} />
                      Ouvir
                    </button>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Repetir o som a cada</label>
                  <input
                    type="number"
                    min={5}
                    max={120}
                    className={inputCls}
                    value={cfg.alertRepeatSeconds}
                    onChange={(e) => set('alertRepeatSeconds', Number(e.target.value) || 10)}
                  />
                  <p className="mt-1 text-[11px] text-gray-400">Em segundos.</p>
                </div>
              </div>
            </SettingRow>

            <SettingRow
              title="Notificações do navegador"
              description="Permite alertar o vendedor mesmo com a aba minimizada no desktop ou no PWA."
              status={cfg.alertBrowserPush ? 'Ativado' : 'Desativado'}
              statusTone={cfg.alertBrowserPush ? 'success' : 'neutral'}
              scope="Configuração da unidade"
              control={
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={cfg.alertBrowserPush}
                    onChange={(e) => set('alertBrowserPush', e.target.checked)}
                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span>Ativado</span>
                </label>
              }
            />

            <SettingRow
              title="WhatsApp do vendedor da vez"
              description="Usa o provedor já configurado da loja para complementar o alerta da fila."
              status={cfg.alertWhatsapp ? 'Ativado' : 'Desativado'}
              statusTone={cfg.alertWhatsapp ? 'success' : 'neutral'}
              scope="Configuração da unidade"
              control={
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={cfg.alertWhatsapp}
                    onChange={(e) => set('alertWhatsapp', e.target.checked)}
                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span>Ativado</span>
                </label>
              }
            />

            <SettingRow
              title="WhatsApp da gestão"
              description="Avisa a gestão quando não há vendedor disponível ou quando a chamada expira."
              status={cfg.alertWhatsappManagers ? 'Ativado' : 'Desativado'}
              statusTone={cfg.alertWhatsappManagers ? 'success' : 'neutral'}
              scope="Configuração da unidade"
              control={
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={cfg.alertWhatsappManagers}
                    onChange={(e) => set('alertWhatsappManagers', e.target.checked)}
                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span>Ativado</span>
                </label>
              }
            />

            <p className="pt-2 text-[11px] text-gray-400">
              O aviso interno da central continua existindo. Se a loja não tiver provedor de WhatsApp ativo, esse envio é simplesmente ignorado.
            </p>
          </SettingsSection>
        )}
      </div>
    )
  }

  if (visibleSection === 'availability') {
    sectionContent = (
      <div className="space-y-5">
        <SettingsSection
          title="Modo férias"
          description="Quando ativo, você fica fora da fila e não recebe novas chamadas como vendedor da vez."
          scope="Minha disponibilidade"
        >
          <SettingRow
            icon={<Palmtree size={16} />}
            title="Afastamento temporário da fila"
            description={onVacation ? 'Seu usuário está fora da fila desta unidade até você desativar esse modo.' : 'Use quando não puder receber novas chamadas nesta unidade.'}
            status={onVacation ? 'Modo férias ativo' : 'Disponível'}
            statusTone={onVacation ? 'warning' : 'success'}
            scope="Minha disponibilidade"
            control={
              <button
                type="button"
                onClick={toggleVacation}
                disabled={vacBusy}
                className={cn(
                  'rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60',
                  onVacation ? 'bg-amber-500 hover:bg-amber-600' : 'bg-brand-600 hover:bg-brand-700',
                )}
              >
                {vacBusy ? 'Atualizando...' : onVacation ? 'Desativar modo férias' : 'Ativar modo férias'}
              </button>
            }
          />
          {onVacation && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Enquanto o modo férias estiver ativo, você não entra nas próximas chamadas desta unidade.
            </div>
          )}
        </SettingsSection>

        {canSettings && (
          <>
            <SettingsSection
              title="Equipe apta a operar a fila"
              description="Gerencie participação, férias e elegibilidade dos colaboradores sem mudar a lógica de rotação da fila."
              scope="Configuração da unidade"
            >
              <div className="space-y-4">
                <QueueParticipantsCard />
                <VacationManagerCard />
              </div>
            </SettingsSection>

            <SettingsSection
              title="Horários automáticos e pausa prolongada"
              description="Define quando a fila abre ou fecha sozinha e quando um colaborador ausente deixa a fila automaticamente."
              scope="Configuração da unidade"
            >
              <SettingRow
                icon={<Clock size={16} />}
                title="Abrir e fechar a fila por horário"
                description="Ative para seguir a rotina operacional da unidade sem depender de ação manual todos os dias."
                status={cfg.autoSchedule ? 'Ativado' : 'Desativado'}
                statusTone={cfg.autoSchedule ? 'success' : 'neutral'}
                scope="Configuração da unidade"
                control={
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={cfg.autoSchedule}
                      onChange={(e) => set('autoSchedule', e.target.checked)}
                      className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span>Ativado</span>
                  </label>
                }
              >
                <div className={cn('grid gap-3 md:grid-cols-2', !cfg.autoSchedule && 'pointer-events-none opacity-50')}>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">Abre às</label>
                    <input type="time" className={inputCls} value={cfg.openTime ?? ''} onChange={(e) => set('openTime', e.target.value || null)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">Fecha às</label>
                    <input type="time" className={inputCls} value={cfg.closeTime ?? ''} onChange={(e) => set('closeTime', e.target.value || null)} />
                  </div>
                </div>
                <div className={cn('mt-3', !cfg.autoSchedule && 'pointer-events-none opacity-50')}>
                  <p className="mb-2 text-xs font-medium text-gray-700">Dias de funcionamento</p>
                  <div className="flex flex-wrap gap-2">
                    {DAYS.map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() =>
                          set(
                            'allowedDays',
                            cfg.allowedDays.includes(value)
                              ? cfg.allowedDays.filter((day) => day !== value)
                              : [...cfg.allowedDays, value],
                          )
                        }
                        className={cn(
                          'rounded-lg border px-3 py-1.5 text-xs font-semibold',
                          cfg.allowedDays.includes(value) ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 bg-white text-gray-500',
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-gray-400">Sem dias marcados = todos os dias.</p>
                </div>
              </SettingRow>

              <SettingRow
                title="Saída automática por pausa ou ausência"
                description="Remove da fila quem permanecer pausado ou ausente por muito tempo."
                status={cfg.maxPauseMinutes > 0 ? `${cfg.maxPauseMinutes} min` : 'Desativado'}
                statusTone={cfg.maxPauseMinutes > 0 ? 'warning' : 'neutral'}
                scope="Configuração da unidade"
              >
                <div className="max-w-[180px]">
                  <label className="mb-1 block text-xs font-medium text-gray-700">Tempo máximo</label>
                  <input
                    type="number"
                    min={limits.maxPauseMinutes.min}
                    max={limits.maxPauseMinutes.max}
                    className={inputCls}
                    value={cfg.maxPauseMinutes}
                    onChange={(e) => set('maxPauseMinutes', Number(e.target.value) || 0)}
                  />
                  <p className="mt-1 text-[11px] text-gray-400">0 desliga essa remoção automática.</p>
                </div>
              </SettingRow>
            </SettingsSection>
          </>
        )}
      </div>
    )
  }

  if (visibleSection === 'presence' && canSettings) {
    sectionContent = (
      <div className="space-y-5">
        <SettingsSection
          title="Presença na unidade"
          description="Defina como o sistema confirma que o vendedor está fisicamente autorizado a entrar na fila desta unidade."
          scope="Configuração da unidade"
        >
          <SettingRow
            icon={<MapPin size={16} />}
            title="Exigir validação de presença nesta unidade"
            description="Quando desativado, os métodos abaixo ficam preservados, porém sem efeito na entrada da fila."
            status={cfg.active ? 'Ativada' : 'Desativada'}
            statusTone={cfg.active ? 'success' : 'neutral'}
            scope="Configuração da unidade"
            control={
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={cfg.active}
                  onChange={(e) => set('active', e.target.checked)}
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <span>Ativado</span>
              </label>
            }
          >
            <div className={cn('space-y-4', !cfg.active && 'opacity-60')}>
              <div>
                <p className="mb-3 text-xs font-medium text-gray-700">Métodos aceitos</p>
                <div className="grid gap-3 md:grid-cols-3">
                  {METHODS.map(([value, label, helper]) => {
                    const checked = cfg.presenceMethods.includes(value)
                    return (
                      <label
                        key={value}
                        className={cn(
                          'rounded-2xl border p-4 text-sm transition',
                          checked ? 'border-brand-500 bg-brand-50' : 'border-gray-200 bg-white',
                          !cfg.active && 'pointer-events-none',
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!cfg.active}
                            onChange={() =>
                              set(
                                'presenceMethods',
                                checked ? cfg.presenceMethods.filter((item) => item !== value) : [...cfg.presenceMethods, value],
                              )
                            }
                            className="mt-0.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                          />
                          <div>
                            <p className="font-semibold text-gray-900">{label}</p>
                            <p className="mt-1 text-xs text-gray-500">{helper}</p>
                          </div>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Tempo de aceite da chamada</label>
                  <input
                    type="number"
                    min={10}
                    max={600}
                    className={inputCls}
                    value={cfg.acceptTimeoutSeconds}
                    onChange={(e) => set('acceptTimeoutSeconds', Number(e.target.value) || 60)}
                  />
                  <p className="mt-1 text-[11px] text-gray-400">Em segundos, antes de considerar a chamada expirada.</p>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={cfg.requireRevalidationOnAccept}
                      onChange={(e) => set('requireRevalidationOnAccept', e.target.checked)}
                      className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    />
                    Revalidar presença no aceite da chamada
                  </label>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Cliente recorrente</label>
                  <select className={inputCls} value={cfg.recurringCustomerRule} onChange={(e) => set('recurringCustomerRule', e.target.value)}>
                    <option value="RESPONSIBLE">Chamar o responsável</option>
                    <option value="QUEUE">Sempre o vendedor da vez</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={cfg.requestByNameRequiresApproval}
                      onChange={(e) => set('requestByNameRequiresApproval', e.target.checked)}
                      className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    />
                    Pedido por nome exige aprovação
                  </label>
                </div>
              </div>
            </div>
          </SettingRow>

          <details
            open={advancedGeoOpen}
            onToggle={(e) => setAdvancedGeoOpen((e.currentTarget as HTMLDetailsElement).open)}
            className="mt-4 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-gray-900">
              <span className="flex items-center gap-2">
                <MapPin size={16} className="text-brand-600" />
                Configurações avançadas de geolocalização
              </span>
              <ChevronRight size={16} className={cn('transition', advancedGeoOpen && 'rotate-90')} />
            </summary>
            <p className="mt-2 text-sm text-gray-500">
              Esses campos são técnicos e ficam reservados para quem administra a presença física da unidade.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Latitude</label>
                <input
                  className={inputCls}
                  value={cfg.geofenceLat ?? ''}
                  onChange={(e) => set('geofenceLat', e.target.value ? Number(e.target.value) : null)}
                  aria-describedby={geoErrors.lat ? 'geo-lat-error' : undefined}
                />
                <p className="mt-1 text-[11px] text-gray-400">Entre -90 e 90.</p>
                {geoErrors.lat && <p id="geo-lat-error" className="mt-1 text-xs text-red-600">{geoErrors.lat}</p>}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Longitude</label>
                <input
                  className={inputCls}
                  value={cfg.geofenceLng ?? ''}
                  onChange={(e) => set('geofenceLng', e.target.value ? Number(e.target.value) : null)}
                  aria-describedby={geoErrors.lng ? 'geo-lng-error' : undefined}
                />
                <p className="mt-1 text-[11px] text-gray-400">Entre -180 e 180.</p>
                {geoErrors.lng && <p id="geo-lng-error" className="mt-1 text-xs text-red-600">{geoErrors.lng}</p>}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Raio permitido</label>
                <input
                  type="number"
                  min={10}
                  max={5000}
                  className={inputCls}
                  value={cfg.geofenceRadiusM}
                  onChange={(e) => set('geofenceRadiusM', Number(e.target.value) || 150)}
                  aria-describedby={geoErrors.radius ? 'geo-radius-error' : undefined}
                />
                <p className="mt-1 text-[11px] text-gray-400">Em metros.</p>
                {geoErrors.radius && <p id="geo-radius-error" className="mt-1 text-xs text-red-600">{geoErrors.radius}</p>}
              </div>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Segredo do QR da unidade</label>
                <input
                  className={inputCls}
                  value={cfg.qrSecret ?? ''}
                  onChange={(e) => set('qrSecret', e.target.value)}
                  placeholder="Token fixo do QR da loja"
                />
              </div>
              <div className="flex items-end">
                <button type="button" onClick={useMyLocation} className="btn-secondary text-xs">
                  <MapPin size={13} />
                  Usar localização atual
                </button>
              </div>
            </div>
          </details>
        </SettingsSection>
      </div>
    )
  }

  if (visibleSection === 'calls' && canSettings) {
    sectionContent = (
      <div className="space-y-5">
        <SettingsSection
          title="Lembretes de atendimento aberto"
          description="Controla quando o sistema volta a cobrar resposta do vendedor e quando escalar a gestão."
          scope="Configuração da unidade"
        >
          <SettingRow
            icon={<BellRing size={16} />}
            title="Lembretes automáticos"
            description="Acompanha atendimentos abertos por muito tempo e força um retorno operacional."
            status={cfg.attendanceReminder.enabled ? 'Ativado' : 'Desativado'}
            statusTone={cfg.attendanceReminder.enabled ? 'success' : 'neutral'}
            scope="Configuração da unidade"
            control={
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={cfg.attendanceReminder.enabled}
                  onChange={(e) => set('attendanceReminder', { ...cfg.attendanceReminder, enabled: e.target.checked })}
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <span>Ativado</span>
              </label>
            }
          >
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={cfg.attendanceReminder.autoEscalate}
                  onChange={(e) => set('attendanceReminder', { ...cfg.attendanceReminder, autoEscalate: e.target.checked })}
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                Escalar para a gestão sem resposta
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={cfg.attendanceReminder.requireFinishOnNo}
                  onChange={(e) => set('attendanceReminder', { ...cfg.attendanceReminder, requireFinishOnNo: e.target.checked })}
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                Abrir finalização ao responder “não”
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={cfg.attendanceReminder.allowSnooze}
                  onChange={(e) => set('attendanceReminder', { ...cfg.attendanceReminder, allowSnooze: e.target.checked })}
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                Permitir adiar o lembrete
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={cfg.attendanceReminder.logEveryReminder}
                  onChange={(e) => set('attendanceReminder', { ...cfg.attendanceReminder, logEveryReminder: e.target.checked })}
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                Registrar todos os lembretes
              </label>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Primeiro lembrete</label>
                <input
                  type="number"
                  min={limits.attendanceFirstAfterMinutes.min}
                  max={limits.attendanceFirstAfterMinutes.max}
                  className={inputCls}
                  value={cfg.attendanceReminder.firstAfterMinutes}
                  onChange={(e) => set('attendanceReminder', { ...cfg.attendanceReminder, firstAfterMinutes: Number(e.target.value) || 15 })}
                />
                <p className="mt-1 text-[11px] text-gray-400">Em minutos.</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Repetir a cada</label>
                <input
                  type="number"
                  min={limits.attendanceRepeatIntervalSeconds.min}
                  max={limits.attendanceRepeatIntervalSeconds.max}
                  className={inputCls}
                  value={cfg.attendanceReminder.repeatIntervalSeconds}
                  onChange={(e) => set('attendanceReminder', { ...cfg.attendanceReminder, repeatIntervalSeconds: Number(e.target.value) || 300 })}
                />
                <p className="mt-1 text-[11px] text-gray-400">Em segundos.</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Máx. de lembretes</label>
                <input
                  type="number"
                  min={limits.attendanceMaxReminders.min}
                  max={limits.attendanceMaxReminders.max}
                  className={inputCls}
                  value={cfg.attendanceReminder.maxReminders}
                  onChange={(e) => set('attendanceReminder', { ...cfg.attendanceReminder, maxReminders: Number(e.target.value) || 6 })}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Escalar após</label>
                <input
                  type="number"
                  min={limits.attendanceEscalateAfter.min}
                  max={limits.attendanceEscalateAfter.max}
                  className={inputCls}
                  value={cfg.attendanceReminder.escalateAfter}
                  onChange={(e) => set('attendanceReminder', { ...cfg.attendanceReminder, escalateAfter: Number(e.target.value) || 3 })}
                />
              </div>
            </div>
          </SettingRow>
        </SettingsSection>

        <SettingsSection
          title="Push complementar da fila"
          description="Usa push ou mobile além da central interna, com limites anti-spam e regras de horário."
          scope="Configuração da unidade"
        >
          <SettingRow
            icon={<Bell size={16} />}
            title="Enviar push complementar"
            description="Serve como reforço para a chamada da fila, sem trocar o fluxo principal da central."
            status={cfg.queuePush.enabled ? 'Ativado' : 'Desativado'}
            statusTone={cfg.queuePush.enabled ? 'success' : 'neutral'}
            scope="Configuração da unidade"
            control={
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={cfg.queuePush.enabled}
                  onChange={(e) => set('queuePush', { ...cfg.queuePush, enabled: e.target.checked })}
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <span>Ativado</span>
              </label>
            }
          >
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={cfg.queuePush.allowOutsideHoursForAdmins}
                  onChange={(e) => set('queuePush', { ...cfg.queuePush, allowOutsideHoursForAdmins: e.target.checked })}
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                Gestão pode alertar fora do horário
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={cfg.queuePush.sound}
                  onChange={(e) => set('queuePush', { ...cfg.queuePush, sound: e.target.checked })}
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                Tocar som junto do push complementar
              </label>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Alvo padrão</label>
                <select className={inputCls} value={cfg.queuePush.targetScope} onChange={(e) => set('queuePush', { ...cfg.queuePush, targetScope: e.target.value })}>
                  <option value="CURRENT_SELLER">Vendedor da vez</option>
                  <option value="CALLED_SELLER">Vendedor chamado ou atendendo</option>
                  <option value="ALL_ACTIVE_PARTICIPANTS">Participantes ativos</option>
                  <option value="MANAGERS">Gestão</option>
                  <option value="MANAGERS_AND_CURRENT">Gestão + vendedor da vez</option>
                  <option value="ALL_QUEUE">Toda a fila</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Intervalo mínimo</label>
                <input
                  type="number"
                  min={limits.queuePushIntervalSeconds.min}
                  max={limits.queuePushIntervalSeconds.max}
                  className={inputCls}
                  value={cfg.queuePush.intervalSeconds}
                  onChange={(e) => set('queuePush', { ...cfg.queuePush, intervalSeconds: Number(e.target.value) || 300 })}
                />
                <p className="mt-1 text-[11px] text-gray-400">Em segundos.</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Máx. de tentativas</label>
                <input
                  type="number"
                  min={limits.queuePushMaxRetries.min}
                  max={limits.queuePushMaxRetries.max}
                  className={inputCls}
                  value={cfg.queuePush.maxRetries}
                  onChange={(e) => set('queuePush', { ...cfg.queuePush, maxRetries: Number(e.target.value) || 6 })}
                />
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Limite por vendedor</label>
                <input
                  type="number"
                  min={limits.queuePushAntiSpamUserLimit.min}
                  max={limits.queuePushAntiSpamUserLimit.max}
                  className={inputCls}
                  value={cfg.queuePush.antiSpamUserLimit}
                  onChange={(e) => set('queuePush', { ...cfg.queuePush, antiSpamUserLimit: Number(e.target.value) || 8 })}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Limite por atendimento</label>
                <input
                  type="number"
                  min={limits.queuePushAntiSpamAttendanceLimit.min}
                  max={limits.queuePushAntiSpamAttendanceLimit.max}
                  className={inputCls}
                  value={cfg.queuePush.antiSpamAttendanceLimit}
                  onChange={(e) => set('queuePush', { ...cfg.queuePush, antiSpamAttendanceLimit: Number(e.target.value) || 6 })}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Limite por fila</label>
                <input
                  type="number"
                  min={limits.queuePushAntiSpamQueueLimit.min}
                  max={limits.queuePushAntiSpamQueueLimit.max}
                  className={inputCls}
                  value={cfg.queuePush.antiSpamQueueLimit}
                  onChange={(e) => set('queuePush', { ...cfg.queuePush, antiSpamQueueLimit: Number(e.target.value) || 60 })}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Janela anti-spam</label>
                <input
                  type="number"
                  min={limits.queuePushAntiSpamWindowMinutes.min}
                  max={limits.queuePushAntiSpamWindowMinutes.max}
                  className={inputCls}
                  value={cfg.queuePush.antiSpamWindowMinutes}
                  onChange={(e) => set('queuePush', { ...cfg.queuePush, antiSpamWindowMinutes: Number(e.target.value) || 10 })}
                />
                <p className="mt-1 text-[11px] text-gray-400">Em minutos.</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Início permitido</label>
                <input
                  type="time"
                  className={inputCls}
                  value={cfg.queuePush.allowedStartTime ?? ''}
                  onChange={(e) => set('queuePush', { ...cfg.queuePush, allowedStartTime: e.target.value || null })}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Fim permitido</label>
                <input
                  type="time"
                  className={inputCls}
                  value={cfg.queuePush.allowedEndTime ?? ''}
                  onChange={(e) => set('queuePush', { ...cfg.queuePush, allowedEndTime: e.target.value || null })}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Urgência</label>
                <select className={inputCls} value={cfg.queuePush.urgency} onChange={(e) => set('queuePush', { ...cfg.queuePush, urgency: e.target.value })}>
                  <option value="HIGH">Alta</option>
                  <option value="NORMAL">Normal</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Reenviar até</label>
                <select className={inputCls} value={cfg.queuePush.resendUntil} onChange={(e) => set('queuePush', { ...cfg.queuePush, resendUntil: e.target.value })}>
                  <option value="ACKNOWLEDGED">Confirmação</option>
                  <option value="FINISHED">Finalização</option>
                  <option value="MAX_RETRIES">Máx. tentativas</option>
                </select>
              </div>
            </div>
          </SettingRow>
        </SettingsSection>

        <SettingsSection
          title="Painel da loja"
          description="Controla o som e a cadência do painel grande da unidade quando existe uma chamada aguardando aceite."
          scope="Configuração da unidade"
        >
          <div className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-2">
              {[
                ['enabled', 'Ativar som do painel'],
                ['repeatUntilAccepted', 'Tocar enquanto o vendedor não aceitar'],
                ['onlyStorePanel', 'Tocar somente no painel da loja'],
                ['playOnDashboard', 'Tocar também no dashboard da fila'],
                ['muteOutsideHours', 'Silenciar fora do horário da loja'],
                ['requireManualActivation', 'Exigir ativação manual do som'],
                ['wakeLock', 'Usar Wake Lock quando disponível'],
                ['showHiddenWarning', 'Avisar se o painel estiver em segundo plano'],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={cfg.panelSound[key as keyof PanelSoundConfig] as boolean}
                    onChange={(e) => set('panelSound', { ...cfg.panelSound, [key]: e.target.checked })}
                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  {label}
                </label>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Tipo de som</label>
                <select className={inputCls} value={cfg.panelSound.soundType} onChange={(e) => set('panelSound', { ...cfg.panelSound, soundType: e.target.value })}>
                  {SOUND_OPTIONS.map((sound) => (
                    <option key={sound.value} value={sound.value}>
                      {sound.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Toque a cada</label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  className={inputCls}
                  value={cfg.panelSound.repeatSeconds}
                  onChange={(e) => set('panelSound', { ...cfg.panelSound, repeatSeconds: Number(e.target.value) || 3 })}
                />
                <p className="mt-1 text-[11px] text-gray-400">Em segundos.</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Atualizar painel</label>
                <input
                  type="number"
                  min={3}
                  max={60}
                  className={inputCls}
                  value={cfg.panelSound.refreshSeconds}
                  onChange={(e) => set('panelSound', { ...cfg.panelSound, refreshSeconds: Number(e.target.value) || 3 })}
                />
                <p className="mt-1 text-[11px] text-gray-400">Em segundos.</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Volume</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  className={inputCls}
                  value={cfg.panelSound.volume}
                  onChange={(e) => set('panelSound', { ...cfg.panelSound, volume: Number(e.target.value) || 0 })}
                />
                <p className="mt-1 text-[11px] text-gray-400">Em porcentagem.</p>
              </div>
            </div>
          </div>
        </SettingsSection>

        <EscalationConfigCard />
        <AttendanceTypesConfigCard />

        <SettingsSection
          title="Regras de chamada rápida e convivência"
          description="Define quando a vez é consumida, quando o vendedor pode ficar aguardando na fila e qual o limite para atendimento rápido."
          scope="Configuração da unidade"
        >
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-700">Permitir aguardar na fila com atendimento ativo?</label>
              <select value={cfg.allowWaitWithOpenAttendance} onChange={(e) => set('allowWaitWithOpenAttendance', e.target.value)} className={inputCls}>
                <option value="NO">Não</option>
                <option value="YES">Sim</option>
                <option value="QUICK_ONLY">Apenas em informação rápida</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-700">Atendimento de informação rápida consome a vez?</label>
              <select value={cfg.infoRapidaConsumesTurn} onChange={(e) => set('infoRapidaConsumesTurn', e.target.value)} className={inputCls}>
                <option value="NO">Não</option>
                <option value="YES">Sim</option>
                <option value="TIME_LIMIT">Apenas se exceder o limite</option>
              </select>
            </div>

            <div className="max-w-[180px]">
              <label className="mb-1 block text-xs font-semibold text-gray-700">Limite para informação rápida</label>
              <input
                type="number"
                min={1}
                max={120}
                value={cfg.infoRapidaTimeLimitMinutes}
                onChange={(e) => set('infoRapidaTimeLimitMinutes', Number(e.target.value) || 3)}
                className={inputCls}
              />
              <p className="mt-1 text-[11px] text-gray-400">Em minutos.</p>
            </div>
          </div>
        </SettingsSection>
      </div>
    )
  }

  if (visibleSection === 'security' && canSettings) {
    sectionContent = (
      <div className="space-y-5">
        <SettingsSection
          title="Permissões de operação"
          description="Ajuste o que a equipe pode fazer na fila sem alterar o escopo de tenant ou quebrar o controle do servidor."
          scope="Somente administradores"
        >
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex items-center gap-2 rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={cfg.allowChooseSeller}
                onChange={(e) => set('allowChooseSeller', e.target.checked)}
                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              Gestão pode escolher o vendedor manualmente
            </label>
            <label className="flex items-center gap-2 rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={cfg.allowSellerFinish}
                onChange={(e) => set('allowSellerFinish', e.target.checked)}
                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              Vendedor pode finalizar o próprio atendimento
            </label>
          </div>
        </SettingsSection>

        <SettingsSection
          title="Responsáveis extras pela fila"
          description="Além dos cargos padrão da loja, escolha colaboradores que poderão operar esta fila com poderes de gestão."
          scope="Somente administradores"
        >
          <div className="grid max-h-56 gap-2 overflow-y-auto rounded-2xl border border-gray-100 bg-gray-50/60 p-3 md:grid-cols-2">
            {sellers.map((seller) => {
              const checked = cfg.responsibleUserIds.includes(seller.sellerId)
              return (
                <label key={seller.sellerId} className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) =>
                      set(
                        'responsibleUserIds',
                        e.target.checked
                          ? [...cfg.responsibleUserIds, seller.sellerId]
                          : cfg.responsibleUserIds.filter((item) => item !== seller.sellerId),
                      )
                    }
                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span className="truncate">{seller.name}</span>
                </label>
              )
            })}
            {sellers.length === 0 && <p className="col-span-full py-4 text-center text-sm text-gray-400">Nenhum vendedor elegível encontrado.</p>}
          </div>
        </SettingsSection>

        <SettingsSection
          title="Conformidade operacional"
          description="Transforma suspeitas e reincidências da fila em revisão gerencial, pendência rastreável e impacto controlado no ranking."
          scope="Somente administradores"
        >
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex items-center gap-2 rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={cfg.compliancePilot.enabled}
                onChange={(e) => set('compliancePilot', { ...cfg.compliancePilot, enabled: e.target.checked })}
                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              Ativar piloto de conformidade
            </label>
            <label className="flex items-center gap-2 rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={cfg.compliancePilot.notifyManagers}
                onChange={(e) => set('compliancePilot', { ...cfg.compliancePilot, notifyManagers: e.target.checked })}
                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              Avisar a gestão quando houver revisão
            </label>
            <label className="flex items-center gap-2 rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={cfg.compliancePilot.autoCreateManagerPendency}
                onChange={(e) => set('compliancePilot', { ...cfg.compliancePilot, autoCreateManagerPendency: e.target.checked })}
                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              Abrir pendência automática
            </label>
            <label className="flex items-center gap-2 rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={cfg.compliancePilot.requireConfirmedFraudForRanking}
                onChange={(e) => set('compliancePilot', { ...cfg.compliancePilot, requireConfirmedFraudForRanking: e.target.checked })}
                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              Descontar no ranking só após fraude confirmada
            </label>
          </div>

          <div className={cn('mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4', !cfg.compliancePilot.enabled && 'pointer-events-none opacity-50')}>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Pontos por timeout</label>
              <input
                type="number"
                min={limits.complianceTimeoutPoints.min}
                max={limits.complianceTimeoutPoints.max}
                className={inputCls}
                value={cfg.compliancePilot.timeoutPoints}
                onChange={(e) => set('compliancePilot', { ...cfg.compliancePilot, timeoutPoints: Number(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Fraude média confirmada</label>
              <input
                type="number"
                min={limits.complianceFraudMediumPoints.min}
                max={limits.complianceFraudMediumPoints.max}
                className={inputCls}
                value={cfg.compliancePilot.confirmedFraudMediumPoints}
                onChange={(e) => set('compliancePilot', { ...cfg.compliancePilot, confirmedFraudMediumPoints: Number(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Fraude alta confirmada</label>
              <input
                type="number"
                min={limits.complianceFraudHighPoints.min}
                max={limits.complianceFraudHighPoints.max}
                className={inputCls}
                value={cfg.compliancePilot.confirmedFraudHighPoints}
                onChange={(e) => set('compliancePilot', { ...cfg.compliancePilot, confirmedFraudHighPoints: Number(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Janela de revisão</label>
              <input
                type="number"
                min={limits.complianceReviewWindowDays.min}
                max={limits.complianceReviewWindowDays.max}
                className={inputCls}
                value={cfg.compliancePilot.reviewWindowDays}
                onChange={(e) => set('compliancePilot', { ...cfg.compliancePilot, reviewWindowDays: Number(e.target.value) || 1 })}
              />
              <p className="mt-1 text-[11px] text-gray-400">Em dias.</p>
            </div>
          </div>
        </SettingsSection>

        <SettingsSection
          title="Score de qualidade"
          description="Sistema global de pontos que pode restringir módulos quando o score operacional cair demais."
          scope="Somente administradores"
          action={
            <a
              href="/vendedor-da-vez/qualidade"
              target="_blank"
              rel="noopener"
              className="shrink-0 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100"
            >
              Ver painel
            </a>
          }
        >
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <label className="flex items-center gap-2 rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-700 md:col-span-1">
                <input
                  type="checkbox"
                  checked={cfg.quality.enabled}
                  onChange={(e) => set('quality', { ...cfg.quality, enabled: e.target.checked })}
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                Ativar score de qualidade
              </label>
              <label className="flex items-center gap-2 rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-700 md:col-span-1">
                <input
                  type="checkbox"
                  checked={cfg.quality.autoSweepEnabled}
                  onChange={(e) => set('quality', { ...cfg.quality, autoSweepEnabled: e.target.checked })}
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                Descontar automaticamente
              </label>
              <div className="md:col-span-1">
                <label className="mb-1 block text-xs font-medium text-gray-700">Janela de análise</label>
                <input
                  type="number"
                  min={7}
                  max={180}
                  className={cn(inputCls, 'max-w-[140px]')}
                  value={cfg.quality.scorePeriodDays}
                  onChange={(e) => set('quality', { ...cfg.quality, scorePeriodDays: Number(e.target.value) || 30 })}
                />
                <p className="mt-1 text-[11px] text-gray-400">Em dias.</p>
              </div>
            </div>

            <div className={cn('space-y-4', !cfg.quality.enabled && 'pointer-events-none opacity-50')}>
              <div>
                <p className="border-t border-gray-100 pt-4 text-sm font-semibold text-gray-900">Limiares de restrição</p>
                <p className="mt-1 text-[11px] text-gray-400">Valores negativos. Quanto menor o score, mais severa a restrição.</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div><label className="mb-1 block text-[11px] font-medium text-gray-700">Pop-up de aviso</label><input type="number" max={0} className={inputCls} value={cfg.quality.thresholds.popupAt} onChange={(e) => set('quality', { ...cfg.quality, thresholds: { ...cfg.quality.thresholds, popupAt: Number(e.target.value) || -5 } })} /></div>
                  <div><label className="mb-1 block text-[11px] font-medium text-gray-700">Destaque vermelho</label><input type="number" max={0} className={inputCls} value={cfg.quality.thresholds.warnAt} onChange={(e) => set('quality', { ...cfg.quality, thresholds: { ...cfg.quality.thresholds, warnAt: Number(e.target.value) || -10 } })} /></div>
                  <div><label className="mb-1 block text-[11px] font-medium text-gray-700">Bloquear pendências</label><input type="number" max={0} className={inputCls} value={cfg.quality.thresholds.blockPendencyCreateAt} onChange={(e) => set('quality', { ...cfg.quality, thresholds: { ...cfg.quality.thresholds, blockPendencyCreateAt: Number(e.target.value) || -20 } })} /></div>
                  <div><label className="mb-1 block text-[11px] font-medium text-gray-700">Bloquear leads</label><input type="number" max={0} className={inputCls} value={cfg.quality.thresholds.blockLeadsAt} onChange={(e) => set('quality', { ...cfg.quality, thresholds: { ...cfg.quality.thresholds, blockLeadsAt: Number(e.target.value) || -30 } })} /></div>
                  <div><label className="mb-1 block text-[11px] font-medium text-gray-700">Bloquear negociações</label><input type="number" max={0} className={inputCls} value={cfg.quality.thresholds.blockNewSalesAt} onChange={(e) => set('quality', { ...cfg.quality, thresholds: { ...cfg.quality.thresholds, blockNewSalesAt: Number(e.target.value) || -35 } })} /></div>
                  <div><label className="mb-1 block text-[11px] font-medium text-gray-700">Retirar da fila</label><input type="number" max={0} className={inputCls} value={cfg.quality.thresholds.blockQueueAt} onChange={(e) => set('quality', { ...cfg.quality, thresholds: { ...cfg.quality.thresholds, blockQueueAt: Number(e.target.value) || -50 } })} /></div>
                  <div><label className="mb-1 block text-[11px] font-medium text-gray-700">Máx. pendências abertas</label><input type="number" min={1} max={100} className={inputCls} value={cfg.quality.thresholds.maxUnresolvedPendencies} onChange={(e) => set('quality', { ...cfg.quality, thresholds: { ...cfg.quality.thresholds, maxUnresolvedPendencies: Number(e.target.value) || 8 } })} /></div>
                </div>
              </div>

              <div>
                <p className="border-t border-gray-100 pt-4 text-sm font-semibold text-gray-900">Custo de pontos por evento</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  {([
                    ['pendency_sla_breach', 'Pendência vencida'],
                    ['pendency_overdue_daily', 'Pendência por dia'],
                    ['lead_no_response_24h', 'Lead sem resposta 24h'],
                    ['lead_no_response_48h', 'Lead sem resposta 48h'],
                    ['lead_no_summary_48h', 'Lead sem resumo 48h'],
                    ['attendance_not_finalized', 'Atendimento não finalizado'],
                    ['attendance_no_registration', 'Cliente não cadastrado'],
                    ['admin_procedure_missed', 'Procedimento perdido'],
                    ['manual_warning', 'Aviso formal'],
                    ['manual_penalty', 'Penalidade manual'],
                  ] as [keyof QualityPointCosts, string][]).map(([key, label]) => (
                    <div key={key}>
                      <label className="mb-1 block text-[11px] font-medium text-gray-700">{label}</label>
                      <input
                        type="number"
                        min={0}
                        max={200}
                        className={inputCls}
                        value={(cfg.quality.pointCosts as unknown as Record<string, number>)[key] ?? (DEFAULT_QUALITY_POINT_COSTS as unknown as Record<string, number>)[key] ?? 0}
                        onChange={(e) => set('quality', { ...cfg.quality, pointCosts: { ...cfg.quality.pointCosts, [key]: Number(e.target.value) || 0 } })}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </SettingsSection>

        <SettingsSection
          title="Bloqueio por reincidência"
          description="Retira o vendedor da fila quando o padrão de perdas e timeouts ultrapassa os limites definidos pela unidade."
          scope="Somente administradores"
        >
          <SettingRow
            icon={<ShieldAlert size={16} />}
            title="Ativar bloqueio automático"
            description="Aplica bloqueio temporário ou diário conforme a reincidência de timeouts."
            status={cfg.autoBlock.enabled ? 'Ativado' : 'Desativado'}
            statusTone={cfg.autoBlock.enabled ? 'warning' : 'neutral'}
            scope="Configuração da unidade"
            control={
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={cfg.autoBlock.enabled}
                  onChange={(e) => set('autoBlock', { ...cfg.autoBlock, enabled: e.target.checked })}
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <span>Ativado</span>
              </label>
            }
          >
            <div className={cn('grid gap-3 md:grid-cols-3', !cfg.autoBlock.enabled && 'pointer-events-none opacity-50')}>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Perdas para bloqueio temporário</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  className={inputCls}
                  value={cfg.autoBlock.strikesForCooldown}
                  onChange={(e) => set('autoBlock', { ...cfg.autoBlock, strikesForCooldown: Number(e.target.value) || 1 })}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Duração do bloqueio</label>
                <input
                  type="number"
                  min={1}
                  max={24}
                  className={inputCls}
                  value={cfg.autoBlock.cooldownHours}
                  onChange={(e) => set('autoBlock', { ...cfg.autoBlock, cooldownHours: Number(e.target.value) || 1 })}
                />
                <p className="mt-1 text-[11px] text-gray-400">Em horas.</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Perdas para bloqueio diário</label>
                <input
                  type="number"
                  min={2}
                  max={40}
                  className={inputCls}
                  value={cfg.autoBlock.strikesForDailyBlock}
                  onChange={(e) => set('autoBlock', { ...cfg.autoBlock, strikesForDailyBlock: Number(e.target.value) || 2 })}
                />
              </div>
            </div>
            {blockConfigInvalid && (
              <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
                O bloqueio diário precisa exigir mais perdas do que o bloqueio temporário.
              </p>
            )}
          </SettingRow>

          <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50/60 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">Vendedores bloqueados</p>
                <p className="mt-1 text-sm text-gray-500">A gestão pode liberar manualmente e zerar as perdas do dia quando necessário.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={loadBlocks} className="btn-secondary text-xs">
                  <RefreshCw size={13} />
                  Atualizar
                </button>
                {blocks.length > 0 && (
                  <button
                    type="button"
                    onClick={() => release()}
                    disabled={blocksBusy !== null}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    {blocksBusy === 'ALL' ? 'Liberando...' : 'Liberar todos'}
                  </button>
                )}
              </div>
            </div>

            {blocks.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-400">Nenhum vendedor bloqueado no momento.</p>
            ) : (
              <div className="mt-4 divide-y divide-gray-100">
                {blocks.map((block) => (
                  <div key={block.sellerId} className="flex flex-col gap-3 py-3 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">{block.name}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        <span className={cn('mr-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold', block.type === 'DAILY_BLOCK' ? 'bg-red-100 text-red-700' : block.type === 'MANUAL' ? 'bg-gray-200 text-gray-700' : 'bg-amber-100 text-amber-700')}>
                          {block.type === 'DAILY_BLOCK' ? 'DIÁRIO' : block.type === 'MANUAL' ? 'MANUAL' : 'TEMPORÁRIO'}
                        </span>
                        {untilText(block)} · {block.strikes} perda(s) hoje
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => release(block.sellerId)}
                      disabled={blocksBusy !== null}
                      className="rounded-lg border border-brand-300 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-60"
                    >
                      {blocksBusy === block.sellerId ? 'Liberando...' : 'Liberar'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SettingsSection>

        <SettingsSection
          title="Motivos cadastrados"
          description="Padroniza os encerramentos de atendimento ou lead e os motivos de negociação na rotina da unidade."
          scope="Configuração da unidade"
        >
          <div className="space-y-4">
            <ReasonsEditor
              title="Encerrar lead ou atendimento"
              hint="Aparece como opção ao finalizar o atendimento ou o lead."
              items={cfg.leadCloseReasons}
              onChange={(value) => set('leadCloseReasons', value)}
            />
            <div className="border-t border-gray-100" />
            <ReasonsEditor
              title="Negociação"
              hint="Aparece como opção na negociação, como motivo de perda."
              items={cfg.negotiationReasons}
              onChange={(value) => set('negotiationReasons', value)}
            />
          </div>
        </SettingsSection>
      </div>
    )
  }

  if (visibleSection === 'diagnostics' && canSettings) {
    sectionContent = (
      <div className="space-y-5">
        <SettingsSection
          title="Diagnóstico dos colaboradores"
          description="Consolida presença, dispositivos e indicadores de conformidade. Use para verificar se cada pessoa está operacionalmente pronta."
          scope="Somente administradores"
        >
          <QueueDiagnosticsCard />
        </SettingsSection>

        <SettingsSection
          title="Testes rápidos"
          description="Ações de validação que não alteram permanentemente a configuração da fila."
          scope="Somente administradores"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-semibold text-gray-900">Som do painel da loja</p>
              <p className="mt-1 text-sm text-gray-500">Use este teste para confirmar o áudio configurado no painel sem mexer na rotina de chamadas.</p>
              <button type="button" onClick={() => { unlockAudio(); playSound(cfg.panelSound.soundType) }} className="btn-secondary mt-4 text-sm">
                <Volume2 size={14} />
                Testar som do painel
              </button>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-semibold text-gray-900">Alertas neste aparelho</p>
              <p className="mt-1 text-sm text-gray-500">Os testes de push e das permissões deste aparelho continuam disponíveis na seção de alertas.</p>
              <button type="button" onClick={() => setActiveSection('alerts')} className="btn-secondary mt-4 text-sm">
                <BellRing size={14} />
                Ir para alertas
              </button>
            </div>
          </div>
        </SettingsSection>

        <SettingsSection
          title="Zona de perigo"
          description="Comandos administrativos para reiniciar a fila do dia ou limpar histórico. Use apenas quando a operação exigir esse reset."
          scope="Somente administradores"
        >
          <div className="rounded-2xl border border-red-200 bg-red-50/40 p-4">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={async () => {
                  if (!confirm('Deseja realmente limpar todos os vendedores da fila de hoje? O histórico do dia será arquivado e a fila começará vazia.')) return
                  setSaving(true)
                  try {
                    const res = await fetch('/api/seller-queue/admin-reset', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include',
                      body: JSON.stringify({ action: 'reset' }),
                    })
                    const data = await res.json().catch(() => ({}))
                    setMsg(res.ok ? 'Fila de hoje reiniciada com sucesso.' : (data?.error ?? 'Falha ao reiniciar.'))
                    setTimeout(() => setMsg(null), 3000)
                  } catch {
                    setMsg('Erro de rede.')
                  } finally {
                    setSaving(false)
                  }
                }}
                disabled={saving}
                className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-60"
              >
                <RefreshCw size={13} className="inline-block" /> Resetar fila de hoje
              </button>

              {role === 'MASTER' && (
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm('ATENÇÃO: isso irá apagar permanentemente todo o histórico da fila desta unidade. Esta ação não pode ser desfeita. Confirmar?')) return
                    setSaving(true)
                    try {
                      const res = await fetch('/api/seller-queue/admin-reset', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ action: 'wipe' }),
                      })
                      const data = await res.json().catch(() => ({}))
                      setMsg(res.ok ? 'Todo o histórico da fila foi deletado permanentemente.' : (data?.error ?? 'Falha ao limpar histórico.'))
                      setTimeout(() => setMsg(null), 4000)
                    } catch {
                      setMsg('Erro de rede.')
                    } finally {
                      setSaving(false)
                    }
                  }}
                  disabled={saving}
                  className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-60"
                >
                  <Trash2 size={13} className="inline-block" /> Apagar histórico geral
                </button>
              )}
            </div>
          </div>
        </SettingsSection>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 pb-28 pt-4 md:px-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-gray-500">
          <span>Fila</span>
          <ChevronRight size={14} />
          <span>Configurações</span>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
              <Settings size={22} className="text-brand-600" />
              Configurações da fila
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-gray-500">
              Gerencie alertas, disponibilidade, presença e comportamento das chamadas.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => { void load(); void refreshDeviceAlertSummary(); void loadBlocks() }} className="btn-secondary text-sm">
              <RefreshCw size={14} />
              Atualizar dados
            </button>
            {canSettings && <StatusBadge tone={hasPendingChanges ? 'warning' : 'neutral'}>{hasPendingChanges ? 'Com alterações pendentes' : 'Sem alterações pendentes'}</StatusBadge>}
          </div>
        </div>
      </div>

      <FeedbackBanner message={msg} />

      {loading && canSettings ? (
        <SettingsPageSkeleton />
      ) : (
        <>
          <div className={cn('grid gap-4', canSettings ? 'md:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-3')}>
            {overviewCards.map((card) => (
              <OverviewCard
                key={card.title}
                icon={card.icon}
                title={card.title}
                value={card.value}
                detail={card.detail}
                tone={card.tone}
                scope={card.scope}
              />
            ))}
          </div>

          {!canSettings && (
            <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-500 shadow-card">
              As demais configurações da fila são gerenciadas pela gestão desta unidade.
            </div>
          )}

          {canSettings && denied && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-card">
              {denied}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
            <div className="hidden lg:block">
              <SettingsSectionNav items={sections} activeSection={visibleSection} onSelect={setActiveSection} />
            </div>

            <div className="min-w-0 space-y-4">
              <div className="lg:hidden">
                <SettingsSectionNav items={sections} activeSection={visibleSection} onSelect={setActiveSection} mobile />
              </div>

              {sectionIntro && (
                <div className="rounded-3xl border border-gray-200 bg-white px-5 py-4 shadow-card">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">{sectionIntro.icon}</div>
                    <div>
                      <p className="text-base font-semibold text-gray-900">{sectionIntro.title}</p>
                      <p className="text-sm text-gray-500">{sectionIntro.description}</p>
                    </div>
                  </div>
                </div>
              )}

              {sectionContent}
            </div>
          </div>
        </>
      )}

      {hasPendingChanges && <UnsavedChangesBar saving={saving} onDiscard={discardChanges} onSave={save} />}
    </div>
  )
}
