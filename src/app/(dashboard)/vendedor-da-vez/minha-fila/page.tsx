'use client'
import { PlaceholderPage } from '@/components/layout/PlaceholderPage'
import { DoorOpen } from 'lucide-react'
export default function Page() {
  return <PlaceholderPage icon={DoorOpen} title="Minha Fila" description="Entrar/sair da fila, pausar e retornar, ver sua posição e histórico. O check-in valida sua presença (GPS/QR/dispositivo ou liberação do gestor). Estrutura preparada para fase futura." />
}
