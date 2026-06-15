'use client'

import { Building2 } from 'lucide-react'
import FinanceResultReport from '@/components/reports/FinanceResultReport'

export default function ResultadoUnidadeReportPage() {
  return <FinanceResultReport view="resultado-unidade" title="Resultado por Unidade" groupLabel="Unidade" Icon={Building2} />
}
