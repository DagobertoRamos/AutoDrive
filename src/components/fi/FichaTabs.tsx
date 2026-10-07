'use client'

// Abas de detalhe da ficha: Histórico, Documentos, Detalhes e Logs técnicos.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Check, Download, Paperclip, Trash2, X } from 'lucide-react'
import type { ProposalView } from '@/lib/finance/fi/read-model'
import { api, brlOrDash, dateTimeBR, iconBtn, StatusBadge } from './ui'

export function Timeline({ items }: { items: ProposalView['timeline'] }) {
  if (!items.length) return <p className="text-sm text-gray-500">Nada registrado ainda.</p>
  return (
    <ol className="space-y-3">
      {items.map((e) => (
        <li key={e.id} className="flex gap-3 text-sm">
          <time className="w-24 shrink-0 tabular-nums text-xs text-gray-500" dateTime={e.at ?? undefined}>{dateTimeBR(e.at)}</time>
          <p className="text-gray-800">{e.message}</p>
        </li>
      ))}
    </ol>
  )
}

const DOC_TONE: Record<string, { label: string; tone: string; icon: string }> = {
  PENDENTE: { label: 'Aguardando envio', tone: 'warning', icon: 'clock' },
  ENVIADO: { label: 'Recebido — conferir', tone: 'info', icon: 'file' },
  APROVADO: { label: 'Aprovado', tone: 'success', icon: 'check' },
  REPROVADO: { label: 'Recusado — enviar de novo', tone: 'danger', icon: 'x' },
}

export function DocumentsPanel({ view, onChanged, canEdit }: { view: ProposalView; onChanged: () => void; canEdit: boolean }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const [target, setTarget] = useState<string | null>(null)

  const upload = async (file: File) => {
    if (!target) return
    setBusy(target); setError(null)
    const fd = new FormData(); fd.append('file', file)
    const res = await fetch(`/api/financing/proposals/${view.id}/documents/${target}/file`, { method: 'POST', body: fd, credentials: 'include' })
    const json = await res.json().catch(() => null)
    setBusy(null); setTarget(null)
    if (!res.ok || json?.success === false) { setError(json?.error ?? 'Não foi possível enviar.'); return }
    onChanged()
  }
  const review = async (docId: string, status: 'APROVADO' | 'REPROVADO') => {
    setBusy(docId); setError(null)
    const r = await api(`/api/financing/proposals/${view.id}/documents/${docId}`, { method: 'PATCH', body: { status } })
    setBusy(null)
    if (!r.ok) { setError(r.error); return }
    onChanged()
  }
  const remove = async (docId: string) => {
    setBusy(docId)
    const r = await api(`/api/financing/proposals/${view.id}/documents/${docId}`, { method: 'DELETE' })
    setBusy(null)
    if (!r.ok) { setError(r.error); return }
    onChanged()
  }

  if (!view.documents.length) return <p className="text-sm text-gray-500">Nenhum documento pedido. Use “Solicitar ao cliente” para pedir.</p>
  return (
    <div className="space-y-2">
      <input ref={input} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }} />
      <ul className="divide-y divide-gray-100">
        {view.documents.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
            <div className="min-w-0">
              <p className="font-medium text-gray-900">{d.type}</p>
              <p className="text-xs text-gray-500">{[d.bankName ? `Pedido do ${d.bankName}` : null, d.source === 'PORTAL' ? 'Enviado pelo cliente' : null, d.uploadedAt ? dateTimeBR(d.uploadedAt) : null].filter(Boolean).join(' · ')}</p>
            </div>
            <div className="flex items-center gap-1">
              <StatusBadge meta={DOC_TONE[d.status] ?? { label: d.status, tone: 'neutral' }} />
              {d.hasFile && <a className={iconBtn} href={`/api/financing/proposals/${view.id}/documents/${d.id}/file`} target="_blank" rel="noreferrer" aria-label={`Abrir ${d.type}`}><Download size={15} /></a>}
              {canEdit && d.status !== 'APROVADO' && <button className={iconBtn} disabled={busy === d.id} onClick={() => { setTarget(d.id); input.current?.click() }} aria-label={`Anexar ${d.type}`}><Paperclip size={15} /></button>}
              {canEdit && d.status === 'ENVIADO' && <>
                <button className={iconBtn} disabled={busy === d.id} onClick={() => review(d.id, 'APROVADO')} aria-label={`Aprovar ${d.type}`}><Check size={15} className="text-green-600" /></button>
                <button className={iconBtn} disabled={busy === d.id} onClick={() => review(d.id, 'REPROVADO')} aria-label={`Recusar ${d.type}`}><X size={15} className="text-red-600" /></button>
              </>}
              {canEdit && d.status !== 'APROVADO' && !d.hasFile && <button className={iconBtn} disabled={busy === d.id} onClick={() => remove(d.id)} aria-label={`Remover ${d.type}`}><Trash2 size={15} /></button>}
            </div>
          </li>
        ))}
      </ul>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
    </div>
  )
}

const ORIGIN: Record<string, string> = { INTERNO: 'Cadastro interno', SITE: 'Site — simulação de financiamento', CRM: 'CRM', NEGOCIACAO: 'Negociação' }

export function DetailsPanel({ view }: { view: ProposalView }) {
  const rows: [string, React.ReactNode][] = [
    ['Cliente', view.customer.name],
    [view.customer.personType === 'PJ' ? 'CNPJ' : 'CPF', view.customer.document ?? '—'],
    ['Celular', view.customer.phone ?? '—'],
    ['Co-comprador', view.coBuyer?.name ?? '—'],
    ['Veículo', view.vehicle.description ?? '—'],
    ['Valor do veículo', brlOrDash(view.terms.vehicleValue)],
    ['Entrada', brlOrDash(view.terms.downPayment)],
    ['Valor financiado', brlOrDash(view.terms.amount)],
    ['Parcelas', view.terms.installments ? `${view.terms.installments}x` : '—'],
    ['Negociação', view.deal ? <Link key="d" href={`/negociacoes/${view.deal.id}`} className="text-brand-700 hover:underline">{view.deal.number ?? 'Abrir negociação'}</Link> : '—'],
    ['Origem', ORIGIN[view.origin ?? ''] ?? '—'],
    ['Criada em', dateTimeBR(view.createdAt)],
  ]
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-3 border-b border-gray-50 py-1.5"><dt className="text-gray-500">{k}</dt><dd className="text-right font-medium text-gray-900">{v}</dd></div>)}
    </dl>
  )
}

interface LogRow { id: string; at: string; action: string; channel: string | null; status: string | null; durationMs: number | null; correlationId: string | null; attempt: number | null; errorCode: string | null; message: string | null; externalId: string | null; requestId: string | null; idempotencyKey: string | null }
interface HookRow { id: string; provider: string | null; eventId: string | null; externalId: string | null; signatureValid: boolean | null; processed: boolean; error: string | null; createdAt: string }

export function TechLogs({ proposalId }: { proposalId: string }) {
  const [rows, setRows] = useState<LogRow[] | null>(null)
  const [hooks, setHooks] = useState<HookRow[]>([])
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    api<LogRow[]>(`/api/financing/logs?proposalId=${proposalId}`).then((r) => {
      if (!r.ok) { setError(r.error); return }
      setRows(r.data ?? []); setHooks((r.json?.webhooks as HookRow[]) ?? [])
    })
  }, [proposalId])
  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!rows) return <div className="h-16 animate-pulse rounded bg-gray-100" />
  if (!rows.length && !hooks.length) return <p className="text-sm text-gray-500">Sem comunicação com bancos nesta ficha (envio manual).</p>
  return (
    <div className="space-y-4 text-xs">
      <div className="overflow-x-auto"><table className="min-w-full">
        <thead className="text-left text-gray-500"><tr><th className="py-1 pr-3">Quando</th><th className="pr-3">Operação</th><th className="pr-3">Canal</th><th className="pr-3">Resultado</th><th className="pr-3">Duração</th><th className="pr-3">Código</th><th className="pr-3">Id externo</th><th>Correlação</th></tr></thead>
        <tbody className="divide-y divide-gray-100 font-mono">
          {rows.map((r) => <tr key={r.id}><td className="py-1 pr-3">{dateTimeBR(r.at)}</td><td className="pr-3">{r.action}</td><td className="pr-3">{r.channel ?? '—'}</td><td className="pr-3">{r.status}</td><td className="pr-3">{r.durationMs != null ? `${r.durationMs} ms` : '—'}</td><td className="pr-3">{r.errorCode ?? '—'}</td><td className="pr-3">{r.externalId ?? '—'}</td><td>{r.correlationId?.slice(0, 8) ?? '—'}</td></tr>)}
        </tbody>
      </table></div>
      {hooks.length > 0 && <div>
        <p className="mb-1 font-semibold text-gray-700">Retornos recebidos dos bancos</p>
        <ul className="space-y-1 font-mono">{hooks.map((h) => <li key={h.id}>{dateTimeBR(h.createdAt)} · {h.provider} · evento {h.eventId?.slice(0, 16)} · {h.processed ? 'aplicado' : (h.error ?? 'não aplicado')} · assinatura {h.signatureValid ? 'válida' : 'não verificada'}</li>)}</ul>
      </div>}
    </div>
  )
}
