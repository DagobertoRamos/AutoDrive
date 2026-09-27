'use client'

// Financeiro › Custos de veículos › conciliação de um carro (mesmo extrato da ficha do veículo).
import { use } from 'react'
import Link from 'next/link'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { LedgerPanel } from '@/components/estoque/prep/LedgerPanel'

export default function ConciliacaoVeiculoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/financeiro/veiculos" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"><ArrowLeft size={13} />Custos de veículos</Link>
          <h1 className="text-xl font-bold text-gray-900">Conciliação do veículo</h1>
        </div>
        <Link href={`/estoque/${id}?aba=servicos`} className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">Abrir ficha do veículo <ExternalLink size={13} /></Link>
      </div>
      <LedgerPanel vehicleId={id} />
    </div>
  )
}
