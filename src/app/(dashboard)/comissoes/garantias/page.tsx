'use client'

// =============================================================================
// Regras de Garantia — AutoDrive
// Descontos por garantias acionadas no período
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Plus, Edit2, Trash2, Shield, X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { maskBRL, parseBRL } from '@/lib/masks'

interface WarrantyRule {
  id:                 string
  name:               string
  warrantyId:         string
  defaultValue:       number | string
  minValue:           number | string
  commissionDefault:  number | string
  commissionDiscount: number | string
  commissionType:     string
  active:             boolean
}

interface WarrantyOption { id: string; name: string }

interface FormState {
  name:               string
  warrantyId:         string
  defaultValue:       string   // mascarado BRL
  minValue:           string   // mascarado BRL
  commissionDefault:  string   // % numérico
  commissionDiscount: string   // % numérico
}

const EMPTY_FORM: FormState = {
  name:               '',
  warrantyId:         '',
  defaultValue:       '',
  minValue:           '',
  commissionDefault:  '',
  commissionDiscount: '',
}

export default function GarantiasComissoesPage() {
  const [rules, setRules]     = useState<WarrantyRule[]>([])
  const [warranties, setWarranties] = useState<WarrantyOption[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen]       = useState(false)
  const [form, setForm]       = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving]   = useState(false)
  const [toast, setToast]     = useState<{ ok: boolean; msg: string } | null>(null)

  const fetchRules = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/commissions/warranty-rules', { credentials: 'include' })
      const data = await res.json()
      if (data.success) setRules(data.data ?? [])
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [])

  const fetchWarranties = useCallback(async () => {
    try {
      const res = await fetch('/api/warranties', { credentials: 'include' })
      const data = await res.json()
      if (data.success) setWarranties(data.data ?? [])
    } catch { /* silent */ }
  }, [])

  useEffect(() => { fetchRules(); fetchWarranties() }, [fetchRules, fetchWarranties])

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
    if (!form.warrantyId) {
      setToast({ ok: false, msg: 'Selecione a garantia.' }); return
    }
    const defaultValue       = parseBRL(form.defaultValue) ?? 0
    const minValue           = parseBRL(form.minValue) ?? 0
    const commissionDefault  = Number(String(form.commissionDefault).replace(',', '.')) || 0
    const commissionDiscount = Number(String(form.commissionDiscount).replace(',', '.')) || 0

    if (commissionDefault <= 0 && commissionDiscount <= 0 && defaultValue <= 0) {
      setToast({ ok: false, msg: 'Informe ao menos um valor numérico.' }); return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/commissions/warranty-rules', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          warrantyId: form.warrantyId,
          defaultValue,
          minValue,
          commissionDefault,
          commissionDiscount,
          commissionType: 'PERCENTUAL',
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
          <h1 className="text-xl font-bold text-gray-900">Regras de Garantia</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Descontos aplicados na comissão com base no número de garantias acionadas no período.
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

      <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-700">
        <p className="font-semibold">Como funciona?</p>
        <p className="mt-1 text-xs text-amber-600">
          Quando o vendedor possui garantias acionadas dentro de uma faixa configurada,
          um percentual de desconto é aplicado sobre a comissão bruta do período.
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100" />)}</div>
      ) : rules.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-16">
          <Shield size={36} strokeWidth={1} className="text-gray-300" />
          <p className="mt-3 text-sm font-medium text-gray-500">Nenhuma regra de garantia configurada</p>
          <button onClick={openModal} className="btn-primary mt-4 text-xs"><Plus size={13} />Criar regra</button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Nome','Valor padrão','Valor mín.','Comissão (%)','Desconto (%)','Status','Ações'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rules.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{r.name}</td>
                  <td className="px-4 py-3 tabular-nums text-gray-600">R$ {maskBRL(String(Math.round(Number(r.defaultValue) * 100)))}</td>
                  <td className="px-4 py-3 tabular-nums text-gray-600">R$ {maskBRL(String(Math.round(Number(r.minValue) * 100)))}</td>
                  <td className="px-4 py-3 tabular-nums text-gray-600">{Number(r.commissionDefault)}%</td>
                  <td className="px-4 py-3 tabular-nums font-semibold text-red-600">-{Number(r.commissionDiscount)}%</td>
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
              <h2 className="text-lg font-bold text-gray-900">Nova regra de garantia</h2>
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
                  placeholder="Ex.: Faixa Premium"
                />
              </div>
              <div>
                <label className="label">Garantia *</label>
                <select
                  className="input"
                  value={form.warrantyId}
                  onChange={(e) => setForm({ ...form, warrantyId: e.target.value })}
                >
                  <option value="">Selecione...</option>
                  {warranties.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Valor padrão</label>
                  <input
                    className="input"
                    value={form.defaultValue}
                    onChange={(e) => setForm({ ...form, defaultValue: maskBRL(e.target.value) })}
                    placeholder="R$ 0,00"
                    inputMode="numeric"
                  />
                </div>
                <div>
                  <label className="label">Valor mínimo</label>
                  <input
                    className="input"
                    value={form.minValue}
                    onChange={(e) => setForm({ ...form, minValue: maskBRL(e.target.value) })}
                    placeholder="R$ 0,00"
                    inputMode="numeric"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Comissão (%)</label>
                  <input
                    className="input"
                    value={form.commissionDefault}
                    onChange={(e) => setForm({ ...form, commissionDefault: e.target.value })}
                    placeholder="Ex.: 5"
                    inputMode="decimal"
                  />
                </div>
                <div>
                  <label className="label">Desconto (%)</label>
                  <input
                    className="input"
                    value={form.commissionDiscount}
                    onChange={(e) => setForm({ ...form, commissionDiscount: e.target.value })}
                    placeholder="Ex.: 2"
                    inputMode="decimal"
                  />
                </div>
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
