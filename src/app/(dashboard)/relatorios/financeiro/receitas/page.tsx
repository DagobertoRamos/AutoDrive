'use client'

import { TrendingUp } from 'lucide-react'
import FinanceEntryListReport from '@/components/reports/FinanceEntryListReport'

export default function ReceitasReportPage() {
  return <FinanceEntryListReport view="receitas" title="Receitas" Icon={TrendingUp} />
}
