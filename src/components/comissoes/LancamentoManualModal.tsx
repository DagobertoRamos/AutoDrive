'use client'

// =============================================================================
// LancamentoManualModal — ferramenta de RH: lançamento MANUAL no extrato do
// colaborador + espelho no Financeiro. Tipos: crédito, débito, vale/adiantamento
// e desconto em folha. POST /api/commissions/manual (gate commissions.adjust).
// =============================================================================

import { useState, useEffect, useMemo } from 'react'
import { X, Save, RefreshCw, AlertCircle, CheckCircle2, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Option { id: string; nome: string }
interface Props { periodDefault?: string; colaboradores: Option[]; onClose: () => void; onDone: () => void }

const KINDS = [
  { value: 'CREDITO', label: 'Crédito (+ soma ao colaborador)' },
  { value: 'DEBITO', label: 'Débito (− desconta)' },
  { value: 'VALE', label: 'Vale / Adiantamento (− desconta)' },
  { value: 'DESCONTO_FOLHA', label: 'Desconto em folha (− desconta)' },
]

function currentMonth() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }

export default function LancamentoManualModal({ periodDefault, colaboradores, onClose, onDone }: Props) {
  const [sellers, setSellers] = useState<Option[]>([])
  const [collaborator, setCollaborator] = useState('')
  const [period, setPeriod] = useState(periodDefault || currentMonth())
  const [kind, setKind] = useState('CREDITO')
  const [value, setValue] = useState('')
  const [description, setDescription] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState(false)

  // Vendedores completos (independem de já ter comissão) + os que aparecem no filtro.
  useEffect(() => {
    fetch('/api/sellers', { credentials: 'include' })
      .then((r) => r.json()).then((j) => {
        const list: Option[] = (j?.data ?? []).map((s: { id: string; fullName?: string; name?: string }) => ({ id: `s:${s.id}`, nome: s.fullName || s.name || 'Vendedor' }))
        setSellers(list)
      }).catch(() => setSellers([]))
  }, [])

  const people = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of [...colaboradores, ...sellers]) if (c.id && !map.has(c.id)) map.set(c.id, c.nome)
    return [...map.entries()].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome))
  }, [colaboradores, sellers])

  const submit = async () => {
    setError(''); setOk(false)
    if (!collaborator) return setError('Selecione o colaborador.')
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return setError('Período inválido.')
    const v = Number(String(value).replace(',', '.'))
    if (!Number.isFinite(v) || v <= 0) return setError('Informe um valor maior que zero.')
    if (description.trim().length < 2) return setError('Informe uma descrição.')
    setSaving(true)
    try {
      const res = await fetch('/api/commissions/manual', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ collaborator, period, kind, value: v, description: description.trim(), reason: reason.trim() }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? 'Erro ao lançar.')
      setOk(true); onDone()
      setTimeout(onClose, 700)
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Erro ao lançar.') } finally { setSaving(false) }
  }

  const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900"><Wallet size={18} className="text-brand-600" />Lançamento manual (RH)</h2>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100"><X size={18} /></button>
        </div>
        <p className="mt-1 text-xs text-gray-500">Lança no extrato do colaborador e espelha no Financeiro.</p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Colaborador</label>
            <select value={collaborator} onChange={(e) => setCollaborator(e.target.value)} className={inputCls}>
              <option value="">Selecione…</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Período</label>
              <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Valor (R$)</label>
              <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0,00" className={inputCls} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Tipo</label>
            <select value={kind} onChange={(e) => setKind(e.target.value)} className={inputCls}>
              {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Descrição</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Vale semana 1 / Garantia cortesia / Bônus" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Motivo (opcional)</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Justificativa interna" className={inputCls} />
          </div>

          {error && <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle size={14} />{error}</div>}
          {ok && <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700"><CheckCircle2 size={14} />Lançado.</div>}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
            <button onClick={submit} disabled={saving} className="btn-primary text-sm">{saving ? <><RefreshCw size={13} className="animate-spin" />Lançando…</> : <><Save size={13} />Lançar</>}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
