'use client'

// =============================================================================
// SimulationManager — simulação comparativa de F&I (Fase 6).
// Monta um comparativo de parcelas por banco (Tabela Price a partir da taxa
// informada) e persiste em /api/financing/simulations. O retorno estimado
// (margem) só é exibido a quem tem financing.config (a API decide).
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Trash2, Calculator, X, Save, Eye, Landmark } from 'lucide-react'
import { cn } from '@/lib/utils'
import { maskBRL, parseBRL } from '@/lib/masks'
import { financedAmount, priceInstallment } from '@/lib/finance/simulation-service'

interface Bank { id: string; name: string }
interface Proponent { id: string; name: string }
interface Header { proponentId: string; vehicle: string; vehicleValue: number; downPayment: number; installments: number }
interface BankRow { bankId: string; rate: string } // taxa mensal % (string p/ input)
interface SimRow { id: string; vehicle: string | null; financedAmount: number; installmentsCount: number; optionsCount: number; proponentNome: string | null; createdAt: string; bestInstallment: number | null; bestReturn: number | null }
interface DetailOption { id: string; bankName: string; installments: number; installmentValue: number; rate: number | null; estimatedReturn: number | null }
interface Detail { id: string; vehicle: string | null; vehicleValue: number; downPayment: number; financedAmount: number; installments: number; proponentNome: string | null; options: DetailOption[]; createdAt: string }

const emptyHeader: Header = { proponentId: '', vehicle: '', vehicleValue: 0, downPayment: 0, installments: 48 }
const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const date = (s: string) => new Date(s).toLocaleDateString('pt-BR')

export default function SimulationManager() {
  const [banks, setBanks] = useState<Bank[]>([])
  const [proponents, setProponents] = useState<Proponent[]>([])
  const [sims, setSims] = useState<SimRow[]>([])
  const [loading, setLoading] = useState(true)
  const [canSeeReturn, setCanSeeReturn] = useState(false)

  const [header, setHeader] = useState<Header>(emptyHeader)
  const [rows, setRows] = useState<BankRow[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)

  const setH = <K extends keyof Header>(k: K, v: Header[K]) => setHeader((h) => ({ ...h, [k]: v }))
  const financed = financedAmount(header.vehicleValue, header.downPayment)

  const loadSims = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/financing/simulations', { credentials: 'include' })
      const json = await res.json(); setSims(json?.data ?? []); setCanSeeReturn(!!json?.canSeeReturn)
    } catch { setSims([]) } finally { setLoading(false) }
  }, [])
  useEffect(() => { loadSims() }, [loadSims])

  useEffect(() => {
    (async () => {
      try {
        const [b, p] = await Promise.all([
          fetch('/api/financing/banks?active=true', { credentials: 'include' }).then((r) => r.json()),
          fetch('/api/financing/proponents', { credentials: 'include' }).then((r) => r.json()),
        ])
        setBanks((b?.data ?? []).map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })))
        setProponents((p?.data ?? []).map((x: { id: string; nomeCompleto: string }) => ({ id: x.id, name: x.nomeCompleto })))
      } catch { /* selects vazios */ }
    })()
  }, [])

  const addBank = (bankId: string) => { if (bankId && !rows.some((r) => r.bankId === bankId)) setRows((rs) => [...rs, { bankId, rate: '' }]) }
  const setRate = (bankId: string, rate: string) => setRows((rs) => rs.map((r) => (r.bankId === bankId ? { ...r, rate: rate.replace(/[^0-9.,]/g, '') } : r)))
  const removeBank = (bankId: string) => setRows((rs) => rs.filter((r) => r.bankId !== bankId))
  const bankName = (id: string) => banks.find((b) => b.id === id)?.name ?? '—'
  const rateNum = (s: string) => (s.trim() ? Number(s.replace(',', '.')) : 0)

  const save = async () => {
    if (rows.length === 0) { setError('Adicione ao menos um banco.'); return }
    if (!header.installments) { setError('Informe o número de parcelas.'); return }
    setSaving(true); setError(null)
    try {
      const payload = {
        proponentId: header.proponentId || null, vehicle: header.vehicle || null,
        vehicleValue: header.vehicleValue || null, downPayment: header.downPayment || null,
        installments: header.installments,
        options: rows.map((r) => ({ bankId: r.bankId, rate: rateNum(r.rate) })),
      }
      const res = await fetch('/api/financing/simulations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload) })
      const json = await res.json()
      if (!res.ok) { setError(json?.error ?? 'Erro ao salvar.'); return }
      setHeader(emptyHeader); setRows([]); await loadSims()
      if (json?.data?.id) view(json.data.id)
    } catch { setError('Erro de rede.') } finally { setSaving(false) }
  }

  const view = async (id: string) => {
    try {
      const res = await fetch(`/api/financing/simulations/${id}`, { credentials: 'include' })
      const json = await res.json(); if (res.ok) setDetail(json.data)
    } catch { /* ignore */ }
  }
  const remove = async (s: SimRow) => {
    if (!confirm(`Excluir a simulação${s.vehicle ? ` de "${s.vehicle}"` : ''}?`)) return
    await fetch(`/api/financing/simulations/${s.id}`, { method: 'DELETE', credentials: 'include' }); await loadSims()
  }

  const money = (value: number, on: (v: number) => void) => <input type="text" inputMode="numeric" className={inputCls} value={maskBRL(value ? Math.round(value * 100).toString() : '')} onChange={(e) => on(parseBRL(maskBRL(e.target.value)) ?? 0)} placeholder="0,00" />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Simulações</h1>
        <p className="mt-0.5 text-sm text-gray-500">Compare a parcela por banco a partir da taxa mensal informada.</p>
      </div>

      {/* ── Simulador ── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="col-span-2"><label className="mb-1 block text-xs font-medium text-gray-700">Veículo</label><input className={inputCls} value={header.vehicle} onChange={(e) => setH('vehicle', e.target.value)} placeholder="Marca/modelo/ano" /></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-700">Valor do veículo</label>{money(header.vehicleValue, (v) => setH('vehicleValue', v))}</div>
          <div><label className="mb-1 block text-xs font-medium text-gray-700">Entrada</label>{money(header.downPayment, (v) => setH('downPayment', v))}</div>
          <div><label className="mb-1 block text-xs font-medium text-gray-700">Parcelas</label><input type="number" min={1} className={inputCls} value={header.installments || ''} onChange={(e) => setH('installments', Number(e.target.value))} placeholder="48" /></div>
          <div className="col-span-2"><label className="mb-1 block text-xs font-medium text-gray-700">Proponente (opcional)</label><select className={inputCls} value={header.proponentId} onChange={(e) => setH('proponentId', e.target.value)}><option value="">—</option>{proponents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div className="col-span-1 flex items-end"><div className="rounded-lg bg-brand-50 px-3 py-2 text-sm"><span className="text-gray-500">Financiado: </span><span className="font-semibold text-brand-800">{fmt(financed)}</span></div></div>
        </div>

        <div className="mt-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Bancos a comparar</span>
            <select className={cn(inputCls, 'w-auto')} value="" onChange={(e) => { addBank(e.target.value); e.currentTarget.value = '' }}>
              <option value="">+ Adicionar banco...</option>
              {banks.filter((b) => !rows.some((r) => r.bankId === b.id)).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>

          {rows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 py-8 text-center text-sm text-gray-400">Adicione bancos para montar o comparativo.</div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50"><tr>{['Banco', 'Taxa % a.m.', `Parcela (${header.installments || 0}x)`, ''].map((h) => (<th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((r) => {
                    const parcela = priceInstallment(financed, rateNum(r.rate), header.installments)
                    return (
                      <tr key={r.bankId}>
                        <td className="px-4 py-2.5 font-medium text-gray-900">{bankName(r.bankId)}</td>
                        <td className="px-4 py-2.5"><input type="text" inputMode="decimal" className={cn(inputCls, 'w-28')} value={r.rate} onChange={(e) => setRate(r.bankId, e.target.value)} placeholder="Ex: 1,99" /></td>
                        <td className="px-4 py-2.5 tabular-nums text-gray-700">{parcela > 0 ? fmt(parcela) : '—'}</td>
                        <td className="px-4 py-2.5 text-right"><button onClick={() => removeBank(r.bankId)} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Remover"><Trash2 size={15} /></button></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => { setHeader(emptyHeader); setRows([]); setError(null) }} className="btn-secondary text-sm">Limpar</button>
            <button onClick={save} disabled={saving || rows.length === 0} className="btn-primary text-sm disabled:opacity-50"><Save size={15} />{saving ? 'Salvando...' : 'Salvar simulação'}</button>
          </div>
        </div>
      </div>

      {/* ── Histórico ── */}
      <div>
        <p className="mb-2 text-sm font-semibold text-gray-700">{loading ? 'Carregando...' : `${sims.length} simulação(ões) salva(s)`}</p>
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50"><tr>{['Veículo', 'Proponente', 'Financiado', 'Parcelas', 'Bancos', 'Menor parcela', ...(canSeeReturn ? ['Melhor retorno'] : []), 'Data', ''].map((h) => (<th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (<tr key={i}>{Array.from({ length: canSeeReturn ? 9 : 8 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>))}</tr>))
                ) : sims.length === 0 ? (
                  <tr><td colSpan={canSeeReturn ? 9 : 8} className="py-12 text-center"><Calculator size={30} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Nenhuma simulação salva ainda.</p></td></tr>
                ) : (
                  sims.map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{s.vehicle ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{s.proponentNome ?? '—'}</td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gray-700">{fmt(s.financedAmount)}</td>
                      <td className="px-4 py-3 text-center tabular-nums text-gray-500">{s.installmentsCount}</td>
                      <td className="px-4 py-3 text-center tabular-nums text-gray-500">{s.optionsCount}</td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gray-700">{s.bestInstallment != null ? fmt(s.bestInstallment) : '—'}</td>
                      {canSeeReturn && <td className="whitespace-nowrap px-4 py-3 tabular-nums text-green-700">{s.bestReturn != null && s.bestReturn > 0 ? fmt(s.bestReturn) : '—'}</td>}
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">{date(s.createdAt)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <button onClick={() => view(s.id)} className="mr-1 inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Ver"><Eye size={15} /></button>
                        <button onClick={() => remove(s)} className="inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Excluir"><Trash2 size={15} /></button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Detalhe ── */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={() => setDetail(null)}>
          <div className="my-4 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div><h2 className="text-lg font-bold text-gray-900">{detail.vehicle ?? 'Simulação'}</h2><p className="text-xs text-gray-500">{detail.proponentNome ?? 'Sem proponente'} · {fmt(detail.financedAmount)} financiado · {detail.installments}x</p></div>
              <button onClick={() => setDetail(null)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X size={18} /></button>
            </div>
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50"><tr>{['Banco', 'Taxa', 'Parcela', ...(detail.options.some((o) => o.estimatedReturn != null) ? ['Retorno est.'] : [])].map((h) => (<th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {detail.options.map((o) => (
                    <tr key={o.id}>
                      <td className="px-4 py-2.5 font-medium text-gray-900"><span className="inline-flex items-center gap-1.5"><Landmark size={13} className="text-gray-400" />{o.bankName}</span></td>
                      <td className="px-4 py-2.5 tabular-nums text-gray-600">{o.rate != null ? `${o.rate}% a.m.` : '—'}</td>
                      <td className="px-4 py-2.5 tabular-nums text-gray-800">{o.installmentValue > 0 ? fmt(o.installmentValue) : '—'}</td>
                      {detail.options.some((x) => x.estimatedReturn != null) && <td className="px-4 py-2.5 tabular-nums text-green-700">{o.estimatedReturn != null && o.estimatedReturn > 0 ? fmt(o.estimatedReturn) : '—'}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
