'use client'

// =============================================================================
// Regras de Comissão — AutoDrive
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Plus, Edit2, Trash2, Percent, X, Save, AlertCircle, Settings, Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { maskBRL, parseBRL } from '@/lib/masks'

function brlInputValue(v: number | string | null | undefined): string {
  if (v == null) return ''
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  if (!Number.isFinite(n)) return ''
  return maskBRL(String(Math.round(n * 100)))
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface CommissionRule {
  id:             string
  name:           string
  description:    string | null
  ruleType:       string
  commissionType: string
  percentage:     number | null
  fixedValue:     number | null
  fromQuantity:   number | null
  toQuantity:     number | null
  fromValue:      number | null
  toValue:        number | null
  priority:       number
  active:         boolean
  unitId:         string | null
  unit?:          { id: string; name: string } | null
  positionId:     string | null
  position?:      { id: string; name: string; slug: string; baseRole?: string | null } | null
  role:           string | null
  notes:          string | null
}

interface PositionLite {
  id:       string
  name:     string
  slug:     string
  baseRole: string | null
  active:   boolean
}

interface UnitLite {
  id:     string
  name:   string
  active: boolean
}

interface CommissionSettings {
  managerReceivesOnOwnSale: boolean
}

const EMPTY_FORM: Omit<CommissionRule, 'id' | 'unit' | 'position'> = {
  name:           '',
  description:    null,
  ruleType:       'VENDA',
  commissionType: 'PERCENTUAL',
  percentage:     null,
  fixedValue:     null,
  fromQuantity:   null,
  toQuantity:     null,
  fromValue:      null,
  toValue:        null,
  priority:       0,
  active:         true,
  unitId:         null,
  positionId:     null,
  role:           null,
  notes:          null,
}

const RULE_TYPE_LABELS: Record<string, string> = {
  // Venda e troca usam a MESMA comissão — uma regra "Venda / Troca" cobre os dois.
  VENDA:     'Venda / Troca',
  TROCA:     'Venda / Troca', // legado: regras antigas de TROCA aparecem como Venda / Troca
  COMPRA:    'Compra',
  GARANTIA:  'Garantia',
  RETORNO:   'Retorno',
  SERVICO:   'Serviço',
  DOCUMENTO: 'Documentação',
}

// Opções SELECIONÁVEIS no formulário: TROCA fora (é a mesma comissão de VENDA;
// o backend normaliza TROCA→VENDA). Evita criar regra "morta" ou duplicada.
const RULE_TYPE_OPTIONS: [string, string][] = Object.entries(RULE_TYPE_LABELS).filter(([v]) => v !== 'TROCA')

const COMMISSION_TYPE_LABELS: Record<string, string> = {
  PERCENTUAL: 'Percentual (%)',
  FIXO:       'Valor Fixo (R$)',
  ESCALONADA: 'Escalonada por faixa',
  BONUS_QTD:  'Bônus por quantidade',
}

const ROLE_LABELS: Record<string, string> = {
  MASTER: 'Master',
  ADM: 'Administrador',
  GERENTE_GERAL: 'Gerente geral',
  GERENTE_ADMINISTRATIVO: 'Gerente administrativo',
  GERENTE: 'Gerente',
  VENDEDOR_LIDER: 'Vendedor líder',
  VENDEDOR: 'Vendedor',
  FINANCEIRO: 'Financeiro',
  USUARIO_LIDER: 'Usuário líder',
  USUARIO: 'Usuário',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-700">{label}</label>
      {children}
    </div>
  )
}

function inputCls(extra?: string) {
  return cn(
    'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400',
    'focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500',
    extra,
  )
}

function formatCurrency(value: number | null | undefined) {
  return Number(value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatCommission(rule: Pick<CommissionRule, 'commissionType' | 'percentage' | 'fixedValue'>) {
  if (rule.commissionType === 'PERCENTUAL') return `${rule.percentage ?? 0}%`
  if (rule.commissionType === 'ESCALONADA') {
    return rule.percentage != null ? `${rule.percentage}% por faixa` : `${formatCurrency(rule.fixedValue)} por faixa`
  }
  if (rule.commissionType === 'BONUS_QTD') return `${formatCurrency(rule.fixedValue)} bônus`
  return formatCurrency(rule.fixedValue)
}

function formatRange(rule: Pick<CommissionRule, 'fromQuantity' | 'toQuantity' | 'fromValue' | 'toValue'>) {
  const qty = rule.fromQuantity != null || rule.toQuantity != null
    ? `Qtd. ${rule.fromQuantity ?? 0} – ${rule.toQuantity ?? '∞'}`
    : null
  const value = rule.fromValue != null || rule.toValue != null
    ? `${formatCurrency(rule.fromValue ?? 0)} – ${rule.toValue != null ? formatCurrency(rule.toValue) : 'sem teto'}`
    : null
  return [qty, value].filter(Boolean).join(' / ') || '—'
}

// ── Modal — Criar / Editar ────────────────────────────────────────────────────

function RuleModal({
  initial,
  positions,
  units,
  onClose,
  onSaved,
}: {
  initial:   CommissionRule | null
  positions: PositionLite[]
  units:     UnitLite[]
  onClose:   () => void
  onSaved:   () => void
}) {
  const isEdit = !!initial
  const initialPayoutMode = initial?.percentage != null ? 'PERCENTUAL' : 'FIXO'
  const [form, setForm] = useState<Omit<CommissionRule, 'id' | 'unit' | 'position'>>(
    initial
      ? {
          name:           initial.name,
          description:    initial.description,
          ruleType:       initial.ruleType,
          commissionType: initial.commissionType,
          percentage:     initial.percentage,
          fixedValue:     initial.fixedValue,
          fromQuantity:   initial.fromQuantity,
          toQuantity:     initial.toQuantity,
          fromValue:      initial.fromValue,
          toValue:        initial.toValue,
          priority:       initial.priority,
          active:         initial.active,
          unitId:         initial.unitId,
          positionId:     initial.positionId,
          role:           initial.role,
          notes:          initial.notes,
        }
      : { ...EMPTY_FORM },
  )
  const [payoutMode, setPayoutMode] = useState<'PERCENTUAL' | 'FIXO'>(initialPayoutMode)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((p) => ({ ...p, [k]: v }))

  const setCommissionType = (commissionType: string) => {
    setForm((prev) => ({
      ...prev,
      commissionType,
      percentage: commissionType === 'FIXO' || commissionType === 'BONUS_QTD' ? null : prev.percentage,
      fixedValue: commissionType === 'PERCENTUAL' ? null : prev.fixedValue,
    }))
    if (commissionType === 'PERCENTUAL') setPayoutMode('PERCENTUAL')
    if (commissionType === 'FIXO' || commissionType === 'BONUS_QTD') setPayoutMode('FIXO')
  }

  const setEscalatedPayoutMode = (mode: 'PERCENTUAL' | 'FIXO') => {
    setPayoutMode(mode)
    setForm((prev) => ({
      ...prev,
      percentage: mode === 'PERCENTUAL' ? prev.percentage : null,
      fixedValue: mode === 'FIXO' ? prev.fixedValue : null,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Nome é obrigatório.'); return }
    if (form.commissionType === 'PERCENTUAL' && !form.percentage) {
      setError('Informe o percentual da comissão.')
      return
    }
    if ((form.commissionType === 'FIXO' || form.commissionType === 'BONUS_QTD') && !form.fixedValue) {
      setError(form.commissionType === 'BONUS_QTD' ? 'Informe o valor do bônus.' : 'Informe o valor fixo.')
      return
    }
    if (form.commissionType === 'BONUS_QTD' && !form.fromQuantity) {
      setError('Informe a quantidade mínima para o bônus.')
      return
    }
    if (form.commissionType === 'ESCALONADA') {
      const hasPayment = payoutMode === 'PERCENTUAL' ? !!form.percentage : !!form.fixedValue
      const hasRange = form.fromQuantity != null || form.toQuantity != null || form.fromValue != null || form.toValue != null
      if (!hasPayment) { setError('Informe o valor ou percentual da faixa.'); return }
      if (!hasRange) { setError('Informe pelo menos uma faixa.'); return }
    }

    setSaving(true)
    setError('')
    try {
      const url    = isEdit ? `/api/commissions/rules/${initial!.id}` : '/api/commissions/rules'
      const method = isEdit ? 'PUT' : 'POST'
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao salvar')
      onSaved()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <Percent size={18} className="text-brand-600" />
            <h2 className="text-base font-semibold text-gray-900">
              {isEdit ? 'Editar Regra' : 'Nova Regra de Comissão'}
            </h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="max-h-[78vh] space-y-5 overflow-y-auto px-6 py-5">
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <Settings size={14} /> Identificação
            </div>
            <div className="grid gap-3 md:grid-cols-[1.4fr_0.6fr]">
              <Field label="Nome da regra *">
                <input
                  className={inputCls()}
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="Ex: Venda vendedor base"
                  autoFocus
                />
              </Field>
              <Field label="Prioridade">
                <input
                  type="number" min={0}
                  className={inputCls()}
                  value={form.priority}
                  onChange={(e) => set('priority', Number(e.target.value))}
                  placeholder="0"
                />
              </Field>
            </div>
            <Field label="Descrição">
              <textarea
                rows={2}
                className={inputCls('resize-none')}
                value={form.description ?? ''}
                onChange={(e) => set('description', e.target.value || null)}
                placeholder="Ex: Comissão padrão para vendas aprovadas"
              />
            </Field>
          </section>

          <section className="space-y-3 border-t border-gray-100 pt-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <Building2 size={14} /> Aplicação
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Operação *">
                <select
                  className={inputCls()}
                  value={form.ruleType}
                  onChange={(e) => set('ruleType', e.target.value)}
                >
                  {RULE_TYPE_OPTIONS.map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </Field>
              <Field label="Unidade">
                <select
                  className={inputCls()}
                  value={form.unitId ?? ''}
                  onChange={(e) => set('unitId', e.target.value || null)}
                >
                  <option value="">Todas as unidades</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Cargo específico">
                <select
                  className={inputCls()}
                  value={form.positionId ?? ''}
                  onChange={(e) => {
                    const newId = e.target.value || null
                    const pos = positions.find((p) => p.id === newId)
                    setForm((prev) => ({
                      ...prev,
                      positionId: newId,
                      role: newId ? (pos?.baseRole ?? null) : prev.role,
                    }))
                  }}
                >
                  <option value="">Nenhum cargo específico</option>
                  {positions.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Perfil base">
                <select
                  className={inputCls()}
                  value={form.role ?? ''}
                  onChange={(e) => set('role', e.target.value || null)}
                >
                  <option value="">Qualquer perfil</option>
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </Field>
            </div>
          </section>

          <section className="space-y-3 border-t border-gray-100 pt-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <Percent size={14} /> Valor e faixas
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Tipo de comissão *">
                <select
                  className={inputCls()}
                  value={form.commissionType}
                  onChange={(e) => setCommissionType(e.target.value)}
                >
                  {Object.entries(COMMISSION_TYPE_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </Field>
              {form.commissionType === 'ESCALONADA' && (
                <Field label="Pagamento da faixa">
                  <select
                    className={inputCls()}
                    value={payoutMode}
                    onChange={(e) => setEscalatedPayoutMode(e.target.value as 'PERCENTUAL' | 'FIXO')}
                  >
                    <option value="PERCENTUAL">Percentual</option>
                    <option value="FIXO">Valor fixo</option>
                  </select>
                </Field>
              )}
              {(form.commissionType === 'PERCENTUAL' || (form.commissionType === 'ESCALONADA' && payoutMode === 'PERCENTUAL')) && (
                <Field label="Percentual (%)">
                  <input
                    type="number" min={0} max={100} step={0.01}
                    className={inputCls()}
                    value={form.percentage ?? ''}
                    onChange={(e) => set('percentage', e.target.value ? Number(e.target.value) : null)}
                    placeholder="Ex: 2.5"
                  />
                </Field>
              )}
              {(form.commissionType === 'FIXO' || form.commissionType === 'BONUS_QTD' || (form.commissionType === 'ESCALONADA' && payoutMode === 'FIXO')) && (
                <Field label={form.commissionType === 'BONUS_QTD' ? 'Valor do bônus (R$)' : 'Valor fixo (R$)'}>
                  <input
                    inputMode="numeric"
                    className={inputCls()}
                    value={brlInputValue(form.fixedValue)}
                    onChange={(e) => set('fixedValue', parseBRL(e.target.value))}
                    placeholder="Ex: 500,00"
                  />
                </Field>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <Field label={form.commissionType === 'BONUS_QTD' ? 'Quantidade mínima para bônus' : 'Quantidade mínima'}>
                <input
                  type="number" min={0}
                  className={inputCls()}
                  value={form.fromQuantity ?? ''}
                  onChange={(e) => set('fromQuantity', e.target.value ? Number(e.target.value) : null)}
                  placeholder="Ex: 1"
                />
              </Field>
              <Field label="Quantidade máxima">
                <input
                  type="number" min={0}
                  className={inputCls()}
                  value={form.toQuantity ?? ''}
                  onChange={(e) => set('toQuantity', e.target.value ? Number(e.target.value) : null)}
                  placeholder="Sem limite"
                />
              </Field>
              <Field label="Valor mínimo da venda">
                <input
                  inputMode="numeric"
                  className={inputCls()}
                  value={brlInputValue(form.fromValue)}
                  onChange={(e) => set('fromValue', parseBRL(e.target.value))}
                  placeholder="Ex: 50.000,00"
                />
              </Field>
              <Field label="Valor máximo da venda">
                <input
                  inputMode="numeric"
                  className={inputCls()}
                  value={brlInputValue(form.toValue)}
                  onChange={(e) => set('toValue', parseBRL(e.target.value))}
                  placeholder="Sem teto"
                />
              </Field>
            </div>
          </section>

          <label className="flex cursor-pointer items-center gap-2.5 border-t border-gray-100 pt-4">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => set('active', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-sm text-gray-700">Regra ativa</span>
          </label>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          {/* Ações */}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary text-sm">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="btn-primary text-sm">
              {saving ? (
                <span className="flex items-center gap-2">
                  <RefreshCw size={13} className="animate-spin" /> Salvando...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Save size={13} /> {isEdit ? 'Salvar alterações' : 'Criar regra'}
                </span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Modal — Confirmar exclusão ────────────────────────────────────────────────

function DeleteModal({
  rule,
  onClose,
  onDeleted,
}: {
  rule: CommissionRule
  onClose: () => void
  onDeleted: () => void
}) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError]       = useState('')

  const handleDelete = async () => {
    setDeleting(true)
    setError('')
    try {
      const res  = await fetch(`/api/commissions/rules/${rule.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao excluir')
      onDeleted()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir')
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="text-base font-semibold text-gray-900">Excluir regra</h3>
        <p className="mt-2 text-sm text-gray-600">
          Tem certeza que deseja excluir a regra <strong>&quot;{rule.name}&quot;</strong>? Se ela já tiver histórico, será apenas inativada.
        </p>
        {error && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertCircle size={14} /> {error}
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
          >
            {deleting ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
            {deleting ? 'Excluindo...' : 'Excluir'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RegrasComissoesPage() {
  const [rules, setRules]         = useState<CommissionRule[]>([])
  const [positions, setPositions] = useState<PositionLite[]>([])
  const [units, setUnits]         = useState<UnitLite[]>([])
  const [settings, setSettings]   = useState<CommissionSettings>({ managerReceivesOnOwnSale: false })
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [loading, setLoading]     = useState(true)
  const [editing, setEditing]     = useState<CommissionRule | null | 'new'>(null)
  const [deleting, setDeleting]   = useState<CommissionRule | null>(null)
  const [error, setError]         = useState('')

  const fetchRules = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res  = await fetch('/api/commissions/rules', { credentials: 'include' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao carregar')
      setRules(data.data ?? [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar regras')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchPositions = useCallback(async () => {
    try {
      const res  = await fetch('/api/positions?active=true', { credentials: 'include' })
      const data = await res.json()
      if (res.ok) setPositions(data.data ?? [])
    } catch {
      /* silencioso — campo é opcional */
    }
  }, [])

  const fetchUnits = useCallback(async () => {
    try {
      const res  = await fetch('/api/units', { credentials: 'include' })
      const data = await res.json()
      if (res.ok) setUnits((data.data ?? []).filter((u: UnitLite) => u.active !== false))
    } catch {
      /* silencioso — campo é opcional */
    }
  }, [])

  const fetchSettings = useCallback(async () => {
    try {
      const res  = await fetch('/api/commissions/settings', { credentials: 'include' })
      const data = await res.json()
      if (res.ok && data.data) setSettings(data.data)
    } catch {
      /* silencioso — mantém default seguro */
    }
  }, [])

  const updateManagerOwnSale = async (checked: boolean) => {
    const previous = settings
    setSettings({ managerReceivesOnOwnSale: checked })
    setSettingsSaving(true)
    try {
      const res = await fetch('/api/commissions/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ managerReceivesOnOwnSale: checked }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao salvar configuração')
      setSettings(data.data ?? { managerReceivesOnOwnSale: checked })
    } catch (err: unknown) {
      setSettings(previous)
      setError(err instanceof Error ? err.message : 'Erro ao salvar configuração')
    } finally {
      setSettingsSaving(false)
    }
  }

  useEffect(() => {
    fetchRules()
    fetchPositions()
    fetchUnits()
    fetchSettings()
  }, [fetchRules, fetchPositions, fetchUnits, fetchSettings])

  return (
    <>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Regras de Comissão</h1>
            <p className="mt-0.5 text-sm text-gray-500">Gerencie as faixas e percentuais de comissionamento.</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchRules}
              disabled={loading}
              className="btn-secondary text-xs"
              title="Atualizar"
            >
              <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
            </button>
            <button onClick={() => setEditing('new')} className="btn-primary text-xs">
              <Plus size={13} />
              Nova regra
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-card md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Comissão gerencial em venda própria</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Padrão seguro: gerente não recebe a comissão gerencial quando ele mesmo é o vendedor.
            </p>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={settings.managerReceivesOnOwnSale}
              disabled={settingsSaving}
              onChange={(e) => updateManagerOwnSale(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 disabled:opacity-60"
            />
            Permitir comissão duplicada
          </label>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle size={14} /> {error}
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-gray-100" />
            ))}
          </div>
        ) : rules.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-16">
            <Percent size={36} strokeWidth={1} className="text-gray-300" />
            <p className="mt-3 text-sm font-medium text-gray-500">Nenhuma regra configurada</p>
            <p className="text-xs text-gray-400">Crie regras de comissão para que o cálculo automático funcione.</p>
            <button onClick={() => setEditing('new')} className="btn-primary mt-4 text-xs">
              <Plus size={13} />
              Criar primeira regra
            </button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {['Nome', 'Operação', 'Aplicação', 'Comissão', 'Faixa', 'Prioridade', 'Unidade', 'Status', 'Ações'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rules.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">
                        {r.name}
                        {r.description && (
                          <p className="mt-0.5 text-xs text-gray-400">{r.description}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {RULE_TYPE_LABELS[r.ruleType] ?? r.ruleType}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {r.position?.name ?? (r.role ? ROLE_LABELS[r.role] ?? r.role : 'Todos')}
                      </td>
                      <td className="px-4 py-3 font-semibold text-brand-700 tabular-nums whitespace-nowrap">
                        <span>{formatCommission(r)}</span>
                        <p className="mt-0.5 text-xs font-medium text-gray-400">
                          {COMMISSION_TYPE_LABELS[r.commissionType] ?? r.commissionType}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                        {formatRange(r)}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600 tabular-nums">
                        {r.priority}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{r.unit?.name ?? 'Todas'}</td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-medium',
                          r.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500',
                        )}>
                          {r.active ? 'Ativa' : 'Inativa'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button
                            onClick={() => setEditing(r)}
                            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                            title="Editar"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => setDeleting(r)}
                            className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                            title="Excluir"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modais */}
      {editing !== null && (
        <RuleModal
          initial={editing === 'new' ? null : editing}
          positions={positions}
          units={units}
          onClose={() => setEditing(null)}
          onSaved={fetchRules}
        />
      )}
      {deleting && (
        <DeleteModal
          rule={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={fetchRules}
        />
      )}
    </>
  )
}
