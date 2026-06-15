'use client'

import { RefreshCw } from 'lucide-react'
import NegotiationsReport from '@/components/reports/NegotiationsReport'

export default function TrocasReportPage() {
  return <NegotiationsReport type="TROCA" title="Trocas" valueLabel="Valor (finalizado)" Icon={RefreshCw} />
}
