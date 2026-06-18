'use client'
import { PlaceholderPage } from '@/components/layout/PlaceholderPage'
import { Phone } from 'lucide-react'
export default function Page() {
  return <PlaceholderPage icon={Phone} title="Telefonia (global) — Master" description="Camada técnica GLOBAL: provedores homologados (Asterisk, 3CX, Twilio, webhook genérico), adapters e limites da plataforma. As credenciais são da loja (BYOC) — o MASTER nunca vê credencial do tenant. Estrutura preparada para fase futura." />
}
