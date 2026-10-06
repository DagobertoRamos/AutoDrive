'use client'

// Saldo projetado dia a dia (próximos 90 dias).

import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CHART, TipBox, brlCompact, dateBR } from './shared'

export interface ProjectionPoint { date: string; entradas: number; saidas: number; balance: number }

export function ProjectionChart({ data }: { data: ProjectionPoint[] }) {
  const min = data.reduce((m, p) => Math.min(m, p.balance), Infinity)
  return (
    <div className="h-56 w-full sm:h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="projFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART.balance} stopOpacity={0.22} />
              <stop offset="100%" stopColor={CHART.balance} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: CHART.axis }} tickLine={false} axisLine={{ stroke: CHART.grid }}
            tickFormatter={(d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`} minTickGap={28} />
          <YAxis tick={{ fontSize: 11, fill: CHART.axis }} tickLine={false} axisLine={false} width={78} tickFormatter={brlCompact} />
          {min < 0 && <ReferenceLine y={0} stroke="#dc2626" strokeDasharray="4 4" />}
          <Tooltip
            content={(p) => {
              if (!p.active || !p.payload?.length) return null
              const d = p.payload[0].payload as ProjectionPoint
              return <TipBox title={dateBR(d.date)} rows={[
                { label: 'A receber', value: d.entradas, color: CHART.in },
                { label: 'A pagar', value: d.saidas, color: CHART.out },
                { label: 'Saldo projetado', value: d.balance, color: CHART.balance },
              ]} />
            }}
          />
          <Area dataKey="balance" type="stepAfter" stroke={CHART.balance} strokeWidth={2} fill="url(#projFill)" activeDot={{ r: 4 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
