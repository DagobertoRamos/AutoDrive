'use client'

// =============================================================================
// ProposalsManager — gestão de fichas/propostas de financiamento.
// Reutilizado por /financiamento/{fichas,simulacoes,aprovadas,recusadas}.
// Consome /api/financing/proposals (+[id]), /proponents, /banks.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, FileText, X, Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import { maskBRL, parseBRL, maskCPF } from '@/lib/masks'
import SearchBox from '@/components/reports/SearchBox'

type Status = 'SIMULACAO' | 'ENVIADA' | 'APROVADA' | 'RECUSADA' | 'CANCELADA'
interface Row {
  id: string; status: Status; vehicle: string | null; installments: number | null
  amountRequested: number; downPayment: number; approvedValue: number; monthlyPayment: number
  rejectionReason: string | null; notes: string | null; createdAt: string
  proponentId: string; bankId: string | null; proponentNome: string; proponentCpf: string | null; bankNome: string | null
}
interface Ref { id: string; name: string }
interface Form {
  proponentId: string; bankId: string; vehicle: string; amountRequested: number; downPayment: number
  installments: number; status: Status; approvedValue: number; monthlyPayment: number; rejectionReason: string; notes: string
}
const emptyForm: Form = { proponentId: '', bankId: '', vehicle: '', amountRequested: 0, downPayment: 0, installments: 0, status: 'SIMULACAO', approvedValue: 0, monthlyPayment: 0, rejectionReason: '', notes: '' }

const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const date = (s: string) => new Date(s).toLocaleDateString('pt-BR')
const STATUS_LABEL: Record<Status, string> = { SIMULACAO: 'Simulação', ENVIADA: 'Enviada', APROVADA: 'Aprovada', RECUSADA: 'Recusada', CANCELADA: 'Cancelada' }
const STATUS_CLS: Record<Status, string> = { SIMULACAO: 'bg-amber-100 text-amber-700', ENVIADA: 'bg-blue-100 text-blue-700', APROVADA: 'bg-green-100 text-green-700', RECUSADA: 'bg-red-100 text-red-600', CANCELADA: 'bg-gray-100 text-gray-500' }
const money = (value: number, on: (v: number) => void) => <input type="text" inputMode="numeric" className={inputCls} value={maskBRL(value ? Math.round(value * 100).toString() : '')} onChange={(e) => on(parseBRL(maskBRL(e.target.value)) ?? 0)} placeholder="0,00" />

export default function ProposalsManager({
  fixedStatus, title, subtitle, allowCreate = true,
}: {
  fixedStatus?: Status; title: string; subtitle?: string; allowCreate?: boolean
}) {
  const [items, setItems] = useState<Row[]>([])
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [proponents, setProponents] = useState<Ref[]>([])
  const [banks, setBanks] = useState<Ref[]>([])
  const [modal, setModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Form>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (fixedStatus) qs.set('status', fixedStatus)
      else if (statusFilter) qs.set('status', statusFilter)
      if (q) qs.set('q', q)
      const res = await fetch(`/api/financing/proposals?${qs}`, { credentials: 'include' })
      const json = await res.json(); setItems(json?.data ?? [])
    } catch { setItems([]) } finally { setLoading(false) }
  }, [fixedStatus, statusFilter, q])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!allowCreate) return
    (async () => {
      try {
        const [p, b] = await Promise.all([
          fetch('/api/financing/proponents', { credentials: 'include' }).then((r) => r.json()),
          fetch('/api/financing/banks?active=true', { credentials: 'include' }).then((r) => r.json()),
        ])
        setProponents((p?.data ?? []).map((x: { id: string; nomeCompleto: string }) => ({ id: x.id, name: x.nomeCompleto })))
        setBanks((b?.data ?? []).map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })))
      } catch { /* selects vazios */ }
    })()
  }, [allowCreate])

  const openNew = () => { setEditingId(null); setForm({ ...emptyForm, status: fixedStatus ?? 'SIMULACAO' }); setError(null); setModal(true) }
  const openEdit = (r: Row) => {
    setEditingId(r.id)
    setForm({ proponentId: r.proponentId, bankId: r.bankId ?? '', vehicle: r.vehicle ?? '', amountRequested: r.amountRequested, downPayment: r.downPayment, installments: r.installments ?? 0, status: r.status, approvedValue: r.approvedValue, monthlyPayment: r.monthlyPayment, rejectionReason: r.rejectionReason ?? '', notes: r.notes ?? '' })
    setError(null); setModal(true)
  }

  const save = async () => {
    if (!form.proponentId) { setError('Selecione o proponente.'); return }
    setSaving(true); setError(null)
    try {
      const payload: Record<string, unknown> = {
        proponentId: form.proponentId, bankId: form.bankId || null, vehicle: form.vehicle || null,
        amountRequested: form.amountRequested || null, downPayment: form.downPayment || null,
        installments: form.installments || null, status: form.status, notes: form.notes || null,
        approvedValue: form.status === 'APROVADA' ? (form.approvedValue || null) : null,
        monthlyPayment: form.status === 'APROVADA' ? (form.monthlyPayment || null) : null,
        rejectionReason: form.status === 'RECUSADA' ? (form.rejectionReason || null) : null,
      }
      const url = editingId ? `/api/financing/proposals/${editingId}` : '/api/financing/proposals'
      const res = await fetch(url, { method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload) })
      const json = await res.json()
      if (!res.ok) { setError(json?.error ?? 'Erro ao salvar.'); return }
      setModal(false); await load()
    } catch { setError('Erro de rede.') } finally { setSaving(false) }
  }
  const remove = async (r: Row) => {
    if (!confirm(`Excluir a ficha de "${r.proponentNome}"?`)) return
    await fetch(`/api/financing/proposals/${r.id}`, { method: 'DELETE', credentials: 'include' }); await load()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{title}</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${items.length} ${subtitle ?? 'fichas'}`}</p>
        </div>
        <div className="flex items-center gap-2">
          <SearchBox value={q} onChange={setQ} placeholder="Buscar proponente, CPF, veículo..." className="w-64" />
          {allowCreate && <button onClick={openNew} className="btn-primary text-sm"><Plus size={15} />Nova ficha</button>}
        </div>
      </div>

      {!fixedStatus && (
        <div className="flex flex-wrap gap-2">
          {['', 'SIMULACAO', 'ENVIADA', 'APROVADA', 'RECUSADA', 'CANCELADA'].map((s) => (
            <button key={s || 'all'} onClick={() => setStatusFilter(s)} className={cn('rounded-full px-3 py-1 text-xs font-medium', statusFilter === s ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>{s ? STATUS_LABEL[s as Status] : 'Todas'}</button>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50"><tr>{['Proponente', 'Banco', 'Veículo', 'Valor', 'Parcelas', 'Status', 'Data', ''].map((h) => (<th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (<tr key={i}>{Array.from({ length: 8 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>))}</tr>))
              ) : items.length === 0 ? (
                <tr><td colSpan={8} className="py-14 text-center"><FileText size={32} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Nenhuma ficha aqui.</p></td></tr>
              ) : (
                items.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3"><p className="font-medium text-gray-900">{r.proponentNome}</p>{r.proponentCpf && <p className="font-mono text-[11px] text-gray-400">{maskCPF(r.proponentCpf)}</p>}</td>
                    <td className="px-4 py-3 text-gray-600">{r.bankNome ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{r.vehicle ?? '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gray-700">{r.amountRequested ? fmt(r.amountRequested) : '—'}</td>
                    <td className="px-4 py-3 text-center tabular-nums text-gray-500">{r.installments ?? '—'}</td>
                    <td className="px-4 py-3"><span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', STATUS_CLS[r.status])}>{STATUS_LABEL[r.status]}</span>{r.status === 'APROVADA' && r.monthlyPayment > 0 && <p className="mt-0.5 text-[11px] text-green-700">{fmt(r.monthlyPayment)}/mês</p>}{r.status === 'RECUSADA' && r.rejectionReason && <p className="mt-0.5 max-w-[160px] truncate text-[11px] text-red-500">{r.rejectionReason}</p>}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">{date(r.createdAt)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button onClick={() => openEdit(r)} className="mr-1 inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Editar / mudar status"><Pencil size={15} /></button>
                      <button onClick={() => remove(r)} className="inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Excluir"><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={() => setModal(false)}>
          <div className="my-4 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold text-gray-900">{editingId ? 'Editar ficha' : 'Nova ficha'}</h2><button onClick={() => setModal(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X size={18} /></button></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="mb-1 block text-xs font-medium text-gray-700">Proponente <span className="text-red-500">*</span></label><select className={inputCls} value={form.proponentId} onChange={(e) => set('proponentId', e.target.value)} disabled={!!editingId}><option value="">Selecione...</option>{proponents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}{editingId && !proponents.some((p) => p.id === form.proponentId) && <option value={form.proponentId}>Proponente atual</option>}</select></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Banco</label><select className={inputCls} value={form.bankId} onChange={(e) => set('bankId', e.target.value)}><option value="">—</option>{banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Status</label><select className={inputCls} value={form.status} onChange={(e) => set('status', e.target.value as Status)}>{(['SIMULACAO', 'ENVIADA', 'APROVADA', 'RECUSADA', 'CANCELADA'] as Status[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select></div>
              <div className="col-span-2"><label className="mb-1 block text-xs font-medium text-gray-700">Veículo</label><input className={inputCls} value={form.vehicle} onChange={(e) => set('vehicle', e.target.value)} placeholder="Marca/modelo/ano" /></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Valor solicitado</label>{money(form.amountRequested, (v) => set('amountRequested', v))}</div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Entrada</label>{money(form.downPayment, (v) => set('downPayment', v))}</div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Parcelas</label><input type="number" min={0} className={inputCls} value={form.installments || ''} onChange={(e) => set('installments', Number(e.target.value))} placeholder="Ex: 48" /></div>
              {form.status === 'APROVADA' && <>
                <div><label className="mb-1 block text-xs font-medium text-gray-700">Valor aprovado</label>{money(form.approvedValue, (v) => set('approvedValue', v))}</div>
                <div><label className="mb-1 block text-xs font-medium text-gray-700">Parcela mensal</label>{money(form.monthlyPayment, (v) => set('monthlyPayment', v))}</div>
              </>}
              {form.status === 'RECUSADA' && <div className="col-span-2"><label className="mb-1 block text-xs font-medium text-gray-700">Motivo da recusa</label><input className={inputCls} value={form.rejectionReason} onChange={(e) => set('rejectionReason', e.target.value)} /></div>}
              <div className="col-span-2"><label className="mb-1 block text-xs font-medium text-gray-700">Observações</label><textarea className={cn(inputCls, 'min-h-[60px] resize-y')} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></div>
              {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}
            </div>
            <div className="mt-5 flex justify-end gap-2"><button onClick={() => setModal(false)} className="btn-secondary text-sm">Cancelar</button><button onClick={save} disabled={saving} className="btn-primary text-sm"><Save size={15} />{saving ? 'Salvando...' : 'Salvar'}</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
