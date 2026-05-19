'use client'

// =============================================================================
// /master/sheets — Importador Google Sheets (MASTER only)
// Gerencia configurações de planilhas, abas internas, mapeamento de colunas,
// teste de acesso, pré-visualização e execução de importação.
//
// Versão corrigida para copiar e colar em page.tsx.
// Correção aplicada:
// - Proteção contra arrays undefined vindos da API: tabs, importJobs,
//   availableSheets, columnDefs, preview, sheetsNotFound e errors.
// - O restante da estrutura visual, rotas, handlers e regras foi preservado.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  FileSpreadsheet, Plus, Trash2, Edit2, Save, X, Loader2, CheckCircle2,
  AlertCircle, Play, Eye, RefreshCw, ChevronDown, ChevronRight,
  ToggleLeft, ToggleRight, Database, Search,
  Clock, Pause, Zap, Settings2, ListChecks, Calendar, Timer, Bot, History,
  SlidersHorizontal, ArrowRightLeft, RotateCcw, UserX, BadgeAlert,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import PlanilhaConfigModal          from './PlanilhaConfigModal'
import SheetCredentialsSettings     from './SheetCredentialsSettings'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface SheetTab {
  id: string
  sheetName: string
  internalName: string
  gid: string | null
  monthReference: string | null
  sortOrder: number | null
  active: boolean
  headerRow: number
  lastSyncAt: string | null
  lastSyncStatus: string | null
  lastSyncError: string | null
  totalRowsLast: number | null
}

interface ImportJob {
  id: string
  status: string
  totalRows: number
  newRecords: number
  finishedAt: string | null
}

interface ImporterConfig {
  id:            string
  name:          string
  spreadsheetId: string
  description:   string | null
  tenantId:      string | null
  unitId:        string | null
  active:        boolean
  lastSyncAt:    string | null
  syncStatus:    string | null
  tabs?:         SheetTab[]
  importJobs?:   ImportJob[]
  autoSync?:     AutoSyncConfig | null
}

interface ImportResult {
  success: boolean
  message: string
  totalRows: number
  newRecords: number
  updatedRecords: number
  errorRows: number
  sheetsRead?: string[]
  sheetsNotFound?: string[]
  errors?: string[]
  durationMs: number
  dryRun: boolean
}

interface PreviewData {
  tab: { id: string; sheetName: string; gid: string | null }
  columnDefs?: { index: number; field: string; label: string; headerValue: string }[]
  preview?: Record<string, string>[]
  totalRowsShown: number
  headers?: string[]
}

interface TestResult {
  success: boolean
  message?: string
  error?: string
  errorCode?: string
  spreadsheetTitle?: string
  totalSheets?: number
  availableSheets?: { title: string; gid: string }[]
  responseMs?: number
}

interface DealProcessResult {
  success:            boolean
  message:            string
  dryRun:             boolean
  totalRows:          number
  dealsCreated:       number
  dealsUpdated:       number
  provisionalSellers: number
  pendenciesCreated:  number
  errors:             number
  errorDetails:       string[]
  durationMs:         number
}

interface SheetRowStats {
  total:           number
  pending:         number
  dealCreated:     number
  dealUpdated:     number
  waitingReview:   number
  error:           number
  ignored:         number
  lastProcessedAt: string | null
}

interface AutoSyncJob {
  id:           string
  status:       'RUNNING' | 'SUCCESS' | 'ERROR' | 'SKIPPED' | 'LOCKED'
  triggerType:  'AUTO' | 'MANUAL' | 'SIMULATION'
  startedAt:    string
  finishedAt:   string | null
  durationMs:   number | null
  rowsRead:     number
  rowsImported: number
  rowsUpdated:  number
  rowsError:    number
  sheetsRead:   string[] | null
  sheetsNotFound: string[] | null
  errors:       string[] | null
  createdBy:    { name: string; email: string } | null
}

interface AutoSyncConfig {
  id:                  string
  importerId:          string
  enabled:             boolean
  mode:                'SIMULATION' | 'REAL'
  frequencyMinutes:    number
  allowedDays:         number[]
  startTime:           string
  endTime:             string
  selectedTabs:        string[] | null
  actionAfterDownload: string
  processDeals:        boolean
  notifyOnNewRecords:  boolean
  notifyOnError:       boolean
  errorNotifyTarget:   string | null
  maxRowsPerRun:       number
  timeoutSeconds:      number
  status:              'ATIVO' | 'PAUSADO' | 'ERRO' | 'RODANDO' | 'AGUARDANDO'
  isRunning:           boolean
  lastRunAt:           string | null
  nextRunAt:           string | null
  lastStatus:          string | null
  lastError:           string | null
  lastJob:             AutoSyncJob | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const inp = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const lbl = 'text-xs font-medium text-gray-600 block mb-1'

function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : []
}

function formatNullableDate(value: string | null | undefined): string {
  if (!value) return 'Data não informada'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Data não informada'

  return date.toLocaleDateString('pt-BR')
}

function formatNullableDateTime(value: string | null | undefined): string {
  if (!value) return 'Data não informada'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Data não informada'

  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function Alert({ type, msg, details }: { type: 'error' | 'success' | 'warning'; msg: string; details?: string }) {
  const [exp, setExp] = useState(false)
  const cls = type === 'error' ? 'border-red-200 bg-red-50 text-red-700' :
              type === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-700' :
                                   'border-emerald-200 bg-emerald-50 text-emerald-700'
  const Icon = type === 'error' || type === 'warning' ? AlertCircle : CheckCircle2
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${cls}`}>
      <div className="flex items-start gap-2">
        <Icon size={15} className="mt-0.5 shrink-0" />
        <div className="flex-1">
          <span>{msg}</span>
          {details && (
            <button onClick={() => setExp(p => !p)} className="ml-2 text-xs underline opacity-70">
              {exp ? 'Ocultar' : 'Ver detalhes'}
            </button>
          )}
          {exp && details && <pre className="mt-2 whitespace-pre-wrap break-all text-xs bg-black/10 rounded p-2 max-h-32 overflow-auto">{details}</pre>}
        </div>
      </div>
    </div>
  )
}

// ── Modal: criar/editar importador ───────────────────────────────────────────

function ImporterModal({ initial, onClose, onSaved }: {
  initial?: ImporterConfig | null
  onClose: () => void
  onSaved: (cfg: ImporterConfig) => void
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? 'Google Sheets - EasyCar Matriz',
    spreadsheetId: initial?.spreadsheetId ?? '',
    description: initial?.description ?? '',
    tenantId: initial?.tenantId ?? '',
    unitId: initial?.unitId ?? '',
    active: initial?.active ?? true,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.name.trim() || !form.spreadsheetId.trim()) { setError('Nome e Spreadsheet ID são obrigatórios.'); return }
    setSaving(true)
    try {
      const url = initial ? `/api/master/sheets/${initial.id}` : '/api/master/sheets'
      const method = initial ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao salvar.')

      onSaved({
        ...data.data,
        tabs: asArray<SheetTab>(data.data?.tabs),
        importJobs: asArray<ImportJob>(data.data?.importJobs),
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="font-semibold text-gray-900">{initial ? 'Editar importador' : 'Novo importador'}</h2>
          <button onClick={onClose} className="rounded p-1.5 hover:bg-gray-100"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          {error && <Alert type="error" msg={error} />}
          <div>
            <label className={lbl}>Nome do importador *</label>
            <input className={inp} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Google Sheets - EasyCar Matriz" />
          </div>
          <div>
            <label className={lbl}>Spreadsheet ID * <span className="text-gray-400 font-normal">(da URL da planilha)</span></label>
            <input className={`${inp} font-mono`} value={form.spreadsheetId} onChange={e => setForm(p => ({ ...p, spreadsheetId: e.target.value }))} placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms" />
          </div>
          <div>
            <label className={lbl}>Descrição</label>
            <input className={inp} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Planilha VENDAS MATRIZ" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Tenant ID vinculado</label>
              <input className={`${inp} font-mono text-xs`} value={form.tenantId} onChange={e => setForm(p => ({ ...p, tenantId: e.target.value }))} placeholder="cuid do tenant" />
            </div>
            <div>
              <label className={lbl}>Unidade ID vinculada</label>
              <input className={`${inp} font-mono text-xs`} value={form.unitId} onChange={e => setForm(p => ({ ...p, unitId: e.target.value }))} placeholder="cuid da unidade" />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-brand-600" checked={form.active} onChange={e => setForm(p => ({ ...p, active: e.target.checked }))} />
            <span className="text-sm text-gray-700">Importador ativo</span>
          </label>
          <div className="flex justify-end gap-3 border-t pt-4">
            <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Modal: adicionar/editar aba ───────────────────────────────────────────────

function TabModal({ configId, initial, onClose, onSaved }: {
  configId: string
  initial?: SheetTab | null
  onClose: () => void
  onSaved: (tab: SheetTab) => void
}) {
  const [form, setForm] = useState({
    sheetName: initial?.sheetName ?? '',
    internalName: initial?.internalName ?? '',
    gid: initial?.gid ?? '',
    monthReference: initial?.monthReference ?? '',
    sortOrder: initial?.sortOrder ?? 0,
    active: initial?.active ?? true,
    headerRow: initial?.headerRow ?? 1,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.sheetName.trim()) { setError('Nome da aba obrigatório.'); return }
    setSaving(true)
    try {
      const url = initial ? `/api/master/sheets/${configId}/tabs/${initial.id}` : `/api/master/sheets/${configId}/tabs`
      const method = initial ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, internalName: form.internalName || form.sheetName }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro.')
      onSaved(data.data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="font-semibold text-gray-900">{initial ? 'Editar aba' : 'Adicionar aba'}</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-gray-100"><X size={15} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3 px-5 py-4">
          {error && <Alert type="error" msg={error} />}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Nome da aba (exato) *</label>
              <input className={inp} value={form.sheetName} onChange={e => setForm(p => ({ ...p, sheetName: e.target.value }))} placeholder="Abril" />
            </div>
            <div>
              <label className={lbl}>GID da aba</label>
              <input className={`${inp} font-mono`} value={form.gid} onChange={e => setForm(p => ({ ...p, gid: e.target.value }))} placeholder="1507200471" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Mês referência</label>
              <input className={inp} value={form.monthReference} onChange={e => setForm(p => ({ ...p, monthReference: e.target.value }))} placeholder="Abril" />
            </div>
            <div>
              <label className={lbl}>Ordem</label>
              <input type="number" min={0} className={inp} value={form.sortOrder} onChange={e => setForm(p => ({ ...p, sortOrder: Number(e.target.value) }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Linha de cabeçalho</label>
              <input type="number" min={1} className={inp} value={form.headerRow} onChange={e => setForm(p => ({ ...p, headerRow: Number(e.target.value) }))} />
            </div>
            <div className="flex flex-col justify-end pb-0.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-brand-600" checked={form.active} onChange={e => setForm(p => ({ ...p, active: e.target.checked }))} />
                <span className="text-sm text-gray-700">Ativa</span>
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-3 border-t pt-3">
            <button type="button" onClick={onClose} className="rounded border px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Modal: configurar atualizador automático ──────────────────────────────────

const FREQ_OPTIONS = [
  { label: '5 minutos',  value: 5   },
  { label: '10 minutos', value: 10  },
  { label: '15 minutos', value: 15  },
  { label: '20 minutos', value: 20  },
  { label: '30 minutos', value: 30  },
  { label: '1 hora',     value: 60  },
  { label: 'Personalizado', value: 0 },
]

const DAYS_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const ACTION_LABELS: Record<string, string> = {
  APENAS_BAIXAR:                  'Apenas baixar e validar',
  IMPORTAR_PENDENCIAS:            'Importar novas pendências',
  IMPORTAR_E_ALERTAR:             'Importar e criar alertas internos',
  IMPORTAR_E_NOTIFICAR_GERENTE:   'Importar e notificar gerente',
  IMPORTAR_E_NOTIFICAR_TODOS:     'Importar, notificar gerente e responsáveis',
}

function AutoSyncModal({ configId, tabs, initial, onClose, onSaved }: {
  configId:  string
  tabs:      SheetTab[]
  initial:   AutoSyncConfig | null
  onClose:   () => void
  onSaved:   (cfg: AutoSyncConfig) => void
}) {
  const freqMatch  = FREQ_OPTIONS.find(o => o.value === (initial?.frequencyMinutes ?? 30))
  const isCustom   = !freqMatch || freqMatch.value === 0

  const [form, setForm] = useState({
    enabled:             initial?.enabled             ?? false,
    mode:                initial?.mode                ?? 'SIMULATION' as 'SIMULATION' | 'REAL',
    frequencyMinutes:    initial?.frequencyMinutes     ?? 30,
    customFreq:          isCustom ? String(initial?.frequencyMinutes ?? 30) : '',
    freqPreset:          isCustom ? 0 : (initial?.frequencyMinutes ?? 30),
    allowedDays:         initial?.allowedDays          ?? [1, 2, 3, 4, 5],
    startTime:           initial?.startTime            ?? '08:00',
    endTime:             initial?.endTime              ?? '18:00',
    selectedTabs:        initial?.selectedTabs         ?? null as string[] | null,
    actionAfterDownload: initial?.actionAfterDownload  ?? 'IMPORTAR_PENDENCIAS',
    processDeals:        initial?.processDeals         ?? false,
    notifyOnNewRecords:  initial?.notifyOnNewRecords   ?? false,
    notifyOnError:       initial?.notifyOnError        ?? true,
    errorNotifyTarget:   initial?.errorNotifyTarget    ?? '',
    maxRowsPerRun:       initial?.maxRowsPerRun        ?? 500,
    timeoutSeconds:      initial?.timeoutSeconds       ?? 120,
  })
  const [saving,  setSaving]  = useState(false)
  const [running, setRunning] = useState(false)
  const [err,     setErr]     = useState('')
  const [ok,      setOk]      = useState('')

  function toggleDay(day: number) {
    setForm(p => ({
      ...p,
      allowedDays: p.allowedDays.includes(day)
        ? p.allowedDays.filter(d => d !== day)
        : [...p.allowedDays, day].sort((a, b) => a - b),
    }))
  }

  function resolvedFreq(): number {
    return form.freqPreset === 0 ? Number(form.customFreq) || 30 : form.freqPreset
  }

  async function handleSave() {
    setErr('')
    setOk('')
    const freq = resolvedFreq()
    if (freq < 1 || freq > 1440) { setErr('Intervalo deve ser entre 1 e 1440 minutos.'); return }
    if (form.allowedDays.length === 0) { setErr('Selecione ao menos um dia.'); return }

    setSaving(true)
    try {
      const res  = await fetch(`/api/master/sheets/${configId}/auto-sync`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled:             form.enabled,
          mode:                form.mode,
          frequencyMinutes:    freq,
          allowedDays:         form.allowedDays,
          startTime:           form.startTime,
          endTime:             form.endTime,
          selectedTabs:        form.selectedTabs,
          actionAfterDownload: form.actionAfterDownload,
          processDeals:        form.processDeals,
          notifyOnNewRecords:  form.notifyOnNewRecords,
          notifyOnError:       form.notifyOnError,
          errorNotifyTarget:   form.errorNotifyTarget || null,
          maxRowsPerRun:       form.maxRowsPerRun,
          timeoutSeconds:      form.timeoutSeconds,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao salvar.')
      setOk('Agendamento salvo com sucesso.')
      onSaved(data.data)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Erro.')
    } finally {
      setSaving(false)
    }
  }

  async function handleRunNow(dryRun: boolean) {
    setErr('')
    setOk('')
    setRunning(true)
    try {
      const res  = await fetch(`/api/master/sheets/${configId}/auto-sync/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun }),
      })
      const data = await res.json()
      if (data.success) {
        setOk(`${dryRun ? '[Simulação] ' : ''}Concluído — ${data.newRecords ?? 0} novos, ${data.updatedRecords ?? 0} atualizados de ${data.totalRows ?? 0} lidas.`)
      } else {
        setErr(data.error ?? 'Erro na execução.')
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Erro.')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600">
              <Bot size={16} className="text-white" />
            </div>
            <h2 className="font-semibold text-gray-900">Configurar Atualizador Automático</h2>
          </div>
          <button onClick={onClose} className="rounded p-1.5 hover:bg-gray-100"><X size={15} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {err && <Alert type="error" msg={err} />}
          {ok  && <Alert type="success" msg={ok} />}

          {/* Ativação e modo */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-700 mb-3">Atualização automática</p>
              <div className="flex gap-3">
                {[true, false].map(v => (
                  <button key={String(v)} type="button"
                    onClick={() => setForm(p => ({ ...p, enabled: v }))}
                    className={cn('flex-1 rounded-lg border py-2 text-xs font-semibold transition-colors',
                      form.enabled === v
                        ? v ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-red-300 bg-red-50 text-red-700'
                        : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                    )}
                  >
                    {v ? 'Ativada' : 'Pausada'}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-700 mb-3">Modo de execução</p>
              <div className="flex gap-3">
                {(['SIMULATION', 'REAL'] as const).map(m => (
                  <button key={m} type="button"
                    onClick={() => setForm(p => ({ ...p, mode: m }))}
                    className={cn('flex-1 rounded-lg border py-2 text-xs font-semibold transition-colors',
                      form.mode === m
                        ? m === 'REAL' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-amber-400 bg-amber-50 text-amber-700'
                        : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                    )}
                  >
                    {m === 'SIMULATION' ? 'Simulação' : 'Real'}
                  </button>
                ))}
              </div>
              {form.mode === 'SIMULATION' && (
                <p className="mt-2 text-[10px] text-amber-600">Modo simulação: não grava dados no banco.</p>
              )}
            </div>
          </div>

          {/* Frequência */}
          <div className="rounded-xl border border-gray-200 p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-700">Frequência de atualização</p>
            <div className="flex flex-wrap gap-2">
              {FREQ_OPTIONS.map(opt => (
                <button key={opt.value} type="button"
                  onClick={() => setForm(p => ({ ...p, freqPreset: opt.value }))}
                  className={cn('rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                    form.freqPreset === opt.value
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {form.freqPreset === 0 && (
              <div className="flex items-center gap-2">
                <input type="number" min={1} max={1440} placeholder="Ex: 45"
                  className={`${inp} w-32`}
                  value={form.customFreq}
                  onChange={e => setForm(p => ({ ...p, customFreq: e.target.value }))}
                />
                <span className="text-xs text-gray-500">minutos (1–1440)</span>
              </div>
            )}
          </div>

          {/* Dias e horário */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-gray-200 p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-700">Dias permitidos</p>
              <div className="flex gap-1.5 flex-wrap">
                {DAYS_LABELS.map((lbl, i) => (
                  <button key={i} type="button"
                    onClick={() => toggleDay(i)}
                    className={cn('rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
                      form.allowedDays.includes(i)
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                    )}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-700">Janela de horário</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={lbl}>Início</label>
                  <input type="time" className={inp} value={form.startTime}
                    onChange={e => setForm(p => ({ ...p, startTime: e.target.value }))} />
                </div>
                <div>
                  <label className={lbl}>Fim</label>
                  <input type="time" className={inp} value={form.endTime}
                    onChange={e => setForm(p => ({ ...p, endTime: e.target.value }))} />
                </div>
              </div>
            </div>
          </div>

          {/* Abas a sincronizar */}
          {tabs.length > 0 && (
            <div className="rounded-xl border border-gray-200 p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-700">Abas a sincronizar</p>
              <div className="flex gap-3">
                <button type="button"
                  onClick={() => setForm(p => ({ ...p, selectedTabs: null }))}
                  className={cn('rounded-lg border px-3 py-1.5 text-xs font-medium',
                    form.selectedTabs === null ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  )}
                >
                  Todas as abas ativas
                </button>
                <button type="button"
                  onClick={() => setForm(p => ({ ...p, selectedTabs: p.selectedTabs ?? [] }))}
                  className={cn('rounded-lg border px-3 py-1.5 text-xs font-medium',
                    form.selectedTabs !== null ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  )}
                >
                  Escolher abas
                </button>
              </div>
              {form.selectedTabs !== null && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {tabs.map(t => {
                    const selected = form.selectedTabs!.includes(t.id)
                    return (
                      <button key={t.id} type="button"
                        onClick={() => setForm(p => ({
                          ...p,
                          selectedTabs: selected
                            ? p.selectedTabs!.filter(id => id !== t.id)
                            : [...(p.selectedTabs ?? []), t.id],
                        }))}
                        className={cn('rounded border px-2 py-0.5 text-xs',
                          selected ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-500'
                        )}
                      >
                        {t.sheetName}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Ação após baixar */}
          <div className="rounded-xl border border-gray-200 p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-700">Ação após baixar os dados</p>
            <div className="space-y-1.5">
              {Object.entries(ACTION_LABELS).map(([val, label]) => (
                <label key={val} className="flex items-center gap-2.5 cursor-pointer group">
                  <input type="radio" name="action" value={val}
                    checked={form.actionAfterDownload === val}
                    onChange={() => setForm(p => ({ ...p, actionAfterDownload: val }))}
                    className="h-3.5 w-3.5 text-brand-600"
                  />
                  <span className="text-xs text-gray-700 group-hover:text-gray-900">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Processamento de Negociações */}
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 space-y-2">
            <p className="text-xs font-semibold text-indigo-800">Conversão em Negociações</p>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600"
                checked={form.processDeals}
                onChange={e => setForm(p => ({ ...p, processDeals: e.target.checked }))}
              />
              <span className="text-xs text-indigo-700 leading-relaxed">
                Processar automaticamente cada linha como Negociação (Deal) após a importação
              </span>
            </label>
            {form.processDeals && (
              <p className="text-[10px] text-indigo-500 pl-6.5">
                Vendedores não encontrados terão um responsável provisório designado e uma pendência de revisão gerada.
              </p>
            )}
          </div>

          {/* Notificações */}
          <div className="rounded-xl border border-gray-200 p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-700">Notificações</p>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-brand-600"
                checked={form.notifyOnNewRecords}
                onChange={e => setForm(p => ({ ...p, notifyOnNewRecords: e.target.checked }))}
              />
              <span className="text-xs text-gray-700">Notificar quando encontrar novas pendências</span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-brand-600"
                checked={form.notifyOnError}
                onChange={e => setForm(p => ({ ...p, notifyOnError: e.target.checked }))}
              />
              <span className="text-xs text-gray-700">Notificar quando der erro técnico</span>
            </label>
            {form.notifyOnError && (
              <div>
                <label className={lbl}>E-mail ou WhatsApp para erros técnicos</label>
                <input className={inp} placeholder="erro@empresa.com ou +5511999990000"
                  value={form.errorNotifyTarget}
                  onChange={e => setForm(p => ({ ...p, errorNotifyTarget: e.target.value }))}
                />
              </div>
            )}
          </div>

          {/* Limites técnicos */}
          <div className="rounded-xl border border-gray-200 p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-700">Limites técnicos</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Máx. linhas por execução</label>
                <input type="number" min={1} max={10000} className={inp}
                  value={form.maxRowsPerRun}
                  onChange={e => setForm(p => ({ ...p, maxRowsPerRun: Number(e.target.value) }))}
                />
              </div>
              <div>
                <label className={lbl}>Timeout (segundos)</label>
                <input type="number" min={10} max={600} className={inp}
                  value={form.timeoutSeconds}
                  onChange={e => setForm(p => ({ ...p, timeoutSeconds: Number(e.target.value) }))}
                />
              </div>
            </div>
            <p className="text-[10px] text-gray-400">
              Execuções simultâneas são automaticamente bloqueadas por lock.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t px-6 py-4 flex items-center justify-between gap-3 bg-gray-50 rounded-b-2xl">
          <div className="flex gap-2">
            <button type="button" disabled={running}
              onClick={() => handleRunNow(true)}
              className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
            >
              {running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
              Simular agora
            </button>
            <button type="button" disabled={running}
              onClick={() => handleRunNow(false)}
              className="flex items-center gap-1.5 rounded-lg border border-brand-300 bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-50"
            >
              {running ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
              Executar agora
            </button>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-xs text-gray-600 hover:bg-gray-100">
              Fechar
            </button>
            <button type="button" disabled={saving} onClick={handleSave}
              className="flex items-center gap-2 rounded-lg bg-violet-600 px-5 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              {saving ? 'Salvando...' : 'Salvar agendamento'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Card de status do auto-sync ───────────────────────────────────────────────

const STATUS_CFG = {
  ATIVO:      { label: 'Ativo',                color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  PAUSADO:    { label: 'Pausado',              color: 'text-gray-600    bg-gray-50    border-gray-200'    },
  ERRO:       { label: 'Erro',                 color: 'text-red-700     bg-red-50     border-red-200'     },
  RODANDO:    { label: 'Rodando agora',        color: 'text-blue-700   bg-blue-50    border-blue-200'    },
  AGUARDANDO: { label: 'Aguardando execução',  color: 'text-violet-700  bg-violet-50  border-violet-200' },
} as const

const JOB_STATUS_CFG = {
  RUNNING:  { label: 'Rodando',   color: 'text-blue-700   bg-blue-50'   },
  SUCCESS:  { label: 'Sucesso',   color: 'text-emerald-700 bg-emerald-50' },
  ERROR:    { label: 'Erro',      color: 'text-red-700    bg-red-50'    },
  SKIPPED:  { label: 'Ignorado',  color: 'text-gray-600   bg-gray-100'  },
  LOCKED:   { label: 'Bloqueado', color: 'text-amber-700  bg-amber-50'  },
} as const

const TRIGGER_LABEL: Record<string, string> = {
  AUTO:       'Automática',
  MANUAL:     'Manual',
  SIMULATION: 'Simulação',
}

function AutoSyncCard({ configId, tabs, initialConfig, onConfigChange }: {
  configId:       string
  tabs:           SheetTab[]
  initialConfig:  AutoSyncConfig | null
  onConfigChange: (cfg: AutoSyncConfig | null) => void
}) {
  const [autoSync,     setAutoSync]     = useState<AutoSyncConfig | null>(initialConfig)
  const [showModal,    setShowModal]    = useState(false)
  const [showHistory,  setShowHistory]  = useState(false)
  const [jobs,         setJobs]         = useState<AutoSyncJob[]>([])
  const [jobsLoading,  setJobsLoading]  = useState(false)
  const [toggling,     setToggling]     = useState(false)
  const [running,      setRunning]      = useState(false)
  const [runResult,    setRunResult]    = useState<{ success: boolean; msg: string } | null>(null)

  async function loadJobs() {
    setJobsLoading(true)
    try {
      const res  = await fetch(`/api/master/sheets/${configId}/auto-sync/jobs?perPage=15`)
      const data = await res.json()
      setJobs(asArray<AutoSyncJob>(data.data))
    } finally {
      setJobsLoading(false)
    }
  }

  async function reloadConfig() {
    const res  = await fetch(`/api/master/sheets/${configId}/auto-sync`)
    const data = await res.json()
    const cfg  = data.data ?? null
    setAutoSync(cfg)
    onConfigChange(cfg)
  }

  async function handleToggle() {
    setToggling(true)
    setRunResult(null)
    try {
      const enabled = !(autoSync?.enabled ?? false)
      const res  = await fetch(`/api/master/sheets/${configId}/auto-sync`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ enabled }),
      })
      const data = await res.json()
      if (data.success) {
        setAutoSync(data.data)
        onConfigChange(data.data)
      } else {
        setRunResult({ success: false, msg: data.error ?? 'Erro ao alterar estado do robô.' })
      }
    } catch {
      setRunResult({ success: false, msg: 'Erro de conexão ao alterar estado do robô.' })
    } finally {
      setToggling(false)
    }
  }

  async function handleRunNow(dryRun: boolean) {
    setRunning(true)
    setRunResult(null)
    try {
      const res  = await fetch(`/api/master/sheets/${configId}/auto-sync/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun }),
      })
      const data = await res.json()
      setRunResult({
        success: data.success,
        msg: data.success
          ? `${dryRun ? '[Simulação] ' : ''}${data.newRecords ?? 0} novos · ${data.updatedRecords ?? 0} atualizados · ${data.totalRows ?? 0} lidas`
          : (data.error ?? 'Erro na execução.'),
      })
      await reloadConfig()
    } finally {
      setRunning(false)
    }
  }

  const status  = autoSync?.status ?? 'PAUSADO'
  const stCfg   = STATUS_CFG[status] ?? STATUS_CFG.PAUSADO
  const enabled  = autoSync?.enabled ?? false

  const freqLabel = (() => {
    if (!autoSync) return '—'
    const min = autoSync.frequencyMinutes
    const found = FREQ_OPTIONS.find(o => o.value === min && o.value !== 0)
    return found ? found.label : `${min} min`
  })()

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/30">
      {/* Header do card */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-violet-100">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-600">
            <Bot size={14} className="text-white" />
          </div>
          <span className="text-sm font-semibold text-gray-900">Atualização Automática</span>
          <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold', stCfg.color)}>
            {stCfg.label}
          </span>
          {autoSync?.isRunning && <Loader2 size={12} className="animate-spin text-blue-600" />}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleToggle}
            disabled={toggling}
            title={enabled ? 'Pausar robô' : 'Ativar robô'}
            className={cn(
              'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50',
              enabled
                ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
            )}
          >
            {toggling ? <Loader2 size={11} className="animate-spin" /> : enabled ? <Pause size={11} /> : <Zap size={11} />}
            {enabled ? 'Pausar' : 'Ativar'}
          </button>
          <button
            onClick={() => { setShowModal(true) }}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            <Settings2 size={11} /> Configurar
          </button>
        </div>
      </div>

      {/* Corpo */}
      <div className="px-4 py-3 space-y-3">
        {/* Stats rápidas */}
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="rounded-lg bg-white border border-gray-100 p-2.5">
            <p className="text-gray-400 flex items-center gap-1"><Clock size={10} /> Frequência</p>
            <p className="mt-0.5 font-semibold text-gray-800">{freqLabel}</p>
          </div>
          <div className="rounded-lg bg-white border border-gray-100 p-2.5">
            <p className="text-gray-400 flex items-center gap-1"><Calendar size={10} /> Última execução</p>
            <p className="mt-0.5 font-semibold text-gray-800">{formatNullableDateTime(autoSync?.lastRunAt)}</p>
          </div>
          <div className="rounded-lg bg-white border border-gray-100 p-2.5">
            <p className="text-gray-400 flex items-center gap-1"><Timer size={10} /> Próxima execução</p>
            <p className="mt-0.5 font-semibold text-gray-800">{formatNullableDateTime(autoSync?.nextRunAt)}</p>
          </div>
        </div>

        {/* Último job */}
        {autoSync?.lastJob && (
          <div className="rounded-lg bg-white border border-gray-100 px-3 py-2 text-xs flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold', JOB_STATUS_CFG[autoSync.lastJob.status]?.color)}>
                {JOB_STATUS_CFG[autoSync.lastJob.status]?.label ?? autoSync.lastJob.status}
              </span>
              <span className="text-gray-500">
                {TRIGGER_LABEL[autoSync.lastJob.triggerType] ?? autoSync.lastJob.triggerType} · {formatNullableDateTime(autoSync.lastJob.startedAt)}
              </span>
            </div>
            <div className="flex items-center gap-3 text-gray-500">
              <span>{autoSync.lastJob.rowsRead} lidas</span>
              <span className="text-emerald-600 font-medium">{autoSync.lastJob.rowsImported} novas</span>
              <span>{autoSync.lastJob.rowsUpdated} atualizadas</span>
              {autoSync.lastJob.rowsError > 0 && <span className="text-red-600">{autoSync.lastJob.rowsError} erros</span>}
              {autoSync.lastJob.durationMs && <span className="text-gray-400">{autoSync.lastJob.durationMs}ms</span>}
            </div>
          </div>
        )}

        {/* Alerta de lastError */}
        {autoSync?.lastError && (
          <Alert type="error" msg={autoSync.lastError} />
        )}

        {/* Alerta sem credencial */}
        {!process.env.NEXT_PUBLIC_HAS_SHEETS_CREDS && autoSync?.enabled && (
          <Alert type="warning" msg="Verifique se GOOGLE_SHEETS_CREDENTIALS está configurada no servidor." />
        )}

        {/* Resultado de execução manual */}
        {runResult && (
          <Alert type={runResult.success ? 'success' : 'error'} msg={runResult.msg} />
        )}

        {/* Botões de ação */}
        <div className="flex items-center gap-2 flex-wrap pt-1">
          <button onClick={() => handleRunNow(true)} disabled={running}
            className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
          >
            {running ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
            Simular agora
          </button>
          <button onClick={() => handleRunNow(false)} disabled={running}
            className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {running ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
            Executar agora
          </button>
          <button
            onClick={() => { setShowHistory(h => !h); if (!showHistory) loadJobs() }}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            <History size={11} />
            {showHistory ? 'Ocultar histórico' : 'Ver histórico'}
          </button>
          <button onClick={reloadConfig}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50"
          >
            <RefreshCw size={11} />
          </button>
        </div>

        {/* Histórico de execuções */}
        {showHistory && (
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50">
              <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                <ListChecks size={12} /> Histórico de atualizações
              </p>
              {jobsLoading && <Loader2 size={12} className="animate-spin text-gray-400" />}
            </div>
            {jobs.length === 0 && !jobsLoading ? (
              <p className="px-3 py-4 text-xs text-gray-400 text-center">Nenhuma execução registrada ainda.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {jobs.map(job => (
                  <JobRow key={job.id} job={job} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal de configuração */}
      {showModal && (
        <AutoSyncModal
          configId={configId}
          tabs={tabs}
          initial={autoSync}
          onClose={() => setShowModal(false)}
          onSaved={cfg => {
            setAutoSync(cfg)
            onConfigChange(cfg)
            setShowModal(false)
          }}
        />
      )}
    </div>
  )
}

// ── Linha de job no histórico ─────────────────────────────────────────────────

function JobRow({ job }: { job: AutoSyncJob }) {
  const [expanded, setExpanded] = useState(false)
  const stCfg = JOB_STATUS_CFG[job.status] ?? JOB_STATUS_CFG.ERROR
  const sheetsRead     = asArray<string>(job.sheetsRead)
  const sheetsNotFound = asArray<string>(job.sheetsNotFound)
  const errors         = asArray<string>(job.errors)

  return (
    <div className="text-xs">
      <button
        type="button"
        onClick={() => setExpanded(p => !p)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 text-left"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold', stCfg.color)}>
            {stCfg.label}
          </span>
          <span className="text-gray-500 font-medium">{TRIGGER_LABEL[job.triggerType] ?? job.triggerType}</span>
          <span className="text-gray-400">{formatNullableDateTime(job.startedAt)}</span>
          {job.createdBy && <span className="text-gray-400">— {job.createdBy.name}</span>}
        </div>
        <div className="flex items-center gap-3 text-gray-500 shrink-0">
          <span>{job.rowsRead} lidas</span>
          <span className="text-emerald-600 font-medium">{job.rowsImported} novas</span>
          {job.rowsError > 0 && <span className="text-red-600">{job.rowsError} erros</span>}
          {job.durationMs && <span className="text-gray-400">{job.durationMs}ms</span>}
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-1.5 bg-gray-50 border-t border-gray-100">
          {sheetsRead.length > 0 && (
            <p className="text-gray-500">
              Abas lidas: {sheetsRead.join(', ')}
            </p>
          )}
          {sheetsNotFound.length > 0 && (
            <p className="text-amber-700">
              Abas não encontradas: {sheetsNotFound.join(', ')}
            </p>
          )}
          {errors.length > 0 && (
            <div>
              <p className="font-medium text-red-700">Erros:</p>
              <ul className="mt-0.5 space-y-0.5 text-red-600">
                {errors.slice(0, 5).map((e, i) => <li key={i}>• {e}</li>)}
              </ul>
            </div>
          )}
          {job.rowsUpdated > 0 && <p className="text-gray-500">{job.rowsUpdated} pendências atualizadas</p>}
          {job.finishedAt && <p className="text-gray-400">Finalizado: {formatNullableDateTime(job.finishedAt)}</p>}
        </div>
      )}
    </div>
  )
}

// ── Card de importador ────────────────────────────────────────────────────────

function ImporterCard({ config, onRefresh }: { config: ImporterConfig; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [editImporter, setEditImporter] = useState(false)
  const [addTabModal, setAddTabModal] = useState(false)
  const [editTab, setEditTab] = useState<SheetTab | null>(null)
  const [testing, setTesting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [previewData,       setPreviewData]       = useState<PreviewData | null>(null)
  const [selectedTab,       setSelectedTab]       = useState<string>('')
  const [autoSyncCfg,       setAutoSyncCfg]       = useState<AutoSyncConfig | null>(config.autoSync ?? null)
  const [showConfigModal,   setShowConfigModal]   = useState(false)

  // ── Deal Processor ────────────────────────────────────────────────────────
  const [rowStats,          setRowStats]          = useState<SheetRowStats | null>(null)
  const [rowStatsLoading,   setRowStatsLoading]   = useState(false)
  const [processing,        setProcessing]        = useState(false)
  const [processResult,     setProcessResult]     = useState<DealProcessResult | null>(null)
  const [showDealSection,   setShowDealSection]   = useState(false)

  const tabs = asArray<SheetTab>(config.tabs)
  const importJobs = asArray<ImportJob>(config.importJobs)
  const lastJob = importJobs[0] ?? null

  async function handleDelete() {
    if (!confirm(`Apagar "${config.name}"? Isso removerá todas as abas cadastradas.`)) return
    await fetch(`/api/master/sheets/${config.id}`, { method: 'DELETE' })
    onRefresh()
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch(`/api/master/sheets/${config.id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tabId: selectedTab || undefined }),
      })
      setTestResult(await res.json())
    } catch (err: unknown) {
      setTestResult({ success: false, error: err instanceof Error ? err.message : 'Erro ao testar acesso.' })
    } finally {
      setTesting(false)
    }
  }

  async function handlePreview() {
    setPreviewing(true)
    setPreviewData(null)
    try {
      const res = await fetch(`/api/master/sheets/${config.id}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tabId: selectedTab || undefined, limit: 5 }),
      })
      const data = await res.json()
      if (data.success) setPreviewData(data)
      else setTestResult({ success: false, error: data.error, errorCode: data.errorCode })
    } catch (err: unknown) {
      setTestResult({ success: false, error: err instanceof Error ? err.message : 'Erro ao pré-visualizar.' })
    } finally {
      setPreviewing(false)
    }
  }

  async function handleImport(dryRun: boolean) {
    setImporting(true)
    setImportResult(null)
    try {
      const res = await fetch(`/api/master/sheets/${config.id}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tabId: selectedTab || undefined, dryRun }),
      })
      const result = await res.json()
      setImportResult({
        ...result,
        sheetsRead: asArray<string>(result.sheetsRead),
        sheetsNotFound: asArray<string>(result.sheetsNotFound),
        errors: asArray<string>(result.errors),
      })
      if (!dryRun && result.success) onRefresh()
    } catch (err: unknown) {
      setImportResult({
        success: false,
        message: err instanceof Error ? err.message : 'Erro ao importar.',
        totalRows: 0,
        newRecords: 0,
        updatedRecords: 0,
        errorRows: 1,
        sheetsRead: [],
        sheetsNotFound: [],
        errors: [err instanceof Error ? err.message : 'Erro ao importar.'],
        durationMs: 0,
        dryRun,
      })
    } finally {
      setImporting(false)
    }
  }

  async function toggleTab(tab: SheetTab) {
    await fetch(`/api/master/sheets/${config.id}/tabs/${tab.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !tab.active }),
    })
    onRefresh()
  }

  async function loadRowStats() {
    setRowStatsLoading(true)
    try {
      const res  = await fetch(`/api/master/sheets/${config.id}/process-deals/status`)
      const data = await res.json()
      if (data.success) setRowStats(data.data)
    } catch { /* silencioso */ }
    finally { setRowStatsLoading(false) }
  }

  async function handleProcessDeals(dryRun: boolean, reset = false) {
    setProcessing(true)
    setProcessResult(null)
    try {
      const res  = await fetch(`/api/master/sheets/${config.id}/process-deals`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ dryRun, resetPending: reset }),
      })
      const data = await res.json()
      setProcessResult(data)
      await loadRowStats()
    } catch (err: unknown) {
      setProcessResult({
        success: false, message: err instanceof Error ? err.message : 'Erro ao processar.', dryRun,
        totalRows: 0, dealsCreated: 0, dealsUpdated: 0, provisionalSellers: 0,
        pendenciesCreated: 0, errors: 1, errorDetails: [], durationMs: 0,
      })
    } finally {
      setProcessing(false)
    }
  }

  async function deleteTab(tab: SheetTab) {
    if (!confirm(`Remover aba "${tab.sheetName}"?`)) return
    await fetch(`/api/master/sheets/${config.id}/tabs/${tab.id}`, { method: 'DELETE' })
    onRefresh()
  }

  const availableSheets        = asArray<{ title: string; gid: string }>(testResult?.availableSheets)
  const previewColumnDefs      = asArray<{ index: number; field: string; label: string; headerValue: string }>(previewData?.columnDefs)
  const previewRows            = asArray<Record<string, string>>(previewData?.preview)
  const importSheetsNotFound   = asArray<string>(importResult?.sheetsNotFound)
  const importErrors           = asArray<string>(importResult?.errors)
  const processErrorDetails    = asArray<string>(processResult?.errorDetails)

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Header do card */}
      <div className="flex items-start gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600">
          <FileSpreadsheet size={18} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-gray-900">{config.name}</p>
            {!config.active && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">inativo</span>}
            {config.syncStatus === 'SUCCESS' && <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs text-emerald-700">sincronizado</span>}
          </div>
          <p className="mt-0.5 text-xs font-mono text-gray-400 truncate">{config.spreadsheetId}</p>
          {config.description && <p className="mt-0.5 text-xs text-gray-500">{config.description}</p>}
          <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
            <span>{tabs.length} aba{tabs.length !== 1 ? 's' : ''}</span>
            {lastJob ? (
              <span>Última importação: {lastJob.newRecords ?? 0} novos · {formatNullableDate(lastJob.finishedAt)}</span>
            ) : (
              <span>Nenhuma importação executada ainda</span>
            )}
            {config.lastSyncAt && <span>Sync: {formatNullableDateTime(config.lastSyncAt)}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setShowConfigModal(true)}
            title="Configurar planilha completo"
            className="flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100"
          >
            <SlidersHorizontal size={13} />
            Configurar planilha
          </button>
          <button onClick={() => setEditImporter(true)} title="Editar rápido" className="rounded p-1.5 text-gray-400 hover:bg-gray-100"><Edit2 size={14} /></button>
          <button onClick={handleDelete} title="Apagar" className="rounded p-1.5 text-red-400 hover:bg-red-50"><Trash2 size={14} /></button>
          <button onClick={() => setExpanded(p => !p)} className="rounded p-1.5 text-gray-400 hover:bg-gray-100">
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 px-4 pb-5 pt-4 space-y-5">

          {/* Abas */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Abas internas</p>
              <button onClick={() => setAddTabModal(true)} className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">
                <Plus size={12} /> Adicionar aba
              </button>
            </div>

            {tabs.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Nenhuma aba cadastrada. Clique em "+ Adicionar aba".</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-gray-200">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-gray-50 text-gray-500">
                      <th className="px-3 py-2 text-left font-medium">Nome</th>
                      <th className="px-3 py-2 text-left font-medium">GID</th>
                      <th className="px-3 py-2 text-left font-medium">Mês ref.</th>
                      <th className="px-3 py-2 text-center font-medium">Ordem</th>
                      <th className="px-3 py-2 text-center font-medium">Ativa</th>
                      <th className="px-3 py-2 text-right font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {tabs.map(tab => (
                      <tr key={tab.id} className={cn('hover:bg-gray-50', !tab.active && 'opacity-50')}>
                        <td className="px-3 py-2 font-medium text-gray-800">{tab.sheetName}</td>
                        <td className="px-3 py-2 font-mono text-gray-500">{tab.gid ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-500">{tab.monthReference ?? '—'}</td>
                        <td className="px-3 py-2 text-center text-gray-500">{tab.sortOrder ?? 0}</td>
                        <td className="px-3 py-2 text-center">
                          <button onClick={() => toggleTab(tab)} className="text-gray-400 hover:text-brand-600">
                            {tab.active ? <ToggleRight size={16} className="text-brand-600" /> : <ToggleLeft size={16} />}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => setEditTab(tab)} className="rounded p-1 hover:bg-gray-100"><Edit2 size={12} /></button>
                            <button onClick={() => deleteTab(tab)} className="rounded p-1 text-red-400 hover:bg-red-50"><Trash2 size={12} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Ações */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <select value={selectedTab} onChange={e => setSelectedTab(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500">
                <option value="">Todas as abas ativas</option>
                {tabs.map(t => <option key={t.id} value={t.id}>{t.sheetName} {t.monthReference ? `(${t.monthReference})` : ''}</option>)}
              </select>
              <button onClick={handleTest} disabled={testing} className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                {testing ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                Testar acesso
              </button>
              <button onClick={handlePreview} disabled={previewing} className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                {previewing ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />}
                Pré-visualizar
              </button>
              <button onClick={() => handleImport(true)} disabled={importing} className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50">
                {importing ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                Simular
              </button>
              <button onClick={() => handleImport(false)} disabled={importing} className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
                {importing ? <Loader2 size={12} className="animate-spin" /> : <Database size={12} />}
                Importar agora
              </button>
            </div>

            {/* Resultado do teste */}
            {testResult && (
              <div className={cn('rounded-lg border p-3 text-xs', testResult.success ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50')}>
                {testResult.success ? (
                  <>
                    <p className="font-semibold text-emerald-800 flex items-center gap-1.5"><CheckCircle2 size={13} /> {testResult.message}</p>
                    {testResult.spreadsheetTitle && <p className="mt-1 text-emerald-700">Planilha: <strong>{testResult.spreadsheetTitle}</strong> — {testResult.totalSheets ?? 0} abas disponíveis</p>}
                    {availableSheets.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {availableSheets.map(s => (
                          <span key={`${s.title}-${s.gid}`} className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700 font-mono">{s.title} ({s.gid})</span>
                        ))}
                      </div>
                    )}
                    {testResult.responseMs !== undefined && <p className="mt-1 text-emerald-600">{testResult.responseMs} ms</p>}
                  </>
                ) : (
                  <>
                    <p className="font-semibold text-red-800 flex items-center gap-1.5"><AlertCircle size={13} /> {testResult.error ?? 'Erro ao testar acesso.'}</p>
                    {testResult.errorCode && <p className="mt-1 text-red-600">Código: <code className="rounded bg-red-100 px-1 font-mono">{testResult.errorCode}</code></p>}
                  </>
                )}
              </div>
            )}

            {/* Preview */}
            {previewData && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
                <p className="text-xs font-semibold text-gray-700">Pré-visualização — {previewData.tab.sheetName}</p>
                <div className="overflow-x-auto">
                  <table className="text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-gray-200">
                        {previewColumnDefs.map(c => (
                          <th key={c.field} className="px-2 py-1 text-left text-gray-500 font-medium whitespace-nowrap">
                            {c.label}<br/><span className="font-normal text-gray-400">{c.headerValue}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.length === 0 ? (
                        <tr>
                          <td colSpan={Math.max(previewColumnDefs.length, 1)} className="px-2 py-3 text-center text-gray-400">
                            Nenhuma linha encontrada para pré-visualização.
                          </td>
                        </tr>
                      ) : (
                        previewRows.map((row, i) => (
                          <tr key={i} className="border-b border-gray-100 hover:bg-white">
                            {previewColumnDefs.map(c => (
                              <td key={c.field} className="px-2 py-1 text-gray-700 whitespace-nowrap max-w-[160px] truncate">{row[c.field] || '—'}</td>
                            ))}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Resultado da importação */}
            {importResult && (
              <div className={cn('rounded-lg border p-3 text-xs space-y-1.5', importResult.success ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50')}>
                <p className={cn('font-semibold flex items-center gap-1.5', importResult.success ? 'text-emerald-800' : 'text-red-800')}>
                  {importResult.success ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                  {importResult.dryRun ? '[SIMULAÇÃO] ' : ''}{importResult.message}
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    ['Linhas lidas', importResult.totalRows ?? 0],
                    ['Novos', importResult.newRecords ?? 0],
                    ['Atualizados', importResult.updatedRecords ?? 0],
                    ['Com erro', importResult.errorRows ?? 0],
                  ].map(([l, v]) => (
                    <div key={String(l)} className="rounded bg-white/60 p-1.5 text-center">
                      <p className="text-lg font-bold text-gray-800">{v}</p>
                      <p className="text-gray-500">{l}</p>
                    </div>
                  ))}
                </div>
                {importSheetsNotFound.length > 0 && (
                  <p className="text-amber-700">Abas não encontradas: {importSheetsNotFound.join(', ')}</p>
                )}
                {importErrors.length > 0 && (
                  <div>
                    <p className="font-medium text-red-700">Erros ({importErrors.length}):</p>
                    <ul className="mt-1 space-y-0.5 text-red-600">
                      {importErrors.slice(0, 5).map((e, i) => <li key={i}>• {e}</li>)}
                    </ul>
                  </div>
                )}
                <p className="text-gray-400">Duração: {importResult.durationMs ?? 0} ms</p>
              </div>
            )}
          </div>

          {/* ── Converter em Negociações ───────────────────────────────────── */}
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/40">
            {/* Cabeçalho colapsável */}
            <button
              type="button"
              onClick={() => {
                const next = !showDealSection
                setShowDealSection(next)
                if (next && !rowStats) loadRowStats()
              }}
              className="w-full flex items-center justify-between px-4 py-3 text-left"
            >
              <div className="flex items-center gap-2">
                <ArrowRightLeft size={15} className="text-indigo-600" />
                <span className="text-sm font-semibold text-indigo-800">Converter em Negociações</span>
                {rowStats && rowStats.pending > 0 && (
                  <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white">
                    {rowStats.pending} pendentes
                  </span>
                )}
              </div>
              <ChevronDown size={14} className={cn('text-indigo-500 transition-transform', showDealSection && 'rotate-180')} />
            </button>

            {showDealSection && (
              <div className="border-t border-indigo-200 px-4 pb-5 pt-4 space-y-4">
                <p className="text-xs text-indigo-700/80 leading-relaxed">
                  Processa as linhas já importadas da planilha e as converte em{' '}
                  <strong>Negociações oficiais</strong> do AutoDrive — criando automaticamente
                  Cliente, Veículo, Contrato e Pendências vinculadas.
                  Vendedores não localizados são vinculados provisoriamente com pendência de revisão.
                </p>

                {/* Stats */}
                {rowStatsLoading ? (
                  <div className="flex items-center gap-2 text-xs text-indigo-600">
                    <Loader2 size={13} className="animate-spin" /> Carregando estatísticas…
                  </div>
                ) : rowStats ? (
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                    {[
                      { label: 'Total',       value: rowStats.total,         color: 'text-gray-700  bg-white          border border-gray-200' },
                      { label: 'Pendentes',   value: rowStats.pending,       color: 'text-indigo-700 bg-indigo-50    border border-indigo-200' },
                      { label: 'Criadas',     value: rowStats.dealCreated,   color: 'text-emerald-700 bg-emerald-50  border border-emerald-200' },
                      { label: 'Atualizadas', value: rowStats.dealUpdated,   color: 'text-blue-700   bg-blue-50      border border-blue-200' },
                      { label: 'Revisão',     value: rowStats.waitingReview, color: 'text-amber-700  bg-amber-50     border border-amber-200' },
                      { label: 'Ignoradas',   value: rowStats.ignored,       color: 'text-gray-500   bg-gray-50      border border-gray-200' },
                      { label: 'Erros',       value: rowStats.error,         color: 'text-red-700    bg-red-50       border border-red-200' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className={cn('rounded-lg p-2 text-center', color)}>
                        <p className="text-base font-bold">{value}</p>
                        <p className="text-[10px] font-medium">{label}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-indigo-500 italic">Nenhuma linha importada ainda. Execute a importação da planilha primeiro.</p>
                )}

                {rowStats?.lastProcessedAt && (
                  <p className="text-[11px] text-indigo-500">
                    Último processamento: {formatNullableDateTime(rowStats.lastProcessedAt)}
                  </p>
                )}

                {/* Alertas de revisão */}
                {(rowStats?.waitingReview ?? 0) > 0 && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <UserX size={13} className="mt-0.5 shrink-0 text-amber-600" />
                    <span>
                      <strong>{rowStats!.waitingReview} negociações</strong> com vendedor não localizado
                      — acesse as pendências para corrigir manualmente.
                    </span>
                  </div>
                )}

                {/* Botões de ação */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={processing}
                    onClick={() => handleProcessDeals(true)}
                    className="flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-white px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                  >
                    {processing ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                    Simular conversão
                  </button>
                  <button
                    type="button"
                    disabled={processing || (rowStats?.pending === 0 && !rowStats)}
                    onClick={() => handleProcessDeals(false)}
                    className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {processing ? <Loader2 size={12} className="animate-spin" /> : <ArrowRightLeft size={12} />}
                    Processar como Negociações
                  </button>
                  {(rowStats?.error ?? 0) > 0 && (
                    <button
                      type="button"
                      disabled={processing}
                      onClick={() => handleProcessDeals(false, true)}
                      title="Reprocessar linhas com erro"
                      className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                    >
                      <RotateCcw size={12} />
                      Reprocessar erros ({rowStats!.error})
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={rowStatsLoading}
                    onClick={loadRowStats}
                    className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-2 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <RefreshCw size={11} className={rowStatsLoading ? 'animate-spin' : ''} />
                    Atualizar
                  </button>
                </div>

                {/* Resultado do processamento */}
                {processResult && (
                  <div className={cn(
                    'rounded-lg border p-3 text-xs space-y-2',
                    processResult.success ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50',
                  )}>
                    <p className={cn('font-semibold flex items-center gap-1.5', processResult.success ? 'text-emerald-800' : 'text-red-800')}>
                      {processResult.success ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                      {processResult.dryRun ? '[SIMULAÇÃO] ' : ''}{processResult.message}
                    </p>

                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                      {[
                        ['Linhas',       processResult.totalRows],
                        ['Criadas',      processResult.dealsCreated],
                        ['Atualizadas',  processResult.dealsUpdated],
                        ['Provisórios',  processResult.provisionalSellers],
                        ['Pendências',   processResult.pendenciesCreated],
                        ['Erros',        processResult.errors],
                      ].map(([l, v]) => (
                        <div key={String(l)} className="rounded bg-white/60 p-1.5 text-center">
                          <p className="text-base font-bold text-gray-800">{v}</p>
                          <p className="text-gray-500">{l}</p>
                        </div>
                      ))}
                    </div>

                    {processResult.provisionalSellers > 0 && (
                      <div className="flex items-center gap-1.5 text-amber-700">
                        <BadgeAlert size={12} />
                        <span>{processResult.provisionalSellers} negociações com vendedor vinculado provisoriamente — verifique as pendências de revisão.</span>
                      </div>
                    )}

                    {processErrorDetails.length > 0 && (
                      <div>
                        <p className="font-medium text-red-700">Erros encontrados:</p>
                        <ul className="mt-1 space-y-0.5 text-red-600">
                          {processErrorDetails.slice(0, 5).map((e, i) => <li key={i}>• {e}</li>)}
                          {processErrorDetails.length > 5 && (
                            <li className="text-gray-500">… e mais {processErrorDetails.length - 5}</li>
                          )}
                        </ul>
                      </div>
                    )}

                    <p className="text-gray-400">Duração: {processResult.durationMs} ms</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Atualizador automático */}
          <AutoSyncCard
            configId={config.id}
            tabs={tabs}
            initialConfig={autoSyncCfg}
            onConfigChange={setAutoSyncCfg}
          />
        </div>
      )}

      {/* Modais */}
      {editImporter && (
        <ImporterModal
          initial={config}
          onClose={() => setEditImporter(false)}
          onSaved={() => { setEditImporter(false); onRefresh() }}
        />
      )}
      {addTabModal && (
        <TabModal
          configId={config.id}
          onClose={() => setAddTabModal(false)}
          onSaved={() => { setAddTabModal(false); onRefresh() }}
        />
      )}
      {editTab && (
        <TabModal
          configId={config.id}
          initial={editTab}
          onClose={() => setEditTab(null)}
          onSaved={() => { setEditTab(null); onRefresh() }}
        />
      )}
      {showConfigModal && (
        <PlanilhaConfigModal
          configId={config.id}
          initialData={{
            name:          config.name,
            spreadsheetId: config.spreadsheetId,
            description:   config.description ?? null,
            active:        config.active,
            tabs: asArray<SheetTab>(config.tabs).map(t => ({
              id:            t.id,
              sheetName:     t.sheetName,
              internalName:  t.internalName,
              gid:           t.gid,
              monthReference: t.monthReference,
              tabType:       'PERSONALIZADO',
              sortOrder:     t.sortOrder,
              active:        t.active,
              headerRow:     t.headerRow,
            })),
            autoSync: config.autoSync ? {
              enabled:             config.autoSync.enabled,
              mode:                config.autoSync.mode,
              frequencyMinutes:    config.autoSync.frequencyMinutes,
              allowedDays:         config.autoSync.allowedDays,
              startTime:           config.autoSync.startTime,
              endTime:             config.autoSync.endTime,
              actionAfterDownload: config.autoSync.actionAfterDownload,
              processDeals:        (config.autoSync as AutoSyncConfig).processDeals ?? false,
              notifyOnNewRecords:  config.autoSync.notifyOnNewRecords,
              notifyOnError:       config.autoSync.notifyOnError,
              errorNotifyTarget:   config.autoSync.errorNotifyTarget,
              maxRowsPerRun:       config.autoSync.maxRowsPerRun,
              timeoutSeconds:      config.autoSync.timeoutSeconds,
            } : null,
          }}
          onClose={() => setShowConfigModal(false)}
          onSaved={() => { setShowConfigModal(false); onRefresh() }}
        />
      )}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function SheetsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [configs, setConfigs] = useState<ImporterConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role !== 'MASTER') {
      router.replace('/inicio')
    }
  }, [session, status, router])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/master/sheets')
      const data = await res.json()
      const safeConfigs = asArray<ImporterConfig>(data.data).map(cfg => ({
        ...cfg,
        tabs: asArray<SheetTab>(cfg.tabs),
        importJobs: asArray<ImportJob>(cfg.importJobs),
      }))
      setConfigs(safeConfigs)
    } catch {
      setConfigs([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (status === 'loading' || loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600">
            <FileSpreadsheet size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Importador Google Sheets</h1>
            <p className="text-xs text-gray-400">Configure planilhas, abas, mapeamento de colunas e execute importações</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50">
            <RefreshCw size={12} /> Atualizar
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            <Plus size={14} /> Novo importador
          </button>
        </div>
      </div>

      {/* Credenciais Google Sheets */}
      <SheetCredentialsSettings />

      {/* Lista de importadores */}
      {configs.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-gray-200 text-gray-400">
          <FileSpreadsheet size={32} strokeWidth={1} />
          <p className="text-sm">Nenhum importador configurado</p>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            <Plus size={13} /> Criar primeiro importador
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {configs.map(cfg => (
            <ImporterCard key={cfg.id} config={cfg} onRefresh={load} />
          ))}
        </div>
      )}

      {showCreate && (
        <ImporterModal
          onClose={() => setShowCreate(false)}
          onSaved={cfg => {
            setShowCreate(false)
            setConfigs(p => [
              {
                ...cfg,
                tabs: asArray<SheetTab>(cfg.tabs),
                importJobs: asArray<ImportJob>(cfg.importJobs),
              },
              ...p,
            ])
          }}
        />
      )}
    </div>
  )
}
