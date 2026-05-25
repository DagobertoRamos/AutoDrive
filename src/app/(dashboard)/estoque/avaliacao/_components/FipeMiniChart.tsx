'use client'

// =============================================================================
// FipeMiniChart — gráfico SVG inline de 6 meses de histórico FIPE.
// =============================================================================

import { useEffect, useState } from 'react'
import { Loader2, TrendingUp } from 'lucide-react'
import { formatBRL } from '@/lib/masks'

interface HistoryPoint { month: string; value: number }
interface ApiResponse  { months?: HistoryPoint[]; note?: string }

interface FipeMiniChartProps {
  fipeCode:     string | null
  vehicleType:  'carros' | 'motos' | 'caminhoes'
  currentValue?: number | null
}

export function FipeMiniChart({ fipeCode, vehicleType, currentValue }: FipeMiniChartProps) {
  const [data,    setData]    = useState<HistoryPoint[]>([])
  const [note,    setNote]    = useState<string>('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!fipeCode) { setData([]); setNote(''); return }
    let alive = true
    setLoading(true)
    setNote('')
    fetch(`/api/evaluations/fipe/history?fipeCode=${encodeURIComponent(fipeCode)}&vehicleType=${vehicleType}`, { cache: 'no-store' })
      .then((r) => r.json() as Promise<ApiResponse>)
      .then((d) => {
        if (!alive) return
        const months = Array.isArray(d?.months) ? d.months : []
        // NaN-safe: descarta entradas inválidas
        setData(months.filter((m) => m && typeof m.month === 'string' && Number.isFinite(Number(m.value))))
        if (d?.note) setNote(d.note)
      })
      .catch(() => { if (alive) { setData([]); setNote('Falha ao carregar histórico FIPE.') } })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [fipeCode, vehicleType])

  const safeCurrent = Number.isFinite(Number(currentValue)) ? Number(currentValue) : null
  const empty = !loading && data.length === 0

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-brand-600" />
          <h4 className="text-sm font-semibold text-gray-800">Histórico FIPE (últimos 6 meses)</h4>
        </div>
        {safeCurrent != null && (
          <span className="text-sm font-bold text-brand-700">{formatBRL(safeCurrent)}</span>
        )}
      </header>

      {loading && (
        <div className="flex items-center justify-center py-8 text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      )}

      {!loading && empty && (
        <p className="text-xs text-gray-500 py-4 text-center">
          {note || (fipeCode ? 'Histórico FIPE indisponível para este modelo.' : 'Selecione o código FIPE para ver o histórico.')}
        </p>
      )}

      {!loading && data.length > 0 && (
        <Chart points={data} />
      )}
    </div>
  )
}

// ── SVG inline ───────────────────────────────────────────────────────────────
function Chart({ points }: { points: HistoryPoint[] }) {
  const W = 600, H = 140, P = 24
  const innerW = W - P * 2
  const innerH = H - P * 2

  const values = points.map((p) => Number(p.value)).filter(Number.isFinite)
  if (values.length === 0) {
    return <p className="text-xs text-gray-500 py-4 text-center">Histórico FIPE indisponível para este modelo.</p>
  }
  const minV = Math.min(...values)
  const maxV = Math.max(...values)
  const range = maxV - minV || 1

  const xOf = (i: number) =>
    points.length === 1 ? W / 2 : P + (i * innerW) / (points.length - 1)
  const yOf = (v: number) => P + innerH - ((v - minV) / range) * innerH

  const lineD = points
    .map((p, i) => {
      const v = Number(p.value)
      if (!Number.isFinite(v)) return null
      return `${i === 0 ? 'M' : 'L'} ${xOf(i)} ${yOf(v)}`
    })
    .filter(Boolean)
    .join(' ')

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-full h-[140px]" preserveAspectRatio="none">
        {/* Grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <line
            key={t}
            x1={P} x2={W - P}
            y1={P + innerH * t} y2={P + innerH * t}
            stroke="#e5e7eb" strokeWidth={1}
          />
        ))}
        {/* Linha */}
        <path d={lineD} fill="none" stroke="#166534" strokeWidth={2} />
        {/* Dots */}
        {points.map((p, i) => {
          const v = Number(p.value)
          if (!Number.isFinite(v)) return null
          return (
            <g key={i}>
              <circle cx={xOf(i)} cy={yOf(v)} r={4} fill="#166534" />
              <title>{`${p.month}: ${formatBRL(v)}`}</title>
            </g>
          )
        })}
        {/* Eixo X */}
        {points.map((p, i) => (
          <text
            key={i}
            x={xOf(i)} y={H - 4}
            textAnchor="middle"
            fontSize={9}
            fill="#6b7280"
          >
            {p.month}
          </text>
        ))}
      </svg>
    </div>
  )
}
