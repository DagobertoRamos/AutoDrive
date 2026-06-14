'use client'

// =============================================================================
// ReturnPanel — Retorno financeiro da negociação (componente autocontido)
// Vendedor informa % de retorno (0–6). ILA/IOF só editáveis com permissão
// (negotiations.financing) — o backend é a fonte de verdade do cálculo.
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
// % de retorno: dígitos preenchem 1 casa decimal, máx 6,0 (spec).
const fmtRate = (v: number) => v.toFixed(1).replace('.', ',')
function parseRateDigits(raw: string): number {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return 0
  return Math.min(parseInt(digits, 10) / 10, 6)
}

export default function ReturnPanel({ dealId, canEdit, onReload, onToast }: Props) {
  const [financed, setFinanced] = useState(0)
  const [rate, setRate] = useState(0)
  const [ila, setIla] = useState(0)
  const [iof, setIof] = useState(0)
  const [canFinancing, setCanFinancing] = useState(false)
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
      setIla(num(d.ilaPercent))
      setIof(num(d.iofPercent))
      setCanFinancing(!!json?.canEditFinancing)
    } catch {
      /* silencioso */
    } finally {
      setLoading(false)
    }
  }, [dealId])

  useEffect(() => { load() }, [load])

  // Preview ao vivo (mesma fórmula do backend) — apenas visual.
  const gross = Math.round(financed * rate) / 100
  const ilaValue = Math.round(gross * ila) / 100
  const iofValue = Math.round(gross * iof) / 100
  const net = Math.max(0, Math.round((gross - ilaValue - iofValue) * 100) / 100)

  const save = async () => {
    setSaving(true)
    try {
      const body: Record<string, number> = { returnRatePercent: rate }
      if (canFinancing) { body.ilaPercent = ila; body.iofPercent = iof }
      const res = await fetch(`/api/negotiations/${dealId}/return`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body),
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
            <label className="mb-1 block text-xs font-medium text-gray-700">% de retorno (0–6)</label>
            <input
              type="text" inputMode="numeric" disabled={!canEdit}
              className={inputCls}
              value={`${fmtRate(rate)}%`}
              onChange={(e) => setRate(parseRateDigits(e.target.value))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Retorno bruto</label>
            <input disabled className={inputCls} value={brl(gross)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              ILA (%) {!canFinancing && <span className="text-gray-400">— restrito</span>}
            </label>
            <input
              type="number" min={0} step="0.0001" disabled={!canEdit || !canFinancing}
              className={inputCls} value={ila}
              onChange={(e) => setIla(Math.max(0, Number(e.target.value)))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              IOF (%) {!canFinancing && <span className="text-gray-400">— restrito</span>}
            </label>
            <input
              type="number" min={0} step="0.0001" disabled={!canEdit || !canFinancing}
              className={inputCls} value={iof}
              onChange={(e) => setIof(Math.max(0, Number(e.target.value)))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Retorno líquido</label>
            <input disabled className={cn(inputCls, 'font-semibold text-brand-700')} value={brl(net)} />
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>ILA: {brl(ilaValue)} · IOF: {brl(iofValue)} · base da comissão = líquido</span>
          {canEdit && (
            <button
              onClick={save} disabled={saving}
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
