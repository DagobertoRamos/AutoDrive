'use client'

// =============================================================================
// Nova publicação › Conteúdo em lote: monta a descrição de TODOS os carros de
// uma vez, cada um num estilo diferente (emocional, completo, direto,
// oportunidade, pergunta, premium) — com a IA configurada ou o modelo pronto,
// sempre só com os dados do sistema. Grava só a descrição (título, preço e
// condições de cada carro ficam como estão).
// =============================================================================

import { useState } from 'react'
import { Layers, Loader2 } from 'lucide-react'
import { api } from '@/components/publications/ui'
import { DESC_STYLES } from '@/lib/publications/social/text-core'

/** Roda as tarefas com no máximo `n` ao mesmo tempo. */
export async function pool<T>(items: T[], n: number, run: (item: T, index: number) => Promise<void>): Promise<void> {
  let next = 0
  const worker = async () => { while (next < items.length) { const i = next++; await run(items[i], i) } }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker))
}

export function BatchContent({ vehicles, onDone }: { vehicles: Array<{ id: string; title: string }>; onDone: () => void }) {
  const [useAi, setUseAi] = useState(true)
  const [overwrite, setOverwrite] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(0)
  const [report, setReport] = useState<{ made: number; kept: number; ai: number; errors: string[] } | null>(null)

  const run = async () => {
    setBusy(true); setDone(0); setReport(null)
    const r = { made: 0, kept: 0, ai: 0, errors: [] as string[] }
    // Começa num estilo sorteado e gira: carros vizinhos nunca saem com o mesmo texto.
    const offset = Math.floor(Math.random() * DESC_STYLES.length)
    await pool(vehicles, 3, async (v, i) => {
      try {
        const cur = await api(`/api/publications/drafts/${v.id}`)
        if (!overwrite && cur.data?.draft?.description?.trim()) { r.kept++; return }
        const style = DESC_STYLES[(i + offset) % DESC_STYLES.length]
        const j = await api('/api/publications/social/text', { method: 'POST', json: { vehicleId: v.id, kind: 'DESCRICAO', style, useAi } })
        await api(`/api/publications/drafts/${v.id}`, { method: 'PUT', json: { partial: true, description: j.text } })
        r.made++; if (j.ai) r.ai++
      } catch (e) { r.errors.push(`${v.title}: ${(e as Error).message}`) } finally { setDone((d) => d + 1) }
    })
    setReport(r); setBusy(false); onDone()
  }

  return (
    <section className="space-y-2 rounded-xl border border-brand-200 bg-brand-50/40 p-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900"><Layers size={15} className="text-brand-700" />Montar os {vehicles.length} veículos de uma vez</p>
      <p className="text-xs text-gray-600">Cada carro ganha uma descrição própria, em estilos que se alternam, só com os dados da ficha. Depois é só conferir carro a carro abaixo, se quiser.</p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-700">
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} className="rounded border-gray-300 text-brand-600" />Escrever com a IA (quando configurada)</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} className="rounded border-gray-300 text-brand-600" />Refazer também os que já têm descrição</label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={run} disabled={busy} className="btn-primary px-3 py-1.5 text-xs">{busy ? <Loader2 size={14} className="animate-spin" /> : <Layers size={14} />}{busy ? `Montando ${done} de ${vehicles.length}…` : 'Gerar descrições variadas de todos'}</button>
        {report && (
          <span role="status" className="text-xs text-gray-700">
            {report.made} montada(s){report.ai ? ` (${report.ai} pela IA)` : ''}{report.kept ? ` · ${report.kept} mantida(s) (já tinham texto)` : ''}{report.errors.length ? ` · ${report.errors.length} com erro` : ''}
          </span>
        )}
      </div>
      {report?.errors.length ? <ul className="text-[11px] text-red-700">{report.errors.slice(0, 8).map((e) => <li key={e}>• {e}</li>)}</ul> : null}
    </section>
  )
}
