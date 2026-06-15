import { ArrowUpCircle } from 'lucide-react'
import FinanceEntryListReport from '@/components/reports/FinanceEntryListReport'

export default function ContasAReceberReportPage() {
  return <FinanceEntryListReport view="contas-a-receber" title="Contas a Receber" aging Icon={ArrowUpCircle} />
}
