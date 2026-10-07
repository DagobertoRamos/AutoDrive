'use client'

// =============================================================================
// FinancingPanel — F&I dentro da Negociação. Lista as fichas desta negociação
// (situação + pagamento do banco), cria ficha ligada (veículo, valor e entrada
// vêm da negociação) e aplica a proposta aprovada (gera o pagamento
// FINANCIAMENTO e a previsão de recebimento no financeiro).
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Banknote, Plus, CheckCircle2, ArrowRight } from 'lucide-react'
import { HelpHint } from '@/components/ui/help-hint'
import { FieldLabel } from '@/components/ui/field'
import { StatusBadge, Modal, btnPrimary, btnSecondary, inputClass } from '@/components/fi/ui'
import { PersonPicker } from '@/components/fi/NewProposalModal'

interface Proposal {
  id: string; code: string | null; status: string; statusLabel: string; statusTone: string; proponentNome: string; bankNome: string | null
  amountRequested: number; approvedValue: number; monthlyPayment: number; installments: number | null; selected: boolean; appliedToDeal: boolean
  funding: string | null; fundingStatus: string
}

const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const TERMS = [12, 18, 24, 36, 48, 60, 72]

export default function FinancingPanel({ dealId, canEdit, onReload, onToast }: { dealId: string; canEdit: boolean; onReload?: () => void; onToast?: (msg: string, kind?: 'error' | 'success') => void }) {
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [locked, setLocked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [modal, setModal] = useState(false)
  const [person, setPerson] = useState<{ id: string; nomeCompleto: string; cpf: string | null } | null>(null)
  const [installments, setInstallments] = useState(48)
  const [saving, setSaving] = useState(false)
  const [applying, setApplying] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/negotiations/${dealId}/financing`, { credentials: 'include' })
      const r = await res.json().catch(() => null)
      if (res.ok && r?.success) { setProposals(r.data.proposals ?? []); setLocked(!!r.data.locked); setLoadError(null) }
      else if (res.status !== 403) setLoadError(r?.error ?? 'Não foi possível carregar o financiamento.')
    } catch { setLoadError('Erro de rede.') } finally { setLoading(false) }
  }, [dealId])
  useEffect(() => { const t = setTimeout(() => void load(), 0); return () => clearTimeout(t) }, [load])

  const create = async () => {
    if (!person) { onToast?.('Escolha o cliente da ficha.', 'error'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/negotiations/${dealId}/financing`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ proponentId: person.id, installments }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) { onToast?.(json?.error ?? 'Erro ao criar ficha.', 'error'); return }
      setModal(false); setPerson(null); onToast?.(`Ficha ${json?.data?.code ?? ''} criada.`, 'success'); await load()
    } catch { onToast?.('Erro de rede.', 'error') } finally { setSaving(false) }
  }

  const apply = async (p: Proposal) => {
    if (!confirm(`Usar o financiamento aprovado${p.bankNome ? ` do ${p.bankNome}` : ''} nesta negociação?`)) return
    setApplying(p.id)
    try {
      const res = await fetch(`/api/negotiations/${dealId}/financing`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ applyProposalId: p.id }) })
      const json = await res.json().catch(() => null)
      if (!res.ok) { onToast?.(json?.error ?? 'Erro ao aplicar.', 'error'); return }
      onToast?.('Financiamento lançado na negociação.', 'success'); onReload?.(); await load()
    } catch { onToast?.('Erro de rede.', 'error') } finally { setApplying(null) }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-card">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900"><Banknote size={15} className="text-brand-600" />Financiamento<HelpHint term="FI" /></h3>
        {canEdit && !locked && <button onClick={() => setModal(true)} className="btn-secondary text-xs"><Plus size={13} />Nova ficha</button>}
      </div>
      <div className="p-4">
        {loadError && <p className="mb-2 text-sm text-red-600" role="alert">{loadError}</p>}
        {loading ? <div className="h-16 animate-pulse rounded-lg bg-gray-100" /> : proposals.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Nenhuma ficha de financiamento nesta negociação.</p>
        ) : (
          <ul className="space-y-2">
            {proposals.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-100 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">{p.code ? `${p.code} · ` : ''}{p.proponentNome}</p>
                  <p className="text-xs text-gray-500">{p.bankNome ?? 'Sem banco escolhido'} · {p.installments ?? '—'}x · {p.approvedValue > 0 ? `aprovado ${fmt(p.approvedValue)}` : fmt(p.amountRequested)}</p>
                </div>
                <StatusBadge meta={{ label: p.statusLabel, tone: p.statusTone }} />
                {p.appliedToDeal && p.funding && <StatusBadge meta={{ label: p.fundingStatus === 'PAGO' ? 'Banco pagou' : `Pagamento: ${p.funding.toLowerCase()}`, tone: p.fundingStatus === 'PAGO' ? 'success' : 'info', icon: 'wallet' }} />}
                {canEdit && !locked && p.status === 'APROVADA' && !p.appliedToDeal && (
                  <button onClick={() => apply(p)} disabled={applying === p.id} className="inline-flex items-center gap-1 rounded-lg bg-green-50 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"><CheckCircle2 size={13} />Usar nesta negociação</button>
                )}
                <Link href={`/financiamento/fichas/${p.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">Abrir<ArrowRight size={13} /></Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {modal && (
        <Modal title="Nova ficha de financiamento" onClose={() => setModal(false)} footer={<><button className={btnSecondary} onClick={() => setModal(false)}>Cancelar</button><button className={btnPrimary} onClick={create} disabled={saving || !person}>{saving ? 'Criando…' : 'Criar ficha'}</button></>}>
          <div className="space-y-3">
            <div><FieldLabel required>Cliente da ficha</FieldLabel><PersonPicker value={person} onChange={setPerson} label="Buscar cliente" /></div>
            <div><FieldLabel>Parcelas</FieldLabel><select className={inputClass} value={installments} onChange={(e) => setInstallments(Number(e.target.value))}>{TERMS.map((t) => <option key={t} value={t}>{t}x</option>)}</select></div>
          </div>
        </Modal>
      )}
    </div>
  )
}
