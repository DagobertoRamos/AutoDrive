'use client'

// =============================================================================
// Marketing › Calendário — agendamentos, publicações confirmadas e retiradas
// por dia, no fuso da empresa (padrão America/Sao_Paulo; gravado em UTC).
// Grade no computador, lista no celular. Clique abre o detalhe.
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PublicationDetail } from '@/components/publications/PublicationDetail'
import { api, Empty, PubTabs } from '@/components/publications/ui'

interface Item { day: string; at: string; kind: 'AGENDADO' | 'PUBLICADO' | 'REMOVIDO'; id: string; title: string; plate: string | null; channel: string; account: string | null; statusLabel: string }

const KIND: Record<Item['kind'], { label: string; cls: string }> = {
  AGENDADO: { label: 'Agendado', cls: 'border-sky-200 bg-sky-50 text-sky-800' },
  PUBLICADO: { label: 'Publicado', cls: 'border-green-200 bg-green-50 text-green-800' },
  REMOVIDO: { label: 'Retirado', cls: 'border-gray-200 bg-gray-50 text-gray-600' },
}
const WEEK = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export default function CalendarPage() {
  const now = new Date()
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const [items, setItems] = useState<Item[]>([])
  const [tz, setTz] = useState('America/Sao_Paulo')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [detail, setDetail] = useState<string | null>(null)
  const [kinds, setKinds] = useState<Set<Item['kind']>>(new Set(['AGENDADO', 'PUBLICADO', 'REMOVIDO']))

  const days = new Date(ym.y, ym.m + 1, 0).getDate()
  const first = new Date(ym.y, ym.m, 1).getDay()
  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try { const j = await api(`/api/publications/calendar?from=${ymd(ym.y, ym.m, 1)}&to=${ymd(ym.y, ym.m, days)}`); setItems(j.data); setTz(j.timezone) } catch (e) { setErr((e as Error).message) } finally { setLoading(false) }
  }, [ym, days])
  useEffect(() => { const t = setTimeout(() => void load(), 0); return () => clearTimeout(t) }, [load])

  const shown = useMemo(() => items.filter((i) => kinds.has(i.kind)), [items, kinds])
  const byDay = useMemo(() => { const m = new Map<string, Item[]>(); for (const i of shown) m.set(i.day, [...(m.get(i.day) ?? []), i]); return m }, [shown])
  const time = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: tz, hour: '2-digit', minute: '2-digit' })
  const today = new Date().toLocaleDateString('en-CA', { timeZone: tz })
  const shift = (d: number) => setYm(({ y, m }) => { const x = new Date(y, m + d, 1); return { y: x.getFullYear(), m: x.getMonth() } })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Calendário de publicações</h1>
        <p className="text-sm text-gray-500">Horários no fuso {tz.replace('_', ' ')}.</p>
      </div>
      <PubTabs />
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => shift(-1)} className="btn-secondary p-2" aria-label="Mês anterior"><ChevronLeft size={15} /></button>
        <p className="min-w-40 text-center font-semibold text-gray-800">{cap(new Date(ym.y, ym.m, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }))}</p>
        <button onClick={() => shift(1)} className="btn-secondary p-2" aria-label="Próximo mês"><ChevronRight size={15} /></button>
        <button onClick={() => setYm({ y: now.getFullYear(), m: now.getMonth() })} className="btn-secondary px-3 py-1.5 text-xs">Hoje</button>
        <div className="ml-auto flex flex-wrap gap-1.5" role="group" aria-label="Tipos">
          {(Object.keys(KIND) as Item['kind'][]).map((k) => (
            <button key={k} aria-pressed={kinds.has(k)} onClick={() => setKinds((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })} className={cn('rounded-full border px-2.5 py-0.5 text-xs', kinds.has(k) ? KIND[k].cls : 'border-gray-200 text-gray-400')}>{KIND[k].label}</button>
          ))}
        </div>
        {loading && <Loader2 size={15} className="animate-spin text-gray-400" />}
      </div>
      {err && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{err}</p>}

      {/* Grade (computador) */}
      <div className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white md:block">
        <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50 text-center text-[11px] font-medium uppercase text-gray-500">{WEEK.map((w) => <div key={w} className="py-1.5">{w}</div>)}</div>
        <div className="grid grid-cols-7">
          {Array.from({ length: first }).map((_, i) => <div key={`e${i}`} className="min-h-28 border-b border-r border-gray-100 bg-gray-50/50" />)}
          {Array.from({ length: days }).map((_, i) => {
            const key = ymd(ym.y, ym.m, i + 1); const list = byDay.get(key) ?? []
            return (
              <div key={key} className={cn('min-h-28 border-b border-r border-gray-100 p-1', key === today && 'bg-brand-50/40')}>
                <p className={cn('text-right text-[11px]', key === today ? 'font-bold text-brand-800' : 'text-gray-400')}>{i + 1}</p>
                <ul className="space-y-0.5">
                  {list.slice(0, 4).map((it) => <li key={`${it.id}${it.kind}`}><button onClick={() => setDetail(it.id)} className={cn('w-full truncate rounded border px-1 py-0.5 text-left text-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600', KIND[it.kind].cls)} title={`${it.title} · ${it.channel}`}>{time(it.at)} {it.channel} · {it.title}</button></li>)}
                  {list.length > 4 && <li className="text-[10px] text-gray-500">+{list.length - 4}</li>}
                </ul>
              </div>
            )
          })}
        </div>
      </div>

      {/* Lista (celular) */}
      <div className="space-y-3 md:hidden">
        {!shown.length && !loading ? <Empty>Nada neste mês.</Empty> : [...byDay.entries()].map(([day, list]) => (
          <section key={day}>
            <h2 className="mb-1 text-xs font-semibold text-gray-600">{cap(new Date(`${day}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' }))}</h2>
            <ul className="space-y-1">{list.map((it) => <li key={`${it.id}${it.kind}`}><button onClick={() => setDetail(it.id)} className="flex w-full items-center gap-2 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-left text-xs"><span className={cn('rounded border px-1 text-[10px]', KIND[it.kind].cls)}>{KIND[it.kind].label}</span><span className="text-gray-500">{time(it.at)}</span><span className="min-w-0 flex-1 truncate">{it.title}</span><span className="text-gray-500">{it.channel}</span></button></li>)}</ul>
          </section>
        ))}
      </div>
      {!loading && !shown.length && <p className="hidden text-center text-xs text-gray-400 md:block">Nada neste mês. Agende na etapa final de “Nova publicação”.</p>}
      <PublicationDetail id={detail} onClose={() => setDetail(null)} onChanged={() => void load()} />
    </div>
  )
}
