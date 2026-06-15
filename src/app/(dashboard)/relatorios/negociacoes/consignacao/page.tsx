import { PackageCheck } from 'lucide-react'
import NegotiationsReport from '@/components/reports/NegotiationsReport'

export default function ConsignacaoReportPage() {
  return <NegotiationsReport type="CONSIGNACAO" title="Consignação" valueLabel="Valor (finalizado)" Icon={PackageCheck} />
}
