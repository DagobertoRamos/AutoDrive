'use client'

// =============================================================================
// F&I › Fichas — lista paginada (filtros no servidor). Uma ficha = um cliente +
// um veículo, com as propostas de cada banco dentro dela.
// =============================================================================

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight, FileText, Plus, Search } from 'lucide-react'
import { api, brlOrDash, btnPrimary, dateTimeBR, EmptyState, inputClass, PageHeader, StatusBadge } from '@/components/fi/ui'
import { NewProposalModal } from '@/components/fi/NewProposalModal'

interface Row {
  id: string; code: string | null; status: string; statusLabel: string; statusTone: string
  proponentNome: string; proponentDoc: string | null; vehicle: string | null; amountRequested: number; approvedValue: number
  bankNome: string | null; banksCount: number; pending: boolean; funding: string | null; fundingStatus: string; updatedAt: string
}

const FILTERS: { key: string; label: string; q: string }[] = [
  { key: 'todas', label: 'Todas', q: '' },
  { key: 'analise', label: 'Em análise', q: 'etapa=analise' },
  { key: 'pendencias', label: 'Com pendência', q: 'etapa=pendencias' },
  { key: 'aprovadas', label: 'Aprovadas', q: 'etapa=aprovadas' },
  { key: 'formalizacao', label: 'Em formalização', q: 'etapa=formalizacao' },
  { key: 'concluidas', label: 'Banco pagou', q: 'etapa=concluidas' },
  { key: 'recusadas', label: 'Recusadas', q: 'status=RECUSADA' },
  { key: 'rascunhos', label: 'Rascunhos', q: 'status=SIMULACAO' },
  { key: 'canceladas', label: 'Canceladas', q: 'status=CANCELADA' },
]

function FichasInner() {
  const sp = useSearchParams()
  const router = useRouter()
  const initial = FILTERS.find((f) => f.q && (sp.get('etapa') ? f.q === `etapa=${sp.get('etapa')}` : f.q === `status=${sp.get('status')}`))?.key ?? 'todas'
  const [filter, setFilter] = useState(initial)
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(sp.get('nova') === '1')

  useEffect(() => { const t = setTimeout(() => { setTerm(q.trim()); setPage(1) }, 350); return () => clearTimeout(t) }, [q])

  const load = useCallback(async () => {
    setLoading(true)
    const f = FILTERS.find((x) => x.key === filter)
    const params = [f?.q, term ? `q=${encodeURIComponent(term)}` : '', `page=${page}`, 'pageSize=25'].filter(Boolean).join('&')
    const r = await api<Row[]>(`/api/financing/proposals?${params}`)
    if (r.ok) { setRows(r.data ?? []); setTotal(Number(r.json?.total ?? 0)); setError(null) } else setError(r.error)
    setLoading(false)
  }, [filter, term, page])
  useEffect(() => { const t = setTimeout(() => void load(), 0); return () => clearTimeout(t) }, [load])

  const pages = Math.max(1, Math.ceil(total / 25))
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <PageHeader title="Fichas" actions={<button className={btnPrimary} onClick={() => setCreating(true)}><Plus size={16} />Nova ficha</button>} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrar fichas">
          {FILTERS.map((f) => (
            <button key={f.key} role="tab" aria-selected={filter === f.key} onClick={() => { setFilter(f.key); setPage(1) }}
              className={`rounded-full px-3 py-1 text-xs font-medium ${filter === f.key ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>{f.label}</button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-64">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden />
          <input className={`${inputClass} pl-9`} placeholder="Ficha, cliente, CPF ou veículo" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar ficha" />
        </div>
      </div>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        {!loading && rows.length === 0 ? <EmptyState icon={<FileText size={28} />} text="Nenhuma ficha encontrada." /> : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500">
              <tr><th className="px-4 py-2.5 font-medium">Ficha</th><th className="px-4 py-2.5 font-medium">Cliente</th><th className="px-4 py-2.5 font-medium">Veículo</th><th className="px-4 py-2.5 text-right font-medium">Financiado</th><th className="px-4 py-2.5 font-medium">Situação</th><th className="px-4 py-2.5 font-medium">Banco</th><th className="px-4 py-2.5 font-medium">Atualizada</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.id} className="cursor-pointer hover:bg-gray-50" onClick={() => router.push(`/financiamento/fichas/${r.id}`)}>
                  <td className="whitespace-nowrap px-4 py-2.5"><Link href={`/financiamento/fichas/${r.id}`} className="font-medium text-brand-700 hover:underline" onClick={(e) => e.stopPropagation()}>{r.code ?? 'Ficha'}</Link></td>
                  <td className="px-4 py-2.5"><p className="font-medium text-gray-900">{r.proponentNome}</p>{r.proponentDoc && <p className="text-xs text-gray-500">{r.proponentDoc}</p>}</td>
                  <td className="px-4 py-2.5 text-gray-700">{r.vehicle ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-900">{brlOrDash(r.approvedValue || r.amountRequested || null)}</td>
                  <td className="px-4 py-2.5"><div className="flex flex-wrap gap-1"><StatusBadge meta={{ label: r.statusLabel, tone: r.statusTone }} />{r.pending && <StatusBadge meta={{ label: 'Pendência', tone: 'warning', icon: 'file' }} />}{r.fundingStatus === 'PAGO' && <StatusBadge meta={{ label: 'Banco pagou', tone: 'success', icon: 'wallet' }} />}</div></td>
                  <td className="px-4 py-2.5 text-gray-700">{r.bankNome ?? (r.banksCount ? `${r.banksCount} banco${r.banksCount > 1 ? 's' : ''}` : '—')}</td>
                  <td className="px-4 py-2.5 text-gray-500">{dateTimeBR(r.updatedAt)}</td>
                </tr>
              ))}
              {loading && rows.length === 0 && Array.from({ length: 5 }).map((_, i) => <tr key={i}><td colSpan={7} className="px-4 py-3"><div className="h-5 animate-pulse rounded bg-gray-100" /></td></tr>)}
            </tbody>
          </table>
        )}
      </div>

      {total > 25 && (
        <div className="flex items-center justify-end gap-2 text-sm text-gray-600">
          <span>{total} fichas · página {page} de {pages}</span>
          <button className="rounded-lg border border-gray-200 p-1.5 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Página anterior"><ChevronLeft size={16} /></button>
          <button className="rounded-lg border border-gray-200 p-1.5 disabled:opacity-40" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Próxima página"><ChevronRight size={16} /></button>
        </div>
      )}

      {creating && <NewProposalModal onClose={() => setCreating(false)} />}
    </div>
  )
}

export default function FichasPage() {
  return <Suspense fallback={null}><FichasInner /></Suspense>
}
