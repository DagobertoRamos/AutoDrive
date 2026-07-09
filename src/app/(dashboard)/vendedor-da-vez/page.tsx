'use client'

// =============================================================================
// Comercial > Vendedor da Vez > Dashboard da Fila.
// Reorganiza a antiga Visão Geral em um painel operacional: vendedor da vez,
// ações principais, ordem da fila, atendimentos ativos, filas individuais,
// rankings e log recente. Reusa as APIs existentes do módulo.
// =============================================================================

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useSession } from 'next-auth/react'
import {
  Activity,
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Ban,
  BellRing,
  CheckCircle2,
  Clock,
  Crown,
  History,
  ChevronDown,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  PhoneCall,
  Play,
  Pause,
  Hand,
  RefreshCw,
  Settings,
  ShieldAlert,
  Trophy,
  UserCheck,
  UserX,
  Zap,
  Tv,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import MinhaFilaIndividual from '@/components/seller-queue/MinhaFilaIndividual'
import FilasIndividuaisUnidade from '@/components/seller-queue/FilasIndividuaisUnidade'
import QueueRanking from '@/components/seller-queue/QueueRanking'
import VerificarVezModal from '@/components/seller-queue/VerificarVezModal'
import AttendanceReminderModal, { type AttendanceReminderData } from '@/components/seller-queue/AttendanceReminderModal'
import { queueStatusLabel } from '@/lib/seller-queue/labels'
import { ensureNotifyPermission, playSound, setAlertVolume, unlockAudio } from '@/lib/seller-queue/alert-client'

interface Entry {
  id: string
  sellerId: string
  sellerName: string
  status: string
  position: number
  joinedAt: string
  blocked: boolean
  attendanceCount: number
  hasDevice?: boolean
  operationalState?: string
  activeAttendanceId?: string | null
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
}

interface CurrentData {
  queue: { id: string; date: string; status: string; unitId: string } | null
  entries: Entry[]
  vendedorDaVez: { sellerId: string; sellerName: string; position: number } | null
  me: Entry | null
  arrivalsPending: number
  queueOpen?: boolean
  canCheckIn?: boolean
  panelSound?: PanelSoundConfig
  permissions?: {
    callCurrentSeller?: boolean
    sendAlertAll?: boolean
    viewLogs?: boolean
    panelView?: boolean
    personalQueuesViewUnit?: boolean
    pauseOther?: boolean
    resumeOther?: boolean
    addParticipant?: boolean
    removeParticipant?: boolean
    blockParticipant?: boolean
    unblockParticipant?: boolean
    reorder?: boolean
  }
  onVacation?: boolean
}

interface Attendance {
  id: string
  sellerId: string
  sellerName: string
  status: string
  type: string | null
  result: string | null
  calledAt: string
  acceptDeadline: string | null
  acceptedAt: string | null
  finishedAt: string | null
  leadId?: string | null
  arrival: { customerName: string | null; customerPhone: string | null; recurring: boolean } | null
}

interface QueueEvent {
  id: string
  type: string
  sellerName: string | null
  actorName: string | null
  reason: string | null
  createdAt: string
}

interface ReportRow {
  sellerId: string
  sellerName: string
  finished: number
  timeouts: number
  rejected: number
  called: number
  avgAcceptSeconds: number | null
}

interface ReportData {
  totals: { arrivals: number; recurring: number; attendances: number; finished: number; timeouts: number }
  bySeller: ReportRow[]
}

interface BlockedSeller {
  sellerId: string
  name: string
  type: 'COOLDOWN' | 'DAILY_BLOCK' | 'MANUAL'
  endsAt: string | null
  strikes: number
}

interface ReminderState {
  attendanceId: string
  reminderCount: number
  lastReminderAt: string | null
  lastAcknowledgedAt: string | null
  finishRequestedAt: string | null
  escalatedAt: string | null
  awaitingResponse: boolean
  nextReminderAt: string | null
}

interface ReminderDashboard {
  settings: { queuePush: { targetScope: string } }
  stats: {
    activeAttendances: number
    remindersToday: number
    confirmationsToday: number
    finishRequestsToday: number
    escalationsToday: number
    queueAlertsToday: number
    awaitingResponses: number
    dueNow: number
    escalatedOpen: number
  }
  byAttendance: Record<string, ReminderState>
  myReminder: AttendanceReminderData | null
}

const MANAGE_ROLES = ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE']
const ATTENDING_STATUSES = ['CALLED', 'ACCEPTED', 'IN_ATTENDANCE']
const AVAILABLE_STATUSES = ['WAITING', 'NEXT']
const DEFAULT_PANEL_SOUND: PanelSoundConfig = {
  enabled: true,
  repeatUntilAccepted: true,
  repeatSeconds: 3,
  refreshSeconds: 3,
  volume: 80,
  soundType: 'siren',
  playOnDashboard: false,
  onlyStorePanel: true,
  muteOutsideHours: false,
}

const STATUS_CLS: Record<string, string> = {
  WAITING: 'border-green-200 bg-green-50 text-green-700',
  NEXT: 'border-brand-200 bg-brand-50 text-brand-700',
  CALLED: 'border-blue-200 bg-blue-50 text-blue-700',
  ACCEPTED: 'border-blue-200 bg-blue-50 text-blue-700',
  IN_ATTENDANCE: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  PAUSED: 'border-amber-200 bg-amber-50 text-amber-700',
  LEFT: 'border-gray-200 bg-gray-50 text-gray-600',
  EXPIRED: 'border-red-200 bg-red-50 text-red-700',
  SKIPPED: 'border-red-200 bg-red-50 text-red-700',
  BLOCKED: 'border-red-200 bg-red-50 text-red-700',
}

const EVENT_LABELS: Record<string, string> = {
  CHECK_IN: 'Entrou na fila',
  CHECK_OUT: 'Saiu da fila',
  PAUSE: 'Pausou',
  RESUME: 'Retomou',
  CUSTOMER_ARRIVED: 'Cliente chegou',
  CALLED: 'Chamado',
  ACCEPTED: 'Aceitou',
  REJECTED: 'Recusou',
  TIMEOUT: 'Não respondeu',
  SKIPPED: 'Perdeu a vez',
  ATTENDANCE_STARTED: 'Iniciou atendimento',
  ATTENDANCE_FINISHED: 'Finalizou',
  MOVED_TO_END: 'Foi para o fim',
  MANAGER_OVERRIDE: 'Ação da gerência',
  LEADER_OVERRIDE: 'Ação da liderança',
  QUEUE_REORDERED: 'Ordem corrigida',
  FRAUD_FLAGGED: 'Alerta antifraude',
}

function getPosition(): Promise<{ latitude?: number; longitude?: number; accuracyM?: number }> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve({})
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracyM: p.coords.accuracy }),
      () => resolve({}),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    )
  })
}

async function jsonData<T>(res: Response): Promise<T | null> {
  const j = await res.json().catch(() => null) as { data?: T } | null
  return j?.data ?? null
}

async function postJson(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body ?? {}),
  })
  const j = await res.json().catch(() => ({})) as { error?: string; data?: unknown }
  return { ok: res.ok, status: res.status, data: j.data, error: j.error }
}

function statusTone(entry: Pick<Entry, 'status' | 'blocked'>): string {
  if (entry.blocked) return STATUS_CLS.BLOCKED
  return STATUS_CLS[entry.status] ?? 'border-gray-200 bg-gray-50 text-gray-600'
}

function timeLabel(value: string | null | undefined, now: number): string {
  if (!value) return '—'
  const seconds = Math.max(0, Math.floor((now - new Date(value).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}min`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}min`
}

function clockLabel(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'
}

function attendanceTypeLabel(type: string | null): string {
  const labels: Record<string, string> = {
    SALE: 'Venda',
    EXCHANGE: 'Troca',
    PURCHASE: 'Compra',
    CONSIGNMENT: 'Consignação',
    FINANCING: 'Financiamento',
    AFTER_SALES: 'Pós-venda',
    OTHER: 'Outro',
  }
  return type ? labels[type] ?? type : 'Atendimento rápido'
}

function requireReason(action: string): string | null {
  const reason = window.prompt(`${action}\nInforme o motivo obrigatório:`)?.trim()
  return reason || null
}

export default function FilaOverviewPage() {
  const { data: session } = useSession()
  const user = session?.user as { id?: string; role?: string } | undefined
  const roleCanManage = !!user?.role && MANAGE_ROLES.includes(user.role)

  const [current, setCurrent] = useState<CurrentData | null>(null)
  const [attendances, setAttendances] = useState<Attendance[]>([])
  const [events, setEvents] = useState<QueueEvent[]>([])
  const [reports, setReports] = useState<ReportData | null>(null)
  const [blocks, setBlocks] = useState<BlockedSeller[]>([])
  const [reminders, setReminders] = useState<ReminderDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState<string | null>(null)
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null)
  const [checkTurnOpen, setCheckTurnOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [now, setNow] = useState(0)
  const [logOpen, setLogOpen] = useState(false) // log recolhível (fechado por padrão)
  const [calling, setCalling] = useState(false)
  const [markAttendingOpen, setMarkAttendingOpen] = useState(false)
  const [markAttendingForm, setMarkAttendingForm] = useState({
    sellerId: '',
    visitType: 'CLIENTE_PORTA',
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    notes: '',
    reason: 'Marcado como atendendo pela gestão'
  })
  const [callable, setCallable] = useState<{ sellerId: string; name: string; queueStatus: string | null }[]>([])

  useEffect(() => {
    if (roleCanManage) {
      fetch('/api/seller-queue/callable', { credentials: 'include' })
        .then((r) => r.ok ? r.json() : null)
        .then((j) => { if (j?.success) setCallable(j.data ?? []) })
        .catch(() => {})
    }
  }, [roleCanManage])

  const callDaVez = async () => {
    if (calling) return
    setCalling(true)
    try {
      const res = await fetch('/api/seller-queue/quick-call', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) flash(j?.error ?? 'Falha ao chamar.', false)
      else if (j?.data?.alreadyInProgress) flash(j?.data?.sellerName ? `Chamada já em andamento — ${j.data.sellerName} foi chamado.` : (j?.data?.cooldownSeconds ? `Aguarde ${j.data.cooldownSeconds}s para chamar de novo.` : 'Chamada já em andamento — aguarde.'), false)
      else if (j?.data?.call?.ok) flash('Vendedor da vez chamado! 🔔', true)
      else flash(j?.data?.call?.reason ?? 'Nenhum vendedor disponível na fila.', false)
      await load()
    } catch { flash('Erro de rede.', false) } finally { setCalling(false) }
  }

  const openMarkAttendingModal = (visitType: string) => {
    setMarkAttendingForm({
      sellerId: '',
      visitType,
      customerName: '',
      customerPhone: '',
      customerEmail: '',
      notes: '',
      reason: 'Marcado como atendendo pela gestão'
    })
    setMarkAttendingOpen(true)
  }

  const submitMarkAttending = async () => {
    if (!markAttendingForm.sellerId) { flash('Selecione o vendedor.', false); return }
    if (!markAttendingForm.notes.trim()) { flash('As observações são obrigatórias.', false); return }
    setBusy('mark-attending')
    try {
      const res = await fetch('/api/seller-queue/manage-seller', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'mark_attending',
          sellerId: markAttendingForm.sellerId,
          visitType: markAttendingForm.visitType,
          customerName: markAttendingForm.customerName.trim() || undefined,
          customerPhone: markAttendingForm.customerPhone.trim() || undefined,
          customerEmail: markAttendingForm.customerEmail.trim() || undefined,
          notes: markAttendingForm.notes.trim(),
          reason: markAttendingForm.reason.trim()
        })
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { flash(j?.error ?? 'Não foi possível marcar como atendendo.', false); return }
      flash('Vendedor marcado como atendendo com sucesso!', true)
      setMarkAttendingOpen(false)
      await load()
    } catch {
      flash('Erro de rede.', false)
    } finally {
      setBusy(null)
    }
  }
  const firedTimeouts = useRef<Set<string>>(new Set())
  const dashboardSoundTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const dashboardSoundCallId = useRef<string | null>(null)
  const isFetchingRef = useRef(false)
  const queuePerms = current?.permissions
  const canCallCurrent = Boolean(queuePerms?.callCurrentSeller || roleCanManage)
  const canManage = Boolean(roleCanManage || queuePerms?.pauseOther || queuePerms?.resumeOther || queuePerms?.removeParticipant || queuePerms?.blockParticipant || queuePerms?.reorder)
  const canViewLogs = Boolean(queuePerms?.viewLogs || roleCanManage)
  const canViewAlertAll = Boolean(queuePerms?.sendAlertAll || roleCanManage)
  const canSendQueueAlert = Boolean(queuePerms?.sendAlertAll || roleCanManage)
  const canViewUnitPersonalQueues = Boolean(canManage || queuePerms?.personalQueuesViewUnit || queuePerms?.panelView)
  const canUseOwnQueue = current?.canCheckIn === true
  const myQueueStatus = current?.me?.blocked ? 'BLOCKED' : current?.me?.status ?? null
  const isMeWaiting = myQueueStatus === 'WAITING' || myQueueStatus === 'NEXT'
  const isMeAttending = myQueueStatus === 'CALLED' || myQueueStatus === 'ACCEPTED' || myQueueStatus === 'IN_ATTENDANCE'
  const isMePaused = myQueueStatus === 'PAUSED'
  const isMeBlocked = myQueueStatus === 'BLOCKED'
  const joinQueueLabel = isMeWaiting
    ? 'Você está na fila'
    : isMeAttending
      ? 'Atendendo'
      : isMePaused
        ? 'Voltar para fila'
        : isMeBlocked
          ? 'Bloqueado'
          : 'Entrar na fila'

  const flash = (msg: string, ok: boolean) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3600)
  }

  // Polling RÁPIDO (operacional): estado da fila (/current) + agregado
  // (atendimentos ativos + lembretes + bloqueios numa chamada). 2 fetches.
  const load = useCallback(async () => {
    if (isFetchingRef.current) return
    isFetchingRef.current = true
    try {
      const sp = typeof window !== 'undefined' ? window.location.search : ''
      const connector = sp ? (sp.includes('?') ? '&' : '?') : '?'
      const [currentRes, dashRes] = await Promise.all([
        fetch(`/api/seller-queue/current${sp}${connector}_t=${Date.now()}`, { credentials: 'include' }),
        fetch(`/api/seller-queue/dashboard${sp}${connector}_t=${Date.now()}`, { credentials: 'include' }),
      ])
      if (currentRes.status === 403 || currentRes.status === 400) {
        const j = await currentRes.json().catch(() => ({})) as { error?: string }
        setDenied(j.error ?? 'Sem acesso à fila.')
        return
      }
      setDenied(null)
      setCurrent(await jsonData<CurrentData>(currentRes))
      let attendanceRows: Attendance[] = []
      if (dashRes.ok) {
        const dash = await jsonData<{ attendances: Attendance[]; reminders: ReminderDashboard | null; blocks: BlockedSeller[] }>(dashRes)
        attendanceRows = dash?.attendances ?? []
        setAttendances(attendanceRows)
        if (dash?.reminders) setReminders(dash.reminders)
        if (dash?.blocks) setBlocks(dash.blocks)
      }

      const nowMs = Date.now()
      for (const att of attendanceRows) {
        if (att.status === 'CALLED' && att.acceptDeadline && new Date(att.acceptDeadline).getTime() < nowMs && !firedTimeouts.current.has(att.id)) {
          firedTimeouts.current.add(att.id)
          fetch(`/api/seller-queue/attendances/${att.id}/timeout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ reason: 'tempo de aceite esgotado' }),
          }).catch(() => {})
        }
      }
    } catch {
      flash('Não foi possível atualizar a fila.', false)
    } finally {
      isFetchingRef.current = false
      setLoading(false)
    }
  }, [])

  // Polling LENTO (não-crítico): ranking (7 dias, pesado) + log recente. A cada
  // 30s em vez de 3s — reduz ~10x a carga da consulta mais cara do dashboard.
  const loadSlow = useCallback(async () => {
    try {
      const [reportRes, eventRes] = await Promise.all([
        fetch('/api/seller-queue/reports?days=7', { credentials: 'include' }),
        fetch('/api/seller-queue/events?limit=10', { credentials: 'include' }),
      ])
      if (reportRes.ok) setReports(await jsonData<ReportData>(reportRes))
      if (eventRes?.ok) setEvents(await jsonData<QueueEvent[]>(eventRes) ?? [])
    } catch { /* silencioso — dado secundário */ }
  }, [])

  useEffect(() => {
    const firstLoad = setTimeout(() => { void load(); void loadSlow() }, 0)
    const poll = setInterval(load, 3000)
    const slowPoll = setInterval(loadSlow, 30000)
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      clearTimeout(firstLoad)
      clearInterval(poll)
      clearInterval(slowPoll)
      clearInterval(tick)
    }
  }, [load, loadSlow])

  const stats = useMemo(() => {
    const entries = current?.entries ?? []
    return {
      total: entries.length,
      available: entries.filter((e) => AVAILABLE_STATUSES.includes(e.status) && !e.blocked).length,
      called: entries.filter((e) => e.status === 'CALLED').length,
      attending: entries.filter((e) => e.status === 'IN_ATTENDANCE' || e.status === 'ACCEPTED').length,
      paused: entries.filter((e) => e.status === 'PAUSED').length,
      blocked: entries.filter((e) => e.blocked || e.status === 'BLOCKED').length + blocks.length,
      noAlert: entries.filter((e) => e.hasDevice === false).length,
      pendingCustomer: attendances.filter((a) => ATTENDING_STATUSES.includes(a.status) && !a.arrival?.customerName).length,
      remindersDue: reminders?.stats.dueNow ?? 0,
      remindersAwaiting: reminders?.stats.awaitingResponses ?? 0,
    }
  }, [current?.entries, attendances, blocks.length, reminders])

  const waitingLine = useMemo(
    () => (current?.entries ?? []).filter((e) => AVAILABLE_STATUSES.includes(e.status) && !e.blocked),
    [current?.entries],
  )

  const currentEntry = useMemo(() => {
    const sellerId = current?.vendedorDaVez?.sellerId
    return sellerId ? current?.entries.find((e) => e.sellerId === sellerId) ?? null : null
  }, [current])

  const panelSound = { ...DEFAULT_PANEL_SOUND, ...(current?.panelSound ?? {}) }
  const dashboardCalled = useMemo(() => (
    current?.entries.find((e) => e.operationalState === 'CHAMADO') ?? null
  ), [current?.entries])
  const dashboardCallId = dashboardCalled?.activeAttendanceId ?? dashboardCalled?.id ?? null

  useEffect(() => {
    setAlertVolume(Math.max(0, Math.min(8, (panelSound.volume / 100) * 8)))
  }, [panelSound.volume])

  useEffect(() => {
    const stopLoop = () => {
      if (dashboardSoundTimer.current) clearInterval(dashboardSoundTimer.current)
      dashboardSoundTimer.current = null
      dashboardSoundCallId.current = null
    }

    const canPlayOnDashboard =
      panelSound.enabled &&
      panelSound.repeatUntilAccepted &&
      panelSound.playOnDashboard &&
      !panelSound.onlyStorePanel &&
      panelSound.volume > 0 &&
      !(panelSound.muteOutsideHours && current?.queueOpen === false)

    if (!dashboardCallId || !canPlayOnDashboard) {
      stopLoop()
      return stopLoop
    }

    const repeatMs = Math.min(Math.max(panelSound.repeatSeconds, 1), 30) * 1000
    const playDashboardAlert = () => playSound(panelSound.soundType)

    if (dashboardSoundCallId.current !== dashboardCallId) {
      stopLoop()
      dashboardSoundCallId.current = dashboardCallId
      playDashboardAlert()
    }

    if (!dashboardSoundTimer.current) dashboardSoundTimer.current = setInterval(playDashboardAlert, repeatMs)
    return stopLoop
  }, [current?.queueOpen, dashboardCallId, panelSound.enabled, panelSound.muteOutsideHours, panelSound.onlyStorePanel, panelSound.playOnDashboard, panelSound.repeatSeconds, panelSound.repeatUntilAccepted, panelSound.soundType, panelSound.volume])

  const noSellerReason = useMemo(() => {
    if (current?.vendedorDaVez) return null
    if (current?.queueOpen === false) return 'Fila fechada pelo horário da loja.'
    if (!current?.queue) return 'Ninguém fez check-in ainda.'
    if (stats.total === 0) return 'Fila vazia.'
    if (stats.available === 0 && stats.attending > 0) return 'Todos os disponíveis estão atendendo.'
    if (stats.available === 0 && stats.paused > 0) return 'Todos estão pausados ou fora da rotação.'
    if (stats.blocked > 0) return 'Há vendedores bloqueados e ninguém elegível.'
    return 'Nenhum vendedor elegível no momento.'
  }, [current, stats])

  const refreshAfter = async (okMsg?: string) => {
    if (okMsg) flash(okMsg, true)
    await load()
  }

  const enterQueue = async () => {
    if (isMeWaiting) { flash('Você já está na fila.', true); return }
    if (isMeAttending) { flash('Você já está em atendimento.', false); return }
    if (isMeBlocked) { flash('Você está bloqueado na fila. Fale com a gerência.', false); return }

    setBusy('enter-queue')
    try {
      unlockAudio()
      void ensureNotifyPermission()
      const pos = await getPosition()
      const r = await postJson(isMePaused ? '/api/seller-queue/resume' : '/api/seller-queue/check-in', pos)
      if (!r.ok) { flash(r.error ?? 'Não foi possível entrar na fila.', false); return }
      await refreshAfter(isMePaused ? 'Você voltou para a fila.' : 'Você entrou na fila.')
      void loadSlow()
    } finally {
      setBusy(null)
    }
  }

  // Pausar a própria posição (mantém o lugar na fila; não recebe chamada enquanto pausado).
  const pauseSelf = async () => {
    if (!isMeWaiting) { flash('Só é possível pausar quando você está aguardando na fila.', false); return }
    setBusy('pause-self')
    try {
      const r = await postJson('/api/seller-queue/pause', {})
      if (!r.ok) { flash(r.error ?? 'Não foi possível pausar.', false); return }
      await refreshAfter('Você pausou — sua posição na fila foi mantida.')
    } finally { setBusy(null) }
  }

  // Sair da fila (check-out). Perde a posição.
  const checkOutSelf = async () => {
    if (!isMeWaiting && !isMePaused) return
    if (!window.confirm('Sair da fila de atendimento agora? Você perde a posição atual.')) return
    setBusy('checkout-self')
    try {
      const r = await postJson('/api/seller-queue/check-out', {})
      if (!r.ok) { flash(r.error ?? 'Não foi possível sair da fila.', false); return }
      await refreshAfter('Você saiu da fila.')
    } finally { setBusy(null) }
  }

  const startAttendanceFor = async (sellerId?: string) => {
    const reason = requireReason('Iniciar atendimento sem cliente cadastrado')
    if (!reason) { flash('Motivo obrigatório.', false); return }
    setBusy(`start-${sellerId ?? 'me'}`)
    try {
      const r = await postJson('/api/seller-queue/start-attendance', sellerId ? { sellerId, reason } : { reason })
      if (!r.ok) { flash(r.error ?? 'Falha ao iniciar atendimento.', false); return }
      await refreshAfter('Atendimento rápido iniciado.')
    } finally {
      setBusy(null)
    }
  }

  const callSpecific = async (sellerId: string, sellerName: string) => {
    const reason = requireReason(`Chamar ${sellerName}`)
    if (!reason) { flash('Motivo obrigatório.', false); return }
    setBusy(`call-${sellerId}`)
    try {
      const r = await postJson('/api/seller-queue/call-specific', { sellerId, reason })
      if (!r.ok) { flash(r.error ?? 'Falha ao chamar vendedor.', false); return }
      await refreshAfter(`${sellerName} foi chamado.`)
    } finally {
      setBusy(null)
    }
  }

  const manageSeller = async (entry: Entry, action: 'pause' | 'resume' | 'remove' | 'add') => {
    const labels = { pause: 'Pausar vendedor', resume: 'Retomar vendedor', remove: 'Tirar vendedor da fila', add: 'Colocar vendedor na fila' }
    const reason = requireReason(labels[action])
    if (!reason) { flash('Motivo obrigatório.', false); return }
    setBusy(`${action}-${entry.sellerId}`)
    try {
      const r = await postJson('/api/seller-queue/manage-seller', { sellerId: entry.sellerId, action, reason })
      if (!r.ok) { flash(r.error ?? 'Falha na ação.', false); return }
      await refreshAfter('Fila atualizada.')
    } finally {
      setBusy(null)
    }
  }

  const blockEntry = async (entry: Entry, blocked: boolean) => {
    const reason = requireReason(blocked ? 'Bloquear vendedor' : 'Desbloquear vendedor')
    if (!reason) { flash('Motivo obrigatório.', false); return }
    setBusy(`block-${entry.id}`)
    try {
      const r = await postJson(`/api/seller-queue/entries/${entry.id}/block`, { blocked, reason })
      if (!r.ok) { flash(r.error ?? 'Falha ao atualizar bloqueio.', false); return }
      await refreshAfter(blocked ? 'Vendedor bloqueado.' : 'Vendedor desbloqueado.')
    } finally {
      setBusy(null)
    }
  }

  const releaseBlock = async (sellerId: string) => {
    const reason = requireReason('Liberar bloqueio automático/manual')
    if (!reason) { flash('Motivo obrigatório.', false); return }
    setBusy(`release-${sellerId}`)
    try {
      const r = await postJson('/api/seller-queue/blocks', { sellerId, reason })
      if (!r.ok) { flash(r.error ?? 'Falha ao liberar bloqueio.', false); return }
      await refreshAfter('Bloqueio liberado.')
    } finally {
      setBusy(null)
    }
  }

  const moveEntry = async (entry: Entry, direction: 'up' | 'down') => {
    const reason = requireReason(direction === 'up' ? 'Subir vendedor na fila' : 'Descer vendedor na fila')
    if (!reason) { flash('Motivo obrigatório.', false); return }
    setBusy(`move-${entry.id}`)
    try {
      const r = await postJson('/api/seller-queue/reorder', { entryId: entry.id, direction, reason })
      if (!r.ok) { flash(r.error ?? 'Falha ao corrigir posição.', false); return }
      await refreshAfter('Ordem corrigida.')
    } finally {
      setBusy(null)
    }
  }

  const sendReminderNow = async (attendanceId: string, sellerName: string) => {
    const reason = requireReason(`Enviar lembrete para ${sellerName}`)
    if (!reason) { flash('Motivo obrigatório.', false); return }
    setBusy(`reminder-${attendanceId}`)
    try {
      const r = await postJson(`/api/seller-queue/reminders/${attendanceId}`, { action: 'send-now', reason })
      if (!r.ok) { flash(r.error ?? 'Falha ao enviar lembrete.', false); return }
      await refreshAfter('Lembrete enviado.')
    } finally {
      setBusy(null)
    }
  }

  const sendQueueAlert = async () => {
    const message = window.prompt('Mensagem do alerta para a fila:')?.trim()
    if (!message) { flash('Mensagem obrigatória.', false); return }
    const reason = requireReason('Enviar alerta manual da fila')
    if (!reason) { flash('Motivo obrigatório.', false); return }
    setBusy('queue-alert')
    try {
      const scope = reminders?.settings.queuePush.targetScope ?? 'CURRENT_SELLER'
      const r = await postJson('/api/seller-queue/reminders', { action: 'send-queue-alert', message, reason, scope })
      if (!r.ok) { flash(r.error ?? 'Falha ao enviar alerta.', false); return }
      await refreshAfter('Alerta enviado para a fila.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="min-w-0 max-w-full space-y-4 sm:space-y-5 overflow-x-hidden">
      <style>{`
        @keyframes qd-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(22, 163, 74, .20) } 50% { box-shadow: 0 0 0 10px rgba(22, 163, 74, 0) } }
        @keyframes qd-rise { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
        .qd-rise { animation: qd-rise .35s ease-out both }
        .qd-current { animation: qd-pulse 2.4s ease-in-out infinite }
      `}</style>

      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-lg sm:text-xl font-bold text-gray-900">
            <LayoutDashboard size={21} className="shrink-0 text-brand-600" />
            Dashboard da Fila
          </h1>
          <p className="mt-0.5 text-xs sm:text-sm text-gray-500 break-words">
            {loading ? 'Atualizando fila...' : `${stats.total} colaborador(es) na fila · ${current?.arrivalsPending ?? 0} cliente(s) aguardando`}
          </p>
        </div>
        {/* Cabeçalho enxuto: só utilitários */}
        <div className="flex flex-wrap gap-2">
          {canSendQueueAlert && (
            <button onClick={sendQueueAlert} disabled={busy === 'queue-alert'} className="btn-secondary text-xs">
              {busy === 'queue-alert' ? <RefreshCw size={14} className="animate-spin" /> : <BellRing size={14} />}
              Alerta da fila
            </button>
          )}
          <button onClick={load} disabled={loading} className="btn-secondary text-xs">
            <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
            Atualizar
          </button>
          {canManage && (
            <a href="/vendedor-da-vez/configuracoes" className="btn-secondary text-xs">
              <Settings size={14} />
              Configurações
            </a>
          )}
        </div>
      </div>

      {toast && (
        <div className={cn('flex items-center gap-2 rounded-lg border px-4 py-2 text-sm', toast.ok ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700')}>
          {toast.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
          {toast.msg}
        </div>
      )}

      {denied ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{denied}</div>
      ) : (
        <>
          <section className="grid min-w-0 gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <div className={cn('qd-rise min-w-0 rounded-xl border bg-white p-3 sm:p-4 shadow-card', current?.vendedorDaVez ? 'qd-current border-green-200' : 'border-amber-200')}>
              <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div className={cn('flex h-11 w-11 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-full', current?.vendedorDaVez ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700')}>
                    <Crown size={22} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-gray-500">Vendedor da vez</p>
                    <h2 className="break-words text-lg sm:text-2xl font-bold text-gray-900 leading-tight">{current?.vendedorDaVez?.sellerName ?? 'Nenhum vendedor disponível'}</h2>
                    <p className="mt-0.5 sm:mt-1 text-xs sm:text-sm text-gray-500 break-words">
                      {current?.vendedorDaVez ? `Posição ${waitingLine.findIndex((e) => e.sellerId === current.vendedorDaVez?.sellerId) + 1 || 1} · tempo na fila ${timeLabel(currentEntry?.joinedAt, now)}` : noSellerReason}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-2 gap-1.5 sm:gap-2 sm:w-64">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-1.5 sm:p-2.5">
                    <p className="text-base sm:text-lg font-bold text-green-700">{stats.available}</p>
                    <p className="text-[10px] sm:text-[11px] text-gray-500">Disponíveis</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-1.5 sm:p-2.5">
                    <p className="text-base sm:text-lg font-bold text-indigo-700">{stats.attending}</p>
                    <p className="text-[10px] sm:text-[11px] text-gray-500">Atendendo</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-1.5 sm:p-2.5">
                    <p className="text-base sm:text-lg font-bold text-amber-700">{stats.paused}</p>
                    <p className="text-[10px] sm:text-[11px] text-gray-500">Pausados</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-1.5 sm:p-2.5">
                    <p className="text-base sm:text-lg font-bold text-red-700">{stats.blocked}</p>
                    <p className="text-[10px] sm:text-[11px] text-gray-500">Bloqueados</p>
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:mt-4">
                {canUseOwnQueue && (
                  <>
                    <button
                      onClick={enterQueue}
                      disabled={busy === 'enter-queue' || isMeWaiting || isMeAttending || isMeBlocked}
                      className={cn(
                        'col-span-full flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-70',
                        isMeWaiting
                          ? 'border border-green-200 bg-green-50 text-green-700'
                          : isMeAttending || isMeBlocked
                            ? 'border border-gray-200 bg-gray-50 text-gray-500'
                            : 'bg-brand-700 text-white hover:bg-brand-800',
                      )}
                    >
                      {busy === 'enter-queue' ? <RefreshCw size={16} className="animate-spin" /> : <Hand size={16} />}
                      {joinQueueLabel}
                    </button>
                    <button onClick={() => setCheckTurnOpen(true)} className="btn-primary justify-center py-2.5 text-sm">
                      <Crown size={16} />
                      Verificar vez
                    </button>
                    {/* Finalizar o próprio atendimento (abre a Minha Fila, com o fluxo de finalização). */}
                    {myQueueStatus === 'IN_ATTENDANCE' && (
                      <a href="/vendedor-da-vez/minha-fila" className="col-span-full flex items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-green-700">
                        <CheckCircle2 size={16} />
                        Finalizar atendimento
                      </a>
                    )}
                    {/* Pausar: mantém a posição, não recebe chamada (só quando aguardando). */}
                    {isMeWaiting && (
                      <button onClick={pauseSelf} disabled={busy === 'pause-self'} className="btn-secondary justify-center py-2.5 text-sm">
                        {busy === 'pause-self' ? <RefreshCw size={16} className="animate-spin" /> : <Pause size={16} className="text-amber-600" />}
                        Pausar
                      </button>
                    )}
                    {/* Retomar: quando pausado (também dá pelo botão "Voltar para a fila"). */}
                    {isMePaused && (
                      <button onClick={enterQueue} disabled={busy === 'enter-queue'} className="btn-secondary justify-center py-2.5 text-sm">
                        {busy === 'enter-queue' ? <RefreshCw size={16} className="animate-spin" /> : <Play size={16} className="text-green-600" />}
                        Retomar
                      </button>
                    )}
                    {/* Sair da fila (check-out) — quando está na fila ou pausado. */}
                    {(isMeWaiting || isMePaused) && (
                      <button onClick={checkOutSelf} disabled={busy === 'checkout-self'} className="btn-secondary justify-center py-2.5 text-sm">
                        {busy === 'checkout-self' ? <RefreshCw size={16} className="animate-spin" /> : <LogOut size={16} className="text-red-600" />}
                        Sair da fila
                      </button>
                    )}
                  </>
                )}
                {/* Painel da Loja (TV) — visível a qualquer um que enxerga a fila
                    (ex.: terminal/TV da loja), pois é um display só-leitura. */}
                <a href="/vendedor-da-vez/painel-loja" target="_blank" rel="noopener noreferrer" className="btn-secondary justify-center py-2.5 text-sm">
                  <Tv size={16} className="text-indigo-600" />
                  Painel da Loja
                </a>
                {canManage && (
                  <>
                    <button onClick={callDaVez} disabled={calling || busy === 'quick-call'} className="btn-secondary justify-center py-2.5 text-sm">
                      <PhoneCall size={16} className="text-amber-600 animate-pulse" />
                      Chamar da vez
                    </button>
                    {/* 4. Marcar atendendo */}
                    <button onClick={() => openMarkAttendingModal('CLIENTE_PORTA')} className="btn-secondary justify-center py-2.5 text-sm">
                      <UserCheck size={16} className="text-blue-600" />
                      Marcar atendendo
                    </button>
                    {/* 5. Info rápida */}
                    <button onClick={() => openMarkAttendingModal('INFORMACAO_RAPIDA')} className="btn-secondary justify-center py-2.5 text-sm">
                      <Zap size={16} className="text-cyan-500 animate-pulse" />
                      Info rápida
                    </button>
                    {/* 7. Testar push */}
                    <a href="/vendedor-da-vez/testes" className="btn-secondary justify-center py-2.5 text-sm">
                      <Settings size={16} className="text-red-500" />
                      Testar push
                    </a>
                  </>
                )}
              </div>
            </div>

            <div className="qd-rise min-w-0 rounded-xl border border-gray-200 bg-white p-3 sm:p-4 shadow-card" style={{ animationDelay: '60ms' }}>
              <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <Activity size={16} className="shrink-0 text-brand-600" />
                Sinais da fila
              </p>
              <div className="mt-3 grid grid-cols-2 gap-1.5 sm:gap-2">
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-2 sm:p-3">
                  <p className="text-lg sm:text-xl font-bold text-blue-700">{stats.called}</p>
                  <p className="text-[10px] sm:text-xs text-blue-700">Chamado agora</p>
                </div>
                <div className="rounded-lg border border-red-100 bg-red-50 p-2 sm:p-3">
                  <p className="text-lg sm:text-xl font-bold text-red-700">{stats.pendingCustomer}</p>
                  <p className="text-[10px] sm:text-xs text-red-700 break-words">Sem cliente cadastrado</p>
                </div>
                <div className="rounded-lg border border-amber-100 bg-amber-50 p-2 sm:p-3">
                  <p className="text-lg sm:text-xl font-bold text-amber-700">{stats.remindersAwaiting}</p>
                  <p className="text-[10px] sm:text-xs text-amber-700 break-words">Aguardando confirmação</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 sm:p-3">
                  <p className="text-lg sm:text-xl font-bold text-gray-800">{stats.remindersDue}</p>
                  <p className="text-[10px] sm:text-xs text-gray-500">Lembretes vencidos</p>
                </div>
              </div>
            </div>
          </section>

          <section className="grid min-w-0 gap-4 xl:grid-cols-[1fr_0.95fr]">
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <ListOrdered size={16} className="text-brand-600" />
                  Ordem da fila
                </p>
                <span className="text-xs text-gray-400">Atualiza a cada 3s</span>
              </div>
              <div className="divide-y divide-gray-100">
                {(current?.entries ?? []).length === 0 ? (
                  <div className="px-4 py-10 text-center text-sm text-gray-400">Fila vazia.</div>
                ) : (current?.entries ?? []).map((entry, index) => {
                  const blocked = entry.blocked || entry.status === 'BLOCKED'
                  return (
                    <div key={entry.id} className="grid min-w-0 gap-2 sm:gap-3 px-3 sm:px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                        <div className={cn('flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-full text-xs sm:text-sm font-bold', index === 0 && !blocked ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-600')}>
                          {index + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1 sm:gap-2">
                            <p className="break-words text-sm font-semibold text-gray-900">{entry.sellerName}</p>
                            <span className={cn('shrink-0 rounded-full border px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-[11px] font-semibold', statusTone(entry))}>
                              {blocked ? 'Bloqueado' : queueStatusLabel(entry.status)}
                            </span>
                            {entry.hasDevice === false && <span className="shrink-0 rounded-full bg-amber-100 px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-[11px] font-semibold text-amber-700">sem alerta</span>}
                          </div>
                          <p className="mt-0.5 text-[10px] sm:text-xs text-gray-400 break-words">
                            Tempo na posição {timeLabel(entry.joinedAt, now)} · {entry.attendanceCount} atend. hoje
                          </p>
                        </div>
                      </div>
                      {canManage && (
                        <div className="flex flex-wrap justify-start gap-1 sm:gap-1.5 md:justify-end">
                          {canCallCurrent && <button onClick={() => callSpecific(entry.sellerId, entry.sellerName)} disabled={busy === `call-${entry.sellerId}`} className="rounded-lg border border-gray-200 px-1.5 sm:px-2 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium text-gray-700 hover:bg-gray-50">
                            <PhoneCall size={12} className="mr-0.5 sm:mr-1 inline" />
                            Chamar
                          </button>}
                          <button onClick={() => startAttendanceFor(entry.sellerId)} disabled={busy === `start-${entry.sellerId}`} className="rounded-lg border border-gray-200 px-1.5 sm:px-2 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium text-gray-700 hover:bg-gray-50">
                            <Play size={12} className="mr-0.5 sm:mr-1 inline" />
                            Iniciar
                          </button>
                          {entry.status === 'PAUSED' && (queuePerms?.resumeOther || roleCanManage) ? (
                            <button onClick={() => manageSeller(entry, 'resume')} className="rounded-lg border border-green-200 px-1.5 sm:px-2 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium text-green-700 hover:bg-green-50">
                              <UserCheck size={12} className="mr-0.5 sm:mr-1 inline" />
                              Retomar
                            </button>
                          ) : AVAILABLE_STATUSES.includes(entry.status) && (queuePerms?.pauseOther || roleCanManage) ? (
                            <button onClick={() => manageSeller(entry, 'pause')} className="rounded-lg border border-amber-200 px-1.5 sm:px-2 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium text-amber-700 hover:bg-amber-50">
                              <Ban size={12} className="mr-0.5 sm:mr-1 inline" />
                              Pausar
                            </button>
                          ) : null}
                          {(queuePerms?.removeParticipant || roleCanManage) && <button onClick={() => manageSeller(entry, 'remove')} className="rounded-lg border border-red-200 px-1.5 sm:px-2 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium text-red-700 hover:bg-red-50">
                            <LogOut size={12} className="mr-0.5 sm:mr-1 inline" />
                            Tirar
                          </button>}
                          {((blocked && (queuePerms?.unblockParticipant || roleCanManage)) || (!blocked && (queuePerms?.blockParticipant || roleCanManage))) && <button onClick={() => blockEntry(entry, !blocked)} className={cn('rounded-lg border px-1.5 sm:px-2 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium', blocked ? 'border-green-200 text-green-700 hover:bg-green-50' : 'border-red-200 text-red-700 hover:bg-red-50')}>
                            {blocked ? <UserCheck size={12} className="mr-0.5 inline" /> : <UserX size={12} className="mr-0.5 inline" />}
                            {blocked ? 'Desbloquear' : 'Bloquear'}
                          </button>}
                          {(queuePerms?.reorder || roleCanManage) && <button onClick={() => moveEntry(entry, 'up')} className="rounded-lg border border-gray-200 p-1 sm:p-1.5 text-gray-500 hover:bg-gray-50" title="Subir posição"><ArrowUp size={13} /></button>}
                          {(queuePerms?.reorder || roleCanManage) && <button onClick={() => moveEntry(entry, 'down')} className="rounded-lg border border-gray-200 p-1 sm:p-1.5 text-gray-500 hover:bg-gray-50" title="Descer posição"><ArrowDown size={13} /></button>}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="space-y-4">
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
                <div className="border-b border-gray-100 px-4 py-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <Clock size={16} className="text-brand-600" />
                    Atendimentos em andamento
                  </p>
                </div>
                <div className="divide-y divide-gray-100">
                  {attendances.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-gray-400">Nenhum atendimento ativo.</div>
                  ) : attendances.map((att) => {
                    const reminder = reminders?.byAttendance?.[att.id]
                    return (
                    <div key={att.id} className="px-3 sm:px-4 py-3">
                      <div className="flex items-start justify-between gap-2 sm:gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="break-words text-sm font-semibold text-gray-900">{att.sellerName}</p>
                          <p className="mt-0.5 text-xs text-gray-500 break-words">
                            {att.arrival?.customerName ?? 'Cliente não cadastrado'} · {attendanceTypeLabel(att.type)}
                          </p>
                        </div>
                        <span className={cn('shrink-0 rounded-full border px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-[11px] font-semibold', STATUS_CLS[att.status] ?? 'border-gray-200 bg-gray-50 text-gray-600')}>
                          {queueStatusLabel(att.status)}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[10px] sm:text-[11px] text-gray-500">
                        <span>Chamado {clockLabel(att.calledAt)}</span>
                        {att.acceptedAt && <span>Em atendimento há {timeLabel(att.acceptedAt, now)}</span>}
                        {reminder && <span>{reminder.reminderCount} lembrete(s)</span>}
                        {reminder?.lastReminderAt && <span>último {clockLabel(reminder.lastReminderAt)}</span>}
                        {reminder?.lastAcknowledgedAt && <span>confirmado {clockLabel(reminder.lastAcknowledgedAt)}</span>}
                        {reminder?.awaitingResponse && <span className="font-semibold text-amber-600">aguardando confirmação</span>}
                        {reminder?.escalatedAt && <span className="font-semibold text-red-600">escalado</span>}
                        {!att.arrival?.customerName && <span className="font-semibold text-red-600">cadastro obrigatório</span>}
                      </div>
                      {canSendQueueAlert && (
                        <div className="mt-2">
                          <button onClick={() => sendReminderNow(att.id, att.sellerName)} disabled={busy === `reminder-${att.id}`} className="rounded-lg border border-amber-200 px-2 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-60">
                            {busy === `reminder-${att.id}` ? 'Enviando...' : 'Enviar lembrete agora'}
                          </button>
                        </div>
                      )}
                    </div>
                    )
                  })}
                </div>
              </div>

              {blocks.length > 0 && canManage && (
                <div className="overflow-hidden rounded-xl border border-red-200 bg-white shadow-card">
                  <div className="border-b border-red-100 bg-red-50 px-4 py-3">
                    <p className="flex items-center gap-2 text-sm font-semibold text-red-800">
                      <ShieldAlert size={16} />
                      Bloqueios ativos
                    </p>
                  </div>
                  <div className="divide-y divide-red-100">
                    {blocks.map((block) => (
                      <div key={`${block.sellerId}-${block.type}`} className="flex items-start sm:items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-900 break-words">{block.name}</p>
                          <p className="text-[10px] sm:text-xs text-gray-500 break-words">{block.type === 'MANUAL' ? 'Bloqueio manual' : block.type === 'COOLDOWN' ? 'Cooldown' : 'Bloqueio diário'} · {block.strikes} perda(s)</p>
                        </div>
                        <button onClick={() => releaseBlock(block.sellerId)} className="shrink-0 rounded-lg border border-green-200 px-2 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-50">Liberar</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="grid min-w-0 gap-4 xl:grid-cols-[1fr_0.95fr]">
            <div className="space-y-4">
              {canViewUnitPersonalQueues ? <FilasIndividuaisUnidade onChanged={load} readOnly={!canManage} /> : <MinhaFilaIndividual onChanged={load} />}
            </div>

            <div className="space-y-4">
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <Trophy size={16} className="text-amber-500" />
                    Ranking de atendimento
                  </p>
                  <span className="text-xs text-gray-400">7 dias</span>
                </div>
                <div className="divide-y divide-gray-100">
                  {(reports?.bySeller ?? []).slice(0, 5).length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-gray-400">Sem atendimentos no período.</div>
                  ) : (reports?.bySeller ?? []).slice(0, 5).map((row, index) => (
                    <div key={row.sellerId} className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3">
                      <div className={cn('flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full text-xs sm:text-sm font-bold', index === 0 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600')}>
                        {index + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-semibold text-gray-900">{row.sellerName}</p>
                        <p className="text-[10px] sm:text-xs text-gray-500 break-words">{row.called} cham. · {row.finished} fin. · {row.avgAcceptSeconds ?? '—'}s resp.</p>
                      </div>
                      <div className="shrink-0 text-right text-[10px] sm:text-xs">
                        <p className="font-semibold text-red-600">{row.timeouts} tout</p>
                        <p className="text-gray-400">{row.rejected} rec.</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <QueueRanking />
            </div>
          </section>

          {canViewLogs && (
            <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                <button onClick={() => setLogOpen((v) => !v)} className="flex items-center gap-2 text-sm font-semibold text-gray-900" aria-expanded={logOpen}>
                  <ChevronDown size={16} className={cn('text-gray-400 transition-transform', logOpen && 'rotate-180')} />
                  <History size={16} className="text-brand-600" />
                  Log recente da fila
                  {!logOpen && events.length > 0 && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">{events.length}</span>}
                </button>
                <a href="/vendedor-da-vez/relatorios" className="text-xs font-semibold text-brand-700 hover:text-brand-800">Ver relatórios</a>
              </div>
              {logOpen && (
                <div className="divide-y divide-gray-100">
                  {events.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-gray-400">Sem eventos recentes.</div>
                  ) : events.map((event) => (
                    <div key={event.id} className="flex flex-col gap-1 px-3 sm:px-4 py-3 md:grid md:grid-cols-[8rem_minmax(0,1fr)_minmax(6rem,12rem)] md:items-center md:gap-2">
                      <div className="text-[10px] sm:text-xs text-gray-500">{clockLabel(event.createdAt)}</div>
                      <div className="min-w-0">
                        <p className="break-words text-sm font-semibold text-gray-900">{EVENT_LABELS[event.type] ?? event.type}</p>
                        <p className="break-words text-[10px] sm:text-xs text-gray-500">{event.sellerName ?? '—'} {event.actorName ? `· por ${event.actorName}` : ''}</p>
                      </div>
                      <p className="break-words text-[10px] sm:text-xs text-gray-500">{event.reason ?? 'Sem motivo informado'}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}

      {checkTurnOpen && <VerificarVezModal onClose={() => setCheckTurnOpen(false)} onChanged={load} />}
      {reminders?.myReminder && <AttendanceReminderModal reminder={reminders.myReminder} onClose={() => setReminders((r) => r ? { ...r, myReminder: null } : r)} onChanged={load} />}

      {/* Modal de Marcar Atendendo (Gestor) */}
      {markAttendingOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" onClick={() => setMarkAttendingOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">
                {markAttendingForm.visitType === 'INFORMACAO_RAPIDA' ? 'Marcar Informação Rápida' : 'Marcar como Atendendo'}
              </h3>
              <button onClick={() => setMarkAttendingOpen(false)} className="rounded-lg bg-gray-100 p-1.5 text-gray-500 hover:bg-gray-200">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-700">Vendedor *</label>
                <select
                  value={markAttendingForm.sellerId}
                  onChange={(e) => setMarkAttendingForm((f) => ({ ...f, sellerId: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">— selecione o vendedor —</option>
                  {callable.map((c) => (
                    <option key={c.sellerId} value={c.sellerId}>
                      {c.name} {c.queueStatus ? `(${queueStatusLabel(c.queueStatus)})` : '(fora da fila)'}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-700">Tipo de Atendimento</label>
                <select
                  value={markAttendingForm.visitType}
                  onChange={(e) => setMarkAttendingForm((f) => ({ ...f, visitType: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="CLIENTE_PORTA">Cliente de porta</option>
                  <option value="INFORMACAO_RAPIDA">Informação rápida</option>
                  <option value="AGENDAMENTO">Agendamento</option>
                  <option value="RETORNO">Retorno</option>
                  <option value="POS_VENDA">Pós-venda</option>
                  <option value="TEST_DRIVE">Test-drive</option>
                  <option value="AVALIACAO">Avaliação</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-700">Nome do Cliente (opcional)</label>
                <input
                  type="text"
                  value={markAttendingForm.customerName}
                  onChange={(e) => setMarkAttendingForm((f) => ({ ...f, customerName: e.target.value }))}
                  placeholder="Ex: Anderson Silva"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-700">Telefone (opcional)</label>
                <input
                  type="tel"
                  value={markAttendingForm.customerPhone}
                  onChange={(e) => setMarkAttendingForm((f) => ({ ...f, customerPhone: e.target.value }))}
                  placeholder="(11)9.9999-9999"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-700">Observações *</label>
                <textarea
                  rows={2}
                  value={markAttendingForm.notes}
                  onChange={(e) => setMarkAttendingForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Justificativa ou descrição do atendimento"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-700">Motivo Administrativo *</label>
                <input
                  type="text"
                  value={markAttendingForm.reason}
                  onChange={(e) => setMarkAttendingForm((f) => ({ ...f, reason: e.target.value }))}
                  placeholder="Justificativa do gerente"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setMarkAttendingOpen(false)} className="btn-secondary text-sm">Cancelar</button>
              <button onClick={submitMarkAttending} disabled={busy === 'mark-attending'} className="btn-primary text-sm">
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
