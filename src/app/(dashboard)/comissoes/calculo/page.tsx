'use client'

// =============================================================================
// Cálculo de Comissões — AutoDrive
// Interface para calcular e registrar comissões do período
// =============================================================================

import { useState } from 'react'
import { Calculator, Loader2, CheckCircle2, AlertCircle, DollarSign } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CalcResult {
  sellerId:     string
  sellerName:   string
  period:       string
  baseValue:    number
  adjustments:  number
  finalValue:   number
}

function fmt(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function CalculoComissoesPage() {
  const [period, setPeriod]   = useState('')
  const [unitId, setUnitId]   = useState('')
  const [calculating, setCalculating] = useState(false)
  const [results, setResults] = useState<CalcResult[]>([])
  const [saving, setSaving]   = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null)

  const handleCalculate = async () => {
    if (!period) return
    setCalculating(true)
    setFeedback(null)
    setResults([])
    try {
      const res  = await fetch('/api/commissions/calculate', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period, unitId: unitId || undefined }),
      })
      const data = await res.json()
      if (data.success) {
        setResults(data.data ?? [])
        setFeedback({ ok: true, msg: `${data.data?.length ?? 0} vendedores calculados para ${period}.` })
      } else {
        setFeedback({ ok: false, msg: data.error ?? 'Erro ao calcular.' })
      }
    } catch {
      setFeedback({ ok: false, msg: 'Erro de conexão.' })
    } finally {
      setCalculating(false)
    }
  }

  const handleSave = async () => {
    if (!results.length) return
    setSaving(true)
    setFeedback(null)
    try {
      const res  = await fetch('/api/commissions', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period, results }),
      })
      const data = await res.json()
      setFeedback({ ok: data.success, msg: data.success ? 'Comissões salvas com sucesso.' : (data.error ?? 'Erro ao salvar.') })
      if (data.success) setResults([])
    } catch {
      setFeedback({ ok: false, msg: 'Erro de conexão.' })
    } finally {
      setSaving(false)
    }
  }

  const totalFinal = results.reduce((s, r) => s + r.finalValue, 0)

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Cálculo de Comissões</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Calcule as comissões dos vendedores com base nas regras configuradas para o período selecionado.
        </p>
      </div>

      {/* ── Parâmetros ──────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="section-header">
          <Calculator size={15} className="text-brand-700" />
          <h2 className="text-sm font-semibold text-gray-800">Parâmetros do Cálculo</h2>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Período *</label>
              <input
                type="month"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="input"
              />
              <p className="mt-1 text-xs text-gray-400">Selecione o mês/ano de referência.</p>
            </div>
            <div>
              <label className="label">Unidade <span className="text-gray-400 font-normal">(opcional)</span></label>
              <input
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
                placeholder="Todas as unidades"
                className="input"
              />
            </div>
          </div>

          {feedback && (
            <div className={cn(
              'flex items-center gap-2 rounded-lg px-4 py-3 text-sm',
              feedback.ok ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700',
            )}>
              {feedback.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              {feedback.msg}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              onClick={handleCalculate}
              disabled={!period || calculating}
              className="btn-primary"
            >
              {calculating
                ? <><Loader2 size={14} className="animate-spin" />Calculando...</>
                : <><Calculator size={14} />Calcular</>}
            </button>
          </div>
        </div>
      </div>

      {/* ── Resultados ──────────────────────────────────────────────────────── */}
      {results.length > 0 && (
        <div className="card animate-fade-in">
          <div className="section-header">
            <DollarSign size={15} className="text-brand-700" />
            <h2 className="text-sm font-semibold text-gray-800">Resultado do Cálculo — {period}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Vendedor','Valor Base','Ajustes','Total Final'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {results.map((r) => (
                  <tr key={r.sellerId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{r.sellerName}</td>
                    <td className="px-4 py-3 tabular-nums text-gray-600">{fmt(r.baseValue)}</td>
                    <td className={cn('px-4 py-3 tabular-nums font-medium', r.adjustments >= 0 ? 'text-green-600' : 'text-red-600')}>
                      {r.adjustments >= 0 ? '+' : ''}{fmt(r.adjustments)}
                    </td>
                    <td className="px-4 py-3 tabular-nums font-bold text-brand-700">{fmt(r.finalValue)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td colSpan={3} className="px-4 py-3 text-sm font-semibold text-gray-700">Total</td>
                  <td className="px-4 py-3 text-base font-bold text-brand-700 tabular-nums">{fmt(totalFinal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="flex justify-end gap-2 p-4 border-t border-gray-100">
            <button onClick={() => setResults([])} className="btn-secondary text-sm">Descartar</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
              {saving ? <><Loader2 size={13} className="animate-spin" />Salvando...</> : 'Salvar comissões'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
