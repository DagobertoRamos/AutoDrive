'use client'

import { Timer } from 'lucide-react'
import PendencyListReport from '@/components/reports/PendencyListReport'

export default function PendenciasSlaReportPage() {
  return <PendencyListReport view="sla" title="SLA de Pendências" Icon={Timer} />
}
