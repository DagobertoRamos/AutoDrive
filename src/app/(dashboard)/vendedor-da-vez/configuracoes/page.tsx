'use client'

// =============================================================================
// Comercial › Fila de Atendimento › Configurações — regras da unidade.
// Presença (geofence/QR/dispositivo), timeout de aceite, regras de recorrente.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Settings, Save, MapPin, Bell, BellRing, Volume2, ShieldAlert, Unlock, RefreshCw, X, Plus, ListChecks, Clock, Palmtree, Zap, Trash2 } from 'lucide-react'

const DAYS: [string, string][] = [['MON', 'Seg'], ['TUE', 'Ter'], ['WED', 'Qua'], ['THU', 'Qui'], ['FRI', 'Sex'], ['SAT', 'Sáb'], ['SUN', 'Dom']]
import { cn } from '@/lib/utils'
import { canAccessModule } from '@/lib/permissions'
import AlertSetup from '@/components/seller-queue/AlertSetup'
import EscalationConfigCard from '@/components/seller-queue/EscalationConfigCard'
import AttendanceTypesConfigCard from '@/components/seller-queue/AttendanceTypesConfigCard'
import VacationManagerCard from '@/components/seller-queue/VacationManagerCard'
import { SOUND_OPTIONS, playSound, unlockAudio } from '@/lib/seller-queue/alert-client'
import { QUEUE_CONFIG_LIMITS } from '@/lib/seller-queue/config-limits'

const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const METHODS = [['GPS', 'GPS / geofence'], ['QR_CODE', 'QR Code'], ['DEVICE_CHECK', 'Dispositivo']] as const

interface AutoBlock { enabled: boolean; strikesForCooldown: number; cooldownHours: number; strikesForDailyBlock: number }
interface AttendanceReminderConfig {
  enabled: boolean; firstAfterMinutes: number; repeatIntervalSeconds: number; maxReminders: number; escalateAfter: number;
  autoEscalate: boolean; requireFinishOnNo: boolean; allowSnooze: boolean; logEveryReminder: boolean;
}
interface QueuePushConfig {
  enabled: boolean; intervalSeconds: number; targetScope: string; maxRetries: number; resendUntil: string;
  antiSpamUserLimit: number; antiSpamAttendanceLimit: number; antiSpamQueueLimit: number; antiSpamWindowMinutes: number;
  allowedStartTime: string | null; allowedEndTime: string | null; allowOutsideHoursForAdmins: boolean; urgency: string; sound: boolean;
}
interface PanelSoundConfig {
  enabled: boolean; repeatUntilAccepted: boolean; repeatSeconds: number; refreshSeconds: number; volume: number; soundType: string;
  playOnDashboard: boolean; onlyStorePanel: boolean; muteOutsideHours: boolean; requireManualActivation: boolean; wakeLock: boolean; showHiddenWarning: boolean;
}
interface Cfg {
  active: boolean; presenceMethods: string[]; geofenceLat: number | null; geofenceLng: number | null; geofenceRadiusM: number;
  qrSecret: string | null; acceptTimeoutSeconds: number; requireRevalidationOnAccept: boolean;
  recurringCustomerRule: string; requestByNameRequiresApproval: boolean;
  alertSound: boolean; alertSoundType: string; alertBrowserPush: boolean; alertWhatsapp: boolean; alertWhatsappManagers: boolean; alertRepeatSeconds: number; allowChooseSeller: boolean;
  allowSellerFinish: boolean;
  leadCloseReasons: string[]; negotiationReasons: string[];
  openTime: string | null; closeTime: string | null; allowedDays: string[];
  maxPauseMinutes: number; autoSchedule: boolean;
  infoRapidaConsumesTurn: string;
  infoRapidaTimeLimitMinutes: number;
  allowWaitWithOpenAttendance: string;
  responsibleUserIds: string[];
  autoBlock: AutoBlock
  attendanceReminder: AttendanceReminderConfig
  queuePush: QueuePushConfig
  panelSound: PanelSoundConfig
}
const DEFAULT_AUTO_BLOCK: AutoBlock = { enabled: true, strikesForCooldown: 3, cooldownHours: 3, strikesForDailyBlock: 6 }
const DEFAULT_ATTENDANCE_REMINDER: AttendanceReminderConfig = { enabled: true, firstAfterMinutes: 15, repeatIntervalSeconds: 300, maxReminders: 6, escalateAfter: 3, autoEscalate: true, requireFinishOnNo: true, allowSnooze: false, logEveryReminder: true }
const DEFAULT_QUEUE_PUSH: QueuePushConfig = { enabled: true, intervalSeconds: 300, targetScope: 'CURRENT_SELLER', maxRetries: 6, resendUntil: 'ACKNOWLEDGED', antiSpamUserLimit: 8, antiSpamAttendanceLimit: 6, antiSpamQueueLimit: 60, antiSpamWindowMinutes: 10, allowedStartTime: null, allowedEndTime: null, allowOutsideHoursForAdmins: true, urgency: 'HIGH', sound: true }
const DEFAULT_PANEL_SOUND: PanelSoundConfig = { enabled: true, repeatUntilAccepted: true, repeatSeconds: 3, refreshSeconds: 3, volume: 80, soundType: 'siren', playOnDashboard: false, onlyStorePanel: true, muteOutsideHours: false, requireManualActivation: true, wakeLock: true, showHiddenWarning: true }
const limits = QUEUE_CONFIG_LIMITS

// Editor de lista de motivos (chips). Usado para encerrar lead e negociação.
function ReasonsEditor({ title, hint, items, onChange }: { title: string; hint: string; items: string[]; onChange: (v: string[]) => void }) {
  const [val, setVal] = useState('')
  const add = () => { const t = val.trim(); if (t && !items.includes(t)) { onChange([...items, t]); setVal('') } }
  return (
    <div>
      <p className="text-sm font-semibold text-gray-800">{title}</p>
      <p className="mb-2 text-[11px] text-gray-400">{hint}</p>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {items.length === 0 && <span className="text-xs text-gray-400">Nenhum motivo cadastrado.</span>}
        {items.map((m) => (
          <span key={m} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
            {m}
            <button type="button" onClick={() => onChange(items.filter((x) => x !== m))} className="text-brand-400 hover:text-red-600"><X size={12} /></button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} placeholder="Novo motivo…" className={inputCls} />
        <button type="button" onClick={add} className="btn-secondary shrink-0 text-xs"><Plus size={14} />Adicionar</button>
      </div>
    </div>
  )
}
const DEFAULTS: Cfg = { active: false, presenceMethods: ['GPS'], geofenceLat: null, geofenceLng: null, geofenceRadiusM: 150, qrSecret: '', acceptTimeoutSeconds: 60, requireRevalidationOnAccept: true, recurringCustomerRule: 'RESPONSIBLE', requestByNameRequiresApproval: true, alertSound: true, alertSoundType: 'siren', alertBrowserPush: true, alertWhatsapp: true, alertWhatsappManagers: true, alertRepeatSeconds: 10, allowChooseSeller: true, allowSellerFinish: true, leadCloseReasons: [], negotiationReasons: [], openTime: null, closeTime: null, allowedDays: [], maxPauseMinutes: 0, autoSchedule: false, infoRapidaConsumesTurn: 'NO', infoRapidaTimeLimitMinutes: 3, allowWaitWithOpenAttendance: 'NO', responsibleUserIds: [], autoBlock: DEFAULT_AUTO_BLOCK, attendanceReminder: DEFAULT_ATTENDANCE_REMINDER, queuePush: DEFAULT_QUEUE_PUSH, panelSound: DEFAULT_PANEL_SOUND }

interface BlockedSeller { sellerId: string; name: string; type: 'COOLDOWN' | 'DAILY_BLOCK' | 'MANUAL'; endsAt: string | null; strikes: number }

function untilText(b: BlockedSeller): string {
  if (b.type === 'MANUAL') return 'bloqueio manual'
  if (b.type === 'DAILY_BLOCK') return 'até o fim do dia'
  if (!b.endsAt) return 'temporário'
  const mins = Math.max(0, Math.ceil((new Date(b.endsAt).getTime() - Date.now()) / 60000))
  const h = Math.floor(mins / 60), m = mins % 60
  return h > 0 ? `~${h}h${m > 0 ? ` ${m}min` : ''} restantes` : `~${m}min restantes`
}

function validateRange(value: number, label: string, min: number, max: number, unit: string): string | null {
  if (!Number.isInteger(value)) return `${label} deve ser um número inteiro.`
  if (value < min) return `${label} deve ser no mínimo ${min} ${unit}.`
  if (value > max) return `${label} deve ser no máximo ${max} ${unit}.`
  return null
}

function validateCfg(c: Cfg): string | null {
  return (
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
    validateRange(c.maxPauseMinutes, 'Tempo de pausa/ausência', limits.maxPauseMinutes.min, limits.maxPauseMinutes.max, 'minutos') ??
    validateRange(c.infoRapidaTimeLimitMinutes, 'Limite de tempo da informação rápida', 1, 60, 'minutos')
  )
}

export default function ConfiguracoesFilaPage() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role
  // Vendedor comum vê só Alertas + Modo Férias. Gestão (settings) vê tudo.
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
  const set = <K extends keyof Cfg>(k: K, v: Cfg[K]) => setCfg((c) => ({ ...c, [k]: v }))
  const toggleMethod = (m: string) => setCfg((c) => ({ ...c, presenceMethods: c.presenceMethods.includes(m) ? c.presenceMethods.filter((x) => x !== m) : [...c.presenceMethods, m] }))

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/seller-queue/config', { credentials: 'include' })
      if (res.status === 403 || res.status === 400) { const j = await res.json().catch(() => ({})); setDenied(j?.error ?? 'Sem acesso.'); return }
      setDenied(null); const j = await res.json(); if (j?.data) setCfg({ ...DEFAULTS, ...j.data, qrSecret: j.data.qrSecret ?? '', allowSellerFinish: j.data.config?.allowSellerFinish ?? true, leadCloseReasons: j.data.config?.leadCloseReasons ?? [], negotiationReasons: j.data.config?.negotiationReasons ?? [], openTime: j.data.openTime ?? null, closeTime: j.data.closeTime ?? null, allowedDays: j.data.allowedDays ?? [], maxPauseMinutes: j.data.config?.maxPauseMinutes ?? 0, autoSchedule: j.data.config?.autoSchedule ?? false, infoRapidaConsumesTurn: j.data.config?.infoRapidaConsumesTurn ?? 'NO', infoRapidaTimeLimitMinutes: j.data.config?.infoRapidaTimeLimitMinutes ?? 3, allowWaitWithOpenAttendance: j.data.config?.allowWaitWithOpenAttendance ?? 'NO', responsibleUserIds: j.data.config?.responsibleUserIds ?? [], autoBlock: { ...DEFAULT_AUTO_BLOCK, ...(j.data.config?.autoBlock ?? {}) }, attendanceReminder: { ...DEFAULT_ATTENDANCE_REMINDER, ...(j.data.config?.attendanceReminder ?? {}) }, queuePush: { ...DEFAULT_QUEUE_PUSH, ...(j.data.config?.queuePush ?? {}) }, panelSound: { ...DEFAULT_PANEL_SOUND, ...(j.data.config?.panelSound ?? {}) } })
    } catch { /* noop */ } finally { setLoading(false) }
  }, [])
  const loadBlocks = useCallback(async () => {
    try {
      const res = await fetch('/api/seller-queue/blocks', { credentials: 'include' })
      if (res.ok) setBlocks((await res.json())?.data ?? [])
    } catch { /* noop */ }
  }, [])
  const loadSellers = useCallback(async () => {
    try {
      const res = await fetch('/api/seller-queue/callable', { credentials: 'include' })
      if (res.ok) setSellers((await res.json())?.data ?? [])
    } catch { /* noop */ }
  }, [])
  useEffect(() => { if (canSettings) { load(); loadBlocks(); loadSellers() } else { setLoading(false) } }, [canSettings, load, loadBlocks, loadSellers])

  // Modo férias (auto-serviço — todos).
  useEffect(() => {
    fetch('/api/seller-queue/vacation', { credentials: 'include' }).then((r) => r.ok ? r.json() : null).then((j) => { if (j?.success) setOnVacation(!!j.data.onVacation) }).catch(() => {})
  }, [])
  const toggleVacation = async () => {
    setVacBusy(true)
    try {
      const res = await fetch('/api/seller-queue/vacation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ on: !onVacation }) })
      const j = await res.json().catch(() => ({}))
      if (res.ok) { setOnVacation(!!j.data.onVacation); setMsg(j.data.onVacation ? 'Modo férias ativado — você está fora da fila.' : 'Modo férias desativado.') }
      else setMsg(j?.error ?? 'Falha ao atualizar.')
      setTimeout(() => setMsg(null), 3000)
    } catch { setMsg('Erro de rede.') } finally { setVacBusy(false) }
  }

  const release = async (sellerId?: string) => {
    const reason = prompt('Informe o motivo da liberação:')
    if (!reason?.trim()) { setMsg('Motivo obrigatório.'); setTimeout(() => setMsg(null), 3000); return }
    setBlocksBusy(sellerId ?? 'ALL')
    try {
      const body = sellerId ? { sellerId, reason: reason.trim() } : { all: true, reason: reason.trim() }
      const res = await fetch('/api/seller-queue/blocks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) })
      const j = await res.json().catch(() => ({}))
      setMsg(res.ok ? (sellerId ? 'Vendedor liberado.' : 'Todos liberados.') : (j?.error ?? 'Falha ao liberar.')); setTimeout(() => setMsg(null), 3000)
      await loadBlocks()
    } catch { setMsg('Erro de rede.') } finally { setBlocksBusy(null) }
  }

  const useMyLocation = () => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition((p) => setCfg((c) => ({ ...c, geofenceLat: p.coords.latitude, geofenceLng: p.coords.longitude })))
  }

  // Trava: o bloqueio diário (reincidência) tem que exigir MAIS perdas que o
  // temporário (diário > temporário), igual à regra validada no servidor.
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
    setSaving(true); setMsg(null)
    try {
      const body = { ...cfg, qrSecret: cfg.qrSecret || null, openTime: cfg.openTime || null, closeTime: cfg.closeTime || null }
      const res = await fetch('/api/seller-queue/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) })
      const j = await res.json().catch(() => ({}))
      setMsg(res.ok ? 'Configurações salvas.' : (j?.error ?? 'Erro ao salvar.')); setTimeout(() => setMsg(null), 3000)
    } catch { setMsg('Erro de rede.') } finally { setSaving(false) }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><Settings size={20} className="text-brand-600" />Configurações da Fila</h1>

      {/* ── Pessoal (todos) — Alertas neste aparelho ───────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900"><BellRing size={16} className="text-brand-600" />Meus alertas neste aparelho</h2>
        <AlertSetup />
      </div>

      {/* ── Pessoal (todos) — Modo Férias ──────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900"><Palmtree size={16} className="text-brand-600" />Modo férias</h2>
        <p className="text-xs text-gray-500">Quando ativado, você fica <strong>fora da fila</strong> e não é chamado como vendedor da vez. Ao desativar, é só entrar na fila de novo.</p>
        {onVacation && <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">🏖️ Você está em modo férias.</div>}
        <button onClick={toggleVacation} disabled={vacBusy} className={cn('rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60', onVacation ? 'bg-gray-500 hover:bg-gray-600' : 'bg-brand-600 hover:bg-brand-700')}>
          {vacBusy ? '...' : onVacation ? 'Sair do modo férias' : 'Entrar em modo férias'}
        </button>
      </div>

      {!canSettings && (
        <p className="text-center text-xs text-gray-400">As demais configurações da fila são gerenciadas pela gestão.</p>
      )}

      {canSettings && denied && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{denied}</div>}

      {canSettings && !denied && (<>
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card space-y-4">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-800"><input type="checkbox" checked={cfg.active} onChange={(e) => set('active', e.target.checked)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />Validação de presença ativa nesta unidade</label>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-700">Métodos de presença aceitos</label>
          <div className="flex flex-wrap gap-2">
            {METHODS.map(([v, l]) => <button key={v} type="button" onClick={() => toggleMethod(v)} className={cn('rounded-lg border px-3 py-1.5 text-xs font-medium', cfg.presenceMethods.includes(v) ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-300 bg-white text-gray-500')}>{l}</button>)}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div><label className="mb-1 block text-xs font-medium text-gray-700">Latitude</label><input className={inputCls} value={cfg.geofenceLat ?? ''} onChange={(e) => set('geofenceLat', e.target.value ? Number(e.target.value) : null)} /></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-700">Longitude</label><input className={inputCls} value={cfg.geofenceLng ?? ''} onChange={(e) => set('geofenceLng', e.target.value ? Number(e.target.value) : null)} /></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-700">Raio (m)</label><input type="number" className={inputCls} value={cfg.geofenceRadiusM} onChange={(e) => set('geofenceRadiusM', Number(e.target.value) || 150)} /></div>
        </div>
        <button onClick={useMyLocation} className="btn-secondary text-xs"><MapPin size={13} />Usar minha localização atual</button>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label className="mb-1 block text-xs font-medium text-gray-700">Segredo do QR (token)</label><input className={inputCls} value={cfg.qrSecret ?? ''} onChange={(e) => set('qrSecret', e.target.value)} placeholder="token fixo do QR da loja" /></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-700">Tempo de aceite (segundos)</label><input type="number" min={10} max={600} className={inputCls} value={cfg.acceptTimeoutSeconds} onChange={(e) => set('acceptTimeoutSeconds', Number(e.target.value) || 60)} /></div>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={cfg.requireRevalidationOnAccept} onChange={(e) => set('requireRevalidationOnAccept', e.target.checked)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />Revalidar presença no aceite</label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label className="mb-1 block text-xs font-medium text-gray-700">Cliente recorrente</label><select className={inputCls} value={cfg.recurringCustomerRule} onChange={(e) => set('recurringCustomerRule', e.target.value)}><option value="RESPONSIBLE">Chama o responsável</option><option value="QUEUE">Sempre o vendedor da vez</option></select></div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-700"><input type="checkbox" checked={cfg.requestByNameRequiresApproval} onChange={(e) => set('requestByNameRequiresApproval', e.target.checked)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />Pedido por nome exige aprovação</label>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card space-y-4">
        <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900"><Bell size={16} className="text-brand-600" />Avisos & Alertas do vendedor da vez</h2>
        <p className="-mt-2 text-xs text-gray-500">Como o vendedor é alertado quando vira o "vendedor da vez". O aviso na central (balão) é sempre enviado.</p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={cfg.alertSound} onChange={(e) => set('alertSound', e.target.checked)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />Som em loop no app do vendedor</label>
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={cfg.alertBrowserPush} onChange={(e) => set('alertBrowserPush', e.target.checked)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />Notificação do navegador (aba minimizada)</label>
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={cfg.alertWhatsapp} onChange={(e) => set('alertWhatsapp', e.target.checked)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />WhatsApp para o vendedor da vez</label>
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={cfg.alertWhatsappManagers} onChange={(e) => set('alertWhatsappManagers', e.target.checked)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />WhatsApp à gestão (timeout / sem vendedor)</label>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Modelo do som</label>
            <div className="flex gap-2">
              <select className={inputCls} value={cfg.alertSoundType} onChange={(e) => set('alertSoundType', e.target.value)}>
                {SOUND_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <button type="button" onClick={() => { unlockAudio(); playSound(cfg.alertSoundType) }} className="btn-secondary shrink-0 text-xs" title="Ouvir"><Volume2 size={14} />Tocar</button>
            </div>
          </div>
          <div><label className="mb-1 block text-xs font-medium text-gray-700">Repetir o som a cada (segundos)</label><input type="number" min={5} max={120} className={inputCls} value={cfg.alertRepeatSeconds} onChange={(e) => set('alertRepeatSeconds', Number(e.target.value) || 10)} /></div>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={cfg.allowChooseSeller} onChange={(e) => set('allowChooseSeller', e.target.checked)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />Gestão pode escolher o vendedor (auto-organização)</label>
        <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={cfg.allowSellerFinish} onChange={(e) => set('allowSellerFinish', e.target.checked)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />Vendedor pode finalizar o próprio atendimento <span className="text-xs text-gray-400">(se desmarcado, só a gestão finaliza)</span></label>
        <p className="-mt-1 text-[11px] text-gray-400">O WhatsApp usa o provedor já configurado da loja; sem provedor ativo, o envio é ignorado silenciosamente.</p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card space-y-4">
        <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900"><Volume2 size={16} className="text-brand-600" />Painel da Loja e Som</h2>
        <p className="-mt-2 text-xs text-gray-500">Som da TV/painel grande. Quando houver vendedor chamado, o painel repete o alerta até aceitar, recusar, expirar ou escalonar.</p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={cfg.panelSound.enabled} onChange={(e) => set('panelSound', { ...cfg.panelSound, enabled: e.target.checked })} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />Ativar som do Painel da Loja</label>
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={cfg.panelSound.repeatUntilAccepted} onChange={(e) => set('panelSound', { ...cfg.panelSound, repeatUntilAccepted: e.target.checked })} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />Tocar enquanto vendedor não aceitar</label>
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={cfg.panelSound.onlyStorePanel} onChange={(e) => set('panelSound', { ...cfg.panelSound, onlyStorePanel: e.target.checked })} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />Tocar somente no Painel da Loja</label>
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={cfg.panelSound.playOnDashboard} onChange={(e) => set('panelSound', { ...cfg.panelSound, playOnDashboard: e.target.checked })} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />Tocar também no Dashboard da Fila</label>
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={cfg.panelSound.muteOutsideHours} onChange={(e) => set('panelSound', { ...cfg.panelSound, muteOutsideHours: e.target.checked })} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />Silenciar fora do horário da loja</label>
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={cfg.panelSound.requireManualActivation} onChange={(e) => set('panelSound', { ...cfg.panelSound, requireManualActivation: e.target.checked })} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />Exigir ativação manual do som</label>
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={cfg.panelSound.wakeLock} onChange={(e) => set('panelSound', { ...cfg.panelSound, wakeLock: e.target.checked })} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />Usar Wake Lock quando disponível</label>
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={cfg.panelSound.showHiddenWarning} onChange={(e) => set('panelSound', { ...cfg.panelSound, showHiddenWarning: e.target.checked })} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />Avisar se o painel estiver em segundo plano</label>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Tipo de som</label>
            <select className={inputCls} value={cfg.panelSound.soundType} onChange={(e) => set('panelSound', { ...cfg.panelSound, soundType: e.target.value })}>
              {SOUND_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div><label className="mb-1 block text-xs font-medium text-gray-700">Toque a cada (s, 1-30)</label><input type="number" min={1} max={30} className={inputCls} value={cfg.panelSound.repeatSeconds} onChange={(e) => set('panelSound', { ...cfg.panelSound, repeatSeconds: Number(e.target.value) || 3 })} /></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-700">Atualizar painel (s, 3-60)</label><input type="number" min={3} max={60} className={inputCls} value={cfg.panelSound.refreshSeconds} onChange={(e) => set('panelSound', { ...cfg.panelSound, refreshSeconds: Number(e.target.value) || 3 })} /></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-700">Volume (%)</label><input type="number" min={0} max={100} className={inputCls} value={cfg.panelSound.volume} onChange={(e) => set('panelSound', { ...cfg.panelSound, volume: Number(e.target.value) || 0 })} /></div>
        </div>

        <button type="button" onClick={() => { unlockAudio(); playSound(cfg.panelSound.soundType) }} className="btn-secondary text-xs">
          <Volume2 size={14} />Testar som do painel
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card space-y-4">
        <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900"><BellRing size={16} className="text-brand-600" />Lembretes de atendimento aberto</h2>
        <p className="-mt-2 text-xs text-gray-500">Quando um atendimento fica aberto por muito tempo, o vendedor confirma se continua atendendo ou abre a finalização.</p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={cfg.attendanceReminder.enabled} onChange={(e) => set('attendanceReminder', { ...cfg.attendanceReminder, enabled: e.target.checked })} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />Ativar lembrete automático</label>
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={cfg.attendanceReminder.autoEscalate} onChange={(e) => set('attendanceReminder', { ...cfg.attendanceReminder, autoEscalate: e.target.checked })} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />Escalar para gestão sem resposta</label>
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={cfg.attendanceReminder.requireFinishOnNo} onChange={(e) => set('attendanceReminder', { ...cfg.attendanceReminder, requireFinishOnNo: e.target.checked })} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />Abrir finalização ao responder &quot;não&quot;</label>
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={cfg.attendanceReminder.logEveryReminder} onChange={(e) => set('attendanceReminder', { ...cfg.attendanceReminder, logEveryReminder: e.target.checked })} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />Registrar todos os lembretes</label>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div><label className="mb-1 block text-xs font-medium text-gray-700">Primeiro após (min, até 1440)</label><input type="number" min={limits.attendanceFirstAfterMinutes.min} max={limits.attendanceFirstAfterMinutes.max} className={inputCls} value={cfg.attendanceReminder.firstAfterMinutes} onChange={(e) => set('attendanceReminder', { ...cfg.attendanceReminder, firstAfterMinutes: Number(e.target.value) || 15 })} /></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-700">Repetir a cada (s, 30-86400)</label><input type="number" min={limits.attendanceRepeatIntervalSeconds.min} max={limits.attendanceRepeatIntervalSeconds.max} className={inputCls} value={cfg.attendanceReminder.repeatIntervalSeconds} onChange={(e) => set('attendanceReminder', { ...cfg.attendanceReminder, repeatIntervalSeconds: Number(e.target.value) || 300 })} /></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-700">Máx. lembretes (até 50)</label><input type="number" min={limits.attendanceMaxReminders.min} max={limits.attendanceMaxReminders.max} className={inputCls} value={cfg.attendanceReminder.maxReminders} onChange={(e) => set('attendanceReminder', { ...cfg.attendanceReminder, maxReminders: Number(e.target.value) || 6 })} /></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-700">Escalar após (até 50)</label><input type="number" min={limits.attendanceEscalateAfter.min} max={limits.attendanceEscalateAfter.max} className={inputCls} value={cfg.attendanceReminder.escalateAfter} onChange={(e) => set('attendanceReminder', { ...cfg.attendanceReminder, escalateAfter: Number(e.target.value) || 3 })} /></div>
        </div>

        <div className="border-t border-gray-100 pt-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Push da fila</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={cfg.queuePush.enabled} onChange={(e) => set('queuePush', { ...cfg.queuePush, enabled: e.target.checked })} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />Enviar push/mobile além da central</label>
            <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={cfg.queuePush.allowOutsideHoursForAdmins} onChange={(e) => set('queuePush', { ...cfg.queuePush, allowOutsideHoursForAdmins: e.target.checked })} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />Gestão pode alertar fora do horário</label>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Alvo padrão</label>
              <select className={inputCls} value={cfg.queuePush.targetScope} onChange={(e) => set('queuePush', { ...cfg.queuePush, targetScope: e.target.value })}>
                <option value="CURRENT_SELLER">Vendedor da vez</option>
                <option value="CALLED_SELLER">Vendedor chamado/atendendo</option>
                <option value="ALL_ACTIVE_PARTICIPANTS">Participantes ativos</option>
                <option value="MANAGERS">Gestão</option>
                <option value="MANAGERS_AND_CURRENT">Gestão + vendedor da vez</option>
                <option value="ALL_QUEUE">Todos da fila</option>
              </select>
            </div>
            <div><label className="mb-1 block text-xs font-medium text-gray-700">Intervalo mínimo (s, 30-86400)</label><input type="number" min={limits.queuePushIntervalSeconds.min} max={limits.queuePushIntervalSeconds.max} className={inputCls} value={cfg.queuePush.intervalSeconds} onChange={(e) => set('queuePush', { ...cfg.queuePush, intervalSeconds: Number(e.target.value) || 300 })} /></div>
            <div><label className="mb-1 block text-xs font-medium text-gray-700">Tentativas máximas (até 50)</label><input type="number" min={limits.queuePushMaxRetries.min} max={limits.queuePushMaxRetries.max} className={inputCls} value={cfg.queuePush.maxRetries} onChange={(e) => set('queuePush', { ...cfg.queuePush, maxRetries: Number(e.target.value) || 6 })} /></div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div><label className="mb-1 block text-xs font-medium text-gray-700">Limite/vendedor (até 100)</label><input type="number" min={limits.queuePushAntiSpamUserLimit.min} max={limits.queuePushAntiSpamUserLimit.max} className={inputCls} value={cfg.queuePush.antiSpamUserLimit} onChange={(e) => set('queuePush', { ...cfg.queuePush, antiSpamUserLimit: Number(e.target.value) || 8 })} /></div>
            <div><label className="mb-1 block text-xs font-medium text-gray-700">Limite/atendimento (até 100)</label><input type="number" min={limits.queuePushAntiSpamAttendanceLimit.min} max={limits.queuePushAntiSpamAttendanceLimit.max} className={inputCls} value={cfg.queuePush.antiSpamAttendanceLimit} onChange={(e) => set('queuePush', { ...cfg.queuePush, antiSpamAttendanceLimit: Number(e.target.value) || 6 })} /></div>
            <div><label className="mb-1 block text-xs font-medium text-gray-700">Limite/fila (até 500)</label><input type="number" min={limits.queuePushAntiSpamQueueLimit.min} max={limits.queuePushAntiSpamQueueLimit.max} className={inputCls} value={cfg.queuePush.antiSpamQueueLimit} onChange={(e) => set('queuePush', { ...cfg.queuePush, antiSpamQueueLimit: Number(e.target.value) || 60 })} /></div>
            <div><label className="mb-1 block text-xs font-medium text-gray-700">Janela (min, até 1440)</label><input type="number" min={limits.queuePushAntiSpamWindowMinutes.min} max={limits.queuePushAntiSpamWindowMinutes.max} className={inputCls} value={cfg.queuePush.antiSpamWindowMinutes} onChange={(e) => set('queuePush', { ...cfg.queuePush, antiSpamWindowMinutes: Number(e.target.value) || 10 })} /></div>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div><label className="mb-1 block text-xs font-medium text-gray-700">Início permitido</label><input type="time" className={inputCls} value={cfg.queuePush.allowedStartTime ?? ''} onChange={(e) => set('queuePush', { ...cfg.queuePush, allowedStartTime: e.target.value || null })} /></div>
            <div><label className="mb-1 block text-xs font-medium text-gray-700">Fim permitido</label><input type="time" className={inputCls} value={cfg.queuePush.allowedEndTime ?? ''} onChange={(e) => set('queuePush', { ...cfg.queuePush, allowedEndTime: e.target.value || null })} /></div>
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
                <option value="ACKNOWLEDGED">Confirmar</option>
                <option value="FINISHED">Finalizar</option>
                <option value="MAX_RETRIES">Máx. tentativas</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Escalonamento multinível da chamada (config dedicada) */}
      <EscalationConfigCard />

      {/* Tipos de atendimento + "consome a vez" (config dedicada) */}
      <AttendanceTypesConfigCard />

      {/* Férias e Ausências por colaborador (gestão) — Fase 2 */}
      <VacationManagerCard />

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card space-y-4">
        <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900"><ShieldAlert size={16} className="text-brand-600" />Bloqueio por reincidência (anti-abuso)</h2>
        <p className="-mt-2 text-xs text-gray-500">Vendedor chamado que não aceita no prazo acumula uma "perda" no dia. Ao atingir os limites, é bloqueado temporariamente e, na reincidência, até o fim do dia. O vendedor é avisado a cada perda. A gestão pode liberar no Painel.</p>

        <label className="flex items-center gap-2 text-sm font-medium text-gray-800"><input type="checkbox" checked={cfg.autoBlock.enabled} onChange={(e) => set('autoBlock', { ...cfg.autoBlock, enabled: e.target.checked })} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />Ativar bloqueio automático por reincidência</label>

        <div className={cn('grid grid-cols-1 gap-3 sm:grid-cols-3', !cfg.autoBlock.enabled && 'pointer-events-none opacity-50')}>
          <div><label className="mb-1 block text-xs font-medium text-gray-700">Perdas p/ bloqueio temporário</label><input type="number" min={1} max={20} className={inputCls} value={cfg.autoBlock.strikesForCooldown} onChange={(e) => set('autoBlock', { ...cfg.autoBlock, strikesForCooldown: Number(e.target.value) || 1 })} /></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-700">Duração do bloqueio (horas)</label><input type="number" min={1} max={24} className={inputCls} value={cfg.autoBlock.cooldownHours} onChange={(e) => set('autoBlock', { ...cfg.autoBlock, cooldownHours: Number(e.target.value) || 1 })} /></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-700">Perdas p/ bloqueio diário</label><input type="number" min={2} max={40} className={inputCls} value={cfg.autoBlock.strikesForDailyBlock} onChange={(e) => set('autoBlock', { ...cfg.autoBlock, strikesForDailyBlock: Number(e.target.value) || 2 })} /></div>
        </div>
        <p className="-mt-1 text-[11px] text-gray-400">Ex.: {cfg.autoBlock.strikesForCooldown} perdas → {cfg.autoBlock.cooldownHours}h fora; {cfg.autoBlock.strikesForDailyBlock} perdas no dia → bloqueado até amanhã. A contagem zera à meia-noite.</p>
        {blockConfigInvalid && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">⚠️ O "bloqueio diário" ({cfg.autoBlock.strikesForDailyBlock}) precisa ser maior que o "bloqueio temporário" ({cfg.autoBlock.strikesForCooldown}). Ajuste para salvar.</p>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900"><Unlock size={16} className="text-brand-600" />Vendedores bloqueados</h2>
          <div className="flex items-center gap-2">
            <button onClick={loadBlocks} className="btn-secondary text-xs"><RefreshCw size={13} />Atualizar</button>
            {blocks.length > 0 && <button onClick={() => release()} disabled={blocksBusy !== null} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60">{blocksBusy === 'ALL' ? 'Liberando...' : 'Liberar todos'}</button>}
          </div>
        </div>
        <p className="-mt-1 text-xs text-gray-500">Vendedores bloqueados por reincidência (saem da fila) ou manualmente. Liberar zera o bloqueio e as perdas do dia — ele pode voltar à fila.</p>

        {blocks.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-400">Nenhum vendedor bloqueado. 🎉</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {blocks.map((b) => (
              <div key={b.sellerId} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">{b.name}</p>
                  <p className="text-xs text-gray-500">
                    <span className={cn('mr-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold', b.type === 'DAILY_BLOCK' ? 'bg-red-100 text-red-700' : b.type === 'MANUAL' ? 'bg-gray-200 text-gray-700' : 'bg-amber-100 text-amber-700')}>{b.type === 'DAILY_BLOCK' ? 'DIÁRIO' : b.type === 'MANUAL' ? 'MANUAL' : 'TEMPORÁRIO'}</span>
                    {untilText(b)} · {b.strikes} perda(s) hoje
                  </p>
                </div>
                <button onClick={() => release(b.sellerId)} disabled={blocksBusy !== null} className="shrink-0 rounded-lg border border-brand-300 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-60">{blocksBusy === b.sellerId ? '...' : 'Liberar'}</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900"><Clock size={16} className="text-brand-600" />Automação da fila</h2>

        <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={cfg.autoSchedule} onChange={(e) => set('autoSchedule', e.target.checked)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />Abrir/fechar a fila automaticamente por horário</label>
        <div className={cn('grid grid-cols-2 gap-3', !cfg.autoSchedule && 'pointer-events-none opacity-50')}>
          <div><label className="mb-1 block text-xs font-medium text-gray-700">Abre às</label><input type="time" className={inputCls} value={cfg.openTime ?? ''} onChange={(e) => set('openTime', e.target.value || null)} /></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-700">Fecha às</label><input type="time" className={inputCls} value={cfg.closeTime ?? ''} onChange={(e) => set('closeTime', e.target.value || null)} /></div>
        </div>
        <div className={cn(!cfg.autoSchedule && 'pointer-events-none opacity-50')}>
          <p className="mb-1 text-xs font-medium text-gray-700">Dias de funcionamento</p>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map(([v, l]) => (
              <button type="button" key={v} onClick={() => set('allowedDays', cfg.allowedDays.includes(v) ? cfg.allowedDays.filter((x) => x !== v) : [...cfg.allowedDays, v])} className={cn('rounded-lg border px-2.5 py-1 text-xs font-semibold', cfg.allowedDays.includes(v) ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 bg-white text-gray-500')}>{l}</button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-gray-400">Sem dias marcados = todos os dias.</p>
        </div>

        <div className="border-t border-gray-100 pt-3">
          <label className="mb-1 block text-sm font-medium text-gray-700">Sair da fila após pausado/ausente por (minutos, até 1440)</label>
          <input type="number" min={limits.maxPauseMinutes.min} max={limits.maxPauseMinutes.max} className={cn(inputCls, 'max-w-[140px]')} value={cfg.maxPauseMinutes} onChange={(e) => set('maxPauseMinutes', Number(e.target.value) || 0)} />
          <p className="mt-1 text-[11px] text-gray-400">0 = desligado. Ex.: 30 → quem ficar pausado/fora por 30 min sai da fila automaticamente; ao tentar voltar, recebe o aviso de que foi removido.</p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card space-y-4">
        <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900"><Zap size={16} className="text-brand-600" />Regras de Informação Rápida / Modo Anti-Briga</h2>
        
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-700">Permitir aguardar na fila com atendimento ativo?</label>
          <select
            value={cfg.allowWaitWithOpenAttendance}
            onChange={(e) => set('allowWaitWithOpenAttendance', e.target.value)}
            className={inputCls}
          >
            <option value="NO">Não (vendedor fica indisponível para novos chamados)</option>
            <option value="YES">Sim (vendedor permanece na fila de espera geral)</option>
            <option value="QUICK_ONLY">Apenas se for Informação Rápida (dentro do tempo limite)</option>
          </select>
          <p className="mt-1 text-[11px] text-gray-400">Controla se o vendedor continua disponível para ser chamado na fila geral enquanto atende outro cliente.</p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-700">Atendimento de Informação Rápida consome a vez?</label>
          <select
            value={cfg.infoRapidaConsumesTurn}
            onChange={(e) => set('infoRapidaConsumesTurn', e.target.value)}
            className={inputCls}
          >
            <option value="NO">Não (vendedor volta para o topo da fila após finalizar)</option>
            <option value="YES">Sim (vendedor vai para o final da fila após finalizar)</option>
            <option value="TIME_LIMIT">Apenas se exceder o limite de tempo</option>
          </select>
          <p className="mt-1 text-[11px] text-gray-400">Determina se um atendimento de natureza rápida consome a vez do vendedor.</p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-700">Limite de tempo para Informação Rápida (minutos)</label>
          <input
            type="number"
            min={1}
            max={60}
            value={cfg.infoRapidaTimeLimitMinutes}
            onChange={(e) => set('infoRapidaTimeLimitMinutes', Number(e.target.value) || 3)}
            className={cn(inputCls, 'max-w-[140px]')}
          />
          <p className="mt-1 text-[11px] text-gray-400">Tempo limite para o vendedor finalizar sem precisar cadastrar dados do cliente. Se passar do limite, o cadastro do cliente passa a ser obrigatório e a vez é consumida.</p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card space-y-4">
        <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900"><ListChecks size={16} className="text-brand-600" />Motivos cadastrados</h2>
        <ReasonsEditor
          title="Encerrar lead / atendimento"
          hint="Aparecem como opção ao finalizar o atendimento/lead."
          items={cfg.leadCloseReasons}
          onChange={(v) => set('leadCloseReasons', v)}
        />
        <div className="border-t border-gray-100" />
        <ReasonsEditor
          title="Negociação"
          hint="Aparecem como opção na negociação (ex.: motivo de perda)."
          items={cfg.negotiationReasons}
          onChange={(v) => set('negotiationReasons', v)}
        />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900"><Save size={16} className="text-brand-600" />Responsáveis pela fila (Gerente+)</h2>
        <p className="text-xs text-gray-500">Designações especiais: selecione os colaboradores que terão permissão de gestão (chamar, pausar, reordenar ou reconfigurar) nesta fila, além dos cargos administrativos padrão da loja.</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 max-h-48 overflow-y-auto border border-gray-100 rounded-lg p-2.5 bg-gray-50/50">
          {sellers.map((s) => {
            const isChecked = cfg.responsibleUserIds.includes(s.sellerId)
            return (
              <label key={s.sellerId} className="flex items-center gap-2 text-xs font-semibold text-gray-700 bg-white border border-gray-200/60 rounded-lg p-2 hover:bg-gray-50 transition cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...cfg.responsibleUserIds, s.sellerId]
                      : cfg.responsibleUserIds.filter((x) => x !== s.sellerId)
                    set('responsibleUserIds', next)
                  }}
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="truncate">{s.name}</span>
              </label>
            )
          })}
          {sellers.length === 0 && (
            <p className="col-span-full text-center text-xs text-gray-400 py-4">Nenhum vendedor elegível encontrado.</p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-red-200 bg-red-50/30 p-5 shadow-card space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-bold text-red-900"><ShieldAlert size={16} className="text-red-600" />Zona de perigo / reinicialização</h2>
        <p className="text-xs text-gray-600">Comandos para reiniciar a fila ou apagar registros caso queira começar do zero.</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={async () => {
              if (!confirm('Deseja realmente limpar todos os vendedores da fila de hoje? O histórico do dia será arquivado e a fila começará vazia.')) return
              setSaving(true)
              try {
                const res = await fetch('/api/seller-queue/admin-reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ action: 'reset' }) })
                const j = await res.json().catch(() => ({}))
                setMsg(res.ok ? 'Fila de hoje reiniciada com sucesso! ✓' : (j?.error ?? 'Falha ao reiniciar.'))
                setTimeout(() => setMsg(null), 3000)
              } catch { setMsg('Erro de rede.') } finally { setSaving(false) }
            }}
            disabled={saving}
            className="rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-3 py-2 flex items-center gap-1.5 shadow-sm transition disabled:opacity-60"
          >
            <RefreshCw size={13} />
            Resetar fila de hoje
          </button>

          {role === 'MASTER' && (
            <button
              onClick={async () => {
                if (!confirm('ATENÇÃO: Isso irá apagar permanentemente TODO o histórico da fila (atendimentos, presenças, logs, eventos, métricas) desta unidade! Esta ação NÃO pode ser desfeita. Confirmar?')) return
                setSaving(true)
                try {
                  const res = await fetch('/api/seller-queue/admin-reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ action: 'wipe' }) })
                  const j = await res.json().catch(() => ({}))
                  setMsg(res.ok ? 'Todo o histórico da fila foi deletado permanentemente! ✓' : (j?.error ?? 'Falha ao limpar histórico.'))
                  setTimeout(() => setMsg(null), 4000)
                } catch { setMsg('Erro de rede.') } finally { setSaving(false) }
              }}
              disabled={saving}
              className="rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-xs px-3 py-2 flex items-center gap-1.5 shadow-sm transition disabled:opacity-60"
            >
              <Trash2 size={13} />
              Apagar histórico geral (WIPE)
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        {msg && <span className={cn('text-sm', /salvas|liberad|ativado|desativado|reiniciada|deletado/.test(msg) ? 'text-green-600' : 'text-red-600')}>{msg}</span>}
        <button onClick={save} disabled={saving || loading || blockConfigInvalid} className="btn-primary text-sm"><Save size={15} />{saving ? 'Salvando...' : 'Salvar configurações'}</button>
      </div>
      </>)}

      {/* mensagem fora do bloco de gestão (toggle de férias) */}
      {!canSettings && msg && <p className={cn('text-center text-sm', /ativado|desativado/.test(msg) ? 'text-green-600' : 'text-red-600')}>{msg}</p>}
    </div>
  )
}
