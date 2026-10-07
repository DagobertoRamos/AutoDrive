'use client'

// Débitos e restrições do veículo (conta da loja no provedor ou o padrão da AutoDrive).
import { useState } from 'react'
import { restrictionKindText } from '@/lib/automotive/readiness-core'
import { btn, EmptyState, ErrorLine, fmtBRL, fmtDate, fmtDateTime, input, postJson, Section } from './ui'

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
  // O provedor pediu o CPF/CNPJ do dono (o que está no documento do carro).
  const [askDoc, setAskDoc] = useState<{ force: boolean } | null>(null)
  const [ownerDoc, setOwnerDoc] = useState('')
  const run = async (force: boolean, doc?: string) => {
    setBusy(true); setError(null)
    const r = await postJson(`/api/vehicles/${vehicleId}/operations`, { action: 'vehicleData.query', force, ...(doc ? { ownerDoc: doc } : {}) })
    setBusy(false)
    if (!r.ok) {
      if (r.details?.need === 'ownerDoc') { setAskDoc({ force }); if (doc) setError(r.error); return }
      return setError(r.error)
    }
    setAskDoc(null); setOwnerDoc('')
    onReload()
  }
  const docDigits = ownerDoc.replace(/\D/g, '')
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
      {askDoc && (
        <div className="mt-3 rounded-lg bg-gray-50 p-3">
          <label className="block text-sm text-gray-700">CPF ou CNPJ do dono que está no documento do carro</label>
          <div className="mt-1.5 flex gap-2">
            <input className={input} inputMode="numeric" autoComplete="off" value={ownerDoc} onChange={(e) => setOwnerDoc(e.target.value)} placeholder="Somente números" />
            <button className={btn.primary} disabled={busy || (docDigits.length !== 11 && docDigits.length !== 14)} onClick={() => run(askDoc.force, docDigits)}>{busy ? 'Consultando…' : 'Consultar'}</button>
          </div>
        </div>
      )}
      <ErrorLine text={error} />
    </Section>
  )
}
