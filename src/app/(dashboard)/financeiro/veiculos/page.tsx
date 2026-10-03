'use client'

// =============================================================================
// Financeiro › Custos de veículos — carros com gastos (compra, serviços,
// documentação, multas, débitos, peças, combustível, laudos, terceiros…),
// com negociação, total, pago e a pagar. Clique abre a conciliação.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Car, ChevronRight, Loader2, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Row {
  id: string; plate: string | null; title: string; stockStatus: string | null; stockType: string | null; entryDate: string | null
  deals: Array<{ role: string; number: string | null }>; total: number; paid: number; pending: number; revenue: number; pendingCount: number
}
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function CustosVeiculosPage() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [totals, setTotals] = useState({ total: 0, paid: 0, pending: 0 })
  const [q, setQ] = useState('')
  const [pending, setPending] = useState(true)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ ...(q.trim() ? { q: q.trim() } : {}), ...(pending ? { pendentes: '1' } : {}) })
    const j = await fetch(`/api/finance/vehicles?${qs}`, { cache: 'no-store' }).then((r) => r.json()).catch(() => null)
    if (j?.success) { setRows(j.data); setTotals(j.totals) } else { setErr(j?.error ?? 'Falha ao carregar.'); setRows([]) }
  }, [q, pending])
  useEffect(() => { const t = setTimeout(() => void load(), 250); return () => clearTimeout(t) }, [load])

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Custos de veículos</h1>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {([['Total lançado', totals.total, ''], ['Pago', totals.paid, 'text-emerald-700'], ['A pagar', totals.pending, 'text-amber-700']] as Array<[string, number, string]>).map(([l, v, c]) => (
          <div key={l} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"><p className="text-xs text-gray-500">{l}</p><p className={cn('text-2xl font-bold tabular-nums text-gray-900', c)}>{brl(v)}</p></div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Placa, marca ou modelo" className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm" /></div>
        <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={pending} onChange={(e) => setPending(e.target.checked)} className="rounded border-gray-300" />Só com contas a pagar</label>
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      {!rows ? <Loader2 className="animate-spin text-gray-400" /> : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
              <tr><th className="px-4 py-2">Veículo</th><th className="px-4 py-2">Negociação</th><th className="px-4 py-2 text-right">Total</th><th className="px-4 py-2 text-right">Pago</th><th className="px-4 py-2 text-right">A pagar</th><th /></tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <Link href={`/financeiro/veiculos/${r.id}`} className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-500"><Car size={15} /></span>
                      <span className="min-w-0"><span className="block font-mono text-xs font-bold text-gray-900">{r.plate ?? 'S/PLACA'}</span><span className="block truncate text-xs text-gray-600">{r.title}</span></span>
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-600">{r.deals.length ? r.deals.map((d) => `${d.number ?? '—'} (${d.role.toLowerCase()})`).join(', ') : '—'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{brl(r.total)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700">{brl(r.paid)}</td>
                  <td className={cn('px-4 py-2.5 text-right font-semibold tabular-nums', r.pending > 0 ? 'text-amber-700' : 'text-gray-400')}>{brl(r.pending)}{r.pendingCount ? <span className="ml-1 text-[10px] font-normal">({r.pendingCount})</span> : null}</td>
                  <td className="px-4 py-2.5 text-right"><Link href={`/financeiro/veiculos/${r.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-brand-700">Conciliar <ChevronRight size={12} /></Link></td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">Nenhum veículo {pending ? 'com contas a pagar' : 'com lançamentos'}.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
