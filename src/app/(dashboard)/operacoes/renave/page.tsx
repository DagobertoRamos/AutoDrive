'use client'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { OpsListPage } from '@/components/operations/OpsListPage'

function Page() {
  const aba = useSearchParams().get('aba') ?? undefined
  return (
    <OpsListPage view="renave" title="RENAVE" hint="RENAVE" initialTab={aba} tabs={[
      { key: 'pending', label: 'Pendentes', empty: 'Nenhuma entrada ou saída pendente.' },
      { key: 'issues', label: 'Recusados / verificando', empty: 'Nenhum registro recusado.' },
      { key: 'divergent', label: 'Divergências', empty: 'Estoque em dia com o RENAVE.' },
      { key: 'confirmed', label: 'Confirmados', empty: 'Nenhum registro confirmado ainda.' },
    ]} />
  )
}
export default function RenavePage() { return <Suspense><Page /></Suspense> }
