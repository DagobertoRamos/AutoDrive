'use client'

// Débitos e restrições do veículo (consulta pela conta da loja no provedor).
import { useState } from 'react'
import { restrictionKindText } from '@/lib/automotive/readiness-core'
import { btn, EmptyState, ErrorLine, fmtBRL, fmtDate, fmtDateTime, postJson, Section } from './ui'

export interface VehicleQuery {
  id: string; status: string; providerName: string; createdAt: string; finishedAt: string | null
  debtsTotal: number; debtsCount: number; restrictionsCount: number; blocking: boolean
  debts: { type: string; description: string; amount: number; dueDate?: string | null; expired?: boolean; year?: number | null }[]
  restrictions: { kind: string; description: string; blocking: boolean; institution?: string | null }[]
  message: string | null; stale: boolean
}

const TYPE_TEXT: Record<string, string> = { IPVA: 'IPVA', LICENCIAMENTO: 'Licenciamento', MULTA: 'Multas', DPVAT: 'Seguro obrigatório', TAXA: 'Taxas', OUTRO: 'Outros' }

export function VehicleDebtsSection({ vehicleId, query, connected, canQuery, defaultOpen, onReload }: { vehicleId: string; query: VehicleQuery | null; connected: boolean; canQuery: boolean; defaultOpen: boolean; onReload: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (force: boolean) => {
    setBusy(true); setError(null)
    const r = await postJson(`/api/vehicles/${vehicleId}/operations`, { action: 'vehicleData.query', force })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    onReload()
  }
  const processing = query?.status === 'PROCESSING'
  const groups = (query?.debts ?? []).reduce<Record<string, { total: number; items: VehicleQuery['debts'] }>>((acc, d) => {
    const g = acc[d.type] ?? { total: 0, items: [] }
    g.total += d.amount; g.items.push(d); acc[d.type] = g
    return acc
  }, {})
  const action = canQuery && connected
    ? <button className={btn.link} disabled={busy || processing} onClick={() => run(!!query && !query.stale)}>{busy ? 'Consultando…' : query ? 'Consultar de novo' : 'Consultar'}</button>
    : undefined

  return (
    <Section title="Débitos e restrições" hint="CONSULTA_VEICULAR" count={query?.status === 'DONE' ? query.debtsCount + query.restrictionsCount : null} defaultOpen={defaultOpen} action={action}>
      {!connected ? (
        <EmptyState text="Nenhum provedor de consulta conectado." action={<a className={btn.secondary} href="/configuracoes/operacoes">Conectar provedor</a>} />
      ) : !query ? (
        <EmptyState text="Veículo ainda não consultado." action={canQuery ? <button className={btn.secondary} disabled={busy} onClick={() => run(false)}>{busy ? 'Consultando…' : 'Consultar agora'}</button> : undefined} />
      ) : processing ? (
        <div className="flex items-center justify-between gap-3 text-sm text-gray-600">
          <span>Consultando no {query.providerName}…</span>
          <button className={btn.link} onClick={onReload}>Atualizar</button>
        </div>
      ) : query.status === 'ERROR' ? (
        <p className="text-sm text-amber-800">{query.message ?? 'Não foi possível concluir a consulta.'}</p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className={`text-base font-semibold ${query.debtsCount ? 'text-amber-800' : 'text-emerald-700'}`}>{query.debtsCount ? fmtBRL(query.debtsTotal) : 'Nada consta em débitos'}</span>
            <span className="text-xs text-gray-400">{query.providerName} · {fmtDateTime(query.finishedAt ?? query.createdAt)}{query.stale ? ' · desatualizada' : ''}</span>
          </div>
          {Object.entries(groups).map(([type, g]) => (
            <div key={type}>
              <div className="flex justify-between text-sm font-medium text-gray-700"><span>{TYPE_TEXT[type] ?? type}</span><span>{fmtBRL(g.total)}</span></div>
              <ul className="mt-1 space-y-0.5">
                {g.items.map((d, i) => (
                  <li key={i} className="flex justify-between gap-3 text-xs text-gray-500">
                    <span className="min-w-0 truncate">{d.description}{d.dueDate ? ` · vence ${fmtDate(d.dueDate)}` : ''}{d.expired ? ' · vencido' : ''}</span>
                    <span className="shrink-0">{fmtBRL(d.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {query.restrictions.length > 0 && (
            <ul className="space-y-1 border-t border-gray-100 pt-2">
              {query.restrictions.map((r, i) => (
                <li key={i} className={`text-sm ${r.blocking ? 'text-red-700' : 'text-gray-700'}`}><strong className="font-medium">{restrictionKindText(r.kind)}</strong>{r.description ? ` — ${r.description}` : ''}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <ErrorLine text={error} />
    </Section>
  )
}
