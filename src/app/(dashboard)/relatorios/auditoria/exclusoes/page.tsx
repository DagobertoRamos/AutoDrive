import { Trash2 } from 'lucide-react'
import AuditReport from '@/components/reports/AuditReport'

export default function AuditoriaExclusoesReportPage() {
  return <AuditReport view="exclusoes" title="Auditoria — Exclusões" Icon={Trash2} />
}
