'use client'

// =============================================================================
// FinancingPanel — F&I dentro da Negociação (Fase 8).
// Lista as fichas (FinanceProposal) ligadas a este Deal, permite criar uma
// ficha ligada (proponente existente, prefill do valor financiado) e aplicar
// uma ficha APROVADA à negociação. Consome /api/negotiations/[id]/financing.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Banknote, Plus, FolderOpen, CheckCircle2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Proposal { id: string; status: string; proponentNome: string; bankNome: string | null; amountRequested: number; approvedValue: number; monthlyPayment: number; installments: number | null; createdAt: string }
interface Proponent { id: string; name: string }
interface Bank { id: string; name: string }

const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const STATUS_CLS: Record<string, string> = { SIMULACAO: 'bg-amber-100 text-amber-700', ENVIADA: 'bg-blue-100 text-blue-700', APROVADA: 'bg-green-100 text-green-700', RECUSADA: 'bg-red-100 text-red-600', CANCELADA: 'bg-gray-100 text-gray-500' }
const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

export default function FinancingPanel({ dealId, canEdit, onReload, onToast }: { dealId: string; canEdit: boolean; onReload?: () => void; onToast?: (msg: string, kind?: 'error' | 'success') => void }) {
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [locked, setLocked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [proponents, setProponents] = useState<Proponent[]>([])
  const [banks, setBanks] = useState<Bank[]>([])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ proponentId: '', bankId: '', installments: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/negotiations/${dealId}/financing`, { credentials: 'include' }).then((x) => x.json())
      if (r?.success) { setProposals(r.data.proposals ?? []); setLocked(!!r.data.locked) }
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [dealId])
  useEffect(() => { load() }, [load])

  const openNew = async () => {
    setForm({ proponentId: '', bankId: '', installments: '' }); setModal(true)
    if (proponents.length === 0 || banks.length === 0) {
      try {
        const [p, b] = await Promise.all([
          fetch('/api/financing/proponents', { credentials: 'include' }).then((x) => x.json()),
          fetch('/api/financing/banks?active=true', { credentials: 'include' }).then((x) => x.json()),
        ])
        setProponents((p?.data ?? []).map((x: { id: string; nomeCompleto: string }) => ({ id: x.id, name: x.nomeCompleto })))
        setBanks((b?.data ?? []).map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })))
      } catch { /* selects vazios */ }
    }
  }

  const create = async () => {
    if (!form.proponentId) { onToast?.('Selecione o proponente.', 'error'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/negotiations/${dealId}/financing`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ proponentId: form.proponentId, bankId: form.bankId || null, installments: form.installments ? Number(form.installments) : null }),
      })
      const json = await res.json()
      if (!res.ok) { onToast?.(json?.error ?? 'Erro ao criar ficha.', 'error'); return }
      setModal(false); onToast?.('Ficha de F&I criada e vinculada.', 'success'); await load()
    } catch { onToast?.('Erro de rede.', 'error') } finally { setSaving(false) }
  }

  const apply = async (p: Proposal) => {
    if (!confirm(`Aplicar a ficha aprovada de "${p.proponentNome}"${p.bankNome ? ` (${p.bankNome})` : ''} aos valores da negociação?`)) return
    try {
      const res = await fetch(`/api/negotiations/${dealId}/financing`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ applyProposalId: p.id }) })
      const json = await res.json()
      if (!res.ok) { onToast?.(json?.error ?? 'Erro ao aplicar.', 'error'); return }
      onToast?.('Valores aplicados à negociação.', 'success'); onReload?.(); await load()
    } catch { onToast?.('Erro de rede.', 'error') }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-card">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900"><Banknote size={15} className="text-brand-600" />Financiamento (F&amp;I)</h3>
        {canEdit && !locked && <button onClick={openNew} className="btn-secondary text-xs"><Plus size={13} />Nova ficha</button>}
      </div>

      <div className="p-4">
        {loading ? (
          <div className="h-16 animate-pulse rounded-lg bg-gray-100" />
        ) : proposals.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Nenhuma ficha de F&amp;I vinculada a esta negociação.</p>
        ) : (
          <ul className="space-y-2">
            {proposals.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-100 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">{p.proponentNome}</p>
                  <p className="text-xs text-gray-500">{p.bankNome ?? 'Sem banco'} · {p.installments ?? '—'}x · {p.status === 'APROVADA' && p.approvedValue > 0 ? `aprovado ${fmt(p.approvedValue)}` : fmt(p.amountRequested)}</p>
                </div>
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', STATUS_CLS[p.status] ?? 'bg-gray-100 text-gray-600')}>{p.status}</span>
                {canEdit && !locked && p.status === 'APROVADA' && (
                  <button onClick={() => apply(p)} className="inline-flex items-center gap-1 rounded-lg bg-green-50 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-100" title="Aplicar valores à negociação"><CheckCircle2 size={13} />Aplicar</button>
                )}
                <Link href={`/financiamento/fichas/${p.id}`} className="inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-brand-50 hover:text-brand-700" title="Abrir ficha"><FolderOpen size={15} /></Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={() => setModal(false)}>
          <div className="my-8 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold text-gray-900">Nova ficha de F&amp;I</h2><button onClick={() => setModal(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X size={18} /></button></div>
            <div className="space-y-3">
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Proponente <span className="text-red-500">*</span></label><select className={inputCls} value={form.proponentId} onChange={(e) => setForm((f) => ({ ...f, proponentId: e.target.value }))}><option value="">Selecione...</option>{proponents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>{proponents.length === 0 && <p className="mt-1 text-[11px] text-amber-600">Cadastre um proponente em F&amp;I &gt; Proponentes primeiro.</p>}</div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Banco (opcional)</label><select className={inputCls} value={form.bankId} onChange={(e) => setForm((f) => ({ ...f, bankId: e.target.value }))}><option value="">—</option>{banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Parcelas (opcional)</label><input type="number" min={1} className={inputCls} value={form.installments} onChange={(e) => setForm((f) => ({ ...f, installments: e.target.value }))} placeholder="Ex: 48" /></div>
              <p className="text-[11px] text-gray-400">O valor financiado é puxado da negociação. Ajuste os detalhes na ficha.</p>
            </div>
            <div className="mt-5 flex justify-end gap-2"><button onClick={() => setModal(false)} className="btn-secondary text-sm">Cancelar</button><button onClick={create} disabled={saving} className="btn-primary text-sm">{saving ? 'Criando...' : 'Criar ficha'}</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
