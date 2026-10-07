'use client'

// Lista do menu Operações: abas de situação, busca e a próxima ação na linha.
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import type { OpsTerm } from '@/lib/glossary-ops'
import { OperationActionModal, type OpAction } from './ActionModals'
import { FiscalCancelModal } from './FiscalDocumentsSection'
import { btn, EmptyState, ErrorLine, fmtDateTime, Hint, postJson, StatusBadge } from './ui'

interface Row {
  key: string; vehicleId: string | null; operationId: string | null; dealId: string | null
  vehicle: { name: string; plate: string | null }; title: string; detail: string | null
  tone: 'ok' | 'progress' | 'attention' | 'critical' | 'neutral'; date: string
  action: { key: string; label: string } | null; extra?: Record<string, any>
}

export interface ListTab { key: string; label: string; empty: string }

const ACTION_PERM: Record<string, string> = {
  'renave.entry': 'ops.renave.operate', 'renave.exit': 'ops.renave.operate', 'fiscal.issue': 'ops.fiscal.issue', 'fiscal.refresh': 'ops.fiscal.view',
  'transfer.advance': 'ops.transfer.start', 'transfer.instructions': 'ops.transfer.view',
}

export function OpsListPage({ view, title, hint, tabs, initialTab }: { view: 'renave' | 'fiscal' | 'transfer' | 'queries'; title: string; hint: OpsTerm; tabs: ListTab[]; initialTab?: string }) {
  const [tab, setTab] = useState(initialTab ?? tabs[0].key)
  const [q, setQ] = useState('')
  const [data, setData] = useState<{ rows: Row[]; permissions: Record<string, boolean>; fiscalMode: 'API' | 'MANUAL'; inspectionRequired: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [action, setAction] = useState<OpAction | null>(null)
  const [cancelDoc, setCancelDoc] = useState<{ id: string; number: string | null } | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async () => {
    const p = new URLSearchParams({ view, filter: tab, q })
    const r = await fetch(`/api/operations/list?${p}`, { cache: 'no-store' }).then((x) => x.json()).catch(() => null)
    if (!r?.success) { setError(r?.error ?? 'Não foi possível carregar.'); return }
    setData(r.data); setError(null)
  }, [view, tab, q])

  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t) }, [load, q])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t) }, [toast])

  const run = async (r: Row) => {
    const a = r.action
    if (!a) return
    if (a.key === 'renave.entry') return setAction(r.operationId ? { kind: 'renave.entry', opId: r.operationId } : { kind: 'renave.entry', vehicleId: r.vehicleId! })
    if (!r.operationId) return
    if (a.key === 'renave.exit') return setAction({ kind: 'renave.exit', opId: r.operationId })
    if (a.key === 'fiscal.issue') {
      const direction = (r.extra?.direction as 'IN' | 'OUT') ?? 'OUT'
      return setAction(data?.fiscalMode === 'API' ? { kind: 'fiscal.emit', opId: r.operationId, onUseXml: () => setAction({ kind: 'fiscal.issue', opId: r.operationId!, direction }) } : { kind: 'fiscal.issue', opId: r.operationId, direction })
    }
    if (a.key === 'fiscal.refresh') { await postJson(`/api/operations/${r.operationId}`, { action: 'fiscal.refresh' }); setToast('Situação atualizada.'); return load() }
    if (a.key === 'transfer.advance') return setAction({ kind: 'transfer.advance', opId: r.operationId, current: String(r.extra?.transferStatus ?? 'PENDING'), inspectionRequired: data?.inspectionRequired ?? true })
    if (a.key === 'transfer.instructions') return setAction({ kind: 'transfer.instructions', opId: r.operationId })
  }

  const perms = data?.permissions ?? {}
  const current = tabs.find((t) => t.key === tab) ?? tabs[0]

  return (
    <div className="flex flex-col gap-5">
      <h1 className="inline-flex items-center gap-2 text-xl font-bold text-gray-900">{title}<Hint term={hint} size={14} /></h1>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`rounded-full px-3 py-1 text-sm font-medium ${tab === t.key ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50'}`}>{t.label}</button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Placa ou veículo" className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none" />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {error ? <div className="p-4"><ErrorLine text={error} /></div> : !data ? <div className="h-40 animate-pulse" /> : data.rows.length === 0 ? (
          <EmptyState text={q ? 'Nada encontrado.' : current.empty} />
        ) : (
          <ul className="divide-y divide-gray-100">
            {data.rows.map((r) => (
              <li key={r.key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900">{r.vehicle.name} {r.vehicle.plate && <span className="font-mono text-xs text-gray-500">{r.vehicle.plate}</span>}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    <StatusBadge tone={r.tone}>{r.title}</StatusBadge>
                    {r.detail && <span className="text-xs text-gray-500">{r.detail}</span>}
                  </div>
                </div>
                <span className="hidden w-24 text-right text-xs tabular-nums text-gray-400 sm:block">{fmtDateTime(r.date)}</span>
                <div className="flex items-center gap-3">
                  {r.extra?.documentId && <a className={btn.link} href={`/api/fiscal-documents/${r.extra.documentId}?download=xml`}>XML</a>}
                  {r.extra?.documentId && r.extra.status === 'AUTHORIZED' && perms['ops.fiscal.cancel'] && <button className="text-sm font-medium text-red-700 hover:underline" onClick={() => setCancelDoc({ id: String(r.extra!.documentId), number: r.title })}>Cancelar</button>}
                  {r.action && perms[ACTION_PERM[r.action.key] ?? ''] && <button className={btn.primary} onClick={() => run(r)}>{r.action.label}</button>}
                  {r.dealId ? <Link className={btn.link} href={`/negociacoes/${r.dealId}`}>Abrir</Link> : r.vehicleId ? <Link className={btn.link} href={`/estoque/${r.vehicleId}`}>Abrir</Link> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {toast && <p className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white">{toast}</p>}
      <OperationActionModal action={action} onClose={() => setAction(null)} onDone={(m) => { setAction(null); if (m) setToast(m); load() }} />
      <FiscalCancelModal doc={cancelDoc} onClose={() => setCancelDoc(null)} onDone={() => { setCancelDoc(null); setToast('NF-e cancelada.'); load() }} />
    </div>
  )
}
