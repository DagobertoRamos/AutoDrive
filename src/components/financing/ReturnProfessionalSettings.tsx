'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

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

function ToggleRow({ checked, disabled, label, onChange }: { checked: boolean; disabled: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
      <input disabled={disabled} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
      {label}
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
        <div>
          <h3 className="text-sm font-semibold text-gray-900">ILA mensal</h3>
          <p className="mt-0.5 text-xs text-gray-500">Informe o percentual interno de ILA para cada mês de competência.</p>
        </div>
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
        <div>
          <h3 className="text-sm font-semibold text-gray-900">IOF periódico</h3>
          <p className="mt-0.5 text-xs text-gray-500">Cadastre regras internas por vigência. O sistema bloqueia períodos ativos sobrepostos.</p>
        </div>
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
    setSaving(true); setError(null); setMessage(null)
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
            <p className="mt-0.5 text-xs text-gray-500">{loading ? 'Carregando...' : 'ILA e IOF aqui são parâmetros internos de desconto do retorno bruto da loja.'}</p>
          </div>
          {canEdit && (
            <button type="button" onClick={save} disabled={saving} className="btn-primary text-sm">
              <Save size={15} />{saving ? 'Salvando...' : 'Salvar configuração'}
            </button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Retorno mínimo (%)</label>
            <input disabled={!canEdit} type="number" min={0.01} max={20} step="0.01" className={inputCls} value={bundle.range.minReturnPercent} onChange={(e) => setRange({ minReturnPercent: Math.max(0, Number(e.target.value) || 0) })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Retorno máximo (%)</label>
            <input disabled={!canEdit} type="number" min={0.01} max={20} step="0.01" className={inputCls} value={bundle.range.maxReturnPercent} onChange={(e) => setRange({ maxReturnPercent: Math.max(0, Number(e.target.value) || 0) })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Base padrão</label>
            <select disabled className={inputCls} value={bundle.range.calculationBase}><option value="FINANCED_AMOUNT">Valor financiado</option></select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Base ILA/IOF</label>
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
          <ToggleRow checked={bundle.range.allowMissingIlaAsZero} disabled={!canEdit} label="Permitir ILA zero quando faltar competência" onChange={(allowMissingIlaAsZero) => setRange({ allowMissingIlaAsZero })} />
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
