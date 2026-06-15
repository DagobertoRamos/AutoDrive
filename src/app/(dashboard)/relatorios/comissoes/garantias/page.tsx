'use client'

import { Shield } from 'lucide-react'
import CommissionLedgerReport from '@/components/reports/CommissionLedgerReport'

export default function ComissoesGarantiasReportPage() {
  return <CommissionLedgerReport view="garantias" title="Comissões — Garantias" Icon={Shield} />
}
