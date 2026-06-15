import { DollarSign } from 'lucide-react'
import CommissionLedgerReport from '@/components/reports/CommissionLedgerReport'

export default function ExtratoGeralReportPage() {
  return <CommissionLedgerReport view="geral" title="Extrato Geral de Comissões" Icon={DollarSign} />
}
