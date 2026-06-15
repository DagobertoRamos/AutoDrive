'use client'

import { Truck } from 'lucide-react'
import NegotiationsReport from '@/components/reports/NegotiationsReport'

export default function ComprasReportPage() {
  return <NegotiationsReport type="COMPRA" title="Compras" valueLabel="Comprado (finalizado)" Icon={Truck} />
}
