'use client'
import { PlaceholderPage } from '@/components/layout/PlaceholderPage'
import { PhoneCall } from 'lucide-react'
export default function Page() {
  return <PlaceholderPage icon={PhoneCall} title="Chamadas" description="Histórico de ligações recebidas, realizadas, atendidas e perdidas, vinculadas a leads. Integração com telefonia (Asterisk/3CX/Twilio/genérico) virá em fase futura — sem integração real sem credenciais oficiais." />
}
