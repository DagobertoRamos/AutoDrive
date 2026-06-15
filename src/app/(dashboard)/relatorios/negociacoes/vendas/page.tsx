'use client'

import { ShoppingCart } from 'lucide-react'
import NegotiationsReport from '@/components/reports/NegotiationsReport'

export default function VendasReportPage() {
  return <NegotiationsReport type="VENDA" title="Vendas" valueLabel="Vendido (finalizado)" Icon={ShoppingCart} />
}
