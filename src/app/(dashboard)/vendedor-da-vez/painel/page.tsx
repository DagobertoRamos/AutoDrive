'use client'
import { PlaceholderPage } from '@/components/layout/PlaceholderPage'
import { LayoutDashboard } from 'lucide-react'
export default function Page() {
  return <PlaceholderPage icon={LayoutDashboard} title="Painel da Unidade" description="Acompanhamento do líder/gerente: fila atual, vendedor da vez, clientes aguardando, chamados ativos e timeouts. Pular com justificativa, confirmar atendimento, histórico do dia e suspeitas. Estrutura preparada para fase futura." />
}
