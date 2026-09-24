'use client'

// =============================================================================
// Painel do Site — Visitas (porta de /admin/visitas do dagobertoeasycar):
// visitas e visitantes por dia, de onde vêm, aparelhos, páginas, carros mais
// vistos (com os leads de cada um), buscas e cidades. Contador próprio e
// anônimo; a equipe logada no painel não entra na conta.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { BarChart3, Car, Eye, MessageCircle, MousePointerClick, RefreshCw, Target, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DEVICE_LABELS, SECTION_LABELS, SOURCE_LABELS } from '@/lib/site/analytics-core'

type Count = { key: string | null; n: number }
interface Data {
  period: string
  totals: { views: number; visitors: number; sessions: number; newVisitors: number; whatsapp: number; leads: number }
  perDay: { day: string; views: number; visitors: number }[]
  sources: Count[]; devices: Count[]; sections: Count[]; searches: Count[]; cities: Count[]
  vehicles: { id: string; title: string; views: number; leads: number }[]
}

const PERIODS = [['hoje', 'Hoje'], ['7', '7 dias'], ['30', '30 dias'], ['90', '90 dias']] as const
const fmt = (n: number) => n.toLocaleString('pt-BR')
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '0%')

function Bars({ title, rows, labels, empty }: { title: string; rows: Count[]; labels?: Record<string, string>; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.n))
  const total = rows.reduce((s, r) => s + r.n, 0)
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
      <h2 className="mb-3 text-sm font-semibold text-gray-900">{title}</h2>
      {rows.length === 0 ? <p className="text-xs text-gray-400">{empty}</p> : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.key ?? '-'}>
              <div className="flex justify-between gap-2 text-xs"><span className="truncate text-gray-700">{(r.key && labels?.[r.key]) || r.key || '—'}</span><span className="tabular-nums text-gray-500">{fmt(r.n)} · {pct(r.n, total)}</span></div>
              <div className="mt-1 h-1.5 rounded-full bg-gray-100"><div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${(r.n / max) * 100}%` }} /></div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default function SiteVisitsPage() {
  const [period, setPeriod] = useState('30')
  const [d, setD] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (p: string) => {
    setLoading(true)
    const j = await fetch(`/api/site-admin/visits?period=${p}`, { credentials: 'include' }).then((r) => r.json()).catch(() => null)
    if (j?.data) setD(j.data)
    setLoading(false)
  }, [])
  useEffect(() => {
    let alive = true
    void Promise.resolve().then(() => { if (alive) void load(period) })
    return () => { alive = false }
  }, [load, period])

  const t = d?.totals
  const maxDay = Math.max(1, ...(d?.perDay ?? []).map((x) => x.views))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><BarChart3 size={20} className="text-brand-600" />Visitas do site</h1>
          <p className="text-sm text-gray-500">Contador próprio e anônimo (sem cookies de terceiros). Acessos da equipe logada no painel não contam.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 bg-white p-0.5">
            {PERIODS.map(([k, l]) => <button key={k} onClick={() => setPeriod(k)} className={cn('rounded-md px-2.5 py-1 text-xs font-medium', period === k ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-50')}>{l}</button>)}
          </div>
          <button onClick={() => void load(period)} className="btn-secondary text-xs" aria-label="Atualizar"><RefreshCw size={13} className={cn(loading && 'animate-spin')} /></button>
        </div>
      </div>

      {!d ? <div className="h-64 animate-pulse rounded-xl bg-gray-100" /> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            {[
              { l: 'Visualizações', v: fmt(t!.views), n: `${fmt(t!.sessions)} visita(s)`, icon: Eye },
              { l: 'Visitantes', v: fmt(t!.visitors), n: `${fmt(t!.newVisitors)} novo(s)`, icon: Users },
              { l: 'Páginas por visita', v: t!.sessions ? (t!.views / t!.sessions).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '0', n: 'média', icon: MousePointerClick },
              { l: 'Cliques no WhatsApp', v: fmt(t!.whatsapp), n: pct(t!.whatsapp, t!.visitors) + ' dos visitantes', icon: MessageCircle },
              { l: 'Leads do site', v: fmt(t!.leads), n: 'formulários enviados', icon: Target, href: '/crm/leads' },
              { l: 'Conversão', v: pct(Math.min(t!.leads + t!.whatsapp, t!.sessions), t!.sessions), n: 'leads + WhatsApp ÷ visitas', icon: Target },
            ].map((c) => {
              const body = <><p className="flex items-center gap-1.5 text-xs text-gray-500"><c.icon size={13} />{c.l}</p><p className="text-2xl font-bold tabular-nums text-gray-900">{c.v}</p><p className="text-[11px] text-gray-400">{c.n}</p></>
              const cls = 'rounded-xl border border-gray-200 bg-white p-4 shadow-card'
              return c.href ? <Link key={c.l} href={c.href} className={cn(cls, 'hover:border-brand-300')}>{body}</Link> : <div key={c.l} className={cls}>{body}</div>
            })}
          </div>

          {period !== 'hoje' && (
            <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
              <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold text-gray-900">Visualizações por dia</h2><span className="flex items-center gap-3 text-[11px] text-gray-500"><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-brand-500" />visualizações</span><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-brand-200" />visitantes</span></span></div>
              <div className="flex h-40 items-end gap-[2px]">
                {d.perDay.map((x) => (
                  <div key={x.day} className="group relative flex h-full flex-1 items-end" title={`${x.day.split('-').reverse().join('/')}: ${x.views} visualizações, ${x.visitors} visitantes`}>
                    <div className="relative w-full rounded-t bg-brand-500" style={{ height: `${(x.views / maxDay) * 100}%`, minHeight: x.views ? 2 : 0 }}>
                      <div className="absolute inset-x-0 bottom-0 rounded-t bg-brand-200" style={{ height: `${x.views ? (x.visitors / x.views) * 100 : 0}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-gray-400"><span>{d.perDay[0]?.day.split('-').reverse().slice(0, 2).join('/')}</span><span>{d.perDay.at(-1)?.day.split('-').reverse().slice(0, 2).join('/')}</span></div>
            </section>
          )}

          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
            <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-gray-900"><Car size={14} />Carros mais vistos</h2>
            {d.vehicles.length === 0 ? <p className="text-xs text-gray-400">Nenhum carro visto no período.</p> : (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[11px] uppercase tracking-wide text-gray-400"><th className="pb-2 font-medium">Veículo</th><th className="pb-2 text-right font-medium">Visualizações</th><th className="pb-2 text-right font-medium">Leads</th><th className="pb-2 text-right font-medium">Conversão</th></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {d.vehicles.map((v) => (
                    <tr key={v.id}>
                      <td className="py-2"><Link href={`/estoque/${v.id}`} className="text-gray-800 hover:text-brand-700">{v.title}</Link></td>
                      <td className="py-2 text-right tabular-nums">{fmt(v.views)}</td>
                      <td className="py-2 text-right tabular-nums">{fmt(v.leads)}</td>
                      <td className="py-2 text-right tabular-nums text-gray-500">{pct(v.leads, v.views)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Bars title="De onde vêm (entradas)" rows={d.sources} labels={SOURCE_LABELS} empty="Sem visitas no período." />
            <Bars title="Páginas mais vistas" rows={d.sections} labels={SECTION_LABELS} empty="Sem visitas no período." />
            <Bars title="Aparelhos (visitantes)" rows={d.devices} labels={DEVICE_LABELS} empty="Sem visitas no período." />
            <Bars title="O que buscaram no estoque" rows={d.searches} empty="Nenhuma busca no período." />
            <Bars title="Cidades (aproximado)" rows={d.cities} empty="Aparece com o site publicado (a hospedagem informa a cidade)." />
          </div>
        </>
      )}
    </div>
  )
}
