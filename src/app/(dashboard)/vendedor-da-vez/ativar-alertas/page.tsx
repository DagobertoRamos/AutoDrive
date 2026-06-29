'use client'

// Página "Ativar Alertas" — wrapper fino do componente AlertSetup (o mesmo bloco
// também aparece em Configurações). Mantida para o deep-link do banner de alertas.

import AlertSetup from '@/components/seller-queue/AlertSetup'

export default function AtivarAlertasPage() {
  return (
    <div className="mx-auto max-w-md space-y-3 p-4">
      <h1 className="text-xl font-bold text-gray-900">Ativar alertas de chamada</h1>
      <AlertSetup />
    </div>
  )
}
