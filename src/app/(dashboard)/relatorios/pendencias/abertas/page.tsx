import { Inbox } from 'lucide-react'
import PendencyListReport from '@/components/reports/PendencyListReport'

export default function PendenciasAbertasReportPage() {
  return <PendencyListReport view="abertas" title="Pendências em Aberto" Icon={Inbox} />
}
