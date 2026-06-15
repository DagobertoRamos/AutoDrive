import { TrendingDown } from 'lucide-react'
import FinanceEntryListReport from '@/components/reports/FinanceEntryListReport'

export default function DespesasReportPage() {
  return <FinanceEntryListReport view="despesas" title="Despesas" Icon={TrendingDown} />
}
