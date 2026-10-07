'use client'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { OpsListPage } from '@/components/operations/OpsListPage'

function Page() {
  const aba = useSearchParams().get('aba') ?? undefined
  return (
    <OpsListPage view="transfer" title="Transferências" hint="TRANSFERENCIA_STATUS" initialTab={aba} tabs={[
      { key: 'open', label: 'Em andamento', empty: 'Nenhuma transferência em andamento.' },
      { key: 'done', label: 'Concluídas', empty: 'Nenhuma transferência concluída ainda.' },
      { key: 'stores', label: 'Entre lojas', empty: 'Nenhuma transferência entre lojas.' },
    ]} />
  )
}
export default function TransferenciasPage() { return <Suspense><Page /></Suspense> }
