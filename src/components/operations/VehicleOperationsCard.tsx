'use client'

// =============================================================================
// Situação operacional do veículo (ficha do estoque).
// Tela: o que é, em que pé está, se há problema e a próxima ação — nada além.
// "Ver detalhes" abre a gaveta com pendências, operação, RENAVE, restrições,
// vistorias, consignação, transferência entre lojas, notas e histórico.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, ChevronRight, XCircle } from 'lucide-react'
import { FieldLabel } from '@/components/ui/field'
import { maskBRL, parseBRL } from '@/lib/masks'
import type { Readiness, ReadinessCheck } from '@/lib/automotive/readiness-core'
import { restrictionKindText } from '@/lib/automotive/readiness-core'
import type { OverallStatus } from '@/lib/automotive/status-core'
import { OperationActionModal, type OpAction } from './ActionModals'
import { btn, Drawer, EmptyState, ErrorLine, fmtBRL, fmtDate, fmtDateTime, Hint, input, Modal, postJson, Section, StatusBadge, StatusRow } from './ui'

interface Dim { key: string; label: string; value: string; text: string }
interface Op { id: string; code: string; kind: string; overall: OverallStatus; dimensions: Dim[]; raw: Record<string, string>; transfer: { stage: string; label: string; state: string }[] | null; cancelledAt: string | null; createdAt: string }
interface Overview {
  readiness: Readiness | null
  renave: 'IN' | 'OUT' | 'NONE' | 'PENDING'
  fiscalEntry: string
  documentsOk: boolean
  cost: number | null
  current: Op | null
  currentOverall: OverallStatus | null
  operations: Op[]
  events: { id: string; title: string; detail: string | null; actorName: string | null; createdAt: string }[]
  eventsTotal: number
  restrictions: { id: string; kind: string; blocking: boolean; status: string; description: string | null; institution: string | null; detectedAt: string; resolution: string | null }[]
  inspections: { id: string; type: string; status: string; company: string | null; performedAt: string | null; validUntil: string | null; protocol: string | null }[]
  consignment: { id: string; ownerName: string; ownerDoc: string | null; ownerPhone: string | null; minPrice: string | number | null; commissionType: string; commissionValue: string | number | null; endsAt: string | null; status: string; payoutStatus: string } | null
  storeTransfer: { id: string; toUnitId: string; fromName: string | null; toName: string | null; reason: string | null; requestedById: string | null } | null
  fiscalDocs: { id: string; number: string | null; series: string | null; direction: string; status: string; amount: number | null; authorizedAt: string | null }[]
  units: { id: string; name: string }[]
  canDecideTransfer: boolean
  permissions: Record<string, boolean>
}

const RENAVE_TEXT: Record<string, string> = { IN: 'Confirmado', OUT: 'Saída registrada', PENDING: 'Aguardando confirmação', NONE: 'Pendente' }
const INSPECTION_TYPE: Record<string, string> = { VISTORIA_TRANSFERENCIA: 'Vistoria de transferência', LAUDO_ECV: 'Laudo ECV', CAUTELAR: 'Cautelar', OUTRA: 'Outra' }
const INSPECTION_STATUS: Record<string, string> = { VALID: 'Aprovada', PENDING: 'Pendente', REJECTED: 'Reprovada', EXPIRED: 'Vencida' }

export function VehicleOperationsCard({ vehicleId, stockType, onGoToTab, onChanged }: { vehicleId: string; stockType: string | null; onGoToTab?: (tab: string) => void; onChanged?: () => void }) {
  const [data, setData] = useState<Overview | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [open, setOpen] = useState(false)
  const [focus, setFocus] = useState<string | null>(null)
  const [action, setAction] = useState<OpAction | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/vehicles/${vehicleId}/operations`, { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok || !j.success) { setLoadError(true); return }
      setData(j.data); setLoadError(false)
    } catch { setLoadError(true) }
  }, [vehicleId])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t) }, [toast])

  const done = (msg?: string) => { setAction(null); if (msg) setToast(msg); load(); onChanged?.() }

  /** Operação de entrada do carro (cria se ainda não existe) — para vincular a NF-e de entrada. */
  const intakeOpId = async (): Promise<string | null> => {
    const cur = data?.operations.find((o) => o.kind !== 'SALE' && !o.cancelledAt)
    if (cur) return cur.id
    const r = await postJson<{ operationId: string }>(`/api/vehicles/${vehicleId}/operations`, { action: 'intake.ensure' })
    if (!r.ok) { setToast(r.error); return null }
    return r.data.operationId
  }

  const runAction = async (key: string) => {
    if (key === 'renave.entry') return setAction({ kind: 'renave.entry', vehicleId })
    if (key === 'fiscal.issue') { const id = await intakeOpId(); if (id) setAction({ kind: 'fiscal.issue', opId: id, direction: 'IN' }); return }
    if (key === 'documents.view') return onGoToTab?.('documentacao')
    if (key === 'inspection.view') return onGoToTab?.('cautelar')
    setFocus(key.startsWith('restriction') ? 'restrictions' : key.startsWith('inspection') ? 'inspections' : key.startsWith('consignment') ? 'consignment' : null)
    setOpen(true)
  }

  if (loadError) return null
  if (!data) return <div className="h-28 animate-pulse rounded-xl border border-gray-200 bg-white" />

  const p = data.permissions
  const r = data.readiness
  const blocker = r?.blockers[0] ?? null
  const warnings = r?.warnings ?? []
  const overall = data.currentOverall
  const renaveOk = data.renave === 'IN'

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {overall ? <StatusBadge tone={overall.tone}>{overall.label}</StatusBadge> : <StatusBadge tone="neutral">ESTOQUE</StatusBadge>}
            <span className="text-sm text-gray-700">{overall?.message ?? 'Sem operação registrada.'}</span>
          </div>
          {data.current && <p className="mt-1 inline-flex items-center gap-1 text-xs text-gray-400">{data.current.code}<Hint term="OPERACAO_TXN" size={11} /></p>}
        </div>
        <button onClick={() => { setFocus(null); setOpen(true) }} className="inline-flex shrink-0 items-center gap-0.5 text-sm font-medium text-brand-700 hover:underline">
          Mais detalhes <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Pronto para venda: uma linha quando está tudo certo; a pendência quando não está. */}
      {r && (blocker ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
          <span className="inline-flex items-center gap-2 text-sm font-medium text-red-700"><XCircle className="h-4 w-4" />Existe uma pendência que impede a venda.</span>
          <button className={btn.link} onClick={() => runAction(blocker.action?.key ?? 'restriction.view')}>Ver pendência</button>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">Veículo pronto para venda ✓<Hint term="PRONTO_VENDA" /></span>
          {warnings.length > 0 && (
            <button onClick={() => { setFocus('pending'); setOpen(true) }} className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:underline">
              <AlertTriangle className="h-3.5 w-3.5" />{warnings.length} {warnings.length === 1 ? 'pendência' : 'pendências'}
            </button>
          )}
        </div>
      ))}

      <div className="mt-2 divide-y divide-gray-100">
        <StatusRow label="Documentação" value={data.documentsOk ? 'Regular' : 'CRLV pendente'} ok={data.documentsOk} tone={data.documentsOk ? undefined : 'attention'} />
        {p['ops.renave.view'] && (
          <StatusRow label="RENAVE" hint="RENAVE_STATUS" value={
            renaveOk ? RENAVE_TEXT.IN : (
              <span className="inline-flex items-center gap-2">{RENAVE_TEXT[data.renave]}{p['ops.renave.operate'] && data.renave !== 'PENDING' && data.renave !== 'OUT' && <button className={btn.link} onClick={() => runAction('renave.entry')}>Registrar</button>}</span>
            )} ok={renaveOk} tone={renaveOk ? undefined : 'attention'} />
        )}
        {data.cost != null && <StatusRow label="Custo" value={fmtBRL(data.cost)} />}
      </div>

      {toast && <p className="mt-3 rounded-lg bg-gray-900 px-3 py-2 text-sm text-white">{toast}</p>}

      <VehicleOperationsDrawer open={open} focus={focus} data={data} vehicleId={vehicleId} stockType={stockType}
        onClose={() => setOpen(false)} onAction={runAction} onModal={setAction} onReload={() => { load(); onChanged?.() }} />
      <OperationActionModal action={action} onClose={() => setAction(null)} onDone={done} />
    </div>
  )
}

// ── Gaveta de detalhes ────────────────────────────────────────────────────────

function VehicleOperationsDrawer({ open, focus, data, vehicleId, stockType, onClose, onAction, onModal, onReload }: {
  open: boolean; focus: string | null; data: Overview; vehicleId: string; stockType: string | null
  onClose: () => void; onAction: (key: string) => void; onModal: (a: OpAction) => void; onReload: () => void
}) {
  const p = data.permissions
  const r = data.readiness
  const pending = r ? [...r.blockers, ...r.warnings] : []
  const op = data.current
  const activeRestrictions = data.restrictions.filter((x) => x.status === 'ACTIVE')

  return (
    <Drawer open={open} onClose={onClose} title="Situação do veículo" subtitle={op ? op.code : undefined}>
      {pending.length > 0 && (
        <Section title="Pendências" count={pending.length} defaultOpen>
          <ul className="space-y-2">
            {pending.map((c) => <PendingItem key={c.key} c={c} onAction={onAction} />)}
          </ul>
        </Section>
      )}

      {r && pending.length === 0 && (
        <Section title="Critérios de venda" hint="PRONTO_VENDA">
          <ul className="space-y-1.5">
            {r.checks.map((c) => <li key={c.key} className="flex items-center justify-between text-sm"><span className="text-gray-600">{c.label}</span><span className="text-emerald-600">✓</span></li>)}
          </ul>
        </Section>
      )}

      {op && (
        <Section title="Operação" hint="OPERACAO_TXN" defaultOpen={!focus}>
          <div className="mb-2 flex items-center gap-2"><StatusBadge tone={op.overall.tone}>{op.overall.label}</StatusBadge><span className="text-sm text-gray-700">{op.overall.message}</span></div>
          <dl className="divide-y divide-gray-100">
            {op.dimensions.filter((d) => !['NOT_APPLICABLE', 'NOT_REQUIRED'].includes(d.value)).map((d) => (
              <div key={d.key} className="flex justify-between py-1.5 text-sm"><dt className="text-gray-500">{d.label}</dt><dd className="font-medium text-gray-800">{d.text}</dd></div>
            ))}
          </dl>
          {op.raw.renaveStatus === 'ENTRY_CONFIRMED' && op.kind !== 'SALE' && p['ops.renave.operate'] && (
            <button className={`${btn.link} mt-2`} onClick={() => onModal({ kind: 'renave.cancel', opId: op.id, sale: false })}>Cancelar entrada no RENAVE</button>
          )}
          {data.operations.length > 1 && <p className="mt-2 text-xs text-gray-400">{data.operations.length} operações neste veículo.</p>}
        </Section>
      )}

      <RestrictionsSection key={`r-${focus}`} data={data} vehicleId={vehicleId} canManage={p['ops.compliance.manage']} defaultOpen={focus === 'restrictions' || activeRestrictions.some((x) => x.blocking)} onReload={onReload} />
      <InspectionsSection key={`i-${focus}`} data={data} vehicleId={vehicleId} canManage={p['ops.compliance.manage']} defaultOpen={focus === 'inspections'} onReload={onReload} />
      {stockType === 'CONSIGNADO' && <ConsignmentSection key={`c-${focus}`} data={data} vehicleId={vehicleId} canManage={p['ops.compliance.manage']} defaultOpen={focus === 'consignment'} onReload={onReload} />}
      {(p['ops.store_transfer'] && data.units.length > 1) || data.storeTransfer ? <StoreTransferSection data={data} vehicleId={vehicleId} onReload={onReload} /> : null}

      {p['ops.fiscal.view'] && (
        <Section title="Notas fiscais" hint="NFE_OPERACAO" count={data.fiscalDocs.length}>
          {data.fiscalDocs.length === 0 ? (
            <EmptyState text="Nenhuma nota fiscal vinculada." action={p['ops.fiscal.issue'] ? <button className={btn.secondary} onClick={() => onAction('fiscal.issue')}>Vincular NF-e de entrada</button> : undefined} />
          ) : (
            <ul className="divide-y divide-gray-100">
              {data.fiscalDocs.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="text-gray-700">NF-e {d.number ?? '—'}{d.series ? `/${d.series}` : ''} · {d.direction === 'OUT' ? 'saída' : 'entrada'}{d.status === 'CANCELLED' ? ' · cancelada' : ''}</span>
                  <a className={btn.link} href={`/api/fiscal-documents/${d.id}?download=xml`}>XML</a>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      <HistorySection vehicleId={vehicleId} initial={data.events} total={data.eventsTotal} />
    </Drawer>
  )
}

function PendingItem({ c, onAction }: { c: ReadinessCheck; onAction: (k: string) => void }) {
  return (
    <li className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ${c.blocking ? 'bg-red-50' : 'bg-amber-50'}`}>
      <span className={c.blocking ? 'text-red-700' : 'text-amber-800'}><strong className="font-semibold">{c.label}:</strong> {c.reason}</span>
      {c.action && <button className={btn.link} onClick={() => onAction(c.action!.key)}>{c.action.label}</button>}
    </li>
  )
}

function RestrictionsSection({ data, vehicleId, canManage, defaultOpen, onReload }: { data: Overview; vehicleId: string; canManage: boolean; defaultOpen: boolean; onReload: () => void }) {
  const [adding, setAdding] = useState(false)
  const [resolving, setResolving] = useState<string | null>(null)
  const [form, setForm] = useState({ kind: 'JUDICIAL', description: '', institution: '', blocking: true })
  const [resolution, setResolution] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const active = data.restrictions.filter((x) => x.status === 'ACTIVE')

  const save = async () => {
    setBusy(true); setError(null)
    const r = await postJson(`/api/vehicles/${vehicleId}/operations`, { action: 'restriction.add', ...form })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setAdding(false); setForm({ kind: 'JUDICIAL', description: '', institution: '', blocking: true }); onReload()
  }
  const resolve = async () => {
    setBusy(true); setError(null)
    const r = await postJson(`/api/vehicles/${vehicleId}/operations`, { action: 'restriction.resolve', restrictionId: resolving, resolution })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setResolving(null); setResolution(''); onReload()
  }
  const kindLocked = ['JUDICIAL', 'ROUBO_FURTO', 'RENAJUD'].includes(form.kind)

  return (
    <Section title="Restrições" hint="RESTRICAO" count={active.length} defaultOpen={defaultOpen}
      action={canManage ? <button className={btn.link} onClick={() => setAdding(true)}>Registrar</button> : undefined}>
      {active.length === 0 ? <EmptyState text="Nenhuma restrição ativa." /> : (
        <ul className="space-y-2">
          {active.map((x) => (
            <li key={x.id} className="flex items-start justify-between gap-2 text-sm">
              <div>
                <p className={`font-medium ${x.blocking ? 'text-red-700' : 'text-gray-800'}`}>{restrictionKindText(x.kind)}{x.institution ? ` · ${x.institution}` : ''}</p>
                {x.description && <p className="text-gray-500">{x.description}</p>}
              </div>
              {canManage && <button className={btn.link} onClick={() => setResolving(x.id)}>Baixar</button>}
            </li>
          ))}
        </ul>
      )}
      <Modal open={adding} title="Registrar restrição" onClose={() => setAdding(false)} footer={<><button className={btn.secondary} onClick={() => setAdding(false)}>Cancelar</button><button className={btn.primary} disabled={busy} onClick={save}>{busy ? 'Salvando…' : 'Salvar'}</button></>}>
        <div>
          <FieldLabel required>Tipo</FieldLabel>
          <select className={input} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            {['JUDICIAL', 'ROUBO_FURTO', 'RENAJUD', 'ADMINISTRATIVA', 'TRIBUTARIA', 'GRAVAME', 'OUTRA'].map((k) => <option key={k} value={k}>{restrictionKindText(k)}</option>)}
          </select>
        </div>
        {form.kind === 'GRAVAME' && (
          <div><FieldLabel>Banco</FieldLabel><input className={input} value={form.institution} onChange={(e) => setForm({ ...form, institution: e.target.value })} /></div>
        )}
        <div><FieldLabel>Descrição</FieldLabel><input className={input} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        {!kindLocked && (
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={form.blocking} onChange={(e) => setForm({ ...form, blocking: e.target.checked })} />Impede a venda</label>
        )}
        <ErrorLine text={error} />
      </Modal>
      <Modal open={!!resolving} title="Baixar restrição" onClose={() => setResolving(null)} footer={<><button className={btn.secondary} onClick={() => setResolving(null)}>Cancelar</button><button className={btn.primary} disabled={busy || !resolution.trim()} onClick={resolve}>{busy ? 'Salvando…' : 'Confirmar'}</button></>}>
        <div><FieldLabel required>Como foi resolvida</FieldLabel><input className={input} value={resolution} onChange={(e) => setResolution(e.target.value)} autoFocus /></div>
        <ErrorLine text={error} />
      </Modal>
    </Section>
  )
}

function InspectionsSection({ data, vehicleId, canManage, defaultOpen, onReload }: { data: Overview; vehicleId: string; canManage: boolean; defaultOpen: boolean; onReload: () => void }) {
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ type: 'VISTORIA_TRANSFERENCIA', status: 'VALID', company: '', performedAt: new Date().toISOString().slice(0, 10), validUntil: '', protocol: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const save = async () => {
    setBusy(true); setError(null)
    const r = await postJson(`/api/vehicles/${vehicleId}/operations`, { action: 'inspection.add', ...form })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setAdding(false); onReload()
  }
  const last = data.inspections[0]
  return (
    <Section title="Vistoria" hint="VISTORIA" count={data.inspections.length} defaultOpen={defaultOpen}
      action={canManage ? <button className={btn.link} onClick={() => setAdding(true)}>Registrar</button> : undefined}>
      {!last ? <EmptyState text="Nenhuma vistoria registrada." /> : (
        <dl className="divide-y divide-gray-100 text-sm">
          <div className="flex justify-between py-1.5"><dt className="text-gray-500">Status</dt><dd className="font-medium">{INSPECTION_STATUS[last.validUntil && new Date(last.validUntil) < new Date() ? 'EXPIRED' : last.status] ?? last.status}</dd></div>
          <div className="flex justify-between py-1.5"><dt className="text-gray-500">Tipo</dt><dd>{INSPECTION_TYPE[last.type] ?? last.type}</dd></div>
          <div className="flex justify-between py-1.5"><dt className="text-gray-500">Data</dt><dd>{fmtDate(last.performedAt)}</dd></div>
          {last.company && <div className="flex justify-between py-1.5"><dt className="text-gray-500">Empresa</dt><dd>{last.company}</dd></div>}
          {last.validUntil && <div className="flex justify-between py-1.5"><dt className="text-gray-500">Validade</dt><dd>{fmtDate(last.validUntil)}</dd></div>}
        </dl>
      )}
      <Modal open={adding} title="Registrar vistoria" onClose={() => setAdding(false)} footer={<><button className={btn.secondary} onClick={() => setAdding(false)}>Cancelar</button><button className={btn.primary} disabled={busy} onClick={save}>{busy ? 'Salvando…' : 'Salvar'}</button></>}>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><FieldLabel required>Tipo</FieldLabel><select className={input} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{Object.entries(INSPECTION_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div><FieldLabel required>Resultado</FieldLabel><select className={input} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="VALID">Aprovada</option><option value="REJECTED">Reprovada</option><option value="PENDING">Pendente</option></select></div>
          <div><FieldLabel required>Data</FieldLabel><input type="date" className={input} value={form.performedAt} onChange={(e) => setForm({ ...form, performedAt: e.target.value })} /></div>
          <div><FieldLabel>Empresa</FieldLabel><input className={input} value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></div>
          <div><FieldLabel>Validade</FieldLabel><input type="date" className={input} value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} /></div>
          <div className="col-span-2"><FieldLabel>Protocolo</FieldLabel><input className={input} value={form.protocol} onChange={(e) => setForm({ ...form, protocol: e.target.value })} /></div>
        </div>
        <ErrorLine text={error} />
      </Modal>
    </Section>
  )
}

function ConsignmentSection({ data, vehicleId, canManage, defaultOpen, onReload }: { data: Overview; vehicleId: string; canManage: boolean; defaultOpen: boolean; onReload: () => void }) {
  const c = data.consignment
  const toMasked = (v: unknown) => (v == null || v === '' ? '' : maskBRL(String(Math.round(Number(v) * 100))))
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ ownerName: c?.ownerName ?? '', ownerDoc: c?.ownerDoc ?? '', ownerPhone: c?.ownerPhone ?? '', minPrice: toMasked(c?.minPrice), commissionType: c?.commissionType ?? 'PERCENT', commissionValue: c?.commissionValue != null ? String(c.commissionValue) : '', endsAt: c?.endsAt ? c.endsAt.slice(0, 10) : '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const save = async () => {
    if (!form.ownerName.trim()) return setError('Informe o proprietário.')
    setBusy(true); setError(null)
    const r = await postJson(`/api/vehicles/${vehicleId}/operations`, { action: 'consignment.save', ...form, minPrice: form.minPrice ? parseBRL(form.minPrice) : null, commissionValue: form.commissionValue ? Number(form.commissionValue.replace(',', '.')) : null })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setEditing(false); onReload()
  }
  const expired = c?.status === 'ACTIVE' && c.endsAt && new Date(c.endsAt) < new Date()
  return (
    <Section title="Consignação" hint="CONTRATO_CONSIGNACAO" defaultOpen={defaultOpen || !c}
      action={canManage && (!c || c.status === 'ACTIVE') ? <button className={btn.link} onClick={() => setEditing(true)}>{c ? 'Editar' : 'Registrar'}</button> : undefined}>
      {!c ? <EmptyState text="Sem contrato de consignação." /> : (
        <dl className="divide-y divide-gray-100 text-sm">
          <div className="flex justify-between py-1.5"><dt className="text-gray-500">Proprietário</dt><dd className="font-medium">{c.ownerName}</dd></div>
          {c.minPrice != null && <div className="flex justify-between py-1.5"><dt className="text-gray-500">Valor mínimo</dt><dd>{fmtBRL(Number(c.minPrice))}</dd></div>}
          {c.commissionValue != null && <div className="flex justify-between py-1.5"><dt className="text-gray-500">Comissão</dt><dd>{c.commissionType === 'PERCENT' ? `${Number(c.commissionValue)}%` : fmtBRL(Number(c.commissionValue))}</dd></div>}
          <div className="flex justify-between py-1.5"><dt className="text-gray-500">Prazo</dt><dd className={expired ? 'font-medium text-amber-700' : ''}>{c.endsAt ? fmtDate(c.endsAt) : 'Sem prazo'}</dd></div>
          {c.status === 'SOLD' && <div className="flex justify-between py-1.5"><dt className="inline-flex items-center gap-1 text-gray-500">Repasse<Hint term="REPASSE" /></dt><dd>{c.payoutStatus === 'PAID' ? 'Pago' : 'Pendente'}</dd></div>}
        </dl>
      )}
      <Modal open={editing} title="Contrato de consignação" onClose={() => setEditing(false)} footer={<><button className={btn.secondary} onClick={() => setEditing(false)}>Cancelar</button><button className={btn.primary} disabled={busy} onClick={save}>{busy ? 'Salvando…' : 'Salvar'}</button></>}>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><FieldLabel required>Proprietário</FieldLabel><input className={input} value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} /></div>
          <div><FieldLabel>CPF/CNPJ</FieldLabel><input className={input} value={form.ownerDoc} onChange={(e) => setForm({ ...form, ownerDoc: e.target.value })} /></div>
          <div><FieldLabel>Telefone</FieldLabel><input className={input} value={form.ownerPhone} onChange={(e) => setForm({ ...form, ownerPhone: e.target.value })} /></div>
          <div><FieldLabel>Valor mínimo</FieldLabel><input className={input} inputMode="numeric" value={form.minPrice} onChange={(e) => setForm({ ...form, minPrice: maskBRL(e.target.value) })} /></div>
          <div><FieldLabel>Prazo</FieldLabel><input type="date" className={input} value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} /></div>
          <div><FieldLabel>Comissão</FieldLabel><select className={input} value={form.commissionType} onChange={(e) => setForm({ ...form, commissionType: e.target.value })}><option value="PERCENT">Percentual</option><option value="FIXED">Valor fixo</option><option value="DIFFERENCE">Diferença sobre o mínimo</option></select></div>
          {form.commissionType !== 'DIFFERENCE' && <div><FieldLabel>{form.commissionType === 'PERCENT' ? '%' : 'Valor'}</FieldLabel><input className={input} inputMode="decimal" value={form.commissionValue} onChange={(e) => setForm({ ...form, commissionValue: e.target.value })} /></div>}
        </div>
        <ErrorLine text={error} />
      </Modal>
    </Section>
  )
}

function StoreTransferSection({ data, vehicleId, onReload }: { data: Overview; vehicleId: string; onReload: () => void }) {
  const t = data.storeTransfer
  const [asking, setAsking] = useState(false)
  const [toUnitId, setToUnitId] = useState('')
  const [reason, setReason] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const call = async (body: Record<string, unknown>, after: () => void) => {
    setBusy(true); setError(null)
    const r = await postJson(`/api/vehicles/${vehicleId}/operations`, body)
    setBusy(false)
    if (!r.ok) return setError(r.error)
    after(); onReload()
  }
  return (
    <Section title="Transferência entre lojas" hint="TRANSFERENCIA_LOJAS" defaultOpen={!!t}
      action={!t && data.permissions['ops.store_transfer'] ? <button className={btn.link} onClick={() => setAsking(true)}>Transferir</button> : undefined}>
      {!t ? <EmptyState text="Nenhuma transferência em andamento." /> : (
        <div className="space-y-3">
          <p className="text-sm text-gray-700">Aguardando aceite de <strong>{t.toName}</strong>.</p>
          <div className="flex flex-wrap gap-2">
            {data.canDecideTransfer && <button className={btn.primary} disabled={busy} onClick={() => call({ action: 'storeTransfer.decide', transferId: t.id, decision: 'ACCEPT' }, () => {})}>Aceitar</button>}
            {data.canDecideTransfer && <button className={btn.secondary} disabled={busy} onClick={() => setRejecting(true)}>Recusar</button>}
            <button className={btn.link} disabled={busy} onClick={() => call({ action: 'storeTransfer.decide', transferId: t.id, decision: 'CANCEL' }, () => {})}>Cancelar pedido</button>
          </div>
          <ErrorLine text={error} />
        </div>
      )}
      <Modal open={asking} title="Transferir para outra loja" onClose={() => setAsking(false)} footer={<><button className={btn.secondary} onClick={() => setAsking(false)}>Cancelar</button><button className={btn.primary} disabled={busy || !toUnitId} onClick={() => call({ action: 'storeTransfer.request', toUnitId, reason }, () => setAsking(false))}>{busy ? 'Enviando…' : 'Solicitar'}</button></>}>
        <div><FieldLabel required>Loja de destino</FieldLabel><select className={input} value={toUnitId} onChange={(e) => setToUnitId(e.target.value)}><option value="">Selecione</option>{data.units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
        <div><FieldLabel>Motivo</FieldLabel><input className={input} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        <ErrorLine text={error} />
      </Modal>
      <Modal open={rejecting} title="Recusar transferência" onClose={() => setRejecting(false)} footer={<><button className={btn.secondary} onClick={() => setRejecting(false)}>Voltar</button><button className={btn.danger} disabled={busy || !reason.trim()} onClick={() => call({ action: 'storeTransfer.decide', transferId: t?.id, decision: 'REJECT', note: reason }, () => setRejecting(false))}>Recusar</button></>}>
        <div><FieldLabel required>Motivo</FieldLabel><input className={input} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /></div>
        <ErrorLine text={error} />
      </Modal>
    </Section>
  )
}

export function HistorySection({ vehicleId, initial, total }: { vehicleId: string; initial: Overview['events']; total: number }) {
  const [items, setItems] = useState(initial)
  const [more, setMore] = useState(total > initial.length)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setItems(initial); setMore(total > initial.length) }, [initial, total])
  const loadMore = async () => {
    setBusy(true)
    const before = items[items.length - 1]?.createdAt
    const r = await fetch(`/api/vehicles/${vehicleId}/operations/events?take=50${before ? `&before=${encodeURIComponent(before)}` : ''}`).then((x) => x.json()).catch(() => null)
    setBusy(false)
    if (!r?.success) return
    setItems((cur) => [...cur, ...r.data.filter((e: { id: string }) => !cur.some((c) => c.id === e.id))])
    setMore(r.hasMore)
  }
  return (
    <Section title="Histórico" count={total} defaultOpen={false}>
      {items.length === 0 ? <EmptyState text="Nenhum evento registrado." /> : (
        <ol className="space-y-2.5">
          {items.map((e) => (
            <li key={e.id} className="flex gap-3 text-sm">
              <span className="w-24 shrink-0 text-xs tabular-nums text-gray-400">{fmtDateTime(e.createdAt)}</span>
              <span className="min-w-0">
                <span className="text-gray-800">{e.title}</span>
                {e.actorName && <span className="block text-xs text-gray-400">{e.actorName}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
      {more && <button className={`${btn.link} mt-3`} disabled={busy} onClick={loadMore}>{busy ? 'Carregando…' : 'Ver histórico completo'}</button>}
    </Section>
  )
}
