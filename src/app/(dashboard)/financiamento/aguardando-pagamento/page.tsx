'use client'

// F&I › Aguardando bancos — contratos cujo pagamento do banco ainda não entrou.
// O financiamento só termina quando o banco paga.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Wallet } from 'lucide-react'
import { Alert, api, brl, dateBR, EmptyState, PageHeader, StatusBadge } from '@/components/fi/ui'

interface Row { id: string; code: string | null; bankName: string; customer: string; amount: number; paid: number | null; fundingStatus: string; signed: boolean; waitingDays: number; expectedAt: string | null; dealId: string | null }

const META: Record<string, { label: string; tone: string; icon: string }> = {
  AGUARDANDO: { label: 'Aguardando', tone: 'info', icon: 'clock' }, ENVIADO_PAGAMENTO: { label: 'Enviado para pagamento', tone: 'progress', icon: 'send' },
  COM_PENDENCIA: { label: 'Com pendência', tone: 'danger', icon: 'alert' }, BLOQUEADO: { label: 'Bloqueado', tone: 'danger', icon: 'lock' },
  PAGO_PARCIAL: { label: 'Pago parcialmente', tone: 'warning', icon: 'wallet' },
}

export default function AguardandoPagamentoPage() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { api<Row[]>('/api/financing/awaiting-payment').then((r) => (r.ok ? setRows(r.data ?? []) : setError(r.error))) }, [])
  const total = (rows ?? []).reduce((s, r) => s + r.amount - (r.paid ?? 0), 0)
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <PageHeader title="Aguardando bancos" helpTerm="PAGAMENTO_BANCO" subtitle={rows && rows.length ? `${rows.length} contrato${rows.length > 1 ? 's' : ''} · ${brl(total)} a receber` : undefined} />
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        {rows && rows.length === 0 ? <EmptyState icon={<Wallet size={28} />} text="Nenhum pagamento de banco pendente." /> : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500"><tr><th className="px-4 py-2.5 font-medium">Banco</th><th className="px-4 py-2.5 font-medium">Cliente</th><th className="px-4 py-2.5 text-right font-medium">Valor</th><th className="px-4 py-2.5 font-medium">Aguardando</th><th className="px-4 py-2.5 font-medium">Situação</th><th className="px-4 py-2.5 font-medium">Ficha</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {(rows ?? []).map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-900">{r.bankName}</td>
                  <td className="px-4 py-2.5">{r.customer}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{brl(r.amount)}{r.paid ? <p className="text-xs text-gray-500">pago {brl(r.paid)}</p> : null}</td>
                  <td className={`px-4 py-2.5 ${r.waitingDays > 3 ? 'font-semibold text-red-700' : 'text-gray-700'}`}>{r.signed ? `há ${r.waitingDays} dia${r.waitingDays === 1 ? '' : 's'}` : 'contrato não assinado'}{r.expectedAt && <p className="text-xs font-normal text-gray-500">previsto {dateBR(r.expectedAt)}</p>}</td>
                  <td className="px-4 py-2.5"><StatusBadge meta={META[r.fundingStatus] ?? { label: r.fundingStatus, tone: 'neutral' }} /></td>
                  <td className="px-4 py-2.5"><Link href={`/financiamento/fichas/${r.id}`} className="text-brand-700 hover:underline">{r.code ?? 'Abrir'}</Link></td>
                </tr>
              ))}
              {!rows && !error && <tr><td colSpan={6} className="px-4 py-3"><div className="h-5 animate-pulse rounded bg-gray-100" /></td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
