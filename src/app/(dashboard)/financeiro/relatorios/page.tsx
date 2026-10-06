// Centro Financeiro — relatórios gerenciais (?view= escolhe o relatório).
import { Suspense } from 'react'
import ReportsHub from '@/components/finance/center/reports/ReportsHub'

export const metadata = { title: 'Relatórios gerenciais' }

export default function FinanceReportsPage() {
  return (
    <Suspense fallback={null}>
      <ReportsHub />
    </Suspense>
  )
}
