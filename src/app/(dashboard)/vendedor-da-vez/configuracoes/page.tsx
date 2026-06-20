'use client'
import { PlaceholderPage } from '@/components/layout/PlaceholderPage'
import { Settings } from 'lucide-react'
export default function Page() {
  return <PlaceholderPage icon={Settings} title="Configurações da Fila" description="Regras por unidade: validação de presença (geofence/raio, QR Code, dispositivo, horário), tempo de aceite, regras de cliente recorrente e exceções. Bloqueio/liberação de vendedor. Estrutura preparada para fase futura." />
}
