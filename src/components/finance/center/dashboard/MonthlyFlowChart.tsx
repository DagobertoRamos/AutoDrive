'use client'

// 12 meses: barras de entradas × saídas realizadas + linha do saldo no fim do mês
// (mesmo eixo em R$).

import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CHART, Legend, TipBox, brlCompact } from './shared'

export interface MonthPoint { month: string; label: string; entradas: number; saidas: number; saldo: number }

export function MonthlyFlowChart({ data }: { data: MonthPoint[] }) {
  return (
    <div className="space-y-2">
      <Legend items={[{ label: 'Entradas', color: CHART.in }, { label: 'Saídas', color: CHART.out }, { label: 'Saldo', color: CHART.balance, line: true }]} />
      <div className="h-64 w-full sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="22%">
            <CartesianGrid stroke={CHART.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: CHART.axis }} tickLine={false} axisLine={{ stroke: CHART.grid }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11, fill: CHART.axis }} tickLine={false} axisLine={false} width={78} tickFormatter={brlCompact} />
            <Tooltip
              cursor={{ fill: 'rgba(0,0,0,0.04)' }}
              content={(p) => {
                if (!p.active || !p.payload?.length) return null
                const d = p.payload[0].payload as MonthPoint
                return <TipBox title={d.label} rows={[
                  { label: 'Entradas', value: d.entradas, color: CHART.in },
                  { label: 'Saídas', value: d.saidas, color: CHART.out },
                  { label: 'Resultado de caixa', value: d.entradas - d.saidas },
                  { label: 'Saldo no fim do mês', value: d.saldo, color: CHART.balance },
                ]} />
              }}
            />
            <Bar dataKey="entradas" name="Entradas" fill={CHART.in} radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Bar dataKey="saidas" name="Saídas" fill={CHART.out} radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Line dataKey="saldo" name="Saldo" type="monotone" stroke={CHART.balance} strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: CHART.balance }} activeDot={{ r: 5 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
