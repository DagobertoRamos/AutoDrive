'use client'

// =============================================================================
// Regras de Retorno — AutoDrive
// Percentuais de conversão de retorno sobre comissão
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Plus, Edit2, Trash2, ArrowLeftRight, X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ReturnRule {
  id:                  string
  name:                string
  percentualInformado: number
  percentualAplicado:  number
  bank?:               string | null
  active:              boolean
}

interface FormState {
  name:                string
  percentualInformado: string
  percentualAplicado:  string
  bank:                string
}

const EMPTY_FORM: FormState = {
  name:                '',
  percentualInformado: '',
  percentualAplicado:  '',
  bank:                '',
}

export default function RetornosPage() {
  const [rules, setRules]     = useState<ReturnRule[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen]       = useState(false)
  const [form, setForm]       = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving]   = useState(false)
  const [toast, setToast]     = useState<{ ok: boolean; msg: string } | null>(null)

  const fetchRules = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/commissions/return-rules', { credentials: 'include' })
      const data = await res.json()
      if (data.success) setRules(data.data ?? [])
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchRules() }, [fetchRules])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  const openModal = () => { setForm(EMPTY_FORM); setOpen(true) }
  const closeModal = () => { if (!saving) setOpen(false) }

  const handleSave = async () => {
    if (!form.name.trim()) {
      setToast({ ok: false, msg: 'Informe o nome da regra.' }); return
    }
    const pi = Number(form.percentualInformado.replace(',', '.'))
    const pa = Number(form.percentualAplicado.replace(',', '.'))
    if (!Number.isFinite(pi) || !Number.isFinite(pa)) {
      setToast({ ok: false, msg: 'Percentuais devem ser numéricos.' }); return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/commissions/return-rules', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          percentualInformado: pi,
          percentualAplicado:  pa,
          bank: form.bank.trim() || null,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setToast({ ok: true, msg: 'Regra criada com sucesso.' })
        setOpen(false)
        fetchRules()
      } else {
        setToast({ ok: false, msg: data.error ?? 'Erro ao salvar.' })
      }
    } catch {
      setToast({ ok: false, msg: 'Erro de conexão.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Regras de Retorno</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Configure as faixas de percentual de retorno e seus descontos na comissão.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchRules} disabled={loading} className="btn-secondary text-xs">
            <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
          </button>
          <button onClick={openModal} className="btn-primary text-xs"><Plus size={13} />Nova regra</button>
        </div>
      </div>

      {toast && (
        <div className={cn(
          'flex items-center gap-2 rounded-xl px-4 py-3 text-sm',
          toast.ok
            ? 'bg-green-50 border border-green-200 text-green-700'
            : 'bg-red-50 border border-red-200 text-red-700',
        )}>
          {toast.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
          {toast.msg}
        </div>
      )}

      {/* Info panel */}
      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-700">
        <p className="font-semibold">Como funciona?</p>
        <p className="mt-1 text-xs text-blue-600">
          Se o percentual de retorno do vendedor no período estiver dentro de uma faixa configurada,
          o desconto correspondente é aplicado sobre a comissão bruta calculada.
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100" />)}</div>
      ) : rules.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-16">
          <ArrowLeftRight size={36} strokeWidth={1} className="text-gray-300" />
          <p className="mt-3 text-sm font-medium text-gray-500">Nenhuma regra de retorno configurada</p>
          <button onClick={openModal} className="btn-primary mt-4 text-xs"><Plus size={13} />Criar regra</button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Nome','% Informado','% Aplicado','Banco','Status','Ações'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rules.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{r.name}</td>
                  <td className="px-4 py-3 tabular-nums text-gray-600">{Number(r.percentualInformado)}%</td>
                  <td className="px-4 py-3 tabular-nums font-semibold text-red-600">{Number(r.percentualAplicado)}%</td>
                  <td className="px-4 py-3 text-gray-600">{r.bank ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', r.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                      {r.active ? 'Ativa' : 'Inativa'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><Edit2 size={13} /></button>
                      <button className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modal ───────────────────────────────────────────────────────── */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={closeModal}>
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Nova regra de retorno</h2>
              <button onClick={closeModal} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                <X size={16} />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label className="label">Nome *</label>
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex.: Faixa 1 — Banco X"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">% Informado</label>
                  <input
                    className="input"
                    value={form.percentualInformado}
                    onChange={(e) => setForm({ ...form, percentualInformado: e.target.value })}
                    placeholder="Ex.: 1,5"
                    inputMode="decimal"
                  />
                </div>
                <div>
                  <label className="label">% Aplicado</label>
                  <input
                    className="input"
                    value={form.percentualAplicado}
                    onChange={(e) => setForm({ ...form, percentualAplicado: e.target.value })}
                    placeholder="Ex.: 1,2"
                    inputMode="decimal"
                  />
                </div>
              </div>
              <div>
                <label className="label">Banco</label>
                <input
                  className="input"
                  value={form.bank}
                  onChange={(e) => setForm({ ...form, bank: e.target.value })}
                  placeholder="Ex.: Banco Bradesco"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={closeModal} disabled={saving} className="btn-secondary text-sm">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
                {saving ? <><Loader2 size={14} className="animate-spin" />Salvando...</> : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
