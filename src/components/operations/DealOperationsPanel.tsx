'use client'

// =============================================================================
// Operação da negociação (aba "Operação"): para cada veículo, o estágio atual,
// a próxima ação e — sob demanda — as etapas. Na troca aparecem as duas
// operações ligadas: a venda do carro da loja e a entrada do carro do cliente.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { OverallStatus } from '@/lib/automotive/status-core'
import { kindLabel } from '@/lib/automotive/status-core'
import { OperationActionModal, type OpAction } from './ActionModals'
import { FiscalCancelModal } from './FiscalDocumentsSection'
import { btn, EmptyState, ErrorLine, Hint, postJson, StatusBadge, StatusRow } from './ui'

interface Dim { key: string; label: string; value: string; text: string }
interface Op {
  id: string; code: string; kind: string; vehicleId: string; parentId: string | null; overall: OverallStatus; dimensions: Dim[]
  raw: Record<string, string>; transfer: { stage: string; label: string; state: 'done' | 'current' | 'todo' }[] | null
  vehicle: { brand: string | null; model: string | null; plate: string | null } | null; cancelledAt: string | null
}
interface FiscalDoc { id: string; operationId: string | null; number: string | null; series: string | null; direction: string; status: string }
interface Data { operations: Op[]; legacy: boolean; fiscalDocs: FiscalDoc[]; permissions: Record<string, boolean>; fiscalMode: 'API' | 'MANUAL' }

const dim = (op: Op, key: string) => op.dimensions.find((d) => d.key === key)

export default function DealOperationsPanel({ dealId, onGoToTab }: { dealId: string; onGoToTab?: (tab: string) => void }) {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [action, setAction] = useState<OpAction | null>(null)
  const [cancelDoc, setCancelDoc] = useState<FiscalDoc | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  const load = useCallback(async () => {
    const r = await fetch(`/api/negotiations/${dealId}/operations`, { cache: 'no-store' }).then((x) => x.json()).catch(() => null)
    if (!r?.success) { setError(r?.error ?? 'Não foi possível carregar a operação.'); return }
    setData(r.data); setError(null)
  }, [dealId])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t) }, [toast])

  if (error) return <ErrorLine text={error} />
  if (!data) return <div className="h-32 animate-pulse rounded-xl border border-gray-200 bg-white" />

  const p = data.permissions
  if (!data.operations.length) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white">
        {data.legacy ? (
          <EmptyState text="Negociação anterior ao acompanhamento de operações."
            action={p['ops.renave.operate'] ? <button className={btn.secondary} disabled={starting} onClick={async () => { setStarting(true); const r = await postJson(`/api/negotiations/${dealId}/operations`, { action: 'start' }); setStarting(false); if (r.ok) load(); else setToast(r.error) }}>{starting ? 'Iniciando…' : 'Acompanhar operação'}</button> : undefined} />
        ) : (
          <EmptyState text="As etapas de nota, RENAVE e transferência começam quando a venda for aprovada." />
        )}
        {toast && <p className="px-4 pb-4 text-sm text-red-700">{toast}</p>}
      </div>
    )
  }

  const open = (op: Op, key: string) => {
    const sale = op.kind === 'SALE'
    switch (key) {
      case 'fiscal.issue': return data.fiscalMode === 'API'
        ? setAction({ kind: 'fiscal.emit', opId: op.id, onUseXml: () => setAction({ kind: 'fiscal.issue', opId: op.id, direction: sale ? 'OUT' : 'IN' }) })
        : setAction({ kind: 'fiscal.issue', opId: op.id, direction: sale ? 'OUT' : 'IN' })
      case 'fiscal.refresh': { postJson(`/api/operations/${op.id}`, { action: 'fiscal.refresh' }).then(() => load()); return }
      case 'renave.exit': return setAction({ kind: 'renave.exit', opId: op.id })
      case 'renave.entry': return setAction({ kind: 'renave.entry', opId: op.id })
      case 'renave.cancel': return setAction({ kind: 'renave.cancel', opId: op.id, sale })
      case 'transfer.advance': return setAction({ kind: 'transfer.advance', opId: op.id, current: op.raw.transferStatus, inspectionRequired: !!op.transfer?.some((s) => s.stage === 'INSPECTION_DONE') })
      case 'transfer.instructions': return setAction({ kind: 'transfer.instructions', opId: op.id })
      case 'financing.lien': return setAction({ kind: 'financing.lien', opId: op.id })
      case 'fiscal.cancel': { const d = data.fiscalDocs.find((f) => f.operationId === op.id && f.status === 'AUTHORIZED'); if (d) setCancelDoc(d); return }
      case 'finance.view': return onGoToTab?.('valores')
      case 'restriction.view': window.location.assign(`/estoque/${op.vehicleId}`); return
      default: return
    }
  }

  const allowed = (key: string) => {
    if (key.startsWith('renave.')) return p['ops.renave.operate']
    if (key === 'fiscal.issue') return p['ops.fiscal.issue']
    if (key === 'fiscal.refresh') return p['ops.fiscal.view']
    if (key === 'fiscal.cancel') return p['ops.fiscal.cancel']
    if (key === 'transfer.advance') return p['ops.transfer.start']
    if (key === 'transfer.instructions') return p['ops.transfer.view']
    if (key === 'financing.lien') return p['ops.compliance.manage']
    return true
  }

  return (
    <div className="space-y-3">
      {data.operations.map((op) => (
        <OperationCard key={op.id} op={op} perms={p} canRun={allowed} onAction={(k) => open(op, k)} />
      ))}
      {toast && <p className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white">{toast}</p>}
      <OperationActionModal action={action} onClose={() => setAction(null)} onDone={(m) => { setAction(null); if (m) setToast(m); load() }} />
      <FiscalCancelModal doc={cancelDoc} onClose={() => setCancelDoc(null)} onDone={() => { setCancelDoc(null); setToast('NF-e cancelada.'); load() }} />
    </div>
  )
}

function OperationCard({ op, perms, canRun, onAction }: { op: Op; perms: Record<string, boolean>; canRun: (k: string) => boolean; onAction: (k: string) => void }) {
  const [steps, setSteps] = useState(false)
  const [details, setDetails] = useState(false)
  const sale = op.kind === 'SALE'
  const next = op.overall.nextAction
  const v = op.vehicle
  const okText = (key: string, okValues: string[]) => { const d = dim(op, key); return d && okValues.includes(d.value) }
  const show = (key: string) => { const d = dim(op, key); return d && !['NOT_APPLICABLE', 'NOT_REQUIRED'].includes(d.value) }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{kindLabel(op.kind)} · <span className="inline-flex items-center gap-1 normal-case">{op.code}<Hint term="OPERACAO_TXN" size={11} /></span></p>
          <p className="mt-0.5 font-semibold text-gray-900">{[v?.brand, v?.model].filter(Boolean).join(' ') || 'Veículo'}{v?.plate ? <span className="ml-2 font-mono text-sm text-gray-500">{v.plate}</span> : null}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge tone={op.overall.tone}>{op.overall.label}</StatusBadge>
            <span className="text-sm text-gray-700">{op.overall.message}</span>
          </div>
        </div>
        {next && canRun(next.key) && <button className={btn.primary} onClick={() => onAction(next.key)}>{next.label}</button>}
      </div>

      <div className="mt-3 divide-y divide-gray-100">
        {sale && show('financialStatus') && <StatusRow label="Pagamento" value={dim(op, 'financialStatus')!.text} ok={okText('financialStatus', ['PAID'])} />}
        {sale && show('financingStatus') && <StatusRow label="Financiamento" hint="GRAVAME" value={dim(op, 'financingStatus')!.text} ok={okText('financingStatus', ['LIEN_REGISTERED', 'BANK_PAID'])} tone={op.raw.financingStatus === 'CHARGEBACK' ? 'critical' : undefined} />}
        {perms['ops.fiscal.view'] && show('fiscalStatus') && <StatusRow label="Fiscal" hint="NFE_OPERACAO" value={dim(op, 'fiscalStatus')!.text} ok={okText('fiscalStatus', ['AUTHORIZED'])} tone={op.raw.fiscalStatus === 'REJECTED' ? 'critical' : undefined} />}
        {perms['ops.renave.view'] && show('renaveStatus') && <StatusRow label="RENAVE" hint="RENAVE_STATUS" value={dim(op, 'renaveStatus')!.text} ok={okText('renaveStatus', ['ENTRY_CONFIRMED', 'EXIT_CONFIRMED'])} tone={op.raw.renaveStatus === 'REJECTED' ? 'critical' : undefined} />}
        {perms['ops.transfer.view'] && op.transfer && <StatusRow label="Transferência" hint="TRANSFERENCIA_STATUS" value={dim(op, 'transferStatus')!.text} ok={op.raw.transferStatus === 'CRLV_ISSUED'} />}
      </div>

      <div className="mt-2 flex flex-wrap gap-4">
        {op.transfer && perms['ops.transfer.view'] && (
          <button className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900" onClick={() => setSteps((s) => !s)}>
            <ChevronDown className={`h-4 w-4 transition-transform ${steps ? '' : '-rotate-90'}`} />Ver etapas
          </button>
        )}
        <button className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900" onClick={() => setDetails((s) => !s)}>
          <ChevronDown className={`h-4 w-4 transition-transform ${details ? '' : '-rotate-90'}`} />Ver detalhes
        </button>
      </div>

      {steps && op.transfer && (
        <ol className="mt-3 space-y-1.5 border-l-2 border-gray-100 pl-4">
          {op.transfer.map((s) => (
            <li key={s.stage} className={`text-sm ${s.state === 'done' ? 'text-gray-500 line-through decoration-gray-300' : s.state === 'current' ? 'font-semibold text-gray-900' : 'text-gray-400'}`}>
              {s.state === 'done' ? '✓ ' : s.state === 'current' ? '→ ' : ''}{s.label}
            </li>
          ))}
        </ol>
      )}

      {details && (
        <div className="mt-3 rounded-lg bg-gray-50 p-3">
          <dl className="divide-y divide-gray-100">
            {op.dimensions.filter((d) => !['NOT_APPLICABLE', 'NOT_REQUIRED'].includes(d.value)).map((d) => (
              <div key={d.key} className="flex justify-between py-1.5 text-sm"><dt className="text-gray-500">{d.label}</dt><dd className="font-medium text-gray-800">{d.text}</dd></div>
            ))}
          </dl>
          <div className="mt-2 flex flex-wrap gap-3">
            {sale && op.raw.renaveStatus === 'EXIT_CONFIRMED' && canRun('renave.cancel') && <button className={btn.link} onClick={() => onAction('renave.cancel')}>Cancelar saída no RENAVE</button>}
            {!sale && op.raw.renaveStatus !== 'ENTRY_CONFIRMED' && op.raw.renaveStatus !== 'NOT_REQUIRED' && canRun('renave.entry') && <button className={btn.link} onClick={() => onAction('renave.entry')}>Registrar entrada no RENAVE</button>}
            {!sale && op.raw.fiscalStatus !== 'AUTHORIZED' && op.raw.fiscalStatus !== 'NOT_REQUIRED' && canRun('fiscal.issue') && <button className={btn.link} onClick={() => onAction('fiscal.issue')}>Vincular NF-e de entrada</button>}
            {op.raw.fiscalStatus === 'AUTHORIZED' && canRun('fiscal.cancel') && <button className={btn.link} onClick={() => onAction('fiscal.cancel')}>Cancelar NF-e</button>}
            {op.raw.fiscalStatus === 'PROCESSING' && canRun('fiscal.refresh') && <button className={btn.link} onClick={() => onAction('fiscal.refresh')}>Atualizar situação da NF-e</button>}
            {op.raw.fiscalStatus === 'REJECTED' && canRun('fiscal.issue') && <button className={btn.link} onClick={() => onAction('fiscal.issue')}>Emitir de novo</button>}
            <a className={btn.link} href={`/estoque/${op.vehicleId}`}>Ficha do veículo</a>
          </div>
        </div>
      )}
    </div>
  )
}
