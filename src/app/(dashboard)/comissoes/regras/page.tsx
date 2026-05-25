'use client'

// =============================================================================
// Regras de Comissão — AutoDrive
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Settings, RefreshCw, Plus, Edit2, Trash2, Percent, X, Save, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { maskBRL, parseBRL } from '@/lib/masks'

function brlInputValue(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return ''
  return maskBRL(String(Math.round(v * 100)))
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
  unit?:          { name: string } | null
  positionId:     string | null
  position?:      { id: string; name: string; slug: string } | null
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
  VENDA:     'Venda',
  TROCA:     'Troca',
  COMPRA:    'Compra',
  GARANTIA:  'Garantia',
  RETORNO:   'Retorno',
}

const COMMISSION_TYPE_LABELS: Record<string, string> = {
  PERCENTUAL: 'Percentual (%)',
  FIXO:       'Valor Fixo (R$)',
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

// ── Modal — Criar / Editar ────────────────────────────────────────────────────

function RuleModal({
  initial,
  positions,
  onClose,
  onSaved,
}: {
  initial:   CommissionRule | null
  positions: PositionLite[]
  onClose:   () => void
  onSaved:   () => void
}) {
  const isEdit = !!initial
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
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((p) => ({ ...p, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Nome é obrigatório.'); return }

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
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-xl">
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

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          {/* Nome */}
          <Field label="Nome da regra *">
            <input
              className={inputCls()}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Ex: Comissão Venda Base"
              autoFocus
            />
          </Field>

          {/* Cargo vinculado */}
          <Field label="Cargo (opcional)">
            <select
              className={inputCls()}
              value={form.positionId ?? ''}
              onChange={(e) => {
                const newId = e.target.value || null
                const pos = positions.find((p) => p.id === newId)
                setForm((prev) => ({
                  ...prev,
                  positionId: newId,
                  // se role não foi setado ainda, auto-preenche pelo baseRole do cargo
                  role: prev.role || (pos?.baseRole ?? null),
                }))
              }}
            >
              <option value="">— Nenhum —</option>
              {positions.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Field>

          {/* Tipo e Comissão */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo da regra *">
              <select
                className={inputCls()}
                value={form.ruleType}
                onChange={(e) => set('ruleType', e.target.value)}
              >
                {Object.entries(RULE_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </Field>
            <Field label="Tipo de comissão *">
              <select
                className={inputCls()}
                value={form.commissionType}
                onChange={(e) => set('commissionType', e.target.value)}
              >
                {Object.entries(COMMISSION_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </Field>
          </div>

          {/* Valor */}
          <div className="grid grid-cols-2 gap-3">
            {form.commissionType === 'PERCENTUAL' ? (
              <Field label="Percentual (%)">
                <input
                  type="number" min={0} max={100} step={0.01}
                  className={inputCls()}
                  value={form.percentage ?? ''}
                  onChange={(e) => set('percentage', e.target.value ? Number(e.target.value) : null)}
                  placeholder="Ex: 2,5"
                />
              </Field>
            ) : (
              <Field label="Valor fixo (R$)">
                <input
                  inputMode="numeric"
                  className={inputCls()}
                  value={brlInputValue(form.fixedValue)}
                  onChange={(e) => set('fixedValue', parseBRL(e.target.value))}
                  placeholder="Ex: 500,00"
                />
              </Field>
            )}
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

          {/* Faixa de quantidade */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Qtd. mínima de vendas">
              <input
                type="number" min={0}
                className={inputCls()}
                value={form.fromQuantity ?? ''}
                onChange={(e) => set('fromQuantity', e.target.value ? Number(e.target.value) : null)}
                placeholder="Ex: 1"
              />
            </Field>
            <Field label="Qtd. máxima de vendas">
              <input
                type="number" min={0}
                className={inputCls()}
                value={form.toQuantity ?? ''}
                onChange={(e) => set('toQuantity', e.target.value ? Number(e.target.value) : null)}
                placeholder="Sem limite"
              />
            </Field>
          </div>

          {/* Descrição */}
          <Field label="Descrição">
            <textarea
              rows={2}
              className={inputCls('resize-none')}
              value={form.description ?? ''}
              onChange={(e) => set('description', e.target.value || null)}
              placeholder="Descreva a regra..."
            />
          </Field>

          {/* Status */}
          <label className="flex cursor-pointer items-center gap-2.5">
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
          Tem certeza que deseja excluir a regra <strong>"{rule.name}"</strong>? Esta ação não pode ser desfeita.
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

  useEffect(() => { fetchRules(); fetchPositions() }, [fetchRules, fetchPositions])

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
                    {['Nome', 'Tipo', 'Cargo', 'Comissão', 'Faixa de Qtd.', 'Prioridade', 'Unidade', 'Status', 'Ações'].map((h) => (
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
                        {r.position?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3 font-semibold text-brand-700 tabular-nums whitespace-nowrap">
                        {r.commissionType === 'PERCENTUAL'
                          ? `${r.percentage ?? 0}%`
                          : `R$ ${Number(r.fixedValue ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                        {r.fromQuantity != null || r.toQuantity != null
                          ? `${r.fromQuantity ?? 0} – ${r.toQuantity ?? '∞'}`
                          : '—'}
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
