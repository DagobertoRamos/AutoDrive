'use client'

// =============================================================================
// Aba Serviços — preparação do veículo: serviços da avaliação + novos, resumo,
// situação (aguardando / em serviço / concluído / negado), fornecedor, valor
// cadastrado × valor real, entrada no prestador, previsão de entrega, notas e
// acompanhamento. Regras e avisos no servidor (lib/stock/vehicle-services).
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ChevronDown, ChevronUp, Clock, ExternalLink, Loader2, Plus, Save, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import { WithHint } from '@/components/ui/help-hint'
import { opsText } from '@/lib/glossary-ops'

/** "?" dos cards de resumo da preparação (por rótulo). */
const SUMMARY_HINT: Record<string, string> = {
  Serviços: opsText('PREPARACAO'),
  Atrasados: 'Serviços ainda abertos com a previsão de entrega já vencida.',
  Previsto: 'Soma dos valores cadastrados (orçados) dos serviços.',
  'Custo atual': 'Soma do valor real de cada serviço; quando o real ainda não foi informado, usa o valor cadastrado. Entra no custo do veículo.',
}
import { DocumentsBadge } from '@/components/documents/DocumentsPanel'
import { MoneyInput, moneyToText, textToMoney } from '@/components/ui/money-input'
import { SERVICE_TYPE_LABELS } from '@/lib/evaluation/catalog'
import { isOverdue, parseMoneyInput, SERVICE_STATUS_LABEL, type ServiceStatus } from '@/lib/stock/prep-core'

interface Ev { id: string; type: string; fromValue: string | null; toValue: string | null; note: string | null; userName: string | null; createdAt: string }
interface Svc {
  id: string; description: string; serviceType: string; status: ServiceStatus; supplierId: string | null
  supplier: { id: string; name: string; whatsapp: string | null; phone: string | null } | null
  estimatedCost: number | null; actualCost: number | null; notes: string | null
  sentAt: string | null; dueAt: string | null; finishedAt: string | null; deniedReason: string | null; evaluationServiceId: string | null
  events: Ev[]
}
interface Data {
  services: Svc[]; suppliers: Array<{ id: string; name: string; kind: string }>
  summary: { total: number; byStatus: Record<ServiceStatus, number>; estimated: number; actual: number; effective: number; overdue: number; done: boolean }
}

const brl = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
const TONE: Record<ServiceStatus, string> = {
  AGUARDANDO: 'bg-gray-100 text-gray-700', EM_SERVICO: 'bg-sky-100 text-sky-800', CONCLUIDO: 'bg-emerald-100 text-emerald-800',
  NEGADO: 'bg-red-100 text-red-700', CANCELADO: 'bg-gray-100 text-gray-500',
}
const input = 'w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const day = (s: string | null) => (s ? s.slice(0, 10) : '')

export function ServicesPanel({ vehicleId, canEdit, onChanged }: { vehicleId: string; canEdit: boolean; onChanged: () => void | Promise<void> }) {
  const [d, setD] = useState<Data | null>(null)
  const [err, setErr] = useState('')
  const [adding, setAdding] = useState(false)
  const [nw, setNw] = useState({ description: '', serviceType: 'OUTRO', estimatedCost: '', supplierId: '', dueAt: '' })

  const load = useCallback(async () => {
    const j = await fetch(`/api/vehicles/${vehicleId}/services`, { cache: 'no-store' }).then((r) => r.json()).catch(() => null)
    if (j?.success) setD(j.data); else setErr(j?.error ?? 'Falha ao carregar os serviços.')
  }, [vehicleId])
  useEffect(() => { const t = setTimeout(() => void load(), 0); return () => clearTimeout(t) }, [load])

  async function patch(id: string, body: Record<string, unknown>) {
    const r = await fetch(`/api/vehicles/${vehicleId}/services/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error ?? 'Não foi possível salvar.')
    await load(); await onChanged()
  }
  async function create() {
    setErr('')
    const r = await fetch(`/api/vehicles/${vehicleId}/services`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...nw, estimatedCost: parseMoneyInput(nw.estimatedCost), supplierId: nw.supplierId || null, dueAt: nw.dueAt ? `${nw.dueAt}T18:00:00` : null }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(j.error ?? 'Falha ao adicionar.'); return }
    setNw({ description: '', serviceType: 'OUTRO', estimatedCost: '', supplierId: '', dueAt: '' }); setAdding(false)
    await load(); await onChanged()
  }

  if (!d) return err ? <p className="text-sm text-red-600">{err}</p> : <Loader2 className="animate-spin text-gray-400" />
  const s = d.summary

  return (
    <div className="space-y-4">
      {/* Resumo */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {([
          ['Serviços', String(s.total)], ['Aguardando', String(s.byStatus.AGUARDANDO)], ['Em serviço', String(s.byStatus.EM_SERVICO)],
          ['Concluídos', String(s.byStatus.CONCLUIDO)], ['Negados', String(s.byStatus.NEGADO)], ['Atrasados', String(s.overdue)],
          ['Previsto', brl(s.estimated)], ['Custo atual', brl(s.effective)],
        ] as Array<[string, string]>).map(([l, v]) => (
          <div key={l} className={cn('rounded-lg border bg-white px-2.5 py-2', l === 'Atrasados' && s.overdue ? 'border-red-200 bg-red-50' : 'border-gray-200')}>
            <p className="text-[10px] uppercase tracking-wide text-gray-500">{SUMMARY_HINT[l] ? <WithHint text={SUMMARY_HINT[l]}>{l}</WithHint> : l}</p>
            <p className="text-sm font-bold tabular-nums text-gray-900">{v}</p>
          </div>
        ))}
      </div>
      {s.done && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">Preparação concluída. Marketing avisado.</p>}
      {!d.suppliers.length && canEdit && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Nenhum fornecedor cadastrado. <Link href="/cadastros/fornecedores" target="_blank" className="font-semibold underline">Cadastrar fornecedor</Link></p>
      )}

      {/* Novo serviço */}
      {canEdit && (adding ? (
        <div className="rounded-xl border border-brand-200 bg-brand-50/30 p-3">
          <div className="grid gap-2 sm:grid-cols-6">
            <input className={cn(input, 'sm:col-span-2')} placeholder="Descrição do serviço *" aria-required="true" value={nw.description} onChange={(e) => setNw({ ...nw, description: e.target.value })} maxLength={200} />
            <select className={input} value={nw.serviceType} onChange={(e) => setNw({ ...nw, serviceType: e.target.value })}>
              {Object.entries(SERVICE_TYPE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <MoneyInput className={input} placeholder="Valor previsto" value={textToMoney(nw.estimatedCost)} onChange={(n) => setNw({ ...nw, estimatedCost: moneyToText(n) })} />
            <select className={input} value={nw.supplierId} onChange={(e) => setNw({ ...nw, supplierId: e.target.value })}>
              <option value="">Fornecedor</option>
              {d.suppliers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            <input type="date" className={input} value={nw.dueAt} onChange={(e) => setNw({ ...nw, dueAt: e.target.value })} title="Previsão de entrega" />
          </div>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => void create()} disabled={!nw.description.trim()} title={nw.description.trim() ? undefined : 'Informe a descrição do serviço.'} className="btn-primary px-3 py-1.5 text-xs"><Plus size={13} />Adicionar serviço</button>
            <button type="button" onClick={() => setAdding(false)} className="btn-secondary px-3 py-1.5 text-xs">Cancelar</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="btn-secondary px-3 py-1.5 text-xs"><Plus size={13} />Novo serviço</button>
      ))}
      {err && <p className="text-xs text-red-600">{err}</p>}

      {d.services.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-gray-400"><Wrench className="mb-2 h-10 w-10" /><p className="text-sm">Nenhum serviço de preparação.</p></div>
      ) : (
        <ul className="space-y-3">{d.services.map((x) => <ServiceCard key={x.id} s={x} suppliers={d.suppliers} canEdit={canEdit} onPatch={(b) => patch(x.id, b)} />)}</ul>
      )}
    </div>
  )
}

function ServiceCard({ s, suppliers, canEdit, onPatch }: { s: Svc; suppliers: Data['suppliers']; canEdit: boolean; onPatch: (b: Record<string, unknown>) => Promise<void> }) {
  const [f, setF] = useState({
    supplierId: s.supplierId ?? '', estimatedCost: s.estimatedCost != null ? String(s.estimatedCost) : '', actualCost: s.actualCost != null ? String(s.actualCost) : '',
    sentAt: day(s.sentAt), dueAt: day(s.dueAt), notes: s.notes ?? '',
  })
  const [follow, setFollow] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const late = isOverdue(s)
  const closed = ['CONCLUIDO', 'NEGADO', 'CANCELADO'].includes(s.status)

  const run = async (b: Record<string, unknown>) => {
    setBusy(true); setErr('')
    try { await onPatch(b); setFollow('') } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  const money = (v: string) => parseMoneyInput(v)
  const saveFields = () => run({
    supplierId: f.supplierId || null, estimatedCost: money(f.estimatedCost), actualCost: money(f.actualCost),
    sentAt: f.sentAt ? `${f.sentAt}T12:00:00` : null, dueAt: f.dueAt ? `${f.dueAt}T18:00:00` : null, notes: f.notes,
    ...(follow.trim() ? { followUp: follow } : {}),
  })
  const move = (status: ServiceStatus) => {
    if (status === 'NEGADO') {
      const reason = prompt('Motivo para negar o serviço:')
      if (!reason?.trim()) return
      return run({ status, deniedReason: reason })
    }
    if (status === 'EM_SERVICO' && !f.supplierId) { setErr('Escolha o fornecedor/oficina antes de colocar em serviço.'); return }
    return run({ status, supplierId: f.supplierId || null, ...(status === 'EM_SERVICO' && f.dueAt ? { dueAt: `${f.dueAt}T18:00:00` } : {}) })
  }

  return (
    <li className={cn('rounded-xl border bg-white p-3', late ? 'border-red-300' : 'border-gray-200')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">{s.description}</p>
          <p className="text-[11px] text-gray-500">
            {SERVICE_TYPE_LABELS[s.serviceType] ?? s.serviceType}{s.evaluationServiceId ? ' · da avaliação' : ''}
            {s.supplier ? ` · ${s.supplier.name}` : ''}{s.dueAt ? ` · previsão ${new Date(s.dueAt).toLocaleDateString('pt-BR')}` : ''}
          </p>
          {s.deniedReason && s.status === 'NEGADO' && <p className="text-[11px] text-red-700">Motivo: {s.deniedReason}</p>}
        </div>
        <div className="flex items-center gap-1.5">
          <DocumentsBadge entityType="VEHICLE_SERVICE" entityId={s.id} defaultDocType="NOTA_FISCAL" title={`Documentos — ${s.description}`} />
          {late && <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700"><AlertTriangle size={11} />Atrasado</span>}
          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', TONE[s.status])}>{SERVICE_STATUS_LABEL[s.status]}</span>
        </div>
      </div>

      {canEdit && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {s.status !== 'EM_SERVICO' && !closed && <button type="button" disabled={busy} onClick={() => void move('EM_SERVICO')} className="rounded-md bg-sky-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-sky-700 disabled:opacity-50">Colocar em serviço</button>}
          {s.status === 'EM_SERVICO' && <button type="button" disabled={busy} onClick={() => void move('AGUARDANDO')} className="rounded-md border border-gray-300 px-2.5 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Voltar para aguardando</button>}
          {!closed && <button type="button" disabled={busy} onClick={() => void move('CONCLUIDO')} className="rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">Concluir</button>}
          {!closed && <button type="button" disabled={busy} onClick={() => void move('NEGADO')} className="rounded-md border border-red-300 px-2.5 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">Negar</button>}
          {closed && <button type="button" disabled={busy} onClick={() => void move('AGUARDANDO')} className="rounded-md border border-gray-300 px-2.5 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Reabrir</button>}
          {s.supplier?.whatsapp && <a href={`https://wa.me/55${s.supplier.whatsapp}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2.5 py-1 text-[11px] text-gray-700 hover:bg-gray-50">WhatsApp do fornecedor <ExternalLink size={10} /></a>}
        </div>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <label className="text-[11px] text-gray-500 lg:col-span-2">Fornecedor / oficina
          <select className={input} disabled={!canEdit} value={f.supplierId} onChange={(e) => setF({ ...f, supplierId: e.target.value })}>
            <option value="">—</option>{suppliers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            {s.supplier && !suppliers.some((x) => x.id === s.supplier!.id) && <option value={s.supplier.id}>{s.supplier.name} (inativo)</option>}
          </select>
        </label>
        <label className="text-[11px] text-gray-500">Valor cadastrado<MoneyInput className={input} disabled={!canEdit} value={textToMoney(f.estimatedCost)} onChange={(n) => setF({ ...f, estimatedCost: moneyToText(n) })} /></label>
        <label className="text-[11px] text-gray-500">Valor real<MoneyInput className={input} disabled={!canEdit} value={textToMoney(f.actualCost)} placeholder={s.estimatedCost != null ? s.estimatedCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '0,00'} onChange={(n) => setF({ ...f, actualCost: moneyToText(n) })} /></label>
        <label className="text-[11px] text-gray-500">Entrada no prestador<input type="date" className={input} disabled={!canEdit} value={f.sentAt} onChange={(e) => setF({ ...f, sentAt: e.target.value })} /></label>
        <label className="text-[11px] text-gray-500">Previsão de entrega<input type="date" className={input} disabled={!canEdit} value={f.dueAt} onChange={(e) => setF({ ...f, dueAt: e.target.value })} /></label>
        <label className="text-[11px] text-gray-500 sm:col-span-3 lg:col-span-3">Notas<textarea rows={1} className={input} disabled={!canEdit} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
        <label className="text-[11px] text-gray-500 sm:col-span-3 lg:col-span-3">Acompanhamento<input className={input} disabled={!canEdit} value={follow} placeholder="Ex.: falta a peça" onChange={(e) => setFollow(e.target.value)} /></label>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-[11px] text-gray-500">
          <span>Previsto {brl(s.estimatedCost)} · Real {brl(s.actualCost)}{s.actualCost != null && s.estimatedCost != null ? ` (${s.actualCost - s.estimatedCost >= 0 ? '+' : ''}${brl(s.actualCost - s.estimatedCost)})` : ''}</span>
          <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 text-brand-700"><Clock size={11} />Acompanhamento ({s.events.length}){open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}</button>
        </div>
        {canEdit && <button type="button" disabled={busy} onClick={() => void saveFields()} className="btn-primary px-3 py-1 text-xs">{busy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}Salvar</button>}
      </div>
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
      {open && (
        <ol className="mt-2 space-y-1 border-l-2 border-gray-100 pl-3">
          {s.events.map((e) => (
            <li key={e.id} className="text-[11px] text-gray-600">
              <span className="text-gray-400">{new Date(e.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · {e.userName ?? 'Sistema'} — </span>
              {e.type === 'NOTA' ? e.note : e.type === 'ATRASO' ? <b className="text-red-700">{e.note}</b> : <>{e.type === 'FORNECEDOR' ? 'Fornecedor' : e.type === 'VALOR' ? e.note : e.type === 'PRAZO' ? 'Previsão' : e.type === 'CRIADO' ? 'Criado' : 'Situação'}: {e.fromValue ? `${e.fromValue} → ` : ''}{e.toValue}{e.type === 'STATUS' && e.note ? ` (${e.note})` : ''}{e.type === 'CRIADO' && e.note ? ` — ${e.note}` : ''}</>}
            </li>
          ))}
        </ol>
      )}
    </li>
  )
}
