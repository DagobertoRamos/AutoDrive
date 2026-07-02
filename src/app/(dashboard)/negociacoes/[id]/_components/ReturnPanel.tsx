'use client'

// =============================================================================
// ReturnPanel — Retorno financeiro da negociação (componente autocontido)
// Vendedor informa % de retorno. ILA/IOF vêm da configuração F&I do tenant
// por competência — o backend é a fonte de verdade do cálculo e snapshot.
// Consome /api/negotiations/[id]/return.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Percent, RefreshCw, Save } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  dealId:   string
  canEdit:  boolean
  onReload: () => void
  onToast:  (msg: string, kind?: 'success' | 'error') => void
}

const num = (v: unknown): number => (v == null ? 0 : Number(v) || 0)
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
interface ReturnConfig {
  range: { minReturnPercent: number; maxReturnPercent: number; deductionBase: 'GROSS_RETURN' | 'FINANCED_AMOUNT' }
  competence: { label: string }
  ila: { value: number; valueType: 'PERCENTUAL' | 'FIXO' } | null
  iof: { value: number; valueType: 'PERCENTUAL' | 'FIXO'; month?: number | null; year?: number | null } | null
}

// % de retorno: dígitos preenchem 1 casa decimal.
const fmtRate = (v: number) => v.toFixed(1).replace('.', ',')
function parseRateDigits(raw: string, max: number): number {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return 0
  return Math.min(parseInt(digits, 10) / 10, max)
}

export default function ReturnPanel({ dealId, canEdit, onReload, onToast }: Props) {
  const [financed, setFinanced] = useState(0)
  const [rate, setRate] = useState(0)
  const [config, setConfig] = useState<ReturnConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/negotiations/${dealId}/return`, { credentials: 'include' })
      const json = await res.json()
      const d = json?.data ?? {}
      setFinanced(num(d.financedAmount))
      setRate(num(d.returnRatePercent))
      setConfig(json?.returnConfig ?? null)
    } catch {
      /* silencioso */
    } finally {
      setLoading(false)
    }
  }, [dealId])

  useEffect(() => { load() }, [load])

  // Preview ao vivo (mesma fórmula do backend) — apenas visual.
  const gross = Math.round(financed * rate) / 100
  const deductionBase = config?.range.deductionBase === 'FINANCED_AMOUNT' ? financed : gross
  const deduction = (entry: ReturnConfig['ila'] | ReturnConfig['iof']) => {
    if (!entry) return 0
    if (entry.valueType === 'FIXO') return Math.round(entry.value * 100) / 100
    return Math.round(deductionBase * entry.value) / 100
  }
  const ilaValue = deduction(config?.ila ?? null)
  const iofValue = deduction(config?.iof ?? null)
  const net = Math.max(0, Math.round((gross - ilaValue - iofValue) * 100) / 100)
  const minRate = config?.range.minReturnPercent ?? 0
  const maxRate = config?.range.maxReturnPercent ?? 6
  const outOfRange = rate < minRate || rate > maxRate

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/negotiations/${dealId}/return`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ returnRatePercent: rate }),
      })
      if (!res.ok) throw new Error((await res.json())?.error ?? 'Erro ao salvar')
      onToast('Retorno atualizado.', 'success')
      onReload()
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Erro ao salvar retorno.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-500'

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <Percent size={15} className="text-brand-700" />
          <h3 className="text-sm font-semibold text-gray-800">Retorno financeiro</h3>
        </div>
        <button onClick={load} disabled={loading} className="text-gray-400 hover:text-gray-600" aria-label="Recarregar">
          <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
        </button>
      </div>

      <div className="space-y-4 p-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Valor financiado</label>
            <input disabled className={inputCls} value={brl(financed)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">% de retorno ({fmtRate(minRate)}–{fmtRate(maxRate)})</label>
            <input
              type="text" inputMode="numeric" disabled={!canEdit}
              className={inputCls}
              value={`${fmtRate(rate)}%`}
              onChange={(e) => setRate(parseRateDigits(e.target.value, maxRate))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Retorno bruto</label>
            <input disabled className={inputCls} value={brl(gross)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">ILA {config?.competence.label ? `(${config.competence.label})` : ''}</label>
            <input disabled className={inputCls} value={config?.ila ? `${config.ila.valueType === 'FIXO' ? brl(config.ila.value) : `${config.ila.value}%`} = ${brl(ilaValue)}` : 'Não cadastrado'} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">IOF</label>
            <input disabled className={inputCls} value={config?.iof ? `${config.iof.valueType === 'FIXO' ? brl(config.iof.value) : `${config.iof.value}%`} = ${brl(iofValue)}` : 'Não cadastrado'} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Retorno líquido</label>
            <input disabled className={cn(inputCls, 'font-semibold text-brand-700')} value={brl(net)} />
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>
            ILA: {brl(ilaValue)} · IOF: {brl(iofValue)} · base da comissão = líquido
            {outOfRange && <span className="ml-2 text-red-600">Retorno fora da faixa permitida.</span>}
            {(!config?.ila || !config?.iof) && <span className="ml-2 text-amber-700">Configure ILA/IOF antes de salvar.</span>}
          </span>
          {canEdit && (
            <button
              onClick={save} disabled={saving || outOfRange || !config?.ila || !config?.iof}
              className="flex items-center gap-2 rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
            >
              <Save size={14} />{saving ? 'Salvando...' : 'Salvar retorno'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
