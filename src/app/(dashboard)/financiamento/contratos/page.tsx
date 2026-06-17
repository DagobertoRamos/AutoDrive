'use client'

// =============================================================================
// F&I > Contratos — fichas APROVADAS (financiamentos fechados). Consome
// /api/financing/proposals?status=APROVADA. Mostra os termos e gera um resumo
// imprimível do contrato. Emissão/assinatura digital fica como passo futuro.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { FileText, RefreshCw, Printer, FolderOpen, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { maskCPF } from '@/lib/masks'
import SearchBox from '@/components/reports/SearchBox'

interface Row { id: string; proponentNome: string; proponentCpf: string | null; bankNome: string | null; vehicle: string | null; amountRequested: number; downPayment: number; approvedValue: number; monthlyPayment: number; installments: number | null; createdAt: string }

const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const date = (s: string) => new Date(s).toLocaleDateString('pt-BR')

export default function FinancingContractsPage() {
  const [items, setItems] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [contract, setContract] = useState<Row | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ status: 'APROVADA' }); if (q) qs.set('q', q)
      const r = await fetch(`/api/financing/proposals?${qs}`, { credentials: 'include' }).then((x) => x.json())
      setItems(r?.data ?? [])
    } catch { setItems([]) } finally { setLoading(false) }
  }, [q])
  useEffect(() => { load() }, [load])

  const total = items.reduce((s, r) => s + (r.approvedValue || r.amountRequested || 0), 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><FileText size={20} className="text-brand-600" />Contratos F&amp;I</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${items.length} contrato(s) aprovado(s) · ${fmt(total)} financiado`}</p>
        </div>
        <div className="flex items-center gap-2">
          <SearchBox value={q} onChange={setQ} placeholder="Buscar proponente, CPF..." className="w-60" />
          <button onClick={load} disabled={loading} className="btn-secondary text-xs"><RefreshCw size={13} className={cn(loading && 'animate-spin')} />Atualizar</button>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-xs text-gray-500">
        São as fichas <strong>aprovadas</strong> — financiamentos fechados. Gere o <strong>resumo do contrato</strong> para conferência/impressão. A emissão e a assinatura digital do contrato entram quando houver integração oficial do provedor.
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50"><tr>{['Proponente', 'Banco', 'Veículo', 'Financiado', 'Parcela', 'Prazo', 'Data', ''].map((h) => (<th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (<tr key={i}>{Array.from({ length: 8 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>))}</tr>))
              ) : items.length === 0 ? (
                <tr><td colSpan={8} className="py-14 text-center"><FileText size={30} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Nenhum contrato (ficha aprovada) ainda.</p></td></tr>
              ) : items.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3"><p className="font-medium text-gray-900">{r.proponentNome}</p>{r.proponentCpf && <p className="font-mono text-[11px] text-gray-400">{maskCPF(r.proponentCpf)}</p>}</td>
                  <td className="px-4 py-3 text-gray-600">{r.bankNome ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{r.vehicle ?? '—'}</td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gray-700">{fmt(r.approvedValue || r.amountRequested)}</td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-green-700">{r.monthlyPayment ? fmt(r.monthlyPayment) : '—'}</td>
                  <td className="px-4 py-3 text-center tabular-nums text-gray-500">{r.installments ? `${r.installments}x` : '—'}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">{date(r.createdAt)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button onClick={() => setContract(r)} className="mr-1 inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-brand-50 hover:text-brand-700" title="Resumo do contrato"><Printer size={15} /></button>
                    <Link href={`/financiamento/fichas/${r.id}`} className="inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Abrir ficha"><FolderOpen size={15} /></Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {contract && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 print:bg-white print:p-0" onClick={() => setContract(null)}>
          <div className="my-6 w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl print:my-0 print:max-w-none print:shadow-none" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between print:hidden">
              <h2 className="text-lg font-bold text-gray-900">Resumo do contrato</h2>
              <div className="flex items-center gap-2">
                <button onClick={() => window.print()} className="btn-secondary text-sm"><Printer size={15} />Imprimir</button>
                <button onClick={() => setContract(null)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X size={18} /></button>
              </div>
            </div>
            <div className="space-y-3">
              <div className="border-b border-gray-100 pb-2"><p className="text-base font-bold text-gray-900">Contrato de Financiamento — F&amp;I</p><p className="text-xs text-gray-500">Resumo gerado em {date(new Date().toISOString())}</p></div>
              {[
                ['Proponente', contract.proponentNome],
                ['CPF', contract.proponentCpf ? maskCPF(contract.proponentCpf) : '—'],
                ['Banco / Financeira', contract.bankNome ?? '—'],
                ['Veículo', contract.vehicle ?? '—'],
                ['Valor financiado', fmt(contract.approvedValue || contract.amountRequested)],
                ['Entrada', fmt(contract.downPayment)],
                ['Parcelas', contract.installments ? `${contract.installments}x` : '—'],
                ['Parcela mensal', contract.monthlyPayment ? fmt(contract.monthlyPayment) : '—'],
                ['Total a prazo', contract.monthlyPayment && contract.installments ? fmt(contract.monthlyPayment * contract.installments) : '—'],
                ['Data', date(contract.createdAt)],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between border-b border-dashed border-gray-100 py-1.5 text-sm"><span className="text-gray-500">{k}</span><span className="font-medium text-gray-900">{v}</span></div>
              ))}
              <div className="mt-6 grid grid-cols-2 gap-6 pt-8 text-center text-xs text-gray-500">
                <div className="border-t border-gray-400 pt-1">Assinatura do proponente</div>
                <div className="border-t border-gray-400 pt-1">Assinatura da loja</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
