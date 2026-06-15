'use client'

// =============================================================================
// Configurações > Google Sheets — AutoDrive
// Gerenciamento de planilhas e mapeamento de abas
// =============================================================================

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import {
  Plus,
  RefreshCw,
  Edit3,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  TableProperties,
  Link as LinkIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { canAccessModule } from '@/lib/permissions'
import type { UserRole } from '@/lib/permissions'
import type { GoogleSheetConfig, GoogleSheetTab } from '@/types'

// ── Componente de status ──────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="badge bg-gray-100 text-gray-500">—</span>
  const map: Record<string, string> = {
    OK:    'badge bg-green-100 text-green-700',
    ERRO:  'badge bg-red-100 text-red-700',
    SYNC:  'badge bg-blue-100 text-blue-700',
  }
  return (
    <span className={map[status] ?? 'badge bg-gray-100 text-gray-500'}>
      {status}
    </span>
  )
}

// ── Modal de Planilha ─────────────────────────────────────────────────────────

interface SheetConfigModalProps {
  initial?: Partial<GoogleSheetConfig>
  onSave: (data: { name: string; spreadsheetId: string; description: string }) => void
  onClose: () => void
}

function SheetConfigModal({ initial, onSave, onClose }: SheetConfigModalProps) {
  const [name,          setName]          = useState(initial?.name          ?? '')
  const [spreadsheetId, setSpreadsheetId] = useState(initial?.spreadsheetId ?? '')
  const [description,   setDescription]   = useState(initial?.description   ?? '')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-modal">
        <div className="border-b border-gray-100 px-6 py-4">
          <h3 className="text-base font-semibold text-gray-900">
            {initial?.id ? 'Editar planilha' : 'Adicionar planilha'}
          </h3>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="label">Nome interno</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Planilha Principal" />
          </div>
          <div>
            <label className="label">ID da planilha Google Sheets</label>
            <input className="input font-mono text-xs" value={spreadsheetId} onChange={(e) => setSpreadsheetId(e.target.value)} placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms" />
            <p className="mt-1 text-xs text-gray-400">Extraia da URL: docs.google.com/spreadsheets/d/<strong>ID</strong>/edit</p>
          </div>
          <div>
            <label className="label">Descrição</label>
            <textarea className="input resize-none" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Finalidade desta planilha..." />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-4">
          <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
          <button type="button" onClick={() => onSave({ name, spreadsheetId, description })} className="btn-primary">Salvar</button>
        </div>
      </div>
    </div>
  )
}

// ── Modal de Aba ──────────────────────────────────────────────────────────────

interface SheetTabModalProps {
  configId: string
  initial?: Partial<GoogleSheetTab>
  onSave: (data: Partial<GoogleSheetTab>) => void
  onClose: () => void
}

const TAB_TYPES = [
  'VENDAS','TROCAS','CLIENTES','VEICULOS','CONTRATOS','COMISSOES',
  'GARANTIAS','RETORNOS','PENDENCIAS','VENDEDORES','GERENTES','UNIDADES',
  'CONFIGURACOES','PERSONALIZADO',
]

function SheetTabModal({ configId, initial, onSave, onClose }: SheetTabModalProps) {
  const [internalName, setInternalName] = useState(initial?.internalName ?? '')
  const [sheetName,    setSheetName]    = useState(initial?.sheetName    ?? '')
  const [tabType,      setTabType]      = useState(initial?.tabType      ?? 'PERSONALIZADO')
  const [description,  setDescription]  = useState(initial?.description  ?? '')
  const [headerRow,    setHeaderRow]    = useState(initial?.headerRow     ?? 1)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-modal">
        <div className="border-b border-gray-100 px-6 py-4">
          <h3 className="text-base font-semibold text-gray-900">
            {initial?.id ? 'Editar aba' : 'Adicionar aba'}
          </h3>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="label">Nome interno (no sistema)</label>
            <input className="input" value={internalName} onChange={(e) => setInternalName(e.target.value)} placeholder="Ex: Vendas do Mês" />
          </div>
          <div>
            <label className="label">Nome real na planilha</label>
            <input className="input font-mono" value={sheetName} onChange={(e) => setSheetName(e.target.value)} placeholder="Ex: VENDAS" />
          </div>
          <div>
            <label className="label">Tipo da aba</label>
            <select className="input" value={tabType} onChange={(e) => setTabType(e.target.value as any)}>
              {TAB_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Linha do cabeçalho</label>
            <input type="number" min={1} className="input" value={headerRow} onChange={(e) => setHeaderRow(Number(e.target.value))} />
          </div>
          <div>
            <label className="label">Descrição</label>
            <textarea className="input resize-none" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-4">
          <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
          <button type="button" onClick={() => onSave({ configId, internalName, sheetName, tabType: tabType as any, description, headerRow })} className="btn-primary">Salvar</button>
        </div>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function SheetsConfigPage() {
  const { data: session } = useSession()
  const role = session?.user?.role as UserRole | undefined

  const [configs,     setConfigs]     = useState<(GoogleSheetConfig & { tabs?: GoogleSheetTab[] })[]>([])
  const [loading,     setLoading]     = useState(true)
  const [expanded,    setExpanded]    = useState<Record<string, boolean>>({})
  const [showConfig,  setShowConfig]  = useState(false)
  const [editConfig,  setEditConfig]  = useState<GoogleSheetConfig | null>(null)
  const [showTab,     setShowTab]     = useState<string | null>(null) // configId
  const [editTab,     setEditTab]     = useState<GoogleSheetTab | null>(null)
  const [syncing,     setSyncing]     = useState<string | null>(null)
  const [message,     setMessage]     = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const canConfigure = canAccessModule(role, 'settings.sheets')

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  const loadConfigs = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/settings/sheets', { credentials: 'include' })
      if (res.ok) {
        const json = await res.json()
        setConfigs(json.data ?? [])
      }
    } catch { /* silent */ }
    finally { setLoading(false) }
  }

  useEffect(() => { loadConfigs() }, [])

  const handleSaveConfig = async (data: { name: string; spreadsheetId: string; description: string }) => {
    try {
      const url    = editConfig ? `/api/settings/sheets/${editConfig.id}` : '/api/settings/sheets'
      const method = editConfig ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      })
      if (res.ok) {
        showMsg('success', editConfig ? 'Planilha atualizada!' : 'Planilha adicionada!')
        setShowConfig(false)
        setEditConfig(null)
        loadConfigs()
      } else {
        const j = await res.json()
        showMsg('error', j.error ?? 'Erro ao salvar planilha')
      }
    } catch { showMsg('error', 'Erro de conexão') }
  }

  const handleSaveTab = async (data: Partial<GoogleSheetTab>) => {
    try {
      const url    = editTab ? `/api/settings/sheets/tabs/${editTab.id}` : '/api/settings/sheets/tabs'
      const method = editTab ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      })
      if (res.ok) {
        showMsg('success', editTab ? 'Aba atualizada!' : 'Aba adicionada!')
        setShowTab(null)
        setEditTab(null)
        loadConfigs()
      } else {
        const j = await res.json()
        showMsg('error', j.error ?? 'Erro ao salvar aba')
      }
    } catch { showMsg('error', 'Erro de conexão') }
  }

  const handleSync = async (configId: string, tabId?: string) => {
    setSyncing(tabId ?? configId)
    try {
      const res = await fetch('/api/settings/sheets/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configId, tabId }),
        credentials: 'include',
      })
      const j = await res.json()
      showMsg(res.ok ? 'success' : 'error', j.message ?? (res.ok ? 'Sincronizado!' : 'Erro ao sincronizar'))
      if (res.ok) loadConfigs()
    } catch { showMsg('error', 'Erro de conexão') }
    finally { setSyncing(null) }
  }

  const toggleExpand = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Google Sheets</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Configure planilhas e abas para importação de dados.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={loadConfigs} className="btn-secondary text-xs">
            <RefreshCw size={13} />
            Recarregar
          </button>
          {canConfigure && (
            <button type="button" onClick={() => { setEditConfig(null); setShowConfig(true) }} className="btn-primary text-xs">
              <Plus size={14} />
              Adicionar planilha
            </button>
          )}
        </div>
      </div>

      {/* Mensagem feedback */}
      {message && (
        <div className={cn(
          'flex items-center gap-2.5 rounded-lg px-4 py-3 text-sm',
          message.type === 'success'
            ? 'bg-green-50 border border-green-200 text-green-800'
            : 'bg-red-50 border border-red-200 text-red-800',
        )}>
          {message.type === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          {message.text}
        </div>
      )}

      {/* Lista de planilhas */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw size={20} className="animate-spin text-gray-400" />
        </div>
      ) : configs.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <TableProperties size={40} className="text-gray-200 mb-3" />
          <p className="text-sm font-medium text-gray-500">Nenhuma planilha configurada</p>
          <p className="text-xs text-gray-400 mt-1">Clique em &quot;Adicionar planilha&quot; para começar.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {configs.map((config) => {
            const isExpanded = expanded[config.id] ?? false
            return (
              <div key={config.id} className="card overflow-hidden">
                {/* Header do card */}
                <div className="flex items-center gap-3 px-5 py-4">
                  <button type="button" onClick={() => toggleExpand(config.id)} className="text-gray-400 hover:text-gray-600 transition-colors">
                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900 truncate">{config.name}</p>
                      <span className={cn('badge', config.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                        {config.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <LinkIcon size={11} className="text-gray-400" />
                      <p className="text-xs text-gray-400 font-mono truncate max-w-xs">{config.spreadsheetId || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {canConfigure && (
                      <>
                        <button type="button" onClick={() => handleSync(config.id)} disabled={!!syncing} className="btn-secondary text-xs py-1 px-2.5">
                          <RefreshCw size={12} className={syncing === config.id ? 'animate-spin' : ''} />
                          Sync
                        </button>
                        <button type="button" onClick={() => { setEditConfig(config); setShowConfig(true) }} className="btn-secondary text-xs py-1 px-2.5">
                          <Edit3 size={12} />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Abas */}
                {isExpanded && (
                  <div className="border-t border-gray-50 bg-gray-50/50">
                    <div className="flex items-center justify-between px-5 py-2.5">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Abas ({config.tabs?.length ?? 0})</p>
                      {canConfigure && (
                        <button type="button" onClick={() => { setShowTab(config.id); setEditTab(null) }} className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-600 transition-colors">
                          <Plus size={12} /> Adicionar aba
                        </button>
                      )}
                    </div>

                    {(!config.tabs || config.tabs.length === 0) ? (
                      <div className="px-5 pb-4 text-center">
                        <p className="text-xs text-gray-400">Nenhuma aba cadastrada.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-y border-gray-100 bg-white">
                              <th className="px-5 py-2 text-left font-medium text-gray-500">Nome interno</th>
                              <th className="px-3 py-2 text-left font-medium text-gray-500">Aba na planilha</th>
                              <th className="px-3 py-2 text-left font-medium text-gray-500">Tipo</th>
                              <th className="px-3 py-2 text-left font-medium text-gray-500">Status</th>
                              <th className="px-3 py-2 text-left font-medium text-gray-500">Última sync</th>
                              <th className="px-3 py-2" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {config.tabs!.map((tab) => (
                              <tr key={tab.id} className="hover:bg-white transition-colors">
                                <td className="px-5 py-2.5 font-medium text-gray-700">{tab.internalName}</td>
                                <td className="px-3 py-2.5 font-mono text-gray-500">{tab.sheetName}</td>
                                <td className="px-3 py-2.5">
                                  <span className="badge bg-blue-50 text-blue-700">{tab.tabType}</span>
                                </td>
                                <td className="px-3 py-2.5">
                                  <StatusBadge status={tab.lastSyncStatus} />
                                </td>
                                <td className="px-3 py-2.5 text-gray-400">
                                  {tab.lastSyncAt ? new Date(tab.lastSyncAt).toLocaleString('pt-BR') : '—'}
                                </td>
                                <td className="px-3 py-2.5">
                                  {canConfigure && (
                                    <div className="flex items-center gap-1">
                                      <button type="button" onClick={() => handleSync(config.id, tab.id)} disabled={!!syncing} className="rounded p-1 text-gray-400 hover:text-brand-700 hover:bg-brand-50 transition-colors" title="Sincronizar">
                                        <RefreshCw size={12} className={syncing === tab.id ? 'animate-spin' : ''} />
                                      </button>
                                      <button type="button" onClick={() => { setEditTab(tab); setShowTab(config.id) }} className="rounded p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Editar">
                                        <Edit3 size={12} />
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modais */}
      {showConfig && (
        <SheetConfigModal
          initial={editConfig ?? undefined}
          onSave={handleSaveConfig}
          onClose={() => { setShowConfig(false); setEditConfig(null) }}
        />
      )}
      {showTab && (
        <SheetTabModal
          configId={showTab}
          initial={editTab ?? undefined}
          onSave={handleSaveTab}
          onClose={() => { setShowTab(null); setEditTab(null) }}
        />
      )}
    </div>
  )
}
