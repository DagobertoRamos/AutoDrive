'use client'

// Fluxo de caixa: entradas e saídas (realizado sólido, previsto esmaecido) +
// linha do saldo acumulado (tracejada na parte projetada). Um único eixo em R$.

import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CHART, Legend, TipBox, brlCompact } from './shared'

export interface CashflowBucket {
  key: string; label: string; start: string; end: string; kind: 'realized' | 'projected' | 'mixed'
  realizedIn: number; realizedOut: number; projectedIn: number; projectedOut: number
  entradas: number; saidas: number; saldo: number; acumulado: number
}

const KIND_LABEL = { realized: 'Realizado', projected: 'Previsto', mixed: 'Realizado + previsto' } as const

export function CashflowChart({ data, showBalance = true }: { data: CashflowBucket[]; showBalance?: boolean }) {
  const rows = data.map((b) => ({
    ...b,
    accReal: b.kind !== 'projected' ? b.acumulado : null,
    accProj: b.kind !== 'realized' ? b.acumulado : null,
  }))
  const min = rows.reduce((m, r) => Math.min(m, r.acumulado), 0)
  return (
    <div className="space-y-2">
      <Legend items={[
        { label: 'Entradas realizadas', color: CHART.in },
        { label: 'Entradas previstas', color: CHART.in, faded: true },
        { label: 'Saídas realizadas', color: CHART.out },
        { label: 'Saídas previstas', color: CHART.out, faded: true },
        ...(showBalance ? [{ label: 'Saldo acumulado', color: CHART.balance, line: true }] : []),
      ]} />
      <div className="h-72 w-full sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="20%">
            <CartesianGrid stroke={CHART.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: CHART.axis }} tickLine={false} axisLine={{ stroke: CHART.grid }} minTickGap={16} />
            <YAxis tick={{ fontSize: 11, fill: CHART.axis }} tickLine={false} axisLine={false} width={78} tickFormatter={brlCompact} />
            {min < 0 && <ReferenceLine y={0} stroke="#9ca3af" />}
            <Tooltip
              cursor={{ fill: 'rgba(0,0,0,0.04)' }}
              content={(p) => {
                if (!p.active || !p.payload?.length) return null
                const d = p.payload[0].payload as CashflowBucket
                const rowsTip = [
                  ...(d.realizedIn ? [{ label: 'Entradas realizadas', value: d.realizedIn, color: CHART.in }] : []),
                  ...(d.projectedIn ? [{ label: 'Entradas previstas', value: d.projectedIn, color: CHART.in, dashed: true }] : []),
                  ...(d.realizedOut ? [{ label: 'Saídas realizadas', value: d.realizedOut, color: CHART.out }] : []),
                  ...(d.projectedOut ? [{ label: 'Saídas previstas', value: d.projectedOut, color: CHART.out, dashed: true }] : []),
                  { label: 'Saldo do período', value: d.saldo },
                  ...(showBalance ? [{ label: 'Saldo acumulado', value: d.acumulado, color: CHART.balance }] : []),
                ]
                return <TipBox title={<>{d.label} <span className="font-normal text-gray-500">· {KIND_LABEL[d.kind]}</span></>} rows={rowsTip} />
              }}
            />
            <Bar dataKey="realizedIn" stackId="in" fill={CHART.in} maxBarSize={26} />
            <Bar dataKey="projectedIn" stackId="in" fill={CHART.in} fillOpacity={0.35} radius={[4, 4, 0, 0]} maxBarSize={26} />
            <Bar dataKey="realizedOut" stackId="out" fill={CHART.out} maxBarSize={26} />
            <Bar dataKey="projectedOut" stackId="out" fill={CHART.out} fillOpacity={0.35} radius={[4, 4, 0, 0]} maxBarSize={26} />
            {showBalance && <Line dataKey="accReal" type="monotone" stroke={CHART.balance} strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />}
            {showBalance && <Line dataKey="accProj" type="monotone" stroke={CHART.balance} strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
