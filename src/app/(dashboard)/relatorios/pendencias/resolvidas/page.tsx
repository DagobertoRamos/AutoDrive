import { CheckCircle2 } from 'lucide-react'
import PendencyListReport from '@/components/reports/PendencyListReport'

export default function PendenciasResolvidasReportPage() {
  return <PendencyListReport view="resolvidas" title="Pendências Resolvidas" Icon={CheckCircle2} />
}
