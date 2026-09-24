'use client'

// =============================================================================
// Painel do Site — Financiamentos (porta de /admin/financiamentos do
// dagobertoeasycar): pedidos de simulação feitos no site, com entrada, prazo,
// parcela desejada e troca, e a situação de cada um no CRM.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CircleDollarSign, MessageCircle, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Item {
  id: string; protocol: string | null; name: string; phone: string | null; email: string | null; status: string; createdAt: string; owner: string | null
  vehicle: { title: string; price: number | null } | null
  private: boolean; privateVehicle: string
  details: { paymentMethod: string; downPayment: string; installments: string; installmentGoal: string; hasTrade: string; tradeVehicle: string; desiredVehicle: string }
  campaign: string
}
interface Data { days: number; items: Item[]; totals: { total: number; open: number; converted: number; withTrade: number } }

const STATUS: Record<string, { label: string; cls: string }> = {
  NEW: { label: 'Novo', cls: 'bg-sky-50 text-sky-700' }, ASSIGNED: { label: 'Atribuído', cls: 'bg-indigo-50 text-indigo-700' },
  WORKING: { label: 'Em atendimento', cls: 'bg-amber-50 text-amber-700' }, QUALIFIED: { label: 'Qualificado', cls: 'bg-violet-50 text-violet-700' },
  CONVERTED: { label: 'Convertido', cls: 'bg-green-50 text-green-700' }, LOST: { label: 'Perdido', cls: 'bg-gray-100 text-gray-500' },
  DISCARDED: { label: 'Descartado', cls: 'bg-gray-100 text-gray-500' }, RECYCLED: { label: 'Reciclado', cls: 'bg-gray-100 text-gray-600' },
}
const brl = (v: number | null) => (v == null ? '' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }))
const wa = (phone: string | null) => { const d = (phone ?? '').replace(/\D/g, ''); return d ? `https://wa.me/${d.length <= 11 ? `55${d}` : d}` : '' }

export default function SiteFinancingPage() {
  const [days, setDays] = useState(30)
  const [d, setD] = useState<Data | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (n: number) => {
    setLoading(true)
    const r = await fetch(`/api/site-admin/financing?days=${n}`, { credentials: 'include' }).catch(() => null)
    const j = await r?.json().catch(() => null)
    if (r?.ok && j?.data) { setD(j.data); setErr(null) } else setErr(j?.error ?? 'Não foi possível carregar.')
    setLoading(false)
  }, [])
  useEffect(() => {
    let alive = true
    void Promise.resolve().then(() => { if (alive) void load(days) })
    return () => { alive = false }
  }, [load, days])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><CircleDollarSign size={20} className="text-brand-600" />Financiamentos do site</h1>
          <p className="text-sm text-gray-500">Pedidos de simulação feitos no site. Cada um já é um lead no CRM; o atendimento segue por lá.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 bg-white p-0.5">
            {[30, 90, 365].map((n) => <button key={n} onClick={() => setDays(n)} className={cn('rounded-md px-2.5 py-1 text-xs font-medium', days === n ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-50')}>{n === 365 ? '12 meses' : `${n} dias`}</button>)}
          </div>
          <button onClick={() => void load(days)} className="btn-secondary text-xs" aria-label="Atualizar"><RefreshCw size={13} className={cn(loading && 'animate-spin')} /></button>
        </div>
      </div>

      {err ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p> : !d ? <div className="h-64 animate-pulse rounded-xl bg-gray-100" /> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[['Pedidos', d.totals.total], ['Em aberto', d.totals.open], ['Convertidos', d.totals.converted], ['Com carro na troca', d.totals.withTrade]].map(([l, v]) => (
              <div key={l as string} className="rounded-xl border border-gray-200 bg-white p-4 shadow-card"><p className="text-xs text-gray-500">{l}</p><p className="text-2xl font-bold tabular-nums text-gray-900">{v}</p></div>
            ))}
          </div>

          {d.items.length === 0 ? <p className="rounded-xl border border-dashed border-gray-200 py-10 text-center text-sm text-gray-400">Nenhum pedido de financiamento no período.</p> : (
            <ul className="space-y-2">
              {d.items.map((i) => {
                const st = STATUS[i.status] ?? { label: i.status, cls: 'bg-gray-100 text-gray-600' }
                const facts = [
                  i.details.paymentMethod && `Pagamento: ${i.details.paymentMethod}`,
                  i.details.downPayment && `Entrada: ${i.details.downPayment}`,
                  i.details.installments && `Prazo: ${i.details.installments}`,
                  i.details.installmentGoal && `Parcela desejada: ${i.details.installmentGoal}`,
                  /^s/i.test(i.details.hasTrade) && `Troca: ${i.details.tradeVehicle || 'sim'}`,
                ].filter(Boolean) as string[]
                return (
                  <li key={i.id} className="rounded-xl border border-gray-200 bg-white p-3 shadow-card">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-semibold text-gray-900">{i.name}{i.protocol && <span className="text-xs font-normal text-gray-400">{i.protocol}</span>}<span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', st.cls)}>{st.label}</span></p>
                        <p className="text-xs text-gray-500">{new Date(i.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · {i.phone}{i.email ? ` · ${i.email}` : ''}{i.owner ? ` · com ${i.owner}` : ' · sem responsável'}</p>
                      </div>
                      <div className="flex gap-1.5">
                        {wa(i.phone) && <a href={wa(i.phone)} target="_blank" rel="noreferrer" className="btn-secondary px-2 py-1.5 text-xs"><MessageCircle size={13} />WhatsApp</a>}
                        <Link href={`/crm/leads/${i.id}`} className="btn-secondary px-2 py-1.5 text-xs">Abrir no CRM<ArrowRight size={13} /></Link>
                      </div>
                    </div>
                    <p className="mt-1.5 text-sm text-gray-800">{i.private ? <><span className="mr-1.5 rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">Financia Fácil</span>Carro de particular: {i.privateVehicle || '—'}</> : i.vehicle ? <>{i.vehicle.title} <span className="text-gray-500">{brl(i.vehicle.price)}</span></> : i.details.desiredVehicle ? `Quer: ${i.details.desiredVehicle}` : 'Sem veículo escolhido'}</p>
                    {facts.length > 0 && <p className="mt-1 flex flex-wrap gap-1.5">{facts.map((f) => <span key={f} className="rounded-md bg-gray-50 px-2 py-0.5 text-[11px] text-gray-600">{f}</span>)}</p>}
                    {i.campaign && <p className="mt-1 text-[11px] text-gray-400">Campanha: {i.campaign}</p>}
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
