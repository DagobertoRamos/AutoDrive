'use client'

import { ArrowDownCircle } from 'lucide-react'
import FinanceEntryListReport from '@/components/reports/FinanceEntryListReport'

export default function ContasAPagarReportPage() {
  return <FinanceEntryListReport view="contas-a-pagar" title="Contas a Pagar" aging Icon={ArrowDownCircle} />
}
