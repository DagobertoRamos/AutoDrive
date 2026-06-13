'use client'

// =============================================================================
// Gerenciar Metas — AutoDrive (tela de gestão sobre /api/goals)
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, Target, X, Save, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface GoalLevel { level: number; targetValue: number; label?: string | null }
interface Goal {
  id:          string
  type:        string
  scope:       string
  period:      string
  title:       string | null
  unitId:      string | null
  userId:      string | null
  startDate:   string
  endDate:     string
  targetValue: number | string
  measureUnit: string
  progressive: boolean
  status:      string
  levels:      GoalLevel[]
}

interface Option { value: string; label: string }

const TYPES: Option[] = [
  { value: 'SALES_EXCHANGE', label: 'Vendas e Trocas' },
  { value: 'PURCHASE', label: 'Compras' },
  { value: 'RETURN', label: 'Retornos' },
  { value: 'DOCUMENTATION', label: 'Documentação' },
  { value: 'EXTENDED_WARRANTY', label: 'Garantia Estendida' },
  { value: 'SERVICE', label: 'Serviços' },
]
const SCOPES: Option[] = [
  { value: 'USER', label: 'Vendedor' },
  { value: 'UNIT', label: 'Unidade' },
  { value: 'TENANT', label: 'Loja inteira' },
]
const PERIODS: Option[] = [
  { value: 'DAILY', label: 'Diário' },
  { value: 'WEEKLY', label: 'Semanal' },
  { value: 'MONTHLY', label: 'Mensal' },
  { value: 'QUARTERLY', label: 'Trimestral' },
  { value: 'YEARLY', label: 'Anual' },
  { value: 'CUSTOM', label: 'Personalizado' },
]
const UNITS_MEASURE: Option[] = [
  { value: 'QTD', label: 'Quantidade' },
  { value: 'BRL', label: 'Reais (R$)' },
  { value: 'PERCENT', label: 'Percentual (%)' },
]

const labelOf = (opts: Option[], v: string) => opts.find((o) => o.value === v)?.label ?? v

interface GoalForm {
  type: string; scope: string; period: string; title: string
  unitId: string; userId: string
  startDate: string; endDate: string
  targetValue: number; measureUnit: string
  progressive: boolean; levels: GoalLevel[]
}

const today = () => new Date().toISOString().slice(0, 10)
const emptyForm: GoalForm = {
  type: 'SALES_EXCHANGE', scope: 'USER', period: 'MONTHLY', title: '',
  unitId: '', userId: '', startDate: today(), endDate: today(),
  targetValue: 0, measureUnit: 'QTD', progressive: false, levels: [],
}

function inputClass(extra?: string) {
  return cn(
    'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500',
    extra,
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function Modal({
  open, onClose, onSave, initial, saving, error, units, sellers,
}: {
  open: boolean
  onClose: () => void
  onSave: (data: GoalForm) => Promise<void>
  initial?: Goal | null
  saving: boolean
  error: string | null
  units: Option[]
  sellers: Option[]
}) {
  const [form, setForm] = useState<GoalForm>(emptyForm)

  useEffect(() => {
    if (!open) return
    if (initial) {
      setForm({
        type: initial.type, scope: initial.scope, period: initial.period,
        title: initial.title ?? '', unitId: initial.unitId ?? '', userId: initial.userId ?? '',
        startDate: initial.startDate.slice(0, 10), endDate: initial.endDate.slice(0, 10),
        targetValue: Number(initial.targetValue), measureUnit: initial.measureUnit,
        progressive: initial.progressive, levels: initial.levels ?? [],
      })
    } else {
      setForm({ ...emptyForm })
    }
  }, [open, initial])

  if (!open) return null

  const set = <K extends keyof GoalForm>(key: K, value: GoalForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const setLevel = (i: number, patch: Partial<GoalLevel>) =>
    setForm((prev) => ({ ...prev, levels: prev.levels.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) }))
  const addLevel = () =>
    setForm((prev) => ({ ...prev, levels: [...prev.levels, { level: prev.levels.length + 1, targetValue: 0, label: '' }] }))
  const removeLevel = (i: number) =>
    setForm((prev) => ({ ...prev, levels: prev.levels.filter((_, idx) => idx !== i).map((l, idx) => ({ ...l, level: idx + 1 })) }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50">
              <Target className="h-5 w-5 text-brand-700" />
            </div>
            <h2 className="text-base font-semibold text-gray-900">{initial ? 'Editar Meta' : 'Nova Meta'}</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); onSave(form) }} className="space-y-4 px-6 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Tipo *</label>
              <select className={inputClass()} value={form.type} onChange={(e) => set('type', e.target.value)}>
                {TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Escopo *</label>
              <select className={inputClass()} value={form.scope} onChange={(e) => set('scope', e.target.value)}>
                {SCOPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {form.scope === 'UNIT' && (
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-gray-700">Unidade *</label>
                <select className={inputClass()} value={form.unitId} onChange={(e) => set('unitId', e.target.value)}>
                  <option value="">Selecione...</option>
                  {units.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            )}
            {form.scope === 'USER' && (
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-gray-700">Vendedor *</label>
                <select className={inputClass()} value={form.userId} onChange={(e) => set('userId', e.target.value)}>
                  <option value="">Selecione...</option>
                  {sellers.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            )}

            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Título (opcional)</label>
              <input className={inputClass()} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Ex: Meta de vendas — junho" />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Período *</label>
              <select className={inputClass()} value={form.period} onChange={(e) => set('period', e.target.value)}>
                {PERIODS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Unidade de medida *</label>
              <select className={inputClass()} value={form.measureUnit} onChange={(e) => set('measureUnit', e.target.value)}>
                {UNITS_MEASURE.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Início *</label>
              <input type="date" className={inputClass()} value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Fim *</label>
              <input type="date" className={inputClass()} value={form.endDate} onChange={(e) => set('endDate', e.target.value)} />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Alvo base *</label>
              <input
                type="number" min={0} step="any" className={inputClass()}
                value={form.targetValue}
                onChange={(e) => set('targetValue', Number(e.target.value))}
              />
            </div>
          </div>

          {/* Progressão por níveis */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Metas progressivas (níveis)</span>
              <button
                type="button" role="switch" aria-checked={form.progressive}
                onClick={() => set('progressive', !form.progressive)}
                className={cn('relative inline-flex h-6 w-11 items-center rounded-full transition-colors', form.progressive ? 'bg-brand-600' : 'bg-gray-300')}
              >
                <span className={cn('inline-block h-4 w-4 rounded-full bg-white shadow transition-transform', form.progressive ? 'translate-x-6' : 'translate-x-1')} />
              </button>
            </div>

            {form.progressive && (
              <div className="mt-3 space-y-2">
                {form.levels.map((lvl, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-14 shrink-0 text-xs font-semibold text-gray-500">Nível {lvl.level}</span>
                    <input
                      type="number" min={0} step="any" placeholder="Alvo"
                      className={inputClass('flex-1')}
                      value={lvl.targetValue}
                      onChange={(e) => setLevel(i, { targetValue: Number(e.target.value) })}
                    />
                    <input
                      placeholder="Rótulo (ex: Bronze)"
                      className={inputClass('flex-1')}
                      value={lvl.label ?? ''}
                      onChange={(e) => setLevel(i, { label: e.target.value })}
                    />
                    <button type="button" onClick={() => removeLevel(i)} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={addLevel} className="flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:underline">
                  <Plus className="h-3.5 w-3.5" /> Adicionar nível
                </button>
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />{error}
            </div>
          )}

          <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-lg bg-brand-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60">
              <Save className="h-4 w-4" />{saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function MetasPage() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [units, setUnits] = useState<Option[]>([])
  const [sellers, setSellers] = useState<Option[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Goal | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 3000) }

  const fetchGoals = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/goals', { credentials: 'include' })
      const json = await res.json()
      setGoals(json?.data ?? [])
    } catch { setGoals([]) } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchGoals()
    fetch('/api/units', { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => setUnits((j?.data ?? []).map((u: { id: string; name: string }) => ({ value: u.id, label: u.name }))))
      .catch(() => {})
    fetch('/api/sellers', { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => setSellers((j?.data ?? [])
        .filter((s: { userId?: string }) => s.userId)
        .map((s: { userId: string; fullName: string }) => ({ value: s.userId, label: s.fullName }))))
      .catch(() => {})
  }, [fetchGoals])

  const openCreate = () => { setEditing(null); setSaveError(null); setModalOpen(true) }
  const openEdit = (g: Goal) => { setEditing(g); setSaveError(null); setModalOpen(true) }

  const handleSave = async (data: GoalForm) => {
    setSaving(true); setSaveError(null)
    try {
      const body = {
        type: data.type, scope: data.scope, period: data.period,
        title: data.title || null,
        unitId: data.scope === 'UNIT' ? data.unitId : null,
        userId: data.scope === 'USER' ? data.userId : null,
        startDate: data.startDate, endDate: data.endDate,
        targetValue: data.targetValue, measureUnit: data.measureUnit,
        progressive: data.progressive,
        ...(data.progressive
          ? { levels: data.levels.map((l) => ({ level: l.level, targetValue: l.targetValue, label: l.label || null })) }
          : {}),
      }

      let goalId = editing?.id
      if (editing) {
        const res = await fetch(`/api/goals/${editing.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error((await res.json())?.error ?? 'Erro ao salvar')
        // Sincroniza níveis (substituição completa) na edição.
        const lvls = data.progressive ? data.levels.map((l) => ({ level: l.level, targetValue: l.targetValue, label: l.label || null })) : []
        await fetch(`/api/goals/${editing.id}/levels`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ levels: lvls }),
        })
      } else {
        const res = await fetch('/api/goals', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error((await res.json())?.error ?? 'Erro ao criar')
        goalId = (await res.json())?.data?.id
      }

      setModalOpen(false)
      flash(editing ? 'Meta atualizada!' : 'Meta criada!')
      await fetchGoals()
      void goalId
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Erro ao salvar.')
    } finally { setSaving(false) }
  }

  const handleDelete = async (g: Goal) => {
    if (!confirm('Excluir esta meta? Os níveis e o progresso serão removidos.')) return
    try {
      const res = await fetch(`/api/goals/${g.id}`, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) throw new Error()
      flash('Meta excluída.')
      await fetchGoals()
    } catch { flash('Erro ao excluir.') }
  }

  const recompute = async (g: Goal) => {
    try {
      const res = await fetch(`/api/goals/${g.id}/progress`, { method: 'POST', credentials: 'include' })
      if (!res.ok) throw new Error()
      flash('Progresso recalculado.')
    } catch { flash('Erro ao recalcular.') }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Metas</h1>
          <p className="mt-1 text-sm text-gray-500">Configure metas por vendedor, unidade ou loja, com níveis progressivos.</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-800">
          <Plus className="h-4 w-4" />Nova Meta
        </button>
      </div>

      {msg && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
          <CheckCircle className="h-4 w-4" />{msg}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                {['Tipo', 'Escopo', 'Período', 'Alvo', 'Níveis', 'Status', 'Ações'].map((h) => (
                  <th key={h} className="whitespace-nowrap px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>
                    ))}
                  </tr>
                ))
              ) : goals.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-sm text-gray-400">
                    Nenhuma meta cadastrada. <button onClick={openCreate} className="text-brand-600 hover:underline">Criar agora</button>
                  </td>
                </tr>
              ) : (
                goals.map((g) => (
                  <tr key={g.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{g.title || labelOf(TYPES, g.type)}</td>
                    <td className="px-4 py-3 text-gray-600">{labelOf(SCOPES, g.scope)}</td>
                    <td className="px-4 py-3 text-gray-600">{labelOf(PERIODS, g.period)}</td>
                    <td className="px-4 py-3 tabular-nums text-gray-700">
                      {Number(g.targetValue).toLocaleString('pt-BR')} {g.measureUnit}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{g.progressive ? `${g.levels?.length ?? 0} níveis` : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium',
                        g.status === 'ATIVA' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                        {g.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => recompute(g)} className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-700" title="Recalcular progresso">
                          <RefreshCw className="h-4 w-4" />
                        </button>
                        <button onClick={() => openEdit(g)} className="rounded-lg p-1.5 text-gray-400 hover:bg-brand-50 hover:text-brand-700" title="Editar">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => handleDelete(g)} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Excluir">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={modalOpen} onClose={() => setModalOpen(false)} onSave={handleSave}
        initial={editing} saving={saving} error={saveError} units={units} sellers={sellers}
      />
    </div>
  )
}
