'use client'

// =============================================================================
// QueueRanking — ranking de qualidade dos vendedores da fila. Pódio dos 3
// primeiros + tabela detalhada (atendimentos, preenchimento, reversões,
// pós-vendas, conversões, pontos). Animado. Lê /api/seller-queue/ranking.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Trophy, RefreshCw, Medal, Star } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Row {
  sellerId: string; sellerName: string; finished: number; called: number; reversoes: number;
  timeouts: number; posVendas: number; conversoes: number; qualidade: number; avgAcceptSeconds: number | null; points: number
}

const PODIUM = [
  { medal: '🥈', ring: 'ring-gray-300', bg: 'from-gray-100 to-gray-50', order: 'order-1 sm:mt-6', h: 'h-24' },
  { medal: '🥇', ring: 'ring-amber-400', bg: 'from-amber-100 to-amber-50', order: 'order-2', h: 'h-32' },
  { medal: '🥉', ring: 'ring-orange-300', bg: 'from-orange-100 to-orange-50', order: 'order-3 sm:mt-10', h: 'h-20' },
]
// Pódio na ordem visual 2º, 1º, 3º a partir do ranking [1º,2º,3º].
const PODIUM_INDEX = [1, 0, 2]

export default function QueueRanking() {
  const [rows, setRows] = useState<Row[]>([])
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/seller-queue/ranking?days=${days}`, { credentials: 'include' })
      if (res.status === 403 || res.status === 400) { setDenied(true); return }
      setDenied(false); setRows((await res.json())?.data?.ranking ?? [])
    } catch { /* noop */ } finally { setLoading(false) }
  }, [days])
  useEffect(() => { load() }, [load])

  if (denied) return null
  const top3 = rows.slice(0, 3)
  const maxPoints = Math.max(1, ...rows.map((r) => r.points))

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card">
      <style>{`
        @keyframes qr-rise { from { opacity:0; transform: translateY(14px) scale(.96) } to { opacity:1; transform: none } }
        @keyframes qr-bar { from { width: 0 } }
        @keyframes qr-shine { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        .qr-rise { animation: qr-rise .5s cubic-bezier(.2,.7,.3,1) both }
        .qr-bar { animation: qr-bar .9s cubic-bezier(.2,.7,.3,1) both }
        .qr-shine { background-image: linear-gradient(110deg, transparent 30%, rgba(255,255,255,.6) 50%, transparent 70%); background-size: 200% 100%; animation: qr-shine 2.4s linear infinite }
      `}</style>

      <div className="flex items-center justify-between gap-2 border-b border-gray-100 bg-gradient-to-r from-brand-50 to-white px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-bold text-gray-900"><Trophy size={17} className="text-amber-500" />Ranking de qualidade</p>
        <div className="flex items-center gap-2">
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs">{[7, 15, 30, 90].map((d) => <option key={d} value={d}>{d} dias</option>)}</select>
          <button onClick={load} disabled={loading} className="text-gray-400 hover:text-gray-600"><RefreshCw size={14} className={cn(loading && 'animate-spin')} /></button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-gray-400">{loading ? 'Carregando…' : 'Sem atendimentos no período ainda.'}</p>
      ) : (
        <>
          {/* Pódio */}
          {top3.length > 0 && (
            <div className="flex items-end justify-center gap-2 px-4 py-5 sm:gap-4">
              {PODIUM_INDEX.map((rankIdx, slot) => {
                const r = top3[rankIdx]
                if (!r) return <div key={slot} className={cn('w-24', PODIUM[slot].order)} />
                const p = PODIUM[slot]
                return (
                  <div key={r.sellerId} className={cn('qr-rise flex w-24 flex-col items-center sm:w-28', p.order)} style={{ animationDelay: `${slot * 90}ms` }}>
                    <span className="text-2xl">{p.medal}</span>
                    <p className="mt-0.5 max-w-full break-words text-center text-xs font-semibold text-gray-800" title={r.sellerName}>{r.sellerName}</p>
                    <p className="text-[11px] text-gray-400">{r.points} pts</p>
                    <div className={cn('relative mt-1.5 w-full overflow-hidden rounded-t-xl bg-gradient-to-b ring-1', p.bg, p.ring, p.h)}>
                      <div className="qr-shine absolute inset-0" />
                      <div className="absolute inset-x-0 bottom-1 text-center text-[11px] font-bold text-gray-500">{r.finished} atend.</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Mobile: card list (below md) */}
          <div className="divide-y divide-gray-100 border-t border-gray-100 md:hidden">
            {rows.map((r, i) => (
              <div key={r.sellerId} className={cn('qr-rise px-3 py-3', i === 0 && 'bg-amber-50/40')} style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-sm font-bold tabular-nums text-gray-500">{i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}º`}</span>
                  <p className="min-w-0 flex-1 break-words text-sm font-semibold text-gray-900">{r.sellerName}</p>
                  <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums', i === 0 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-700')}>{r.points} pts</span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-gray-500">
                  <span>{r.finished} atend.</span>
                  <span className="flex items-center gap-1">
                    <span className={cn('inline-block h-1 w-8 rounded-full', r.qualidade >= 80 ? 'bg-green-500' : r.qualidade >= 50 ? 'bg-amber-500' : 'bg-red-400')} />
                    {r.qualidade}%
                  </span>
                  <span className="text-red-600">{r.reversoes} rev.</span>
                  <span>{r.posVendas} pós-v.</span>
                  <span className="text-brand-700">{r.conversoes} conv.</span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: full table (md+) */}
          <div className="hidden overflow-x-auto border-t border-gray-100 md:block">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50"><tr>{['#', 'Vendedor', 'Atend.', 'Qualidade', 'Reversões', 'Pós-vendas', 'Conversões', 'Pontos'].map((h) => (<th key={h} className="whitespace-nowrap px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r, i) => (
                  <tr key={r.sellerId} className={cn('qr-rise hover:bg-gray-50', i === 0 && 'bg-amber-50/40')} style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                    <td className="px-3 py-2 tabular-nums font-semibold text-gray-500">{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</td>
                    <td className="px-3 py-2 font-medium text-gray-900">{r.sellerName}</td>
                    <td className="px-3 py-2 tabular-nums text-gray-700">{r.finished}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-100">
                          <div className={cn('qr-bar h-full rounded-full', r.qualidade >= 80 ? 'bg-green-500' : r.qualidade >= 50 ? 'bg-amber-500' : 'bg-red-400')} style={{ width: `${r.qualidade}%`, animationDelay: `${Math.min(i, 8) * 40}ms` }} />
                        </div>
                        <span className="tabular-nums text-xs text-gray-500">{r.qualidade}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-red-600">{r.reversoes}</td>
                    <td className="px-3 py-2 tabular-nums text-gray-600">{r.posVendas}</td>
                    <td className="px-3 py-2 tabular-nums text-brand-700">{r.conversoes}</td>
                    <td className="px-3 py-2"><span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums', i === 0 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-700')}>{i === 0 && <Star size={11} className="fill-amber-400 text-amber-400" />}{r.points}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-1.5 border-t border-gray-100 px-3 sm:px-4 py-2 text-[10px] sm:text-[11px] text-gray-400">
            <Medal size={12} className="shrink-0" />
            <span className="break-words">Pontos = atendimentos + conversões + pós-vendas + preenchimento − reversões/timeouts. Qualidade = % de atendimentos com cadastro completo.</span>
          </div>
        </>
      )}
    </div>
  )
}
