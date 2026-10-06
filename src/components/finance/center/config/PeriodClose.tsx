'use client'

// Financeiro › Fechamento — fecha os meses já conferidos (nada dentro deles
// pode ser lançado, alterado, estornado ou cancelado). /api/finance/center/period-close

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Lock, Unlock } from 'lucide-react'
import { PageHeader, api, inputClass } from './ui'

interface Hist { id: string; kind: 'FECHOU' | 'REABRIU'; userName: string | null; at: string; from: string | null; to: string | null; reason: string | null }
interface Data { closedUntil: string | null; history: Hist[]; canClose: boolean }

const br = (ymd: string | null) => (ymd ? ymd.split('-').reverse().join('/') : '—')
const monthLabel = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const lastDay = (ym: string) => { const [y, m] = ym.split('-').map(Number); return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}` }
const prevMonth = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 7) }

export default function PeriodClose() {
  const [data, setData] = useState<Data | null>(null)
  const [month, setMonth] = useState(prevMonth())
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await api<Data>('/api/finance/center/period-close')
    setData(r.data)
  }, [])
  useEffect(() => { void load() }, [load])

  const target = lastDay(month)
  const reopening = !!data?.closedUntil && target < data.closedUntil

  const save = async (closedUntil: string | null) => {
    setBusy(true); setError(null)
    const r = await api('/api/finance/center/period-close', { method: 'POST', body: { closedUntil, reason } })
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    setReason(''); void load()
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Fechamento" helpText="Mês fechado não aceita lançamento, edição, baixa, estorno ou cancelamento com data dentro dele. Correções entram como ajuste num mês aberto." />

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card">
        <div className="flex items-center gap-3">
          {data?.closedUntil ? <Lock size={20} className="text-gray-700" /> : <Unlock size={20} className="text-gray-400" />}
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Fechado até</p>
            <p className="text-lg font-bold text-gray-900">{data ? br(data.closedUntil) : '—'}</p>
          </div>
        </div>

        {data?.canClose && (
          <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-gray-100 pt-5">
            <label className="text-xs font-medium text-gray-600">Mês
              <input type="month" className={`${inputClass} mt-1 w-48`} value={month} max={prevMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)} />
            </label>
            {reopening && (
              <label className="min-w-[16rem] flex-1 text-xs font-medium text-gray-600">Motivo <span className="text-red-500">*</span>
                <input className={`${inputClass} mt-1`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
              </label>
            )}
            <button type="button" disabled={busy || (reopening && !reason.trim()) || target === data.closedUntil} onClick={() => save(target)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${reopening ? 'bg-amber-600 hover:bg-amber-700' : 'bg-brand-600 hover:bg-brand-700'}`}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : reopening ? <Unlock size={14} /> : <Lock size={14} />}
              {reopening ? `Reabrir a partir de ${monthLabel(month)}` : `Fechar até ${monthLabel(month)}`}
            </button>
          </div>
        )}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>

      {!!data?.history.length && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr><th className="px-4 py-2.5">Data</th><th className="px-4 py-2.5">Ação</th><th className="px-4 py-2.5">Fechado até</th><th className="px-4 py-2.5">Por</th><th className="px-4 py-2.5">Motivo</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.history.map((h) => (
                <tr key={h.id}>
                  <td className="whitespace-nowrap px-4 py-2 text-gray-700">{new Date(h.at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td className="px-4 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${h.kind === 'FECHOU' ? 'bg-gray-100 text-gray-700' : 'bg-amber-100 text-amber-800'}`}>{h.kind === 'FECHOU' ? 'Fechou' : 'Reabriu'}</span></td>
                  <td className="px-4 py-2 tabular-nums text-gray-700">{br(h.from)} → {br(h.to)}</td>
                  <td className="px-4 py-2 text-gray-700">{h.userName ?? '—'}</td>
                  <td className="px-4 py-2 text-xs text-gray-600">{h.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
