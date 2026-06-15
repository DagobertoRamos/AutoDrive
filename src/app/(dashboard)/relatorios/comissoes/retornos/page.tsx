'use client'

import { ArrowLeftRight } from 'lucide-react'
import CommissionLedgerReport from '@/components/reports/CommissionLedgerReport'

export default function ComissoesRetornosReportPage() {
  return <CommissionLedgerReport view="retornos" title="Comissões — Retornos" Icon={ArrowLeftRight} />
}
