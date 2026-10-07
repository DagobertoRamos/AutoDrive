'use client'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { OpsListPage } from '@/components/operations/OpsListPage'

function Page() {
  const aba = useSearchParams().get('aba') ?? undefined
  return (
    <OpsListPage view="queries" title="Consultas de débitos e restrições" hint="CONSULTA_VEICULAR" initialTab={aba} tabs={[
      { key: 'all', label: 'Todas', empty: 'Nenhuma consulta feita. Consulte pela ficha do veículo.' },
      { key: 'debts', label: 'Com débitos', empty: 'Nenhum veículo com débito nas consultas.' },
      { key: 'restrictions', label: 'Com restrições', empty: 'Nenhuma restrição encontrada.' },
    ]} />
  )
}
export default function ConsultasPage() { return <Suspense><Page /></Suspense> }
