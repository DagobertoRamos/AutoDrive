'use client'

// Financeiro › Contas a receber — lista, filtros, baixa (individual e em lote), lançamento completo.
import { Suspense } from 'react'
import { EntriesCenter } from '@/components/finance/center/entries/EntriesCenter'

export default function Page() {
  return (
    <Suspense fallback={null}>
      <EntriesCenter kind="RECEITA" />
    </Suspense>
  )
}
