import { MessageCircle } from 'lucide-react'
import CommunicationReport from '@/components/reports/CommunicationReport'

export default function ComunicacaoWhatsappReportPage() {
  return <CommunicationReport view="whatsapp" title="Comunicação — WhatsApp" Icon={MessageCircle} />
}
