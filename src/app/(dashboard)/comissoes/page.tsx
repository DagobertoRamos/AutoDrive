'use client'

// =============================================================================
// Comissões — AutoDrive
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import {
  Eye,
  EyeOff,
  TrendingUp,
  ShoppingCart,
  Star,
  Target,
  Hash,
  FileText,
  Wrench,
  Shield,
  RotateCcw,
} from 'lucide-react'
import { cn, formatMoney } from '@/lib/utils'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface CommissionSummary {
  total: number
  month: string
  year: number
}

interface SaleEntry {
  id: string
  date: string
  client: string
  plate: string
  vehicle: string
  negotiation: string
  saleValue: number
  commissionType: string
  commissionValue: number
  status: string
}

interface PurchaseEntry {
  id: string
  date: string
  client: string
  plate: string
  vehicle: string
  purchaseValue: number
  commission: number
  status: string
}

interface BonusDezena {
  current: number
  target: number
  bonusValue: number
}

interface BonusMeta {
  meta: number
  realized: number
  percentage: number
  bonusValue: number
}

interface BonusMetaQtd {
  id: string
  from: number
  to: number
  bonus: number
  reached: boolean
}

interface DocumentEntry {
  id: string
  client: string
  plate: string
  docType: string
  value: number
  commission: number
  status: string
}

interface ServiceEntry {
  id: string
  service: string
  client: string
  plate: string
  value: number
  commission: number
  status: string
}

interface WarrantyEntry {
  id: string
  type: string
  client: string
  plate: string
  value: number
  commission: number
  status: string
}

interface ReturnEntry {
  id: string
  type: string
  client: string
  plate: string
  calcType: string
  value: number
  commission: number
  status: string
}

// -----------------------------------------------------------------------------
// Tab config
// -----------------------------------------------------------------------------

const TABS = [
  { id: 'vendas', label: 'Extrato de Vendas', icon: TrendingUp },
  { id: 'compras', label: 'Extrato de Compras', icon: ShoppingCart },
  { id: 'bonus-dezena', label: 'Bônus Dezena', icon: Star },
  { id: 'bonus-meta', label: 'Bônus Meta', icon: Target },
  { id: 'bonus-meta-qtd', label: 'Bônus Meta Qtd', icon: Hash },
  { id: 'documentos', label: 'Documentos', icon: FileText },
  { id: 'servicos', label: 'Serviços', icon: Wrench },
  { id: 'garantia', label: 'Garantia', icon: Shield },
  { id: 'retorno', label: 'Retorno', icon: RotateCcw },
] as const

type TabId = (typeof TABS)[number]['id']

// -----------------------------------------------------------------------------
// Status badge
// -----------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    PAGO: 'bg-green-100 text-green-700',
    PENDENTE: 'bg-yellow-100 text-yellow-700',
    CANCELADO: 'bg-red-100 text-red-700',
    APROVADO: 'bg-blue-100 text-blue-700',
  }
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', map[status] ?? 'bg-gray-100 text-gray-600')}>
      {status}
    </span>
  )
}

// -----------------------------------------------------------------------------
// Table skeleton
// -----------------------------------------------------------------------------

function TableSkeleton({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
        <tr key={i} className="border-b border-gray-100">
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="px-4 py-3">
              <div className="h-4 animate-pulse rounded bg-gray-200" />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

// -----------------------------------------------------------------------------
// Empty state
// -----------------------------------------------------------------------------

function EmptyState({ message = 'Nenhum registro encontrado.' }: { message?: string }) {
  return (
    <tr>
      <td colSpan={99} className="py-10 text-center text-sm text-gray-400">
        {message}
      </td>
    </tr>
  )
}

// -----------------------------------------------------------------------------
// Progress bar
// -----------------------------------------------------------------------------

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200">
      <div
        className="h-full rounded-full bg-brand-600 transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

// -----------------------------------------------------------------------------
// Tab panels
// -----------------------------------------------------------------------------

function VendasTab() {
  const [data, setData] = useState<SaleEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/commissions/sales')
      .then((r) => r.json())
      .then((d) => setData(d?.data ?? []))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            {['Data', 'Cliente', 'Placa', 'Veículo', 'Negociação', 'Valor Venda', 'Tipo Comissão', 'Valor Comissão', 'Status'].map((h) => (
              <th key={h} className="px-4 py-3 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <TableSkeleton cols={9} />
          ) : data.length === 0 ? (
            <EmptyState />
          ) : (
            data.map((row) => (
              <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 whitespace-nowrap">{row.date}</td>
                <td className="px-4 py-3">{row.client}</td>
                <td className="px-4 py-3 font-mono text-xs">{row.plate}</td>
                <td className="px-4 py-3">{row.vehicle}</td>
                <td className="px-4 py-3">{row.negotiation}</td>
                <td className="px-4 py-3 text-right">{formatMoney(row.saleValue)}</td>
                <td className="px-4 py-3">{row.commissionType}</td>
                <td className="px-4 py-3 text-right font-semibold text-green-700">{formatMoney(row.commissionValue)}</td>
                <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

function ComprasTab() {
  const [data, setData] = useState<PurchaseEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/commissions/purchases')
      .then((r) => r.json())
      .then((d) => setData(d?.data ?? []))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            {['Data', 'Cliente', 'Placa', 'Veículo', 'Valor Compra', 'Comissão', 'Status'].map((h) => (
              <th key={h} className="px-4 py-3 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <TableSkeleton cols={7} />
          ) : data.length === 0 ? (
            <EmptyState />
          ) : (
            data.map((row) => (
              <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 whitespace-nowrap">{row.date}</td>
                <td className="px-4 py-3">{row.client}</td>
                <td className="px-4 py-3 font-mono text-xs">{row.plate}</td>
                <td className="px-4 py-3">{row.vehicle}</td>
                <td className="px-4 py-3 text-right">{formatMoney(row.purchaseValue)}</td>
                <td className="px-4 py-3 text-right font-semibold text-green-700">{formatMoney(row.commission)}</td>
                <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

function BonusDezenaTab() {
  const [data, setData] = useState<BonusDezena | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/commissions/bonus/dezena')
      .then((r) => r.json())
      .then((d) => setData(d?.data ?? null))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  const current = data?.current ?? 0
  const target = data?.target ?? 10
  const bonus = data?.bonusValue ?? 0

  return (
    <div className="p-4">
      {loading ? (
        <div className="space-y-4">
          <div className="h-24 animate-pulse rounded-xl bg-gray-200" />
          <div className="h-4 animate-pulse rounded bg-gray-200" />
        </div>
      ) : (
        <div className="max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-yellow-100">
              <Star className="h-6 w-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Bônus Dezena</p>
              <p className="text-xl font-bold text-gray-900">{formatMoney(bonus)}</p>
            </div>
          </div>
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-gray-600">Vendas realizadas</span>
            <span className="font-semibold text-gray-900">
              {current} / {target}
            </span>
          </div>
          <ProgressBar value={current} max={target} />
          <p className="mt-3 text-xs text-gray-400">
            {target - current > 0
              ? `Faltam ${target - current} venda(s) para atingir a dezena.`
              : 'Parabéns! Dezena atingida!'}
          </p>
        </div>
      )}
    </div>
  )
}

function BonusMetaTab() {
  const [data, setData] = useState<BonusMeta | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/commissions/bonus/meta')
      .then((r) => r.json())
      .then((d) => setData(d?.data ?? null))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  const meta = data?.meta ?? 0
  const realized = data?.realized ?? 0
  const percentage = data?.percentage ?? 0
  const bonus = data?.bonusValue ?? 0

  return (
    <div className="p-4">
      {loading ? (
        <div className="h-40 animate-pulse rounded-xl bg-gray-200" />
      ) : (
        <div className="max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100">
              <Target className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Bônus Meta</p>
              <p className="text-xl font-bold text-gray-900">{formatMoney(bonus)}</p>
            </div>
          </div>
          <div className="mb-1 flex justify-between text-sm">
            <span className="text-gray-600">Realizado</span>
            <span className="font-semibold">{formatMoney(realized)}</span>
          </div>
          <div className="mb-3 flex justify-between text-sm">
            <span className="text-gray-600">Meta</span>
            <span className="font-semibold">{formatMoney(meta)}</span>
          </div>
          <ProgressBar value={realized} max={meta} />
          <p className="mt-2 text-right text-sm font-bold text-brand-700">{percentage.toFixed(1)}% atingido</p>
        </div>
      )}
    </div>
  )
}

function BonusMetaQtdTab() {
  const [data, setData] = useState<BonusMetaQtd[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/commissions/bonus/meta-qtd')
      .then((r) => r.json())
      .then((d) => setData(d?.data ?? []))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            {['De', 'Até', 'Bônus', 'Situação'].map((h) => (
              <th key={h} className="px-4 py-3">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <TableSkeleton cols={4} />
          ) : data.length === 0 ? (
            <EmptyState />
          ) : (
            data.map((row) => (
              <tr key={row.id} className={cn('border-b border-gray-100', row.reached ? 'bg-green-50' : 'hover:bg-gray-50')}>
                <td className="px-4 py-3">{row.from} vendas</td>
                <td className="px-4 py-3">{row.to} vendas</td>
                <td className="px-4 py-3 font-semibold text-green-700">{formatMoney(row.bonus)}</td>
                <td className="px-4 py-3">
                  {row.reached ? (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Atingida</span>
                  ) : (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">Pendente</span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

function DocumentosTab() {
  const [data, setData] = useState<DocumentEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/commissions/documents')
      .then((r) => r.json())
      .then((d) => setData(d?.data ?? []))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            {['Cliente', 'Placa', 'Doc Vendido', 'Valor', 'Comissão', 'Status'].map((h) => (
              <th key={h} className="px-4 py-3 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <TableSkeleton cols={6} />
          ) : data.length === 0 ? (
            <EmptyState />
          ) : (
            data.map((row) => (
              <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3">{row.client}</td>
                <td className="px-4 py-3 font-mono text-xs">{row.plate}</td>
                <td className="px-4 py-3">{row.docType}</td>
                <td className="px-4 py-3 text-right">{formatMoney(row.value)}</td>
                <td className="px-4 py-3 text-right font-semibold text-green-700">{formatMoney(row.commission)}</td>
                <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

function ServicosTab() {
  const [data, setData] = useState<ServiceEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/commissions/services')
      .then((r) => r.json())
      .then((d) => setData(d?.data ?? []))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            {['Serviço', 'Cliente', 'Placa', 'Valor', 'Comissão', 'Status'].map((h) => (
              <th key={h} className="px-4 py-3 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <TableSkeleton cols={6} />
          ) : data.length === 0 ? (
            <EmptyState />
          ) : (
            data.map((row) => (
              <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3">{row.service}</td>
                <td className="px-4 py-3">{row.client}</td>
                <td className="px-4 py-3 font-mono text-xs">{row.plate}</td>
                <td className="px-4 py-3 text-right">{formatMoney(row.value)}</td>
                <td className="px-4 py-3 text-right font-semibold text-green-700">{formatMoney(row.commission)}</td>
                <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

function GarantiaTab() {
  const [data, setData] = useState<WarrantyEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/commissions/warranties')
      .then((r) => r.json())
      .then((d) => setData(d?.data ?? []))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            {['Tipo', 'Cliente', 'Placa', 'Valor', 'Comissão', 'Status'].map((h) => (
              <th key={h} className="px-4 py-3 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <TableSkeleton cols={6} />
          ) : data.length === 0 ? (
            <EmptyState />
          ) : (
            data.map((row) => (
              <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3">{row.type}</td>
                <td className="px-4 py-3">{row.client}</td>
                <td className="px-4 py-3 font-mono text-xs">{row.plate}</td>
                <td className="px-4 py-3 text-right">{formatMoney(row.value)}</td>
                <td className="px-4 py-3 text-right font-semibold text-green-700">{formatMoney(row.commission)}</td>
                <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

function RetornoTab() {
  const [data, setData] = useState<ReturnEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/commissions/returns')
      .then((r) => r.json())
      .then((d) => setData(d?.data ?? []))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            {['Tipo', 'Cliente', 'Placa', 'Tipo Cálculo', 'Valor', 'Comissão', 'Status'].map((h) => (
              <th key={h} className="px-4 py-3 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <TableSkeleton cols={7} />
          ) : data.length === 0 ? (
            <EmptyState />
          ) : (
            data.map((row) => (
              <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs font-semibold text-brand-700">{row.type}</td>
                <td className="px-4 py-3">{row.client}</td>
                <td className="px-4 py-3 font-mono text-xs">{row.plate}</td>
                <td className="px-4 py-3">{row.calcType}</td>
                <td className="px-4 py-3 text-right">{formatMoney(row.value)}</td>
                <td className="px-4 py-3 text-right font-semibold text-green-700">{formatMoney(row.commission)}</td>
                <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Main page
// -----------------------------------------------------------------------------

export default function ComissoesPage() {
  const { data: session } = useSession()
  const [activeTab, setActiveTab] = useState<TabId>('vendas')
  const [summary, setSummary] = useState<CommissionSummary | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(true)
  const [showBalance, setShowBalance] = useState(true)

  const now = new Date()
  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ]
  const currentMonth = monthNames[now.getMonth()]
  const currentYear = now.getFullYear()

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch('/api/commissions/summary')
      const json = await res.json()
      setSummary(json?.data ?? null)
    } catch {
      setSummary(null)
    } finally {
      setLoadingSummary(false)
    }
  }, [])

  useEffect(() => {
    fetchSummary()
  }, [fetchSummary])

  const renderPanel = () => {
    switch (activeTab) {
      case 'vendas': return <VendasTab />
      case 'compras': return <ComprasTab />
      case 'bonus-dezena': return <BonusDezenaTab />
      case 'bonus-meta': return <BonusMetaTab />
      case 'bonus-meta-qtd': return <BonusMetaQtdTab />
      case 'documentos': return <DocumentosTab />
      case 'servicos': return <ServicosTab />
      case 'garantia': return <GarantiaTab />
      case 'retorno': return <RetornoTab />
      default: return null
    }
  }

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* User info */}
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-700 text-lg font-bold text-white">
              {session?.user?.name?.charAt(0) ?? '?'}
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{session?.user?.name ?? '—'}</h1>
              <p className="text-sm text-gray-500">
                {(session?.user as { role?: string })?.role ?? 'Vendedor'} &bull; Loja Principal
              </p>
              <p className="text-xs text-gray-400">
                Período: {currentMonth} / {currentYear}
              </p>
            </div>
          </div>

          {/* Balance */}
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-6 py-4">
            <p className="mb-1 text-xs text-gray-500 uppercase tracking-wide">Saldo Total</p>
            <div className="flex items-center gap-3">
              {loadingSummary ? (
                <div className="h-8 w-32 animate-pulse rounded bg-gray-300" />
              ) : (
                <span className="text-2xl font-black text-gray-900">
                  {showBalance ? formatMoney(summary?.total ?? 0) : 'R$ ••••••'}
                </span>
              )}
              <button
                onClick={() => setShowBalance((v) => !v)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-colors"
                title={showBalance ? 'Ocultar saldo' : 'Mostrar saldo'}
              >
                {showBalance ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        {/* Tab bar */}
        <div className="overflow-x-auto border-b border-gray-200">
          <div className="flex min-w-max">
            {TABS.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-2 whitespace-nowrap px-5 py-3.5 text-sm font-medium transition-colors',
                    activeTab === tab.id
                      ? 'border-b-2 border-brand-600 text-brand-700'
                      : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Tab panel */}
        <div className="min-h-[320px]">
          {renderPanel()}
        </div>
      </div>
    </div>
  )
}
