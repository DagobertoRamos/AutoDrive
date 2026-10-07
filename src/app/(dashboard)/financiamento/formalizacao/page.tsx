'use client'

// F&I › Formalização — propostas escolhidas, do contrato até o pagamento do banco.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FileSignature } from 'lucide-react'
import { Alert, api, brlOrDash, dateTimeBR, EmptyState, PageHeader, StatusBadge } from '@/components/fi/ui'

interface Row { id: string; code: string | null; proponentNome: string; bankNome: string | null; approvedValue: number; formalization: string | null; funding: string | null; fundingStatus: string; updatedAt: string }

const FUND_TONE: Record<string, string> = { AGUARDANDO: 'info', ENVIADO_PAGAMENTO: 'progress', COM_PENDENCIA: 'danger', BLOQUEADO: 'danger', PAGO_PARCIAL: 'warning', PAGO: 'success', NAO_ESPERADO: 'neutral' }

export default function FormalizacaoPage() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { api<Row[]>('/api/financing/proposals?etapa=formalizacao&pageSize=100').then((r) => (r.ok ? setRows(r.data ?? []) : setError(r.error))) }, [])
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <PageHeader title="Formalização" helpTerm="FORMALIZACAO" />
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        {rows && rows.length === 0 ? <EmptyState icon={<FileSignature size={28} />} text="Nenhuma proposta em formalização." /> : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500"><tr><th className="px-4 py-2.5 font-medium">Ficha</th><th className="px-4 py-2.5 font-medium">Cliente</th><th className="px-4 py-2.5 font-medium">Banco</th><th className="px-4 py-2.5 text-right font-medium">Valor</th><th className="px-4 py-2.5 font-medium">Formalização</th><th className="px-4 py-2.5 font-medium">Pagamento do banco</th><th className="px-4 py-2.5 font-medium">Atualizada</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {(rows ?? []).map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5"><Link href={`/financiamento/fichas/${r.id}`} className="font-medium text-brand-700 hover:underline">{r.code ?? 'Ficha'}</Link></td>
                  <td className="px-4 py-2.5">{r.proponentNome}</td>
                  <td className="px-4 py-2.5">{r.bankNome ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{brlOrDash(r.approvedValue || null)}</td>
                  <td className="px-4 py-2.5">{r.formalization && <StatusBadge meta={{ label: r.formalization, tone: r.formalization === 'Com pendência' ? 'danger' : r.formalization.startsWith('Aguardando') ? 'warning' : r.formalization === 'Não iniciada' ? 'neutral' : 'success' }} />}</td>
                  <td className="px-4 py-2.5">{r.funding && <StatusBadge meta={{ label: r.funding, tone: FUND_TONE[r.fundingStatus] ?? 'neutral' }} />}</td>
                  <td className="px-4 py-2.5 text-gray-500">{dateTimeBR(r.updatedAt)}</td>
                </tr>
              ))}
              {!rows && !error && <tr><td colSpan={7} className="px-4 py-3"><div className="h-5 animate-pulse rounded bg-gray-100" /></td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
