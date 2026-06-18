'use client'
import { PlaceholderPage } from '@/components/layout/PlaceholderPage'
import { GitBranch } from 'lucide-react'
export default function Page() {
  return <PlaceholderPage icon={GitBranch} title="Políticas de Distribuição" description="Modos de distribuição de leads (roleta, tanque de tubarão, livre, menor carga, por peso/regras), respeitando unidade, horário, presença, SLA e fila. MASTER define o que é permitido; a loja configura. Estrutura preparada para fase futura." />
}
