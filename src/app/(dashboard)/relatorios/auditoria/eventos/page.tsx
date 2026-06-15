import { AlertTriangle } from 'lucide-react'
import AuditReport from '@/components/reports/AuditReport'

export default function AuditoriaEventosReportPage() {
  return <AuditReport view="eventos" title="Auditoria — Eventos Críticos" Icon={AlertTriangle} />
}
