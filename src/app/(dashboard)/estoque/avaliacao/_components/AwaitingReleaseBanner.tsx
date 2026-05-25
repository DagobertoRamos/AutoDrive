'use client'

// =============================================================================
// AwaitingReleaseBanner — exibido para VENDEDOR enquanto o gerente não libera a
// precificação. GERENTE+ não vê o banner.
// =============================================================================

import { Clock, AlertCircle } from 'lucide-react'

interface AwaitingReleaseBannerProps {
  /** Resposta do GET /api/evaluations/[id] — flag adicionada pelo backend. */
  pricingHidden?: boolean | null
  releasedAt?:    string | Date | null
  role?:          string | null
  /** Força ocultar (ex: tela de edição que não deve mostrar banner). */
  hidden?:        boolean
}

const VENDEDOR_ROLES = new Set(['VENDEDOR', 'VENDEDOR_LIDER'])

export function AwaitingReleaseBanner({
  pricingHidden, releasedAt, role, hidden,
}: AwaitingReleaseBannerProps) {
  if (hidden) return null
  const isVendedor = role ? VENDEDOR_ROLES.has(role) : false
  // Mostrar se o backend masked OU (vendedor sem releasedAt). GERENTE+ nunca vê.
  const shouldShow = pricingHidden === true || (isVendedor && !releasedAt)
  if (!shouldShow) return null
  // Se temos role explícito e ele NÃO é vendedor (e backend não mascarou), oculta.
  if (!isVendedor && pricingHidden !== true) return null

  return (
    <div className="flex items-start gap-3 rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-4 shadow-sm">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
        <Clock className="h-5 w-5 text-amber-700" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-amber-700 shrink-0" />
          <p className="text-sm font-bold text-amber-900">
            Aguardando liberação do resultado da avaliação.
          </p>
        </div>
        <p className="mt-1 text-xs text-amber-800">
          O gerente está revisando a precificação. Você será notificado assim que o resultado for liberado.
        </p>
      </div>
    </div>
  )
}
