import { UserSquare } from 'lucide-react'
import FinanceResultReport from '@/components/reports/FinanceResultReport'

export default function ResultadoVendedorReportPage() {
  return <FinanceResultReport view="resultado-vendedor" title="Resultado por Vendedor" groupLabel="Vendedor" Icon={UserSquare} />
}
