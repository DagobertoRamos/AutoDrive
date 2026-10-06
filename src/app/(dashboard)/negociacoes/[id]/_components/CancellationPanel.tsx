'use client'

// =============================================================================
// Negociação cancelada × dinheiro: o que entrou continua na conta (retido) até
// o financeiro marcar o estorno — que vira saída no extrato, no fluxo de caixa,
// na DRE (Devoluções e distratos) e no relatório "Cancelamentos e estornos".
// Consome /api/negotiations/[id]/refunds.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { Loader2, RotateCcw, Undo2, Wallet } from 'lucide-react'
import { maskBRL, parseBRL } from '@/lib/masks'

type Kind = 'ESTORNO_CLIENTE' | 'DEVOLUCAO_PROPRIETARIO'
interface Line {
  refId: string; kind: Kind; label: string; party: string | null
  value: number; moved: number; refunded: number; pending: number
  refund: { entryId: string; amount: number; date: string | null; accountName: string | null; method: string | null; notes: string | null } | null
}
interface Data { lines: Line[]; canRefund: boolean; accounts: { id: string; name: string }[] }

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const day = (s: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—')
const todayIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const METHODS = ['PIX', 'Transferência', 'Dinheiro', 'Estorno no cartão', 'Cheque', 'Boleto', 'Outro']

export default function CancellationPanel({ dealId, onToast }: { dealId: string; onToast: (msg: string, ok?: boolean) => void }) {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Line | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const j = await fetch(`/api/negotiations/${dealId}/refunds`, { cache: 'no-store' }).then((r) => r.json())
      setData(j?.success ? j.data : null)
    } catch { setData(null) } finally { setLoading(false) }
  }, [dealId])
  useEffect(() => { void load() }, [load])

  const undo = async (l: Line) => {
    if (!confirm(`Desfazer o estorno de ${brl(l.refunded)}? O lançamento de saída será apagado.`)) return
    setBusy(true)
    try {
      const r = await fetch(`/api/negotiations/${dealId}/refunds?refId=${encodeURIComponent(l.refId)}&kind=${l.kind}`, { method: 'DELETE' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.success) throw new Error(j.error ?? 'Não foi possível desfazer.')
      onToast('Estorno desfeito.')
      void load()
    } catch (e) { onToast(e instanceof Error ? e.message : 'Erro', false) } finally { setBusy(false) }
  }

  if (loading) return <div className="h-24 animate-pulse rounded-2xl border border-gray-200 bg-gray-50" />
  if (!data || data.lines.length === 0) return null

  const pending = data.lines.reduce((s, l) => s + l.pending, 0)
  const refunded = data.lines.reduce((s, l) => s + l.refunded, 0)

  return (
    <div className="overflow-hidden rounded-2xl border border-red-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-red-100 bg-red-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <Wallet size={15} className="text-red-600" />
          <h3 className="font-semibold text-gray-800">Valores da negociação cancelada</h3>
        </div>
        <div className="flex gap-2 text-[11px] font-semibold">
          {pending > 0 && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-amber-800">Retido: {brl(pending)}</span>}
          {refunded > 0 && <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-gray-700">Estornado: {brl(refunded)}</span>}
        </div>
      </div>
      <ul className="divide-y divide-gray-100">
        {data.lines.map((l) => (
          <li key={`${l.kind}:${l.refId}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium text-gray-800">{l.kind === 'DEVOLUCAO_PROPRIETARIO' ? 'Pago ao proprietário' : 'Recebido'} · {l.label}</p>
              <p className="text-xs text-gray-500">
                {l.party ?? '—'} · {brl(l.moved)}
                {l.refund
                  ? <> · {l.kind === 'DEVOLUCAO_PROPRIETARIO' ? 'devolvido' : 'estornado'} em {day(l.refund.date)}{l.refund.accountName ? ` · ${l.refund.accountName}` : ''}{l.refund.method ? ` · ${l.refund.method}` : ''}</>
                  : <> · {l.kind === 'DEVOLUCAO_PROPRIETARIO' ? 'aguardando devolução' : 'retido na conta'}</>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {l.refund
                ? <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">{l.kind === 'DEVOLUCAO_PROPRIETARIO' ? 'Devolvido' : 'Estornado'} {brl(l.refunded)}</span>
                : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{brl(l.pending)}</span>}
              {data.canRefund && !l.refund && (
                <button type="button" onClick={() => setEditing(l)} className="inline-flex items-center gap-1 rounded-lg border border-red-300 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50">
                  <RotateCcw size={12} /> {l.kind === 'DEVOLUCAO_PROPRIETARIO' ? 'Marcar devolvido' : 'Marcar estornado'}
                </button>
              )}
              {data.canRefund && l.refund && (
                <button type="button" disabled={busy} onClick={() => undo(l)} title="Desfazer estorno" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><Undo2 size={14} /></button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {!data.canRefund && pending > 0 && <p className="border-t border-gray-100 px-4 py-2 text-xs text-gray-500">O estorno é marcado pelo financeiro.</p>}
      {editing && <RefundModal dealId={dealId} line={editing} accounts={data.accounts} onClose={() => setEditing(null)} onDone={() => { setEditing(null); onToast('Estorno registrado no financeiro.'); void load() }} onError={(m) => onToast(m, false)} />}
    </div>
  )
}

function RefundModal({ dealId, line, accounts, onClose, onDone, onError }: {
  dealId: string; line: Line; accounts: { id: string; name: string }[]
  onClose: () => void; onDone: () => void; onError: (m: string) => void
}) {
  const owner = line.kind === 'DEVOLUCAO_PROPRIETARIO'
  const [amount, setAmount] = useState(maskBRL(line.pending.toFixed(2).replace('.', ',')))
  const [date, setDate] = useState(todayIso())
  const [accountId, setAccountId] = useState(accounts.length === 1 ? accounts[0].id : '')
  const [method, setMethod] = useState('PIX')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const value = parseBRL(amount) ?? 0
  const ok = value > 0 && value <= line.pending + 0.009 && !!date && !!accountId

  const save = async () => {
    setSaving(true)
    try {
      const r = await fetch(`/api/negotiations/${dealId}/refunds`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refId: line.refId, kind: line.kind, amount: value, date, accountId, method, notes }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.success) throw new Error(j.error ?? 'Não foi possível registrar.')
      onDone()
    } catch (e) { onError(e instanceof Error ? e.message : 'Erro') } finally { setSaving(false) }
  }

  const input = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose() }}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" role="dialog" aria-modal="true">
        <h3 className="text-lg font-semibold text-gray-900">{owner ? 'Devolução do proprietário' : 'Estorno ao cliente'}</h3>
        <p className="mt-1 text-xs text-gray-500">{line.label} · {line.party ?? '—'} · {owner ? 'pago' : 'recebido'} {brl(line.moved)}</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="text-xs font-medium text-gray-600">Valor <span className="text-red-500">*</span>
            <input className={input} inputMode="decimal" value={amount} onChange={(e) => setAmount(maskBRL(e.target.value))} />
          </label>
          <label className="text-xs font-medium text-gray-600">Data <span className="text-red-500">*</span>
            <input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="col-span-2 text-xs font-medium text-gray-600">{owner ? 'Conta que recebeu' : 'Conta de saída'} <span className="text-red-500">*</span>
            <select className={input} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Selecione</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label className="col-span-2 text-xs font-medium text-gray-600">Forma
            <select className={input} value={method} onChange={(e) => setMethod(e.target.value)}>
              {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className="col-span-2 text-xs font-medium text-gray-600">Observação
            <textarea className={`${input} min-h-16 resize-y`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
          </label>
        </div>
        {value > line.pending + 0.009 && <p className="mt-2 text-xs text-red-600">Máximo: {brl(line.pending)}.</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Voltar</button>
          <button type="button" onClick={save} disabled={!ok || saving} className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
            {saving && <Loader2 size={13} className="animate-spin" />}{owner ? 'Registrar devolução' : 'Registrar estorno'}
          </button>
        </div>
      </div>
    </div>
  )
}
