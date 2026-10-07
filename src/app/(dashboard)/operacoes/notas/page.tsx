'use client'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { OpsListPage } from '@/components/operations/OpsListPage'

function Page() {
  const aba = useSearchParams().get('aba') ?? undefined
  return (
    <OpsListPage view="fiscal" title="Notas fiscais" hint="NFE_OPERACAO" initialTab={aba} tabs={[
      { key: 'pending', label: 'A emitir', empty: 'Nenhuma nota pendente.' },
      { key: 'rejected', label: 'Rejeitadas', empty: 'Nenhuma nota rejeitada.' },
      { key: 'authorized', label: 'Emitidas', empty: 'Nenhuma nota emitida ainda.' },
      { key: 'cancelled', label: 'Canceladas', empty: 'Nenhuma nota cancelada.' },
    ]} />
  )
}
export default function NotasPage() { return <Suspense><Page /></Suspense> }
