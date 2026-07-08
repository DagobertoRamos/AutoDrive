'use client'

// =============================================================================
// Error boundary do segmento (dashboard). Contém erros de render de QUALQUER
// página interna e mostra um aviso controlado e recuperável DENTRO do app
// (menu/shell preservados), em vez de derrubar tudo na tela global
// "Houve um erro ao abrir o AutoDrive". "Tentar novamente" re-renderiza a rota.
// =============================================================================

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[dashboard] erro de render capturado:', error) }, [error])

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-card">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
          <AlertTriangle className="h-6 w-6 text-amber-600" />
        </div>
        <h2 className="text-lg font-bold text-gray-900">Não foi possível abrir esta tela</h2>
        <p className="mt-1.5 text-sm text-gray-500">
          Ocorreu um erro ao carregar esta parte do sistema. O restante do AutoDrive continua funcionando — você pode tentar de novo.
        </p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            <RefreshCw size={16} />
            Tentar novamente
          </button>
          <a href="/dashboard" className="inline-flex items-center rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">
            Ir para o início
          </a>
        </div>
        {error?.digest && <p className="mt-3 text-[11px] text-gray-400">Código: {error.digest}</p>}
      </div>
    </div>
  )
}
