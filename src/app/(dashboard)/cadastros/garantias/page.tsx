'use client'

// =============================================================================
// Cadastro de Garantias — AutoDrive
// Form rico: valor cheio/reduzido + adicional prêmio/luxo + comissões fixas.
// Consome /api/warranties (POST) e /api/warranties/[id] (PATCH/DELETE).
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Shield, X, Save, CheckCircle, AlertCircle, Power } from 'lucide-react'
import { cn, formatMoney } from '@/lib/utils'
import { maskBRL, parseBRL } from '@/lib/masks'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface Warranty {
  id:                          string
  name:                        string
  provider:                    string | null
  coverageType:                string | null
  durationYears:               1 | 2
  fullPrice:                   number | string
  reducedPrice:                number | string
  hasPremiumAddon:             boolean
  premiumAddonName:            string | null
  premiumAddonValue:           number | string
  reducedSaleCommissionValue:  number | string
  fullSaleCommissionValue:     number | string
  premiumAddonCommissionValue: number | string
  active:                      boolean
  notes:                       string | null
}

interface WarrantyForm {
  name:                        string
  provider:                    string
  coverageType:                string
  durationYears:               1 | 2
  fullPrice:                   number
  reducedPrice:                number
  hasPremiumAddon:             boolean
  premiumAddonName:            string
  premiumAddonValue:           number
  reducedSaleCommissionValue:  number
  fullSaleCommissionValue:     number
  premiumAddonCommissionValue: number
  active:                      boolean
  notes:                       string
}

const num = (v: unknown): number => (v == null ? 0 : Number(v) || 0)

const emptyForm: WarrantyForm = {
  name: '', provider: '', coverageType: '',
  durationYears: 1,
  fullPrice: 0, reducedPrice: 0,
  hasPremiumAddon: false, premiumAddonName: '', premiumAddonValue: 0,
  reducedSaleCommissionValue: 0, fullSaleCommissionValue: 0, premiumAddonCommissionValue: 0,
  active: true, notes: '',
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function inputClass(extra?: string) {
  return cn(
    'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500',
    extra,
  )
}

function MoneyField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-gray-700">{label}</label>
      <input
        type="text" inputMode="numeric" className={inputClass()}
        value={maskBRL(value ? Math.round(value * 100).toString() : '')}
        onChange={(e) => onChange(parseBRL(maskBRL(e.target.value)) ?? 0)}
        placeholder="0,00"
      />
    </div>
  )
}

function ToggleRow({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <button
        type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={cn('relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2', checked ? 'bg-brand-600' : 'bg-gray-200')}
      >
        <span className={cn('inline-block h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-6' : 'translate-x-1')} />
      </button>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Modal
// -----------------------------------------------------------------------------

function Modal({
  open, onClose, onSave, initial, saving, error,
}: {
  open: boolean
  onClose: () => void
  onSave: (data: WarrantyForm) => Promise<void>
  initial?: Warranty | null
  saving: boolean
  error: string | null
}) {
  const [form, setForm] = useState<WarrantyForm>(emptyForm)

  useEffect(() => {
    if (!open) return
    if (initial) {
      setForm({
        name: initial.name, provider: initial.provider ?? '', coverageType: initial.coverageType ?? '',
        durationYears: initial.durationYears === 2 ? 2 : 1,
        fullPrice: num(initial.fullPrice), reducedPrice: num(initial.reducedPrice),
        hasPremiumAddon: initial.hasPremiumAddon,
        premiumAddonName: initial.premiumAddonName ?? '', premiumAddonValue: num(initial.premiumAddonValue),
        reducedSaleCommissionValue: num(initial.reducedSaleCommissionValue),
        fullSaleCommissionValue: num(initial.fullSaleCommissionValue),
        premiumAddonCommissionValue: num(initial.premiumAddonCommissionValue),
        active: initial.active, notes: initial.notes ?? '',
      })
    } else {
      setForm({ ...emptyForm })
    }
  }, [open, initial])

  if (!open) return null

  const set = <K extends keyof WarrantyForm>(key: K, value: WarrantyForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50">
              <Shield className="h-5 w-5 text-brand-700" />
            </div>
            <h2 className="text-base font-semibold text-gray-900">{initial ? 'Editar Garantia' : 'Nova Garantia'}</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); onSave(form) }} className="space-y-4 px-6 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Nome da garantia *</label>
              <input required className={inputClass()} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Garantia Excelente" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Tempo *</label>
              <select className={inputClass()} value={form.durationYears} onChange={(e) => set('durationYears', Number(e.target.value) === 2 ? 2 : 1)}>
                <option value={1}>01 ano</option>
                <option value={2}>02 anos</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Descrição / cobertura</label>
              <input className={inputClass()} value={form.coverageType} onChange={(e) => set('coverageType', e.target.value)} placeholder="Ex: 150 itens" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Fornecedor / Seguradora</label>
              <input className={inputClass()} value={form.provider} onChange={(e) => set('provider', e.target.value)} placeholder="Nome do fornecedor" />
            </div>

            <MoneyField label="Valor cheio (R$) *" value={form.fullPrice} onChange={(v) => set('fullPrice', v)} />
            <MoneyField label="Valor com desconto (R$) *" value={form.reducedPrice} onChange={(v) => set('reducedPrice', v)} />
            <MoneyField label="Comissão valor cheio (R$)" value={form.fullSaleCommissionValue} onChange={(v) => set('fullSaleCommissionValue', v)} />
            <MoneyField label="Comissão valor com desconto (R$)" value={form.reducedSaleCommissionValue} onChange={(v) => set('reducedSaleCommissionValue', v)} />
          </div>

          {/* Adicional prêmio/luxo */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
            <ToggleRow label="Possui adicional prêmio/luxo?" checked={form.hasPremiumAddon} onChange={(v) => set('hasPremiumAddon', v)} />
            {form.hasPremiumAddon && (
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">Nome do adicional *</label>
                  <input className={inputClass()} value={form.premiumAddonName} onChange={(e) => set('premiumAddonName', e.target.value)} placeholder="Prêmio/Luxo" />
                </div>
                <MoneyField label="Valor adicional (R$) *" value={form.premiumAddonValue} onChange={(v) => set('premiumAddonValue', v)} />
                <MoneyField label="Comissão adicional (R$)" value={form.premiumAddonCommissionValue} onChange={(v) => set('premiumAddonCommissionValue', v)} />
              </div>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-700">Observações</label>
            <textarea rows={2} className={inputClass('resize-none')} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Condições, vigência..." />
          </div>

          <ToggleRow label="Garantia ativa" checked={form.active} onChange={(v) => set('active', v)} />

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />{error}
            </div>
          )}

          <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-lg bg-brand-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60">
              <Save className="h-4 w-4" />{saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Main page
// -----------------------------------------------------------------------------

export default function GarantiasPage() {
  const [warranties, setWarranties] = useState<Warranty[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Warranty | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 3000) }

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/warranties', { credentials: 'include' })
      const json = await res.json()
      setWarranties(json?.data ?? [])
    } catch { setWarranties([]) } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const openCreate = () => { setEditing(null); setSaveError(null); setModalOpen(true) }
  const openEdit = (w: Warranty) => { setEditing(w); setSaveError(null); setModalOpen(true) }

  const handleSave = async (data: WarrantyForm) => {
    setSaving(true); setSaveError(null)
    try {
      const url = editing ? `/api/warranties/${editing.id}` : '/api/warranties'
      const method = editing ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(data) })
      if (!res.ok) throw new Error((await res.json())?.error ?? 'Erro ao salvar')
      setModalOpen(false)
      flash(editing ? 'Garantia atualizada!' : 'Garantia criada!')
      await fetchData()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Erro ao salvar.')
    } finally { setSaving(false) }
  }

  const toggleActive = async (w: Warranty) => {
    try {
      if (w.active) {
        if (!confirm(`Inativar a garantia "${w.name}"?`)) return
        const res = await fetch(`/api/warranties/${w.id}`, { method: 'DELETE', credentials: 'include' })
        if (!res.ok) throw new Error()
        flash('Garantia inativada.')
      } else {
        const res = await fetch(`/api/warranties/${w.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ active: true }) })
        if (!res.ok) throw new Error()
        flash('Garantia reativada.')
      }
      await fetchData()
    } catch { flash('Erro ao alterar status.') }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Garantias</h1>
          <p className="mt-1 text-sm text-gray-500">Configure garantias com tempo, valor cheio, valor com desconto e comissões fixas.</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-800">
          <Plus className="h-4 w-4" />Nova Garantia
        </button>
      </div>

      {msg && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
          <CheckCircle className="h-4 w-4" />{msg}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                {['Nome', 'Tempo', 'Valor cheio', 'Valor desconto', 'Comissão cheia', 'Comissão desconto', 'Status', 'Ações'].map((h) => (
                  <th key={h} className="whitespace-nowrap px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>
                    ))}
                  </tr>
                ))
              ) : warranties.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-sm text-gray-400">
                    Nenhuma garantia cadastrada. <button onClick={openCreate} className="text-brand-600 hover:underline">Criar agora</button>
                  </td>
                </tr>
              ) : (
                warranties.map((w) => (
                  <tr key={w.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-green-100">
                          <Shield className="h-3.5 w-3.5 text-green-600" />
                        </div>
                        <p className="font-medium text-gray-900">{w.name}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{w.durationYears === 2 ? '02 anos' : '01 ano'}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{formatMoney(num(w.fullPrice))}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{formatMoney(num(w.reducedPrice))}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{formatMoney(num(w.fullSaleCommissionValue))}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{formatMoney(num(w.reducedSaleCommissionValue))}</td>
                    <td className="px-4 py-3">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', w.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                        {w.active ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(w)} className="rounded-lg p-1.5 text-gray-400 hover:bg-brand-50 hover:text-brand-700" title="Editar">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => toggleActive(w)} className={cn('rounded-lg p-1.5 text-gray-400', w.active ? 'hover:bg-red-50 hover:text-red-600' : 'hover:bg-green-50 hover:text-green-700')} title={w.active ? 'Inativar' : 'Reativar'}>
                          <Power className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} onSave={handleSave} initial={editing} saving={saving} error={saveError} />
    </div>
  )
}
