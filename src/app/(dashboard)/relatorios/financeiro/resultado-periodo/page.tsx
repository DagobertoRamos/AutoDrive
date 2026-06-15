import { CalendarRange } from 'lucide-react'
import FinanceResultReport from '@/components/reports/FinanceResultReport'

export default function ResultadoPeriodoReportPage() {
  return <FinanceResultReport view="resultado-periodo" title="Resultado por Período" groupLabel="Período" Icon={CalendarRange} />
}
