import { LogIn } from 'lucide-react'
import AuditReport from '@/components/reports/AuditReport'

export default function AuditoriaAcessosReportPage() {
  return <AuditReport view="acessos" title="Auditoria — Acessos" Icon={LogIn} />
}
