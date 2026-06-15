import { Mail } from 'lucide-react'
import CommunicationReport from '@/components/reports/CommunicationReport'

export default function ComunicacaoEmailReportPage() {
  return <CommunicationReport view="email" title="Comunicação — E-mail" Icon={Mail} />
}
