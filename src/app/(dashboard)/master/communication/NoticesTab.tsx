'use client'

// =============================================================================
// NoticesTab — Central de Avisos Internos (MASTER only)
// Funcionalidades: criar, editar, pausar, reativar, cancelar, arquivar,
// excluir, duplicar, testar, pré-visualizar, ver logs, ver métricas.
// =============================================================================

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Bell, Plus, Loader2, AlertCircle, CheckCircle2, X, Save,
  MoreVertical, Eye, Edit2, Copy, Pause, Play, XCircle, Archive,
  Trash2, FlaskConical, BarChart2, FileText, RefreshCw, Search,
  ChevronDown, ChevronRight, Filter, Megaphone, Info, AlertTriangle,
  Zap, ShieldAlert, CheckSquare, Clock, Send,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Notice {
  id:              string
  title:           string
  message:         string
  type:            string
  severity:        string
  priority:        string
  status:          string
  targetType:      string
  displayType:     string
  displayChannels: string[]
  startsAt:        string
  endsAt:          string | null
  required:        boolean
  dismissible:     boolean
  blockUntilRead:  boolean
  allowComments:   boolean
  actionUrl:       string | null
  actionLabel:     string | null
  active:          boolean
  createdAt:       string
  updatedAt:       string
  _count:          { reads: number; logs: number }
}

interface NoticeLog {
  id:        string
  action:    string
  userId:    string | null
  success:   boolean
  details:   Record<string, unknown> | null
  createdAt: string
}

interface NoticeMetrics {
  reads:      number
  views:      number
  clicks:     number
  dismissals: number
  pending:    number
  readRate:   number
}

// ── Constantes de UI ──────────────────────────────────────────────────────────

const inp = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const lbl = 'text-xs font-medium text-gray-600 block mb-1'

const STATUS_CFG: Record<string, { label: string; color: string; dot: string }> = {
  DRAFT:     { label: 'Rascunho',  color: 'bg-gray-100  text-gray-600  border-gray-200',  dot: 'bg-gray-400'   },
  SCHEDULED: { label: 'Programado',color: 'bg-blue-50   text-blue-700  border-blue-200',  dot: 'bg-blue-500'   },
  ACTIVE:    { label: 'Ativo',     color: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  PAUSED:    { label: 'Pausado',   color: 'bg-amber-50  text-amber-700 border-amber-200', dot: 'bg-amber-400'  },
  CANCELLED: { label: 'Cancelado', color: 'bg-red-50    text-red-700   border-red-200',   dot: 'bg-red-500'    },
  EXPIRED:   { label: 'Expirado',  color: 'bg-slate-100 text-slate-500 border-slate-200', dot: 'bg-slate-400'  },
  ARCHIVED:  { label: 'Arquivado', color: 'bg-slate-50  text-slate-600 border-slate-200', dot: 'bg-slate-300'  },
  DELETED:   { label: 'Excluído',  color: 'bg-red-100   text-red-800   border-red-300',   dot: 'bg-red-700'    },
}

const TYPE_CFG: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
  INFO:        { label: 'Info',        color: 'bg-blue-50   text-blue-700  border-blue-200',  Icon: Info         },
  WARNING:     { label: 'Aviso',       color: 'bg-amber-50  text-amber-700 border-amber-200', Icon: AlertTriangle },
  CRITICAL:    { label: 'Crítico',     color: 'bg-red-50    text-red-700   border-red-200',   Icon: ShieldAlert  },
  MAINTENANCE: { label: 'Manutenção',  color: 'bg-orange-50 text-orange-700 border-orange-200', Icon: AlertTriangle },
  BILLING:     { label: 'Financeiro',  color: 'bg-purple-50 text-purple-700 border-purple-200', Icon: Info       },
  RELEASE:     { label: 'Lançamento',  color: 'bg-green-50  text-green-700 border-green-200',  Icon: Zap         },
}

const PRIORITY_CFG: Record<string, { label: string; color: string }> = {
  LOW:      { label: 'Baixa',   color: 'text-gray-500'   },
  MEDIUM:   { label: 'Média',   color: 'text-blue-600'   },
  HIGH:     { label: 'Alta',    color: 'text-amber-600'  },
  CRITICAL: { label: 'Crítica', color: 'text-red-600'    },
}

const TARGET_LABELS: Record<string, string> = {
  ALL:               'Todos os usuários',
  ALL_TENANTS:       'Todos os tenants',
  SELECTED_TENANTS:  'Tenants selecionados',
  SELECTED_UNITS:    'Unidades selecionadas',
  SELECTED_ROLES:    'Perfis selecionados',
  SELECTED_USERS:    'Usuários selecionados',
  MASTER_ONLY:       'Apenas MASTER',
  ADM_ONLY:          'Apenas administradores',
  MANAGER_ONLY:      'Apenas gerentes',
  SELLER_ONLY:       'Apenas vendedores',
}

const ACTION_LABELS: Record<string, string> = {
  CREATED:    'Criado',
  EDITED:     'Editado',
  PUBLISHED:  'Publicado',
  SCHEDULED:  'Programado',
  PAUSED:     'Pausado',
  RESUMED:    'Reativado',
  CANCELLED:  'Cancelado',
  ARCHIVED:   'Arquivado',
  DELETED:    'Excluído',
  DUPLICATED: 'Duplicado',
  TESTED:     'Testado',
  READ:       'Lido',
  CLICKED:    'Clicado',
  DISMISSED:  'Descartado',
  EXPIRED:    'Expirado',
}

const STATUS_FILTER_OPTIONS = [
  { value: '',          label: 'Todos'       },
  { value: 'DRAFT',     label: 'Rascunhos'   },
  { value: 'SCHEDULED', label: 'Programados' },
  { value: 'ACTIVE',    label: 'Ativos'      },
  { value: 'PAUSED',    label: 'Pausados'    },
  { value: 'CANCELLED', label: 'Cancelados'  },
  { value: 'EXPIRED',   label: 'Expirados'   },
  { value: 'ARCHIVED',  label: 'Arquivados'  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(v: string | null | undefined) {
  if (!v) return '—'
  return new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function AlertMsg({ type, msg }: { type: 'error' | 'success' | 'warning'; msg: string }) {
  const cls = type === 'error'   ? 'border-red-200    bg-red-50    text-red-700'
            : type === 'warning' ? 'border-amber-200  bg-amber-50  text-amber-700'
                                 : 'border-emerald-200 bg-emerald-50 text-emerald-700'
  const Icon = type === 'success' ? CheckCircle2 : AlertCircle
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs ${cls}`}>
      <Icon size={13} className="mt-0.5 shrink-0" />
      <span>{msg}</span>
    </div>
  )
}

// ── Diálogo de confirmação ────────────────────────────────────────────────────

function ConfirmDialog({ title, message, confirmLabel = 'Confirmar', danger = false, onConfirm, onCancel }: {
  title:         string
  message:       string
  confirmLabel?: string
  danger?:       boolean
  onConfirm:     () => void
  onCancel:      () => void
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl">
        <div className="px-6 py-5">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <p className="mt-2 text-sm text-gray-500">{message}</p>
        </div>
        <div className="flex justify-end gap-3 border-t px-6 py-4">
          <button onClick={onCancel} className="rounded-lg border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className={cn('rounded-lg px-4 py-2 text-sm font-semibold text-white',
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-600 hover:bg-brand-700'
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Balão de teste visual ─────────────────────────────────────────────────────

function TestBalloon({ notice, onDismiss }: { notice: Partial<Notice> & { title: string; message: string }; onDismiss: () => void }) {
  const typCfg = TYPE_CFG[notice.type ?? 'INFO'] ?? TYPE_CFG.INFO
  const Icon   = typCfg.Icon

  useEffect(() => {
    const t = setTimeout(onDismiss, 6000)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <div className="fixed bottom-6 right-6 z-[70] animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className={cn('w-80 rounded-xl border shadow-2xl p-4', typCfg.color)}>
        <div className="flex items-start gap-3">
          <Icon size={18} className="shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">{notice.title}</p>
            <p className="mt-0.5 text-xs opacity-80">{notice.message}</p>
          </div>
          <button onClick={onDismiss} className="shrink-0 opacity-60 hover:opacity-100">
            <X size={14} />
          </button>
        </div>
        <p className="mt-2 text-[10px] opacity-50 text-right">[TESTE — somente para você]</p>
      </div>
    </div>
  )
}

function TestBanner({ notice, onDismiss }: { notice: Partial<Notice> & { title: string; message: string }; onDismiss: () => void }) {
  const typCfg = TYPE_CFG[notice.type ?? 'INFO'] ?? TYPE_CFG.INFO

  useEffect(() => {
    const t = setTimeout(onDismiss, 8000)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <div className={cn('fixed top-0 inset-x-0 z-[70] border-b px-6 py-3 flex items-center justify-between gap-4', typCfg.color, 'animate-in slide-in-from-top-2 duration-300')}>
      <div className="flex items-center gap-2 text-sm font-medium">
        <typCfg.Icon size={15} />
        <span>{notice.title}</span>
        <span className="font-normal opacity-70">— {notice.message}</span>
        <span className="ml-2 text-[10px] opacity-50">[TESTE]</span>
      </div>
      <button onClick={onDismiss} className="shrink-0 opacity-60 hover:opacity-100"><X size={14} /></button>
    </div>
  )
}

function TestModal({ notice, onDismiss }: { notice: Partial<Notice> & { title: string; message: string }; onDismiss: () => void }) {
  const typCfg = TYPE_CFG[notice.type ?? 'INFO'] ?? TYPE_CFG.INFO
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className={cn('flex items-center gap-2 rounded-t-2xl px-6 py-4 border-b', typCfg.color)}>
          <typCfg.Icon size={16} />
          <h3 className="font-semibold">{notice.title}</h3>
          <span className="ml-auto text-[10px] opacity-50">[TESTE]</span>
        </div>
        <div className="px-6 py-5">
          <p className="text-sm text-gray-700 leading-relaxed">{notice.message}</p>
        </div>
        <div className="flex justify-end gap-3 border-t px-6 py-4">
          <button onClick={onDismiss} className={cn('rounded-lg px-5 py-2 text-sm font-semibold text-white', 'bg-brand-600 hover:bg-brand-700')}>
            Li e estou ciente
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal de logs do aviso ────────────────────────────────────────────────────

function NoticeLogsModal({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  const [logs,    setLogs]    = useState<NoticeLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/master/communication/notices/${notice.id}/logs?perPage=30`)
      .then(r => r.json())
      .then(d => setLogs(d.data ?? []))
      .finally(() => setLoading(false))
  }, [notice.id])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4 shrink-0">
          <div>
            <h3 className="font-semibold text-gray-900">Histórico do aviso</h3>
            <p className="text-xs text-gray-400 truncate max-w-xs">{notice.title}</p>
          </div>
          <button onClick={onClose} className="rounded p-1.5 hover:bg-gray-100"><X size={15} /></button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex h-32 items-center justify-center"><Loader2 size={18} className="animate-spin text-gray-400" /></div>
          ) : logs.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">Nenhum log registrado.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {logs.map(log => (
                <div key={log.id} className="flex items-start gap-3 px-5 py-3 text-xs hover:bg-gray-50">
                  <span className={cn('shrink-0 rounded px-1.5 py-0.5 font-medium',
                    log.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                  )}>
                    {ACTION_LABELS[log.action] ?? log.action}
                  </span>
                  <span className="text-gray-400">{fmtDate(log.createdAt)}</span>
                  {log.details && (
                    <span className="text-gray-400 truncate">{JSON.stringify(log.details)}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Pré-visualização inline ───────────────────────────────────────────────────

function PreviewPane({ form }: { form: Record<string, unknown> }) {
  const [mode, setMode] = useState<'BELL' | 'BALLOON' | 'BANNER' | 'MODAL'>('BALLOON')
  const typCfg = TYPE_CFG[(form.type as string) ?? 'INFO'] ?? TYPE_CFG.INFO
  const Icon   = typCfg.Icon
  const title  = (form.title   as string) || 'Título do aviso'
  const msg    = (form.message as string) || 'Mensagem do aviso aparece aqui.'

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Eye size={13} className="text-gray-400" />
        <span className="text-xs font-semibold text-gray-600">Pré-visualização</span>
        <div className="flex gap-1 ml-auto">
          {(['BALLOON', 'BANNER', 'BELL', 'MODAL'] as const).map(m => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className={cn('rounded px-2 py-0.5 text-[10px] font-medium border transition-colors',
                mode === m ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-500'
              )}
            >{m}</button>
          ))}
        </div>
      </div>

      <div className="min-h-[80px] flex items-center justify-center">
        {mode === 'BALLOON' && (
          <div className={cn('w-72 rounded-xl border shadow-md p-3', typCfg.color)}>
            <div className="flex items-start gap-2">
              <Icon size={15} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-xs">{title}</p>
                <p className="text-[11px] opacity-80 mt-0.5">{msg}</p>
              </div>
            </div>
          </div>
        )}
        {mode === 'BANNER' && (
          <div className={cn('w-full rounded-lg border px-4 py-2 flex items-center gap-2 text-xs', typCfg.color)}>
            <Icon size={13} />
            <span className="font-semibold">{title}</span>
            <span className="opacity-70">— {msg}</span>
          </div>
        )}
        {mode === 'BELL' && (
          <div className="flex flex-col items-center gap-2">
            <div className="relative">
              <Bell size={28} className="text-gray-600" />
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">1</span>
            </div>
            <div className="w-64 rounded-lg border border-gray-200 bg-white shadow-md p-2.5 text-xs">
              <div className="flex items-start gap-2">
                <span className={cn('rounded border px-1.5 py-0.5 text-[10px] font-medium', typCfg.color)}>{typCfg.label}</span>
                <div><p className="font-medium text-gray-900">{title}</p><p className="text-gray-500 mt-0.5">{msg}</p></div>
              </div>
            </div>
          </div>
        )}
        {mode === 'MODAL' && (
          <div className="w-72 rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden">
            <div className={cn('px-4 py-3 flex items-center gap-2 border-b', typCfg.color)}>
              <Icon size={14} />
              <span className="font-semibold text-sm">{title}</span>
            </div>
            <div className="px-4 py-3">
              <p className="text-xs text-gray-700">{msg}</p>
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t bg-gray-50">
              <button className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white">
                {(form.actionLabel as string) || 'Li e estou ciente'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Modal de criar/editar aviso ───────────────────────────────────────────────

const BLANK_FORM = {
  title: '', message: '', type: 'INFO', severity: 'INFO', priority: 'MEDIUM',
  status: 'ACTIVE',
  targetType: 'ALL',
  displayType: 'BELL', displayChannels: ['BELL'],
  startsAt: '', endsAt: '',
  required: false, dismissible: true, blockUntilRead: false, allowComments: false,
  actionUrl: '', actionLabel: '',
}

type NoticeForm = typeof BLANK_FORM & { displayChannels: string[] }

function NoticeModal({ initial, onClose, onSaved }: {
  initial?: Notice | null
  onClose:  () => void
  onSaved:  (n: Notice) => void
}) {
  const [form, setForm] = useState<NoticeForm>(initial ? {
    title:           initial.title,
    message:         initial.message,
    type:            initial.type,
    severity:        initial.severity,
    priority:        initial.priority,
    status:          initial.status,
    targetType:      initial.targetType,
    displayType:     initial.displayType,
    displayChannels: Array.isArray(initial.displayChannels) ? initial.displayChannels : ['BELL'],
    startsAt:        initial.startsAt ? initial.startsAt.slice(0, 16) : '',
    endsAt:          initial.endsAt   ? initial.endsAt.slice(0, 16)   : '',
    required:        initial.required,
    dismissible:     initial.dismissible,
    blockUntilRead:  initial.blockUntilRead,
    allowComments:   initial.allowComments,
    actionUrl:       initial.actionUrl   ?? '',
    actionLabel:     initial.actionLabel ?? '',
  } : { ...BLANK_FORM })

  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')
  const [preview,  setPreview]  = useState(false)
  const [tab,      setTab]      = useState<'form' | 'preview'>('form')

  const isEdit = Boolean(initial)

  function setField<K extends keyof NoticeForm>(k: K, v: NoticeForm[K]) {
    setForm(p => ({ ...p, [k]: v }))
  }

  function toggleChannel(ch: string) {
    setForm(p => ({
      ...p,
      displayChannels: p.displayChannels.includes(ch)
        ? p.displayChannels.filter(c => c !== ch)
        : [...p.displayChannels, ch],
    }))
  }

  // Validação inteligente
  function getWarning(): string | null {
    if (form.required && form.dismissible)
      return 'Aviso obrigatório normalmente não deve ser descartável.'
    if (form.startsAt && form.endsAt && new Date(form.endsAt) < new Date(form.startsAt))
      return 'A data de expiração não pode ser anterior à data de início.'
    if (form.targetType === 'ALL' && form.type === 'CRITICAL')
      return 'Este aviso crítico será exibido para todos os usuários. Confirme antes de publicar.'
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.title.trim() || !form.message.trim()) {
      setError('Título e mensagem são obrigatórios.')
      return
    }
    if (form.startsAt && form.endsAt && new Date(form.endsAt) < new Date(form.startsAt)) {
      setError('A data de expiração não pode ser anterior à data de início.')
      return
    }
    setSaving(true)
    try {
      const url    = isEdit ? `/api/master/communication/notices/${initial!.id}` : '/api/master/communication/notices'
      const method = isEdit ? 'PATCH' : 'POST'
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          startsAt:    form.startsAt   || null,
          endsAt:      form.endsAt     || null,
          actionUrl:   form.actionUrl.trim()   || null,
          actionLabel: form.actionLabel.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao salvar aviso.')
      onSaved(data.data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveDraft() {
    setField('status', 'DRAFT')
    setTimeout(() => {
      const form_ = { ...form, status: 'DRAFT' }
      const fakeEv = { preventDefault: () => {} } as React.FormEvent
      void handleSubmit(fakeEv)
    }, 0)
  }

  const warning = getWarning()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="my-8 w-full max-w-2xl rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4 shrink-0">
          <h2 className="font-semibold text-gray-900">
            {isEdit ? 'Editar aviso' : 'Novo aviso'}
          </h2>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
              {(['form', 'preview'] as const).map(t => (
                <button key={t} type="button" onClick={() => setTab(t)}
                  className={cn('px-3 py-1.5 font-medium', tab === t ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:bg-gray-50')}
                >
                  {t === 'form' ? 'Formulário' : 'Pré-visualizar'}
                </button>
              ))}
            </div>
            <button onClick={onClose} className="rounded p-1.5 hover:bg-gray-100"><X size={15} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {tab === 'preview' ? (
            <div className="p-6">
              <PreviewPane form={form as unknown as Record<string, unknown>} />
            </div>
          ) : (
            <form id="notice-form" onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
              {error   && <AlertMsg type="error"   msg={error} />}
              {warning && <AlertMsg type="warning" msg={warning} />}

              {/* Status inicial */}
              <div>
                <label className={lbl}>Status inicial</label>
                <div className="flex gap-2">
                  {[
                    { v: 'DRAFT',     label: 'Salvar como rascunho' },
                    { v: 'ACTIVE',    label: 'Publicar agora' },
                    { v: 'SCHEDULED', label: 'Programar publicação' },
                  ].map(opt => (
                    <button key={opt.v} type="button" onClick={() => setField('status', opt.v)}
                      className={cn('flex-1 rounded-lg border px-2 py-2 text-xs font-medium transition-colors',
                        form.status === opt.v ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                      )}
                    >{opt.label}</button>
                  ))}
                </div>
              </div>

              {/* Título e mensagem */}
              <div>
                <label className={lbl}>Título *</label>
                <input className={inp} value={form.title} onChange={e => setField('title', e.target.value)} placeholder="Ex: Nova funcionalidade disponível" />
              </div>
              <div>
                <label className={lbl}>Mensagem *</label>
                <textarea className={inp} rows={3} value={form.message} onChange={e => setField('message', e.target.value)} placeholder="Texto completo do aviso..." />
              </div>

              {/* Tipo, prioridade e severidade */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={lbl}>Tipo</label>
                  <select className={inp} value={form.type} onChange={e => setField('type', e.target.value)}>
                    <option value="INFO">Info</option>
                    <option value="WARNING">Aviso</option>
                    <option value="CRITICAL">Crítico</option>
                    <option value="MAINTENANCE">Manutenção</option>
                    <option value="BILLING">Financeiro</option>
                    <option value="RELEASE">Lançamento</option>
                  </select>
                </div>
                <div>
                  <label className={lbl}>Prioridade</label>
                  <select className={inp} value={form.priority} onChange={e => setField('priority', e.target.value)}>
                    <option value="LOW">Baixa</option>
                    <option value="MEDIUM">Média</option>
                    <option value="HIGH">Alta</option>
                    <option value="CRITICAL">Crítica</option>
                  </select>
                </div>
                <div>
                  <label className={lbl}>Severidade visual</label>
                  <select className={inp} value={form.severity} onChange={e => setField('severity', e.target.value)}>
                    <option value="INFO">Info</option>
                    <option value="SUCCESS">Sucesso</option>
                    <option value="WARNING">Atenção</option>
                    <option value="ERROR">Erro</option>
                    <option value="CRITICAL">Crítico</option>
                  </select>
                </div>
              </div>

              {/* Público-alvo */}
              <div>
                <label className={lbl}>Público-alvo</label>
                <select className={inp} value={form.targetType} onChange={e => setField('targetType', e.target.value)}>
                  {Object.entries(TARGET_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
                {['SELECTED_TENANTS', 'SELECTED_UNITS', 'SELECTED_ROLES', 'SELECTED_USERS'].includes(form.targetType) && (
                  <p className="mt-1 text-[11px] text-blue-600">
                    Seleção avançada de {TARGET_LABELS[form.targetType]?.toLowerCase()} disponível via API de usuários/tenants.
                  </p>
                )}
              </div>

              {/* Canais de exibição */}
              <div>
                <label className={lbl}>Canais de exibição</label>
                <div className="flex gap-2 flex-wrap">
                  {['BELL', 'BALLOON', 'BANNER', 'MODAL', 'DASHBOARD'].map(ch => (
                    <button key={ch} type="button" onClick={() => toggleChannel(ch)}
                      className={cn('rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                        form.displayChannels.includes(ch) ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                      )}
                    >{ch}</button>
                  ))}
                </div>
              </div>

              {/* Datas */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Exibir a partir de</label>
                  <input type="datetime-local" className={inp} value={form.startsAt} onChange={e => setField('startsAt', e.target.value)} />
                </div>
                <div>
                  <label className={lbl}>Expirar em</label>
                  <input type="datetime-local" className={inp} value={form.endsAt} onChange={e => setField('endsAt', e.target.value)} />
                </div>
              </div>

              {/* Ação */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>URL de ação (opcional)</label>
                  <input className={inp} value={form.actionUrl} onChange={e => setField('actionUrl', e.target.value)} placeholder="https://..." />
                </div>
                <div>
                  <label className={lbl}>Texto do botão</label>
                  <input className={inp} value={form.actionLabel} onChange={e => setField('actionLabel', e.target.value)} placeholder="Ver mais" />
                </div>
              </div>

              {/* Comportamento */}
              <div className="rounded-lg border border-gray-200 p-4 space-y-2.5">
                <p className="text-xs font-semibold text-gray-700">Comportamento</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { k: 'required',       label: 'Leitura obrigatória'           },
                    { k: 'dismissible',    label: 'Pode ser descartado'            },
                    { k: 'blockUntilRead', label: 'Bloquear sistema até ciência'   },
                    { k: 'allowComments',  label: 'Permitir comentários'           },
                  ].map(({ k, label }) => (
                    <label key={k} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-brand-600"
                        checked={form[k as keyof NoticeForm] as boolean}
                        onChange={e => setField(k as keyof NoticeForm, e.target.checked as NoticeForm[keyof NoticeForm])}
                      />
                      <span className="text-xs text-gray-700">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-between gap-3 border-t px-6 py-4 bg-gray-50 rounded-b-2xl">
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm text-gray-600 hover:bg-gray-100">
            Cancelar
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={() => { setField('status', 'DRAFT'); setTimeout(() => document.getElementById('notice-form')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })), 0) }}
              disabled={saving}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              Salvar rascunho
            </button>
            <button form="notice-form" type="submit" disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              {saving ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Publicar aviso'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Menu de ações do card ─────────────────────────────────────────────────────

function ActionMenu({ notice, onAction }: {
  notice:   Notice
  onAction: (action: string, notice: Notice) => void
}) {
  const [open, setOpen] = useState(false)
  const ref             = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const s = notice.status

  const items: { label: string; action: string; icon: React.ElementType; danger?: boolean; divider?: boolean }[] = []

  items.push({ label: 'Visualizar',  action: 'view',      icon: Eye    })
  if (['DRAFT','PAUSED','SCHEDULED'].includes(s)) items.push({ label: 'Editar',      action: 'edit',      icon: Edit2   })
  if (s === 'ACTIVE')                             items.push({ label: 'Editar',      action: 'edit',      icon: Edit2   })
  items.push({ label: 'Duplicar',    action: 'duplicate', icon: Copy   })
  items.push({ label: 'Ver logs',    action: 'logs',      icon: FileText, divider: true })
  if (s === 'DRAFT')                              items.push({ label: 'Publicar',    action: 'publish',   icon: Send    })
  if (['ACTIVE','SCHEDULED'].includes(s))         items.push({ label: 'Pausar',      action: 'pause',     icon: Pause   })
  if (s === 'PAUSED')                             items.push({ label: 'Reativar',    action: 'resume',    icon: Play    })
  if (!['CANCELLED','DELETED','ARCHIVED'].includes(s)) items.push({ label: 'Cancelar',  action: 'cancel',  icon: XCircle, danger: true })
  if (!['ARCHIVED','DELETED'].includes(s))        items.push({ label: 'Arquivar',    action: 'archive',   icon: Archive })
  if (s === 'ACTIVE')                             items.push({ label: 'Testar aviso',action: 'test',      icon: FlaskConical, divider: true })
  if (!['ACTIVE','DELETED'].includes(s))          items.push({ label: 'Excluir',     action: 'delete',    icon: Trash2, danger: true, divider: items.some(i => i.divider) ? false : true })

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(p => !p)}
        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
      >
        <MoreVertical size={15} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-48 rounded-xl border border-gray-200 bg-white py-1 shadow-xl">
          {items.map((item, i) => (
            <div key={item.action}>
              {item.divider && i > 0 && <div className="my-1 border-t border-gray-100" />}
              <button
                type="button"
                onClick={() => { setOpen(false); onAction(item.action, notice) }}
                className={cn(
                  'flex w-full items-center gap-2.5 px-4 py-2 text-xs font-medium transition-colors',
                  item.danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-50',
                )}
              >
                <item.icon size={13} />
                {item.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Card de aviso ─────────────────────────────────────────────────────────────

function NoticeCard({ notice, onRefresh, onAction }: {
  notice:    Notice
  onRefresh: () => void
  onAction:  (action: string, notice: Notice) => void
}) {
  const [expanded, setExpanded]   = useState(false)
  const [metrics,  setMetrics]    = useState<NoticeMetrics | null>(null)
  const [mLoading, setMLoading]   = useState(false)

  const stCfg  = STATUS_CFG[notice.status]  ?? STATUS_CFG.DRAFT
  const typCfg = TYPE_CFG[notice.type]      ?? TYPE_CFG.INFO
  const priCfg = PRIORITY_CFG[notice.priority] ?? PRIORITY_CFG.MEDIUM
  const TypeIcon = typCfg.Icon

  async function loadMetrics() {
    if (metrics || mLoading) return
    setMLoading(true)
    try {
      const res  = await fetch(`/api/master/communication/notices/${notice.id}/metrics`)
      const data = await res.json()
      if (data.success) setMetrics(data.data)
    } finally {
      setMLoading(false)
    }
  }

  useEffect(() => {
    if (expanded) loadMetrics()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded])

  const channels = Array.isArray(notice.displayChannels) ? notice.displayChannels : [notice.displayType]

  return (
    <div className={cn('rounded-xl border bg-white shadow-sm transition-all',
      notice.status === 'ACTIVE'    ? 'border-emerald-200' :
      notice.status === 'PAUSED'    ? 'border-amber-200'   :
      notice.status === 'CANCELLED' ? 'border-red-200'     :
      notice.status === 'DRAFT'     ? 'border-dashed border-gray-200' :
                                      'border-gray-200'
    )}>
      {/* Header do card */}
      <div className="flex items-start gap-3 p-4">
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border', typCfg.color)}>
          <TypeIcon size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-gray-900 truncate">{notice.title}</p>
            {/* Status badge */}
            <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold', stCfg.color)}>
              <span className={cn('h-1.5 w-1.5 rounded-full', stCfg.dot)} />
              {stCfg.label}
            </span>
            {/* Tipo badge */}
            <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium', typCfg.color)}>
              {typCfg.label}
            </span>
            {/* Prioridade */}
            <span className={cn('text-[10px] font-medium', priCfg.color)}>{priCfg.label}</span>
          </div>
          <p className="mt-1 text-xs text-gray-500 line-clamp-1">{notice.message}</p>
          <div className="mt-1.5 flex items-center gap-3 text-[11px] text-gray-400 flex-wrap">
            <span>{TARGET_LABELS[notice.targetType] ?? notice.targetType}</span>
            <span>•</span>
            <span>{channels.join(', ')}</span>
            <span>•</span>
            <span>{notice._count.reads} leitura{notice._count.reads !== 1 ? 's' : ''}</span>
            {notice.required    && <span className="text-red-500">obrigatório</span>}
            {!notice.dismissible && <span className="text-amber-500">não descartável</span>}
            <span className="ml-auto">{fmtDate(notice.createdAt)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setExpanded(p => !p)} className="rounded p-1 text-gray-400 hover:bg-gray-100">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          <ActionMenu notice={notice} onAction={onAction} />
        </div>
      </div>

      {/* Expandido: métricas + detalhes */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-3">
          {/* Métricas */}
          {mLoading ? (
            <div className="flex justify-center py-2"><Loader2 size={14} className="animate-spin text-gray-400" /></div>
          ) : metrics ? (
            <div className="grid grid-cols-5 gap-2">
              {[
                { label: 'Leituras',    v: metrics.reads,      color: 'text-emerald-600' },
                { label: 'Views',       v: metrics.views,      color: 'text-blue-600'    },
                { label: 'Cliques',     v: metrics.clicks,     color: 'text-brand-600'   },
                { label: 'Descartes',   v: metrics.dismissals, color: 'text-amber-600'   },
                { label: 'Taxa leitura',v: `${metrics.readRate}%`, color: 'text-gray-700' },
              ].map(m => (
                <div key={m.label} className="rounded-lg bg-gray-50 border border-gray-100 p-2 text-center">
                  <p className={cn('text-base font-bold', m.color)}>{m.v}</p>
                  <p className="text-[10px] text-gray-400">{m.label}</p>
                </div>
              ))}
            </div>
          ) : null}

          {/* Info extra */}
          <div className="grid grid-cols-2 gap-3 text-xs text-gray-500">
            <div><span className="font-medium text-gray-700">Início:</span> {fmtDate(notice.startsAt)}</div>
            <div><span className="font-medium text-gray-700">Expira:</span> {notice.endsAt ? fmtDate(notice.endsAt) : 'Sem expiração'}</div>
            {notice.actionUrl && <div className="col-span-2"><span className="font-medium text-gray-700">URL:</span> {notice.actionUrl}</div>}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function NoticesTab() {
  const [notices,       setNotices]       = useState<Notice[]>([])
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState('')
  const [statusFilter,  setStatusFilter]  = useState('')
  const [search,        setSearch]        = useState('')
  const [searchInput,   setSearchInput]   = useState('')
  const [showCreate,    setShowCreate]    = useState(false)
  const [editNotice,    setEditNotice]    = useState<Notice | null>(null)
  const [logsNotice,    setLogsNotice]    = useState<Notice | null>(null)
  const [confirm,       setConfirm]       = useState<{ action: string; notice: Notice } | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [feedback,      setFeedback]      = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [testOverlay,   setTestOverlay]   = useState<{ type: 'balloon' | 'banner' | 'modal'; notice: Partial<Notice> & { title: string; message: string } } | null>(null)

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400)
    return () => clearTimeout(t)
  }, [searchInput])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const qs = new URLSearchParams()
      if (statusFilter) qs.set('status', statusFilter)
      if (search)       qs.set('search', search)
      const res  = await fetch(`/api/master/communication/notices?${qs}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setNotices(data.data ?? [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar avisos.')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, search])

  useEffect(() => { load() }, [load])

  function showFeedback(type: 'success' | 'error', msg: string) {
    setFeedback({ type, msg })
    setTimeout(() => setFeedback(null), 4000)
  }

  async function executeAction(action: string, notice: Notice) {
    const id = notice.id
    setActionLoading(id)
    try {
      let res: Response
      switch (action) {
        case 'pause':     res = await fetch(`/api/master/communication/notices/${id}/pause`,     { method: 'POST' }); break
        case 'resume':    res = await fetch(`/api/master/communication/notices/${id}/resume`,    { method: 'POST' }); break
        case 'cancel':    res = await fetch(`/api/master/communication/notices/${id}/cancel`,    { method: 'POST' }); break
        case 'archive':   res = await fetch(`/api/master/communication/notices/${id}/archive`,   { method: 'POST' }); break
        case 'delete':    res = await fetch(`/api/master/communication/notices/${id}`,           { method: 'DELETE' }); break
        case 'duplicate': res = await fetch(`/api/master/communication/notices/${id}/duplicate`, { method: 'POST' }); break
        case 'publish': {
          res = await fetch(`/api/master/communication/notices/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'ACTIVE' }) })
          break
        }
        case 'test': {
          const testRes = await fetch(`/api/master/communication/notices/${id}/test`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel: 'BALLOON' }),
          })
          const testData = await testRes.json()
          if (testData.success) {
            setTestOverlay({ type: 'balloon', notice: { ...notice, title: `[TESTE] ${notice.title}` } })
            showFeedback('success', 'Teste enviado. Nenhum usuário real foi impactado.')
          } else {
            showFeedback('error', testData.error ?? 'Erro ao testar.')
          }
          setActionLoading(null)
          return
        }
        default: setActionLoading(null); return
      }
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro na ação.')
      showFeedback('success', data.message ?? 'Ação concluída.')
      load()
    } catch (err: unknown) {
      showFeedback('error', err instanceof Error ? err.message : 'Erro.')
    } finally {
      setActionLoading(null)
    }
  }

  function handleAction(action: string, notice: Notice) {
    if (action === 'view')  { setEditNotice(notice); return }
    if (action === 'edit')  { setEditNotice(notice); return }
    if (action === 'logs')  { setLogsNotice(notice); return }
    // Ações críticas pedem confirmação
    const CRITICAL = ['cancel', 'delete']
    if (CRITICAL.includes(action)) {
      setConfirm({ action, notice })
      return
    }
    void executeAction(action, notice)
  }

  async function runQuickTest(channel: 'bell' | 'balloon' | 'banner' | 'modal') {
    try {
      const res  = await fetch(`/api/master/communication/notices/test-${channel}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      const n = data.notice
      if (channel === 'balloon') setTestOverlay({ type: 'balloon', notice: n })
      else if (channel === 'banner') setTestOverlay({ type: 'banner', notice: n })
      else if (channel === 'modal')  setTestOverlay({ type: 'modal',  notice: n })
      else showFeedback('success', 'Teste de sininho criado. Verifique o sininho.')
    } catch (err: unknown) {
      showFeedback('error', err instanceof Error ? err.message : 'Erro no teste.')
    }
  }

  return (
    <div className="space-y-4">
      {/* Feedback global */}
      {feedback && (
        <AlertMsg type={feedback.type} msg={feedback.msg} />
      )}

      {/* Barra de ações superiores */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700"
        >
          <Plus size={13} /> Novo aviso
        </button>
        <div className="flex gap-1 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden text-[11px]">
          {([
            { label: 'Balão',   ch: 'balloon' as const },
            { label: 'Sininho', ch: 'bell'    as const },
            { label: 'Banner',  ch: 'banner'  as const },
            { label: 'Modal',   ch: 'modal'   as const },
          ]).map(({ label, ch }) => (
            <button key={ch} onClick={() => runQuickTest(ch)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-gray-600 hover:bg-gray-100 font-medium"
            >
              <FlaskConical size={11} /> Testar {label}
            </button>
          ))}
        </div>
        <button onClick={load} className="ml-auto rounded-lg border border-gray-200 p-2 text-gray-400 hover:bg-gray-50">
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Filtro de status */}
        <div className="flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1 flex-wrap">
          {STATUS_FILTER_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => setStatusFilter(opt.value)}
              className={cn('rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
                statusFilter === opt.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              )}
            >{opt.label}</button>
          ))}
        </div>
        {/* Busca */}
        <div className="relative flex-1 min-w-[180px]">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full rounded-lg border border-gray-200 pl-8 pr-3 py-2 text-xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            placeholder="Buscar por título ou mensagem..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
          {searchInput && (
            <button onClick={() => { setSearchInput(''); setSearch('') }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Lista de avisos */}
      {loading ? (
        <div className="flex h-48 items-center justify-center"><Loader2 size={20} className="animate-spin text-gray-400" /></div>
      ) : error ? (
        <AlertMsg type="error" msg={error} />
      ) : notices.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-gray-200 text-gray-400">
          <Megaphone size={32} strokeWidth={1} />
          <p className="text-sm">Nenhum aviso encontrado</p>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700">
            <Plus size={12} /> Criar primeiro aviso
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {notices.map(n => (
            <div key={n.id} className={cn(actionLoading === n.id && 'opacity-60 pointer-events-none')}>
              <NoticeCard notice={n} onRefresh={load} onAction={handleAction} />
            </div>
          ))}
        </div>
      )}

      {/* Modais */}
      {(showCreate || editNotice) && (
        <NoticeModal
          initial={editNotice}
          onClose={() => { setShowCreate(false); setEditNotice(null) }}
          onSaved={() => { setShowCreate(false); setEditNotice(null); load() }}
        />
      )}
      {logsNotice && (
        <NoticeLogsModal notice={logsNotice} onClose={() => setLogsNotice(null)} />
      )}

      {/* Confirmação de ação crítica */}
      {confirm && (
        <ConfirmDialog
          title={confirm.action === 'delete' ? 'Excluir aviso' : 'Cancelar aviso'}
          message={
            confirm.action === 'delete'
              ? `Você está prestes a excluir "${confirm.notice.title}". Esta ação será registrada na auditoria. Deseja continuar?`
              : `Você está prestes a cancelar "${confirm.notice.title}". O aviso deixará de ser exibido. Deseja continuar?`
          }
          confirmLabel={confirm.action === 'delete' ? 'Excluir' : 'Cancelar aviso'}
          danger
          onConfirm={() => { const { action, notice } = confirm; setConfirm(null); void executeAction(action, notice) }}
          onCancel={() => setConfirm(null)}
        />
      )}

      {/* Overlays de teste visual */}
      {testOverlay?.type === 'balloon' && (
        <TestBalloon notice={testOverlay.notice} onDismiss={() => setTestOverlay(null)} />
      )}
      {testOverlay?.type === 'banner' && (
        <TestBanner notice={testOverlay.notice} onDismiss={() => setTestOverlay(null)} />
      )}
      {testOverlay?.type === 'modal' && (
        <TestModal notice={testOverlay.notice} onDismiss={() => setTestOverlay(null)} />
      )}
    </div>
  )
}
