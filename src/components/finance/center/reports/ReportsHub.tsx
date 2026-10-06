'use client'

// Relatórios gerenciais — seletor de relatório + filtros comuns + exportação.

import { useCallback, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Ban, BarChart3, Building2, CalendarClock, CarFront, Landmark, PieChart, Scale, Target, Truck, Users, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MonthInput, RegimeToggle, SelectInput, Toolbar, currentMonth, downloadCsv, monthLabel, monthsBack, qs, type Option } from './shared'
import { ExpensesByCategoryReport, SuppliersReport } from './CategoryReports'
import { FiRevenueReport, ResultByCenterReport, ServicesSoldReport } from './CenterReports'
import { GroupProfitReport, VehicleProfitReport } from './ProfitReports'
import { AgingReport, BudgetReport, MonthlyComparisonReport } from './PeriodReports'
import { CancellationReport } from './CancellationReport'
import type { CsvSpec } from './types'

type View =
  | 'resultado-centros' | 'servicos' | 'receitas-fi' | 'despesas-categoria' | 'fornecedores' | 'lucratividade-veiculo' | 'lucratividade-vendedor'
  | 'lucratividade-unidade' | 'comparativo-mensal' | 'orcado-realizado' | 'aging' | 'cancelamentos'

type Filter = 'range' | 'to' | 'regime' | 'costCenter' | 'unit' | 'seller'

const REPORTS: { key: View; label: string; icon: typeof PieChart; filters: Filter[] }[] = [
  { key: 'resultado-centros', label: 'Resultado por área', icon: Building2, filters: ['range', 'regime', 'unit'] },
  { key: 'servicos', label: 'Serviços vendidos', icon: Wrench, filters: ['range', 'unit', 'seller'] },
  { key: 'receitas-fi', label: 'Receitas de F&I', icon: Landmark, filters: ['range', 'regime', 'unit', 'seller'] },
  { key: 'despesas-categoria', label: 'Despesas por categoria', icon: PieChart, filters: ['range', 'regime', 'costCenter', 'unit'] },
  { key: 'fornecedores', label: 'Fornecedores', icon: Truck, filters: ['range', 'regime', 'costCenter', 'unit'] },
  { key: 'lucratividade-veiculo', label: 'Lucro por veículo', icon: CarFront, filters: ['range', 'unit', 'seller'] },
  { key: 'lucratividade-vendedor', label: 'Lucro por vendedor', icon: Users, filters: ['range', 'unit'] },
  { key: 'lucratividade-unidade', label: 'Lucro por unidade', icon: Building2, filters: ['range'] },
  { key: 'comparativo-mensal', label: 'Comparativo mensal', icon: BarChart3, filters: ['to', 'regime', 'costCenter', 'unit'] },
  { key: 'orcado-realizado', label: 'Orçado × realizado', icon: Target, filters: ['range', 'costCenter', 'unit'] },
  { key: 'aging', label: 'Aging', icon: CalendarClock, filters: ['costCenter', 'unit'] },
  { key: 'cancelamentos', label: 'Cancelamentos e estornos', icon: Ban, filters: ['range', 'unit', 'seller'] },
]

interface FilterLists { costCenters: Option[]; units: Option[]; sellers: Option[] }

export default function ReportsHub() {
  const sp = useSearchParams()
  // 'centro-custo' = nome antigo do "Resultado por área" (links salvos continuam valendo).
  const asked = sp.get('view') === 'centro-custo' ? 'resultado-centros' : sp.get('view')
  const initial = REPORTS.find((r) => r.key === asked)?.key ?? 'resultado-centros'
  const [view, setView] = useState<View>(initial)
  const [from, setFrom] = useState(monthsBack(2))
  const [to, setTo] = useState(currentMonth())
  const [regime, setRegime] = useState<'competencia' | 'caixa'>('competencia')
  const [costCenterId, setCostCenterId] = useState('')
  const [unitId, setUnitId] = useState('')
  const [sellerId, setSellerId] = useState('')
  const [lists, setLists] = useState<FilterLists>({ costCenters: [], units: [], sellers: [] })
  const csv = useRef<CsvSpec | null>(null)
  const [hasCsv, setHasCsv] = useState(false)

  const def = REPORTS.find((r) => r.key === view)!
  const has = (f: Filter) => def.filters.includes(f)

  const select = (v: View) => {
    setView(v)
    try { window.history.replaceState(null, '', `?view=${v}`) } catch { /* sem histórico */ }
  }

  const onData = useCallback((data: unknown) => {
    const f = (data as { filters?: Partial<FilterLists> } | null)?.filters
    if (f) setLists({ costCenters: f.costCenters ?? [], units: f.units ?? [], sellers: f.sellers ?? [] })
  }, [])
  const registerCsv = useCallback((spec: CsvSpec | null) => { csv.current = spec; setHasCsv(!!spec) }, [])

  const url = `/api/finance/center/reports?${qs({
    view,
    from: has('range') ? from : null,
    to: has('range') || has('to') ? to : null,
    regime: has('regime') ? regime : null,
    costCenterId: has('costCenter') ? costCenterId : null,
    unitId: has('unit') ? unitId : null,
    sellerId: has('seller') ? sellerId : null,
  })}`
  const props = { url, onData, registerCsv }

  const subtitle = has('range') ? `${monthLabel(from <= to ? from : to)} a ${monthLabel(from <= to ? to : from)}`
    : has('to') ? `12 meses até ${monthLabel(to)}` : 'Posição de hoje'

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Relatórios gerenciais</h1>
        <p className="mt-0.5 text-sm text-gray-500">{def.label} · {subtitle}{has('regime') ? ` · ${regime === 'caixa' ? 'caixa' : 'competência'}` : ''}</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 print:hidden">
        {REPORTS.map((r) => {
          const Icon = r.icon
          return (
            <button key={r.key} type="button" onClick={() => select(r.key)}
              className={cn('inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                view === r.key ? 'border-brand-600 bg-brand-600 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50')}>
              <Icon size={15} />{r.label}
            </button>
          )
        })}
      </div>

      <Toolbar onCsv={hasCsv ? () => csv.current && downloadCsv(csv.current.name, csv.current.headers, csv.current.rows) : undefined}>
        {has('range') && <MonthInput label="De" value={from} onChange={setFrom} />}
        {(has('range') || has('to')) && <MonthInput label={has('range') ? 'Até' : 'Mês final'} value={to} onChange={setTo} />}
        {has('regime') && <RegimeToggle value={regime} onChange={setRegime} />}
        {has('costCenter') && <SelectInput label="Área / centro" value={costCenterId} onChange={setCostCenterId} all="Todas" options={[...lists.costCenters, { id: 'none', name: 'Sem centro' }]} />}
        {has('unit') && lists.units.length > 1 && <SelectInput label="Unidade" value={unitId} onChange={setUnitId} all="Todas" options={lists.units} />}
        {has('seller') && <SelectInput label="Vendedor" value={sellerId} onChange={setSellerId} all="Todos" options={lists.sellers} />}
        {!has('range') && !has('to') && <span className="flex items-center gap-1.5 self-center text-xs text-gray-500"><Scale size={13} />Contas em aberto na data de hoje</span>}
      </Toolbar>

      {view === 'resultado-centros' && <ResultByCenterReport key={view} {...props} />}
      {view === 'servicos' && <ServicesSoldReport key={view} {...props} />}
      {view === 'receitas-fi' && <FiRevenueReport key={view} {...props} />}
      {view === 'despesas-categoria' && <ExpensesByCategoryReport key={view} {...props} />}
      {view === 'fornecedores' && <SuppliersReport key={view} {...props} />}
      {view === 'lucratividade-veiculo' && <VehicleProfitReport key={view} {...props} />}
      {view === 'lucratividade-vendedor' && <GroupProfitReport key={view} {...props} groupLabel="Vendedor" />}
      {view === 'lucratividade-unidade' && <GroupProfitReport key={view} {...props} groupLabel="Unidade" />}
      {view === 'comparativo-mensal' && <MonthlyComparisonReport key={view} {...props} />}
      {view === 'orcado-realizado' && <BudgetReport key={view} {...props} />}
      {view === 'aging' && <AgingReport key={view} {...props} />}
      {view === 'cancelamentos' && <CancellationReport key={view} {...props} />}
    </div>
  )
}
