'use client'

// =============================================================================
// Ações de uma pendência de estoque na ficha do veículo. Cada portão da esteira
// se resolve no lugar certo (nada de "resolver" sem evidência):
//   Negociação de entrada → cadastrar em Negociações › Nova (resolve sozinho)
//   Perícia               → aba Cautelar (status + laudo anexado)
//   Recebimento           → aba Recebimento (checklist com fotos)
//   Serviços da avaliação → aba Serviços (concluir/negar cada serviço)
//   Demais                → Resolver / Reabrir
// =============================================================================

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, ExternalLink } from 'lucide-react'
import { GATE_INSPECTION, GATE_NEGOTIATION, GATE_RECEIVE, sameLabel, STAGE_SERVICES } from '@/lib/stock/intake-core'

const btn = 'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold disabled:opacity-50'
const go = `${btn} bg-emerald-600 text-white hover:bg-emerald-700`

export function PendencyActions({ label, resolved, plate, onGoTab, onSubmit }: {
  label: string
  resolved: boolean
  plate: string | null
  onGoTab: (tab: string) => void
  onSubmit: (body: Record<string, unknown>) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)

  if (sameLabel(label, GATE_NEGOTIATION)) {
    return resolved
      ? <span className="text-[11px] text-emerald-700">Pela negociação cadastrada</span>
      : (
        <Link href={`/negociacoes/nova${plate ? `?placa=${encodeURIComponent(plate)}` : ''}`} className={go} title="Ao cadastrar a negociação de compra/troca/consignação com esta placa, a pendência se resolve sozinha.">
          Abrir nova negociação <ExternalLink size={11} />
        </Link>
      )
  }
  const tabFor = sameLabel(label, GATE_INSPECTION) ? ['cautelar', 'Resolver na Cautelar']
    : sameLabel(label, GATE_RECEIVE) ? ['recebimento', resolved ? 'Ver recebimento' : 'Fazer recebimento']
    : sameLabel(label, STAGE_SERVICES) ? ['servicos', 'Abrir serviços']
    : null
  if (tabFor) {
    return (
      <button type="button" onClick={() => onGoTab(tabFor[0])} className={resolved ? `${btn} border border-gray-300 bg-white font-medium text-gray-600 hover:bg-gray-50` : go}>
        {tabFor[1]} <ArrowRight size={11} />
      </button>
    )
  }

  return (
    <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await onSubmit({ resolved: !resolved }) } finally { setBusy(false) } }}
      className={resolved ? `${btn} border border-gray-300 bg-white font-medium text-gray-600 hover:bg-gray-50` : go}>
      {busy ? '...' : resolved ? 'Reabrir' : 'Resolver'}
    </button>
  )
}
