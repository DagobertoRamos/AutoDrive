'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RequiredMark } from '@/components/ui/field'
import { HelpHint } from '@/components/ui/help-hint'
import { DEAL_HINTS } from '@/lib/glossary-deals'

type ValueType = 'PERCENTUAL' | 'FIXO'
type DeductionBase = 'GROSS_RETURN' | 'FINANCED_AMOUNT'

interface RangeConfig {
  minReturnPercent: number
  maxReturnPercent: number
  calculationBase: 'FINANCED_AMOUNT'
  deductionBase: DeductionBase
  allowMissingIlaAsZero: boolean
  allowMissingIofAsZero: boolean
  active: boolean
}

interface CompetenceRow {
  id?: string
  name?: string | null
  month: number | null
  year: number | null
  startsAt?: string | null
  endsAt?: string | null
  value: number
  valueType: ValueType
  active: boolean
  notes: string | null
}

interface Bundle {
  range: RangeConfig
  ila: CompetenceRow[]
  iof: CompetenceRow[]
}

const defaultBundle: Bundle = {
  range: {
    minReturnPercent: 0.01,
    maxReturnPercent: 20,
    calculationBase: 'FINANCED_AMOUNT',
    deductionBase: 'GROSS_RETURN',
    allowMissingIlaAsZero: false,
    allowMissingIofAsZero: false,
    active: true,
  },
  ila: [],
  iof: [],
}

const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-500'
const months = Array.from({ length: 12 }, (_, i) => i + 1)

function todayDate() {
  return new Date().toISOString().slice(0, 10)
}

function emptyIlaRow(): CompetenceRow {
  const now = new Date()
  return {
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    value: 0,
    valueType: 'PERCENTUAL',
    active: true,
    notes: null,
  }
}

function emptyIofRow(): CompetenceRow {
  return {
    name: 'IOF vigente',
    month: null,
    year: null,
    startsAt: todayDate(),
    endsAt: null,
    value: 0,
    valueType: 'PERCENTUAL',
    active: true,
    notes: null,
  }
}

function ToggleRow({ checked, disabled, label, onChange, help }: { checked: boolean; disabled: boolean; label: string; onChange: (checked: boolean) => void; help?: boolean }) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
      <input disabled={disabled} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
      {label}
      {help && <HelpHint {...DEAL_HINTS.ILA_IOF_ZERO} size={12} />}
    </label>
  )
}

function IlaEditor({ rows, onChange, canEdit }: { rows: CompetenceRow[]; onChange: (rows: CompetenceRow[]) => void; canEdit: boolean }) {
  const update = (index: number, patch: Partial<CompetenceRow>) => {
    onChange(rows.map((row, i) => i === index ? { ...row, ...patch } : row))
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-1 text-sm font-semibold text-gray-900">ILA mensal<HelpHint term="ILA" /></h3>
        {canEdit && <button type="button" onClick={() => onChange([...rows, emptyIlaRow()])} className="btn-secondary text-xs"><Plus size={14} />Adicionar</button>}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-200 py-6 text-center text-sm text-gray-400">Nenhum ILA mensal cadastrado.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row, index) => (
            <div key={row.id ?? index} className="grid gap-2 rounded-lg border border-gray-100 bg-gray-50 p-3 sm:grid-cols-[1fr_1fr_1fr_1.5fr_auto]">
              <select disabled={!canEdit} className={inputCls} value={row.month ?? ''} onChange={(e) => update(index, { month: Number(e.target.value) || null })}>
                {months.map((m) => <option key={m} value={m}>{String(m).padStart(2, '0')}</option>)}
              </select>
              <input disabled={!canEdit} type="number" min={2000} max={2100} className={inputCls} value={row.year ?? ''} onChange={(e) => update(index, { year: Number(e.target.value) || null })} placeholder="Ano" />
              <input disabled={!canEdit} type="number" min={0} max={100} step="0.01" className={inputCls} value={row.value} onChange={(e) => update(index, { value: Math.max(0, Number(e.target.value) || 0), valueType: 'PERCENTUAL' })} placeholder="ILA %" />
              <input disabled={!canEdit} className={inputCls} value={row.notes ?? ''} onChange={(e) => update(index, { notes: e.target.value || null })} placeholder="Observação" />
              <div className="flex items-center justify-end gap-2">
                <label className="flex items-center gap-1 text-xs text-gray-600">
                  <input disabled={!canEdit} type="checkbox" checked={row.active} onChange={(e) => update(index, { active: e.target.checked })} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                  Ativo
                </label>
                {canEdit && <button type="button" onClick={() => onChange(rows.filter((_, i) => i !== index))} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Remover"><Trash2 size={14} /></button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function IofEditor({ rows, onChange, canEdit }: { rows: CompetenceRow[]; onChange: (rows: CompetenceRow[]) => void; canEdit: boolean }) {
  const update = (index: number, patch: Partial<CompetenceRow>) => {
    onChange(rows.map((row, i) => i === index ? { ...row, ...patch } : row))
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-1 text-sm font-semibold text-gray-900">IOF periódico<HelpHint term="IOF" /></h3>
        {canEdit && <button type="button" onClick={() => onChange([...rows, emptyIofRow()])} className="btn-secondary text-xs"><Plus size={14} />Adicionar</button>}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-200 py-6 text-center text-sm text-gray-400">Nenhum IOF periódico cadastrado.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row, index) => (
            <div key={row.id ?? index} className="grid gap-2 rounded-lg border border-gray-100 bg-gray-50 p-3 sm:grid-cols-[1.2fr_1fr_1fr_0.8fr_1.3fr_auto]">
              <input disabled={!canEdit} className={inputCls} value={row.name ?? ''} onChange={(e) => update(index, { name: e.target.value || null })} placeholder="Nome da regra" />
              <input disabled={!canEdit} type="date" className={inputCls} value={row.startsAt ?? ''} onChange={(e) => update(index, { startsAt: e.target.value || null, month: null, year: null })} />
              <input disabled={!canEdit} type="date" className={inputCls} value={row.endsAt ?? ''} onChange={(e) => update(index, { endsAt: e.target.value || null })} />
              <input disabled={!canEdit} type="number" min={0} max={100} step="0.01" className={inputCls} value={row.value} onChange={(e) => update(index, { value: Math.max(0, Number(e.target.value) || 0), valueType: 'PERCENTUAL' })} placeholder="IOF %" />
              <input disabled={!canEdit} className={inputCls} value={row.notes ?? ''} onChange={(e) => update(index, { notes: e.target.value || null })} placeholder="Observação" />
              <div className="flex items-center justify-end gap-2">
                <label className="flex items-center gap-1 text-xs text-gray-600">
                  <input disabled={!canEdit} type="checkbox" checked={row.active} onChange={(e) => update(index, { active: e.target.checked })} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                  Ativo
                </label>
                {canEdit && <button type="button" onClick={() => onChange(rows.filter((_, i) => i !== index))} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Remover"><Trash2 size={14} /></button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function ReturnProfessionalSettings({ canEdit }: { canEdit: boolean }) {
  const [bundle, setBundle] = useState<Bundle>(defaultBundle)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/settings/financing/return-config', { credentials: 'include' })
      const json = await res.json()
      if (json?.data) setBundle({ ...defaultBundle, ...json.data, range: { ...defaultBundle.range, ...json.data.range } })
    } catch {
      setError('Não foi possível carregar a configuração de retorno.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const setRange = (patch: Partial<RangeConfig>) => {
    setBundle((prev) => ({ ...prev, range: { ...prev.range, ...patch } }))
  }

  const save = async () => {
    setError(null); setMessage(null)
    const { minReturnPercent: min, maxReturnPercent: max } = bundle.range
    const invalid =
      !(min > 0) || !(max > 0)                              ? 'Informe o retorno mínimo e máximo.'
      : max < min                                           ? 'Retorno máximo deve ser maior que o mínimo.'
      : bundle.ila.some((r) => !r.month || !r.year)         ? 'Informe mês e ano do ILA.'
      : bundle.iof.some((r) => !r.startsAt)                 ? 'Informe o início da vigência do IOF.'
      : null
    if (invalid) { setError(invalid); return }
    setSaving(true)
    try {
      const res = await fetch('/api/settings/financing/return-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(bundle),
      })
      const json = await res.json()
      if (!res.ok) { setError(json?.error ?? 'Erro ao salvar configuração.'); return }
      setBundle(json.data ?? bundle)
      setMessage('Configuração de retorno atualizada.')
    } catch {
      setError('Erro de rede ao salvar configuração.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Configuração Geral de Retorno / F&amp;I</h2>
            {loading && <p className="mt-0.5 text-xs text-gray-500">Carregando...</p>}
          </div>
          {canEdit && (
            <button type="button" onClick={save} disabled={saving} className="btn-primary text-sm">
              <Save size={15} />{saving ? 'Salvando...' : 'Salvar configuração'}
            </button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-5">
          <div>
            <label className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-700">Retorno mínimo (%) <RequiredMark /><HelpHint {...DEAL_HINTS.FAIXA_RETORNO} size={12} /></label>
            <input disabled={!canEdit} type="number" min={0.01} max={20} step="0.01" className={inputCls} value={bundle.range.minReturnPercent} onChange={(e) => setRange({ minReturnPercent: Math.max(0, Number(e.target.value) || 0) })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Retorno máximo (%) <RequiredMark /></label>
            <input disabled={!canEdit} type="number" min={0.01} max={20} step="0.01" className={inputCls} value={bundle.range.maxReturnPercent} onChange={(e) => setRange({ maxReturnPercent: Math.max(0, Number(e.target.value) || 0) })} />
          </div>
          <div>
            <label className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-700">Base padrão<HelpHint {...DEAL_HINTS.VALOR_FINANCIADO} size={12} /></label>
            <select disabled className={inputCls} value={bundle.range.calculationBase}><option value="FINANCED_AMOUNT">Valor financiado</option></select>
          </div>
          <div>
            <label className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-700">Base ILA/IOF<HelpHint {...DEAL_HINTS.BASE_DEDUCAO} size={12} /></label>
            <select disabled className={inputCls} value={bundle.range.deductionBase} onChange={(e) => setRange({ deductionBase: e.target.value as DeductionBase })}>
              <option value="GROSS_RETURN">Retorno bruto</option>
            </select>
          </div>
          <label className="flex items-end gap-2 pb-2 text-sm text-gray-700">
            <input disabled={!canEdit} type="checkbox" checked={bundle.range.active} onChange={(e) => setRange({ active: e.target.checked })} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
            Configuração ativa
          </label>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <ToggleRow help checked={bundle.range.allowMissingIlaAsZero} disabled={!canEdit} label="Permitir ILA zero quando faltar competência" onChange={(allowMissingIlaAsZero) => setRange({ allowMissingIlaAsZero })} />
          <ToggleRow checked={bundle.range.allowMissingIofAsZero} disabled={!canEdit} label="Permitir IOF zero quando não houver vigência" onChange={(allowMissingIofAsZero) => setRange({ allowMissingIofAsZero })} />
        </div>

        {(message || error) && (
          <p className={cn('mt-3 rounded-lg px-3 py-2 text-sm', error ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700')}>
            {error ?? message}
          </p>
        )}
      </div>

      <IlaEditor rows={bundle.ila} canEdit={canEdit} onChange={(ila) => setBundle((prev) => ({ ...prev, ila }))} />
      <IofEditor rows={bundle.iof} canEdit={canEdit} onChange={(iof) => setBundle((prev) => ({ ...prev, iof }))} />
    </div>
  )
}
