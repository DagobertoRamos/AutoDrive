import { UserCog } from 'lucide-react'
import PendencyGroupedReport from '@/components/reports/PendencyGroupedReport'

export default function PendenciasResponsavelReportPage() {
  return <PendencyGroupedReport view="responsavel" title="Pendências por Responsável" groupLabel="Responsável" Icon={UserCog} />
}
