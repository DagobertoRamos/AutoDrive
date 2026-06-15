import { FilePenLine } from 'lucide-react'
import AuditReport from '@/components/reports/AuditReport'

export default function AuditoriaAlteracoesReportPage() {
  return <AuditReport view="alteracoes" title="Auditoria — Alterações" Icon={FilePenLine} />
}
