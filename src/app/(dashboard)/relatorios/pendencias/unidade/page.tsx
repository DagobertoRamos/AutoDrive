'use client'

import { Building2 } from 'lucide-react'
import PendencyGroupedReport from '@/components/reports/PendencyGroupedReport'

export default function PendenciasUnidadeReportPage() {
  return <PendencyGroupedReport view="unidade" title="Pendências por Unidade" groupLabel="Unidade" Icon={Building2} />
}
