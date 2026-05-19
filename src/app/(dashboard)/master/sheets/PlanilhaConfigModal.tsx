'use client'

// =============================================================================
// PlanilhaConfigModal — Configuração completa do importador Google Sheets
//
// 4 seções internas com navegação por abas:
//   1. Planilha — ID, nome, descrição, teste de conexão
//   2. Abas     — auto-descoberta + gerenciamento de abas da planilha
//   3. Mapeamento — mapeamento de colunas por aba
//   4. Automação  — configuração do sincronizador automático
//
// Um único botão "Salvar tudo" grava todas as seções de uma vez via
// POST /api/master/sheets/[id]/configure
// =============================================================================

import { useState, useCallback } from 'react'
import {
  X, Save, Loader2, CheckCircle2, AlertCircle, RefreshCw, Search,
  Plus, Trash2, ChevronDown, ChevronRight, Eye, Zap,
  Play, Settings2, Table2, GitMerge, Bot, Info,
  ToggleLeft, ToggleRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface ColumnMapDraft {
  columnLetter: string    // "A", "B", "C" ou índice numérico como string
  columnHeader: string    // nome do cabeçalho descoberto na planilha
  fieldName:    string    // campo do sistema para mapeamento
  fieldLabel:   string
  required:     boolean
  active:       boolean
}

export interface TabDraft {
  _key:          string   // chave local única (não é o ID do banco)
  id?:           string   // ID do banco (presente se já salvo)
  sheetName:     string   // nome exato da aba no Google Sheets
  internalName:  string   // nome amigável no sistema
  gid:           string   // GID numérico da aba
  monthReference: string
  tabType:       string
  sortOrder:     number
  active:        boolean
  headerRow:     number
  columnMaps:    ColumnMapDraft[]
  // estado de UI
  _discovered:   boolean  // veio da auto-descoberta
  _previewHeaders: string[]
  _previewLoading: boolean
}

export interface AutoSyncDraft {
  enabled:             boolean
  mode:                'SIMULATION' | 'REAL'
  frequencyMinutes:    number
  allowedDays:         number[]
  startTime:           string
  endTime:             string
  actionAfterDownload: string
  notifyOnNewRecords:  boolean
  notifyOnError:       boolean
  errorNotifyTarget:   string
  maxRowsPerRun:       number
  timeoutSeconds:      number
}

export interface PlanilhaDraft {
  name:             string
  spreadsheetId:    string
  description:      string
  active:           boolean
  availableSheets?: string[]
}

interface PlanilhaConfigModalProps {
  configId:    string
  initialData: {
    name:          string
    spreadsheetId: string
    description:   string | null
    active:        boolean
    tabs: {
      id:            string
      sheetName:     string
      internalName:  string
      gid:           string | null
      monthReference: string | null
      tabType:       string
      sortOrder:     number | null
      active:        boolean
      headerRow:     number
      columnMaps?:   ColumnMapDraft[]
    }[]
    availableSheets?:    string[]
    autoSync?: {
      enabled:             boolean
      mode:                string
      frequencyMinutes:    number
      allowedDays:         number[]
      startTime:           string
      endTime:             string
      actionAfterDownload: string
      processDeals?:       boolean
      notifyOnNewRecords:  boolean
      notifyOnError:       boolean
      errorNotifyTarget:   string | null
      maxRowsPerRun:       number
      timeoutSeconds:      number
    } | null
  }
  onClose:  () => void
  onSaved:  () => void
}

// ── Constantes ─────────────────────────────────────────────────────────────────

const inp = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const lbl = 'text-xs font-medium text-gray-600 block mb-1'

const TAB_TYPES: { value: string; label: string }[] = [
  { value: 'VENDAS',        label: 'Vendas' },
  { value: 'TROCAS',        label: 'Trocas' },
  { value: 'CLIENTES',      label: 'Clientes' },
  { value: 'VEICULOS',      label: 'Veículos / Estoque' },
  { value: 'CONTRATOS',     label: 'Contratos' },
  { value: 'COMISSOES',     label: 'Comissões' },
  { value: 'GARANTIAS',     label: 'Garantias' },
  { value: 'RETORNOS',      label: 'Retornos' },
  { value: 'PENDENCIAS',    label: 'Pendências' },
  { value: 'VENDEDORES',    label: 'Vendedores' },
  { value: 'GERENTES',      label: 'Gerentes' },
  { value: 'CONFIGURACOES', label: 'Configurações' },
  { value: 'PERSONALIZADO', label: 'Personalizado' },
]

const SYSTEM_FIELDS: { value: string; label: string; category: string }[] = [
  // Venda
  { value: 'data_venda',       label: 'Data da Venda',       category: 'Venda' },
  { value: 'numero_contrato',  label: 'Nº Contrato',         category: 'Venda' },
  { value: 'status',           label: 'Status',              category: 'Venda' },
  { value: 'forma_pagamento',  label: 'Forma de Pagamento',  category: 'Venda' },
  { value: 'valor_venda',      label: 'Valor de Venda',      category: 'Venda' },
  { value: 'valor_entrada',    label: 'Valor de Entrada',    category: 'Venda' },
  { value: 'valor_financiado', label: 'Valor Financiado',    category: 'Venda' },
  { value: 'banco_financiado', label: 'Banco Financiador',   category: 'Venda' },
  { value: 'observacoes',      label: 'Observações',         category: 'Venda' },
  // Cliente
  { value: 'cliente',          label: 'Nome do Cliente',     category: 'Cliente' },
  { value: 'cpf_cliente',      label: 'CPF do Cliente',      category: 'Cliente' },
  { value: 'telefone_cliente', label: 'Telefone',            category: 'Cliente' },
  { value: 'email_cliente',    label: 'E-mail',              category: 'Cliente' },
  { value: 'cidade_cliente',   label: 'Cidade',              category: 'Cliente' },
  // Veículo
  { value: 'placa',            label: 'Placa',               category: 'Veículo' },
  { value: 'modelo',           label: 'Modelo',              category: 'Veículo' },
  { value: 'marca',            label: 'Marca',               category: 'Veículo' },
  { value: 'ano_fabricacao',   label: 'Ano Fabricação',      category: 'Veículo' },
  { value: 'ano_modelo',       label: 'Ano Modelo',          category: 'Veículo' },
  { value: 'cor',              label: 'Cor',                 category: 'Veículo' },
  { value: 'combustivel',      label: 'Combustível',         category: 'Veículo' },
  { value: 'km',               label: 'Quilometragem',       category: 'Veículo' },
  { value: 'chassi',           label: 'Chassi',              category: 'Veículo' },
  { value: 'renavam',          label: 'Renavam',             category: 'Veículo' },
  { value: 'valor_compra',     label: 'Valor de Compra',     category: 'Veículo' },
  { value: 'data_entrada',     label: 'Data de Entrada',     category: 'Veículo' },
  // Equipe
  { value: 'vendedor',         label: 'Vendedor',            category: 'Equipe' },
  { value: 'gerente',          label: 'Gerente',             category: 'Equipe' },
  { value: 'unidade',          label: 'Unidade / Loja',      category: 'Equipe' },
  // Comissão
  { value: 'valor_comissao',   label: 'Valor Comissão',      category: 'Comissão' },
  { value: 'pct_comissao',     label: '% Comissão',          category: 'Comissão' },
  { value: 'status_comissao',  label: 'Status Comissão',     category: 'Comissão' },
  { value: 'data_comissao',    label: 'Data Comissão',       category: 'Comissão' },
  // Outros
  { value: 'mes_referencia',   label: 'Mês Referência',      category: 'Outros' },
  { value: 'ignorar',          label: '— Ignorar coluna —',  category: 'Outros' },
]

const FREQ_OPTIONS = [
  { label: '5 min',   value: 5   },
  { label: '10 min',  value: 10  },
  { label: '15 min',  value: 15  },
  { label: '30 min',  value: 30  },
  { label: '1 hora',  value: 60  },
  { label: '2 horas', value: 120 },
  { label: 'Custom',  value: 0   },
]

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const ACTION_OPTS: { value: string; label: string }[] = [
  { value: 'APENAS_BAIXAR',                label: 'Apenas baixar e validar' },
  { value: 'IMPORTAR_PENDENCIAS',          label: 'Importar novas pendências' },
  { value: 'IMPORTAR_E_ALERTAR',           label: 'Importar e criar alertas internos' },
  { value: 'IMPORTAR_E_NOTIFICAR_GERENTE', label: 'Importar e notificar gerente' },
  { value: 'IMPORTAR_E_NOTIFICAR_TODOS',   label: 'Importar e notificar todos' },
]

// ── Helpers ────────────────────────────────────────────────────────────────────

function Alert({ type, msg }: { type: 'error' | 'success' | 'warning'; msg: string }) {
  const cls = type === 'error'   ? 'border-red-200 bg-red-50 text-red-700' :
              type === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-700' :
                                   'border-emerald-200 bg-emerald-50 text-emerald-700'
  const Icon = type === 'error' || type === 'warning' ? AlertCircle : CheckCircle2
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm flex items-start gap-2 ${cls}`}>
      <Icon size={15} className="mt-0.5 shrink-0" />
      <span>{msg}</span>
    </div>
  )
}

function makeKey() { return Math.random().toString(36).slice(2, 9) }

function buildInitialTabs(raw: PlanilhaConfigModalProps['initialData']['tabs']): TabDraft[] {
  return raw.map((t, i) => ({
    _key:           makeKey(),
    id:             t.id,
    sheetName:      t.sheetName,
    internalName:   t.internalName,
    gid:            t.gid ?? '',
    monthReference: t.monthReference ?? '',
    tabType:        t.tabType ?? 'PERSONALIZADO',
    sortOrder:      t.sortOrder ?? i,
    active:         t.active,
    headerRow:      t.headerRow,
    columnMaps:     (t.columnMaps ?? []).map(m => ({ ...m })),
    _discovered:    false,
    _previewHeaders: [],
    _previewLoading: false,
  }))
}

function buildInitialAutoSync(raw: PlanilhaConfigModalProps['initialData']['autoSync']): AutoSyncDraft {
  return {
    enabled:             raw?.enabled             ?? false,
    mode:                (raw?.mode as 'SIMULATION' | 'REAL') ?? 'SIMULATION',
    frequencyMinutes:    raw?.frequencyMinutes     ?? 30,
    allowedDays:         raw?.allowedDays          ?? [1, 2, 3, 4, 5],
    startTime:           raw?.startTime            ?? '08:00',
    endTime:             raw?.endTime              ?? '18:00',
    actionAfterDownload: raw?.actionAfterDownload  ?? 'IMPORTAR_PENDENCIAS',
    notifyOnNewRecords:  raw?.notifyOnNewRecords   ?? false,
    notifyOnError:       raw?.notifyOnError        ?? true,
    errorNotifyTarget:   raw?.errorNotifyTarget    ?? '',
    maxRowsPerRun:       raw?.maxRowsPerRun        ?? 500,
    timeoutSeconds:      raw?.timeoutSeconds       ?? 120,
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═════════════════════════════════════════════════════════════════════════════

export default function PlanilhaConfigModal({
  configId,
  initialData,
  onClose,
  onSaved,
}: PlanilhaConfigModalProps) {
  type ModalTab = 'planilha' | 'abas' | 'mapeamento' | 'automacao'

  const [activeTab, setActiveTab] = useState<ModalTab>('planilha')
  const [saving,    setSaving]    = useState(false)
  const [globalErr, setGlobalErr] = useState('')
  const [globalOk,  setGlobalOk]  = useState('')

  // Estado de cada seção
  const [planilha, setPlanilha] = useState<PlanilhaDraft>({
    name:          initialData.name,
    spreadsheetId: initialData.spreadsheetId,
    description:   initialData.description ?? '',
    active:        initialData.active,
  })

  const [tabs, setTabs] = useState<TabDraft[]>(() => buildInitialTabs(initialData.tabs))
  const [tabsToDelete, setTabsToDelete] = useState<string[]>([])

  const [autoSync, setAutoSync] = useState<AutoSyncDraft>(() => buildInitialAutoSync(initialData.autoSync ?? null))

  // Estado da seção "Planilha"
  const [testing,    setTesting]    = useState(false)
  const [testResult, setTestResult] = useState<{
    success: boolean; message?: string; error?: string; errorCode?: string
    spreadsheetTitle?: string; totalSheets?: number
    availableSheets?: { title: string; gid: string }[]
  } | null>(null)

  // ── Seção Planilha — teste de acesso ─────────────────────────────────────────

  async function handleTest() {
    if (!planilha.spreadsheetId.trim()) return
    setTesting(true)
    setTestResult(null)
    try {
      const res  = await fetch(`/api/master/sheets/${configId}/test`, { method: 'POST' })
      setTestResult(await res.json())
    } catch {
      setTestResult({ success: false, error: 'Erro de rede ao testar acesso.' })
    } finally {
      setTesting(false)
    }
  }

  // ── Seção Abas — auto-descoberta ─────────────────────────────────────────────

  const [discovering, setDiscovering] = useState(false)
  const [discoverErr, setDiscoverErr] = useState('')

  async function handleDiscover() {
    setDiscovering(true)
    setDiscoverErr('')
    try {
      const res  = await fetch(`/api/master/sheets/${configId}/test`, { method: 'POST' })
      const data = await res.json()

      if (!data.success) {
        setDiscoverErr(data.error ?? 'Falha ao conectar ao Google Sheets.')
        return
      }

      const discovered: { title: string; gid: string }[] = data.availableSheets ?? []

      setTabs(prev => {
        const existing = new Map(prev.map(t => [t.gid, t]))

        const merged: TabDraft[] = discovered.map((s, i) => {
          const ex = existing.get(s.gid) ?? existing.get('')
          if (ex && ex.sheetName === s.title) {
            // já existe, apenas marca como descoberta
            return { ...ex, _discovered: true, gid: s.gid }
          }
          return {
            _key:           makeKey(),
            id:             undefined,
            sheetName:      s.title,
            internalName:   s.title,
            gid:            s.gid,
            monthReference: '',
            tabType:        'PERSONALIZADO',
            sortOrder:      i,
            active:         false,
            headerRow:      1,
            columnMaps:     [],
            _discovered:    true,
            _previewHeaders: [],
            _previewLoading: false,
          }
        })

        // Adiciona abas existentes que não apareceram na descoberta
        for (const ex of prev) {
          if (!merged.find(m => m._key === ex._key)) {
            merged.push({ ...ex, _discovered: false })
          }
        }

        return merged
      })
    } finally {
      setDiscovering(false)
    }
  }

  // ── Seção Mapeamento — preview de headers ────────────────────────────────────

  const loadPreview = useCallback(async (tabKey: string, tabId?: string) => {
    if (!tabId) return

    setTabs(prev => prev.map(t =>
      t._key === tabKey ? { ...t, _previewLoading: true } : t
    ))

    try {
      const res  = await fetch(`/api/master/sheets/${configId}/preview`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tabId, limit: 3 }),
      })
      const data = await res.json()

      if (data.success && Array.isArray(data.headers)) {
        setTabs(prev => prev.map(t => {
          if (t._key !== tabKey) return t

          // Auto-cria mapeamentos para headers não mapeados
          const existingFields = new Set(t.columnMaps.map(m => m.columnHeader))
          const newMaps: ColumnMapDraft[] = data.headers
            .filter((h: string) => h && !existingFields.has(h))
            .map((h: string, i: number) => {
              const letter = String.fromCharCode(65 + (t.columnMaps.length + i))
              // Heurística: tenta adivinhar o campo pelo nome do header
              const guessed = guessField(h)
              return {
                columnLetter: letter,
                columnHeader: h,
                fieldName:    guessed,
                fieldLabel:   SYSTEM_FIELDS.find(f => f.value === guessed)?.label ?? h,
                required:     false,
                active:       true,
              }
            })

          return {
            ...t,
            _previewHeaders: data.headers,
            _previewLoading: false,
            columnMaps: [...t.columnMaps, ...newMaps],
          }
        }))
      } else {
        setTabs(prev => prev.map(t =>
          t._key === tabKey ? { ...t, _previewLoading: false } : t
        ))
      }
    } catch {
      setTabs(prev => prev.map(t =>
        t._key === tabKey ? { ...t, _previewLoading: false } : t
      ))
    }
  }, [configId])

  // ── Salvar tudo ──────────────────────────────────────────────────────────────

  async function handleSaveAll() {
    setGlobalErr('')
    setGlobalOk('')

    if (!planilha.name.trim()) { setGlobalErr('Nome do importador é obrigatório.'); setActiveTab('planilha'); return }
    if (!planilha.spreadsheetId.trim()) { setGlobalErr('Spreadsheet ID é obrigatório.'); setActiveTab('planilha'); return }

    setSaving(true)
    try {
      // 1. Atualiza config básica
      const patchRes = await fetch(`/api/master/sheets/${configId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name:          planilha.name,
          spreadsheetId: planilha.spreadsheetId,
          description:   planilha.description || null,
          active:        planilha.active,
        }),
      })
      if (!patchRes.ok) {
        const d = await patchRes.json()
        throw new Error(d.error ?? 'Erro ao salvar configuração básica.')
      }

      // 2. Salva abas + mapeamentos + auto-sync via /configure
      const cfgRes = await fetch(`/api/master/sheets/${configId}/configure`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          tabsToDelete,
          tabs: tabs.map((t, i) => ({
            id:            t.id,
            sheetName:     t.sheetName,
            internalName:  t.internalName || t.sheetName,
            gid:           t.gid || null,
            monthReference: t.monthReference || null,
            tabType:       t.tabType,
            sortOrder:     t.sortOrder ?? i,
            active:        t.active,
            headerRow:     t.headerRow,
            columnMaps:    t.columnMaps
              .filter(m => m.active && m.fieldName && m.fieldName !== 'ignorar')
              .map(m => ({
                columnLetter: m.columnLetter,
                columnHeader: m.columnHeader,
                fieldName:    m.fieldName,
                fieldLabel:   m.fieldLabel,
                required:     m.required,
                active:       m.active,
              })),
          })),
          autoSync: {
            enabled:             autoSync.enabled,
            mode:                autoSync.mode,
            frequencyMinutes:    autoSync.frequencyMinutes,
            allowedDays:         autoSync.allowedDays,
            startTime:           autoSync.startTime,
            endTime:             autoSync.endTime,
            actionAfterDownload: autoSync.actionAfterDownload,
            notifyOnNewRecords:  autoSync.notifyOnNewRecords,
            notifyOnError:       autoSync.notifyOnError,
            errorNotifyTarget:   autoSync.errorNotifyTarget || null,
            maxRowsPerRun:       autoSync.maxRowsPerRun,
            timeoutSeconds:      autoSync.timeoutSeconds,
          },
        }),
      })

      if (!cfgRes.ok) {
        const d = await cfgRes.json()
        throw new Error(d.error ?? 'Erro ao salvar configuração completa.')
      }

      setGlobalOk('Todas as configurações salvas com sucesso!')
      setTabsToDelete([])

      // Recarrega dados atualizados no estado
      const { data } = await cfgRes.json().catch(() => ({ data: null }))
      if (data?.tabs) {
        setTabs(buildInitialTabs(data.tabs))
      }

      setTimeout(() => { onSaved() }, 800)
    } catch (err: unknown) {
      setGlobalErr(err instanceof Error ? err.message : 'Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const MODAL_TABS: { id: ModalTab; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: 'planilha',  label: 'Planilha',   icon: Settings2  },
    { id: 'abas',      label: 'Abas',       icon: Table2,    badge: tabs.length },
    { id: 'mapeamento',label: 'Mapeamento', icon: GitMerge                     },
    { id: 'automacao', label: 'Automação',  icon: Bot                          },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b px-6 py-4 shrink-0">
          <div>
            <h2 className="font-semibold text-gray-900 text-lg">Configurar Planilha</h2>
            <p className="text-xs text-gray-400 mt-0.5">{planilha.name || 'Novo importador'}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-gray-100"><X size={16} /></button>
        </div>

        {/* ── Tab bar ────────────────────────────────────────────────────── */}
        <div className="flex border-b bg-gray-50 shrink-0">
          {MODAL_TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={cn(
                'flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors -mb-px',
                activeTab === t.id
                  ? 'border-brand-600 text-brand-700 bg-white'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-white/60',
              )}
            >
              <t.icon size={14} />
              {t.label}
              {t.badge !== undefined && t.badge > 0 && (
                <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold text-brand-700">
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Corpo scrollável ───────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {globalErr && <Alert type="error"   msg={globalErr} />}
          {globalOk  && <Alert type="success" msg={globalOk}  />}

          {activeTab === 'planilha'   && (
            <PlanilhaSection
              value={planilha}
              onChange={setPlanilha}
              configId={configId}
              testing={testing}
              testResult={testResult}
              onTest={handleTest}
            />
          )}

          {activeTab === 'abas' && (
            <AbasSection
              tabs={tabs}
              onChange={setTabs}
              onDelete={(tab) => {
                if (tab.id) setTabsToDelete(p => [...p, tab.id!])
                setTabs(p => p.filter(t => t._key !== tab._key))
              }}
              discovering={discovering}
              discoverErr={discoverErr}
              onDiscover={handleDiscover}
            />
          )}

          {activeTab === 'mapeamento' && (
            <MapeamentoSection
              tabs={tabs.filter(t => t.active)}
              onChange={setTabs}
              configId={configId}
              onLoadPreview={loadPreview}
            />
          )}

          {activeTab === 'automacao' && (
            <AutomacaoSection
              value={autoSync}
              onChange={setAutoSync}
              tabs={tabs.filter(t => t.active)}
            />
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="shrink-0 border-t px-6 py-4 flex items-center justify-between gap-3 bg-gray-50 rounded-b-2xl">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Info size={13} />
            <span>Todas as seções são salvas juntas ao clicar em "Salvar tudo".</span>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm text-gray-600 hover:bg-gray-100">
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? 'Salvando...' : 'Salvar tudo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// Seção 1: Planilha
// ═════════════════════════════════════════════════════════════════════════════

function PlanilhaSection({
  value, onChange, configId, testing, testResult, onTest,
}: {
  value:      PlanilhaDraft
  onChange:   (v: PlanilhaDraft) => void
  configId:   string
  testing:    boolean
  testResult: {
    success: boolean; message?: string; error?: string; errorCode?: string
    spreadsheetTitle?: string; totalSheets?: number
    availableSheets?: { title: string; gid: string }[]
  } | null
  onTest: () => void
}) {
  function set<K extends keyof PlanilhaDraft>(k: K, v: PlanilhaDraft[K]) {
    onChange({ ...value, [k]: v })
  }

  const available = value.availableSheets ?? testResult?.availableSheets ?? []

  return (
    <div className="space-y-5">
      {/* Identificação */}
      <div className="rounded-xl border border-gray-200 p-5 space-y-4">
        <p className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <Settings2 size={15} className="text-brand-600" /> Identificação
        </p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={lbl}>Nome do importador *</label>
            <input className={inp} value={value.name} onChange={e => set('name', e.target.value)}
              placeholder="Painel Master — EasyCar" />
          </div>
          <div className="flex flex-col justify-end pb-0.5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-brand-600"
                checked={value.active} onChange={e => set('active', e.target.checked)} />
              <span className="text-sm text-gray-700">Importador ativo</span>
            </label>
          </div>
        </div>

        <div>
          <label className={lbl}>Descrição</label>
          <input className={inp} value={value.description} onChange={e => set('description', e.target.value)}
            placeholder="Planilha principal de controle de vendas e comissões" />
        </div>
      </div>

      {/* Planilha Google */}
      <div className="rounded-xl border border-gray-200 p-5 space-y-4">
        <p className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <Eye size={15} className="text-emerald-600" /> Planilha Google Sheets
        </p>

        <div>
          <label className={lbl}>
            Spreadsheet ID *
            <span className="ml-1 font-normal text-gray-400">(da URL da planilha)</span>
          </label>
          <div className="flex gap-2">
            <input
              className={`${inp} font-mono flex-1`}
              value={value.spreadsheetId}
              onChange={e => set('spreadsheetId', e.target.value)}
              placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
            />
            <button
              type="button"
              onClick={onTest}
              disabled={testing || !value.spreadsheetId.trim()}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap"
            >
              {testing ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
              Testar conexão
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            Encontrado na URL: docs.google.com/spreadsheets/d/<strong>[ID]</strong>/edit
          </p>
        </div>

        {/* Resultado do teste */}
        {testResult && (
          <div className={cn('rounded-lg border p-4 space-y-2 text-sm', testResult.success
            ? 'border-emerald-200 bg-emerald-50'
            : 'border-red-200 bg-red-50',
          )}>
            {testResult.success ? (
              <>
                <p className="font-semibold text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 size={15} /> Conexão estabelecida com sucesso!
                </p>
                {testResult.spreadsheetTitle && (
                  <p className="text-emerald-700">
                    Planilha: <strong>{testResult.spreadsheetTitle}</strong> — {testResult.totalSheets ?? 0} aba(s) disponíve{(testResult.totalSheets ?? 0) !== 1 ? 'is' : 'l'}
                  </p>
                )}
                {(testResult.availableSheets ?? []).length > 0 && (
                  <div>
                    <p className="text-xs text-emerald-600 font-medium mb-1">Abas encontradas:</p>
                    <div className="flex flex-wrap gap-1">
                      {(testResult.availableSheets ?? []).map(s => (
                        <span key={s.gid} className="rounded-full bg-emerald-100 border border-emerald-200 px-2 py-0.5 text-xs text-emerald-700 font-mono">
                          {s.title} <span className="opacity-60">gid={s.gid}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="font-semibold text-red-800 flex items-center gap-2">
                  <AlertCircle size={15} /> Falha na conexão
                </p>
                <p className="text-red-700">{testResult.error}</p>
                {testResult.errorCode && (
                  <p className="text-xs text-red-500">Código: <code className="rounded bg-red-100 px-1 font-mono">{testResult.errorCode}</code></p>
                )}
                <p className="text-xs text-red-600 mt-1">
                  Verifique se a planilha foi compartilhada com a Service Account como <strong>Leitor</strong>.
                </p>
              </>
            )}
          </div>
        )}

        {/* Dica de compartilhamento */}
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 space-y-1">
          <p className="font-semibold">⚠️ Pré-requisito: compartilhar a planilha</p>
          <p>
            Vá em <strong>Arquivo → Compartilhar</strong> e adicione o e-mail da Service Account como <strong>Leitor</strong>:
          </p>
          <code className="block mt-1 rounded bg-amber-100 px-2 py-1 text-amber-900">
            easycar@newagent-irof.iam.gserviceaccount.com
          </code>
        </div>
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// Seção 2: Abas
// ═════════════════════════════════════════════════════════════════════════════

function AbasSection({
  tabs, onChange, onDelete, discovering, discoverErr, onDiscover,
}: {
  tabs:        TabDraft[]
  onChange:    (tabs: TabDraft[]) => void
  onDelete:    (tab: TabDraft) => void
  discovering: boolean
  discoverErr: string
  onDiscover:  () => void
}) {
  const [expanded, setExpanded] = useState<string | null>(null)

  function updateTab(key: string, patch: Partial<TabDraft>) {
    onChange(tabs.map(t => t._key === key ? { ...t, ...patch } : t))
  }

  function addManual() {
    onChange([...tabs, {
      _key:           makeKey(),
      id:             undefined,
      sheetName:      '',
      internalName:   '',
      gid:            '',
      monthReference: '',
      tabType:        'PERSONALIZADO',
      sortOrder:      tabs.length,
      active:         true,
      headerRow:      1,
      columnMaps:     [],
      _discovered:    false,
      _previewHeaders: [],
      _previewLoading: false,
    }])
  }

  return (
    <div className="space-y-4">
      {/* Auto-descoberta */}
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <RefreshCw size={14} className="text-emerald-600" /> Auto-descoberta de abas
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              Conecta ao Google Sheets e lista todas as abas disponíveis automaticamente.
            </p>
          </div>
          <button
            type="button"
            onClick={onDiscover}
            disabled={discovering}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {discovering ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            {discovering ? 'Descobrindo...' : 'Descobrir abas'}
          </button>
        </div>
        {discoverErr && <Alert type="error" msg={discoverErr} />}
      </div>

      {/* Lista de abas */}
      <div className="space-y-2">
        {tabs.length === 0 && (
          <div className="flex h-24 items-center justify-center rounded-xl border-2 border-dashed border-gray-200 text-gray-400 text-sm">
            Nenhuma aba configurada. Use "Descobrir abas" ou adicione manualmente.
          </div>
        )}

        {tabs.map(tab => (
          <div
            key={tab._key}
            className={cn(
              'rounded-xl border bg-white transition-all',
              tab.active ? 'border-gray-200' : 'border-gray-100 opacity-60',
              tab._discovered && !tab.id ? 'border-emerald-200 bg-emerald-50/30' : '',
            )}
          >
            {/* Linha resumo da aba */}
            <div className="flex items-center gap-3 px-4 py-3">
              <button
                type="button"
                onClick={() => setExpanded(p => p === tab._key ? null : tab._key)}
                className="text-gray-400 hover:text-gray-600 shrink-0"
              >
                {expanded === tab._key ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              </button>

              {/* Toggle ativo */}
              <button onClick={() => updateTab(tab._key, { active: !tab.active })} className="shrink-0">
                {tab.active
                  ? <ToggleRight size={20} className="text-brand-600" />
                  : <ToggleLeft  size={20} className="text-gray-300"  />}
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-900 text-sm">
                    {tab.sheetName || <span className="text-gray-400 italic">sem nome</span>}
                  </span>
                  {tab._discovered && !tab.id && (
                    <span className="rounded-full bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 text-[10px] text-emerald-700 font-semibold">
                      descoberta
                    </span>
                  )}
                  {tab.monthReference && (
                    <span className="rounded-full bg-blue-50 border border-blue-200 px-1.5 py-0.5 text-[10px] text-blue-700">
                      {tab.monthReference}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5 flex-wrap">
                  {tab.gid && <span className="font-mono">gid={tab.gid}</span>}
                  <span>{TAB_TYPES.find(t => t.value === tab.tabType)?.label ?? tab.tabType}</span>
                  {tab.columnMaps.length > 0 && <span>{tab.columnMaps.length} coluna(s) mapeada(s)</span>}
                </div>
              </div>

              <button
                onClick={() => onDelete(tab)}
                className="rounded p-1.5 text-red-400 hover:bg-red-50 shrink-0"
              >
                <Trash2 size={13} />
              </button>
            </div>

            {/* Formulário expandido */}
            {expanded === tab._key && (
              <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>Nome da aba (exato, como no Google) *</label>
                    <input className={inp} value={tab.sheetName}
                      onChange={e => updateTab(tab._key, { sheetName: e.target.value })}
                      placeholder="Janeiro" />
                  </div>
                  <div>
                    <label className={lbl}>Nome interno (exibição no sistema)</label>
                    <input className={inp} value={tab.internalName}
                      onChange={e => updateTab(tab._key, { internalName: e.target.value })}
                      placeholder="Vendas de Janeiro" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className={lbl}>GID numérico</label>
                    <input className={`${inp} font-mono`} value={tab.gid}
                      onChange={e => updateTab(tab._key, { gid: e.target.value })}
                      placeholder="107306894" />
                    <p className="mt-0.5 text-[10px] text-gray-400">Número após ?gid= na URL</p>
                  </div>
                  <div>
                    <label className={lbl}>Mês referência</label>
                    <input className={inp} value={tab.monthReference}
                      onChange={e => updateTab(tab._key, { monthReference: e.target.value })}
                      placeholder="Janeiro" />
                  </div>
                  <div>
                    <label className={lbl}>Linha do cabeçalho</label>
                    <input type="number" min={1} className={inp} value={tab.headerRow}
                      onChange={e => updateTab(tab._key, { headerRow: Number(e.target.value) })} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>Tipo de aba</label>
                    <select className={inp} value={tab.tabType}
                      onChange={e => updateTab(tab._key, { tabType: e.target.value })}>
                      {TAB_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Ordem</label>
                    <input type="number" min={0} className={inp} value={tab.sortOrder}
                      onChange={e => updateTab(tab._key, { sortOrder: Number(e.target.value) })} />
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addManual}
        className="flex items-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-4 py-2.5 text-sm text-gray-500 hover:border-brand-400 hover:text-brand-600 w-full justify-center"
      >
        <Plus size={14} /> Adicionar aba manualmente
      </button>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// Seção 3: Mapeamento de colunas
// ═════════════════════════════════════════════════════════════════════════════

function MapeamentoSection({
  tabs, onChange, configId, onLoadPreview,
}: {
  tabs:          TabDraft[]
  onChange:      React.Dispatch<React.SetStateAction<TabDraft[]>>
  configId:      string
  onLoadPreview: (tabKey: string, tabId?: string) => Promise<void>
}) {
  const [selectedTabKey, setSelectedTabKey] = useState<string>(tabs[0]?._key ?? '')

  const currentTab = tabs.find(t => t._key === selectedTabKey)

  function updateMap(tabKey: string, index: number, patch: Partial<ColumnMapDraft>) {
    onChange(prev => prev.map(t =>
      t._key === tabKey
        ? { ...t, columnMaps: t.columnMaps.map((m, i) => i === index ? { ...m, ...patch } : m) }
        : t
    ))
  }

  function removeMap(tabKey: string, index: number) {
    onChange(prev => prev.map(t =>
      t._key === tabKey
        ? { ...t, columnMaps: t.columnMaps.filter((_, i) => i !== index) }
        : t
    ))
  }

  function addMap(tabKey: string) {
    onChange(prev => prev.map(t => {
      if (t._key !== tabKey) return t
      const letter = String.fromCharCode(65 + t.columnMaps.length)
      return {
        ...t,
        columnMaps: [...t.columnMaps, {
          columnLetter: letter,
          columnHeader: '',
          fieldName:    '',
          fieldLabel:   '',
          required:     false,
          active:       true,
        }],
      }
    }))
  }

  if (tabs.length === 0) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 text-gray-400">
        <GitMerge size={24} strokeWidth={1} />
        <p className="text-sm">Ative pelo menos uma aba na seção "Abas" para configurar o mapeamento.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Seletor de aba */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Configurando aba:</label>
        <div className="flex gap-1.5 flex-wrap">
          {tabs.map(t => (
            <button
              key={t._key}
              type="button"
              onClick={() => setSelectedTabKey(t._key)}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                selectedTabKey === t._key
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50',
              )}
            >
              {t.sheetName || 'sem nome'}
            </button>
          ))}
        </div>
      </div>

      {currentTab && (
        <div className="space-y-4">
          {/* Carregar colunas da planilha */}
          <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-700">Carregar colunas do Google Sheets</p>
              <p className="text-xs text-gray-400">Busca os cabeçalhos da planilha e sugere o mapeamento automaticamente.</p>
            </div>
            <button
              type="button"
              onClick={() => onLoadPreview(currentTab._key, currentTab.id)}
              disabled={currentTab._previewLoading || !currentTab.id}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              {currentTab._previewLoading
                ? <Loader2 size={12} className="animate-spin" />
                : <RefreshCw size={12} />}
              {currentTab._previewLoading ? 'Carregando...' : 'Carregar colunas'}
            </button>
          </div>

          {!currentTab.id && (
            <Alert type="warning" msg='Salve as abas primeiro (botão "Salvar tudo") para depois carregar as colunas do Google.' />
          )}

          {/* Tabela de mapeamento */}
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
              <p className="text-xs font-semibold text-gray-700">
                Mapeamento de colunas — {currentTab.sheetName}
              </p>
              <button
                type="button"
                onClick={() => addMap(currentTab._key)}
                className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
              >
                <Plus size={11} /> Adicionar linha
              </button>
            </div>

            {currentTab.columnMaps.length === 0 ? (
              <div className="flex h-24 items-center justify-center text-xs text-gray-400">
                Clique em "Carregar colunas" para auto-detectar ou em "Adicionar linha" para mapear manualmente.
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-gray-50/50 text-gray-500">
                    <th className="px-3 py-2 text-left font-medium w-14">Col.</th>
                    <th className="px-3 py-2 text-left font-medium">Cabeçalho no Sheets</th>
                    <th className="px-3 py-2 text-left font-medium">Campo do sistema</th>
                    <th className="px-3 py-2 text-center font-medium w-20">Obrig.</th>
                    <th className="px-3 py-2 text-center font-medium w-16">Ativo</th>
                    <th className="px-3 py-2 w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {currentTab.columnMaps.map((m, i) => (
                    <tr key={i} className={cn('hover:bg-gray-50', !m.active && 'opacity-40')}>
                      <td className="px-3 py-2">
                        <input
                          className="w-10 rounded border border-gray-200 px-1.5 py-1 text-xs text-center font-mono focus:outline-none focus:ring-1 focus:ring-brand-400"
                          value={m.columnLetter}
                          onChange={e => updateMap(currentTab._key, i, { columnLetter: e.target.value.toUpperCase() })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="w-full rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400"
                          value={m.columnHeader}
                          onChange={e => updateMap(currentTab._key, i, { columnHeader: e.target.value })}
                          placeholder="VENDEDOR"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          className="w-full rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400"
                          value={m.fieldName}
                          onChange={e => {
                            const f = SYSTEM_FIELDS.find(sf => sf.value === e.target.value)
                            updateMap(currentTab._key, i, { fieldName: e.target.value, fieldLabel: f?.label ?? '' })
                          }}
                        >
                          <option value="">— Selecione —</option>
                          {Object.entries(
                            SYSTEM_FIELDS.reduce((acc, f) => {
                              ;(acc[f.category] ??= []).push(f)
                              return acc
                            }, {} as Record<string, typeof SYSTEM_FIELDS>)
                          ).map(([cat, fields]) => (
                            <optgroup key={cat} label={cat}>
                              {fields.map(f => (
                                <option key={f.value} value={f.value}>{f.label}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input type="checkbox" className="h-3.5 w-3.5 rounded border-gray-300 text-brand-600"
                          checked={m.required}
                          onChange={e => updateMap(currentTab._key, i, { required: e.target.checked })} />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input type="checkbox" className="h-3.5 w-3.5 rounded border-gray-300 text-brand-600"
                          checked={m.active}
                          onChange={e => updateMap(currentTab._key, i, { active: e.target.checked })} />
                      </td>
                      <td className="px-3 py-2">
                        <button onClick={() => removeMap(currentTab._key, i)}
                          className="rounded p-1 text-red-400 hover:bg-red-50">
                          <Trash2 size={11} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Preview dos cabeçalhos descobertos */}
          {currentTab._previewHeaders.length > 0 && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
              <p className="text-xs font-semibold text-blue-800 mb-2">
                Cabeçalhos encontrados na planilha:
              </p>
              <div className="flex flex-wrap gap-1">
                {currentTab._previewHeaders.map(h => (
                  <span key={h} className="rounded bg-blue-100 border border-blue-200 px-2 py-0.5 text-xs text-blue-700 font-mono">
                    {h}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// Seção 4: Automação (auto-sync)
// ═════════════════════════════════════════════════════════════════════════════

function AutomacaoSection({
  value, onChange, tabs,
}: {
  value:   AutoSyncDraft
  onChange: (v: AutoSyncDraft) => void
  tabs:    TabDraft[]
}) {
  function set<K extends keyof AutoSyncDraft>(k: K, v: AutoSyncDraft[K]) {
    onChange({ ...value, [k]: v })
  }

  function toggleDay(d: number) {
    set('allowedDays', value.allowedDays.includes(d)
      ? value.allowedDays.filter(x => x !== d)
      : [...value.allowedDays, d].sort((a, b) => a - b)
    )
  }

  const freqPreset = FREQ_OPTIONS.find(o => o.value === value.frequencyMinutes)?.value ?? 0
  const isCustomFreq = freqPreset === 0

  return (
    <div className="space-y-5">
      {/* Ativação e modo */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-semibold text-gray-700 mb-3">Atualização automática</p>
          <div className="flex gap-3">
            {[true, false].map(v => (
              <button key={String(v)} type="button"
                onClick={() => set('enabled', v)}
                className={cn('flex-1 rounded-lg border py-2 text-xs font-semibold transition-colors',
                  value.enabled === v
                    ? v ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                         : 'border-red-300 bg-red-50 text-red-700'
                    : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                )}
              >
                {v ? '✅ Ativada' : '⏸️ Pausada'}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-semibold text-gray-700 mb-3">Modo de execução</p>
          <div className="flex gap-3">
            {(['SIMULATION', 'REAL'] as const).map(m => (
              <button key={m} type="button"
                onClick={() => set('mode', m)}
                className={cn('flex-1 rounded-lg border py-2 text-xs font-semibold transition-colors',
                  value.mode === m
                    ? m === 'REAL'
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-amber-400 bg-amber-50 text-amber-700'
                    : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                )}
              >
                {m === 'SIMULATION' ? '🧪 Simulação' : '⚡ Real'}
              </button>
            ))}
          </div>
          {value.mode === 'SIMULATION' && (
            <p className="mt-2 text-[10px] text-amber-600">Simulação não grava dados no banco.</p>
          )}
        </div>
      </div>

      {/* Frequência */}
      <div className="rounded-xl border border-gray-200 p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-700">Frequência de sincronização</p>
        <div className="flex flex-wrap gap-2">
          {FREQ_OPTIONS.map(opt => (
            <button key={opt.value} type="button"
              onClick={() => {
                if (opt.value !== 0) set('frequencyMinutes', opt.value)
                else set('frequencyMinutes', 0)
              }}
              className={cn('rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                (opt.value === 0 ? isCustomFreq : value.frequencyMinutes === opt.value)
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {isCustomFreq && (
          <div className="flex items-center gap-2">
            <input type="number" min={1} max={1440}
              className={`${inp} w-32`}
              placeholder="Ex: 45"
              value={value.frequencyMinutes || ''}
              onChange={e => set('frequencyMinutes', Number(e.target.value))}
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
            {DAYS.map((d, i) => (
              <button key={i} type="button" onClick={() => toggleDay(i)}
                className={cn('rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
                  value.allowedDays.includes(i)
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                )}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-700">Janela de horário</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={lbl}>Início</label>
              <input type="time" className={inp} value={value.startTime}
                onChange={e => set('startTime', e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Fim</label>
              <input type="time" className={inp} value={value.endTime}
                onChange={e => set('endTime', e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      {/* Ação e limites */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-gray-200 p-4 space-y-2">
          <p className="text-xs font-semibold text-gray-700">Ação após sincronizar</p>
          {ACTION_OPTS.map(o => (
            <label key={o.value} className="flex items-center gap-2.5 cursor-pointer">
              <input type="radio" name="action" value={o.value}
                checked={value.actionAfterDownload === o.value}
                onChange={() => set('actionAfterDownload', o.value)}
                className="h-3.5 w-3.5 text-brand-600"
              />
              <span className="text-xs text-gray-700">{o.label}</span>
            </label>
          ))}
        </div>
        <div className="rounded-xl border border-gray-200 p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-700">Limites técnicos</p>
          <div>
            <label className={lbl}>Máx. linhas por execução</label>
            <input type="number" min={1} max={10000} className={inp}
              value={value.maxRowsPerRun}
              onChange={e => set('maxRowsPerRun', Number(e.target.value))} />
          </div>
          <div>
            <label className={lbl}>Timeout (segundos)</label>
            <input type="number" min={10} max={600} className={inp}
              value={value.timeoutSeconds}
              onChange={e => set('timeoutSeconds', Number(e.target.value))} />
          </div>
        </div>
      </div>

      {/* Notificações */}
      <div className="rounded-xl border border-gray-200 p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-700">Notificações</p>
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-brand-600"
            checked={value.notifyOnNewRecords}
            onChange={e => set('notifyOnNewRecords', e.target.checked)} />
          <span className="text-xs text-gray-700">Notificar ao encontrar novas pendências</span>
        </label>
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-brand-600"
            checked={value.notifyOnError}
            onChange={e => set('notifyOnError', e.target.checked)} />
          <span className="text-xs text-gray-700">Notificar ao encontrar erro técnico</span>
        </label>
        {value.notifyOnError && (
          <div>
            <label className={lbl}>Destino das notificações de erro</label>
            <input className={inp} value={value.errorNotifyTarget}
              onChange={e => set('errorNotifyTarget', e.target.value)}
              placeholder="erro@empresa.com ou +5511999990000" />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Heurística de campo ────────────────────────────────────────────────────────

function guessField(header: string): string {
  const h = header.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (h.includes('vendedor') || h.includes('consultor'))          return 'vendedor'
  if (h.includes('gerente'))                                       return 'gerente'
  if (h.includes('cliente') || h.includes('comprador'))           return 'cliente'
  if (h.includes('cpf'))                                           return 'cpf_cliente'
  if (h.includes('fone') || h.includes('celular') || h.includes('telefone')) return 'telefone_cliente'
  if (h.includes('email') || h.includes('e-mail'))                return 'email_cliente'
  if (h.includes('placa'))                                         return 'placa'
  if (h.includes('modelo'))                                        return 'modelo'
  if (h.includes('marca'))                                         return 'marca'
  if (h.includes('ano') && h.includes('fab'))                     return 'ano_fabricacao'
  if (h.includes('ano') && h.includes('mod'))                     return 'ano_modelo'
  if (h.includes('ano'))                                           return 'ano_fabricacao'
  if (h.includes('cor') || h.includes('color'))                   return 'cor'
  if (h.includes('km') || h.includes('quilom'))                   return 'km'
  if (h.includes('chassi'))                                        return 'chassi'
  if (h.includes('renavam'))                                       return 'renavam'
  if ((h.includes('valor') || h.includes('preco')) && h.includes('venda')) return 'valor_venda'
  if ((h.includes('valor') || h.includes('preco')) && h.includes('compra')) return 'valor_compra'
  if (h.includes('valor') || h.includes('preco'))                 return 'valor_venda'
  if (h.includes('entrada'))                                       return 'valor_entrada'
  if (h.includes('financ') && h.includes('valor'))                return 'valor_financiado'
  if (h.includes('banco') || h.includes('financ'))                return 'banco_financiado'
  if (h.includes('data') && h.includes('venda'))                  return 'data_venda'
  if (h.includes('data') && h.includes('entrada'))                return 'data_entrada'
  if (h.includes('data'))                                          return 'data_venda'
  if (h.includes('contrato') || h.includes('numero'))             return 'numero_contrato'
  if (h.includes('forma') || h.includes('pagamento'))             return 'forma_pagamento'
  if (h.includes('comissao') && (h.includes('%') || h.includes('pct') || h.includes('perc'))) return 'pct_comissao'
  if (h.includes('comissao'))                                      return 'valor_comissao'
  if (h.includes('status'))                                        return 'status'
  if (h.includes('obs') || h.includes('observ'))                  return 'observacoes'
  if (h.includes('mes') || h.includes('referencia'))              return 'mes_referencia'
  if (h.includes('unidade') || h.includes('loja') || h.includes('filial')) return 'unidade'
  if (h.includes('combustiv'))                                     return 'combustivel'
  return 'ignorar'
}
