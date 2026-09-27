'use client'

// =============================================================================
// Rascunhos em andamento — negociações abertas no assistente e não concluídas.
// Mostra onde parou e permite continuar ou descartar. Gestores veem os da loja.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { FileClock, Trash2 } from 'lucide-react'
import { draftStepLabel } from '@/lib/negotiation-drafts'

interface Draft { id: string; title: string | null; type: string | null; step: number; updatedAt: string; userName: string | null; mine: boolean }

const TYPE_LABEL: Record<string, string> = { VENDA: 'Venda', COMPRA: 'Compra', TROCA: 'Troca', CONSIGNACAO: 'Consignação' }

export function DealDraftsPanel() {
  const [rows, setRows] = useState<Draft[]>([])

  const load = useCallback(async () => {
    const j = await fetch('/api/negotiations/drafts', { cache: 'no-store' }).then((r) => r.json()).catch(() => null)
    setRows(Array.isArray(j?.data) ? j.data : [])
  }, [])
  useEffect(() => { const t = setTimeout(() => void load(), 0); return () => clearTimeout(t) }, [load])

  async function discard(d: Draft) {
    if (!confirm('Descartar este rascunho? O que foi preenchido será perdido.')) return
    await fetch(`/api/negotiations/drafts/${d.id}`, { method: 'DELETE' })
    void load()
  }

  if (!rows.length) return null
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-900"><FileClock size={15} />Rascunhos em andamento ({rows.length})</p>
      <ul className="divide-y divide-amber-100">
        {rows.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-900">{d.title || 'Sem cliente/veículo ainda'}</p>
              <p className="text-xs text-gray-600">
                {d.type ? `${TYPE_LABEL[d.type] ?? d.type} · ` : ''}parou em <b>{draftStepLabel(d.step)}</b>
                {' · '}{new Date(d.updatedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                {!d.mine && d.userName ? ` · ${d.userName}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {d.mine && <Link href={`/negociacoes/nova?rascunho=${d.id}`} className="rounded-md bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700">Continuar</Link>}
              <button type="button" onClick={() => void discard(d)} className="rounded-md border border-amber-300 bg-white p-1.5 text-amber-700 hover:text-red-600" aria-label="Descartar rascunho"><Trash2 size={12} /></button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
