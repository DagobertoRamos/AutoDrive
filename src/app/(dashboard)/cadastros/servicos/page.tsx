'use client'

// =============================================================================
// Cadastro de Serviços — AutoDrive
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Wrench, X, Save, CheckCircle, AlertCircle } from 'lucide-react'
import { cn, formatMoney } from '@/lib/utils'
import { maskBRL, parseBRL } from '@/lib/masks'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface Service {
  id: string
  name: string
  category: string
  defaultValue: number
  defaultCommission: number
  active: boolean
  notes: string
}

type ServiceForm = Omit<Service, 'id'>

const emptyForm: ServiceForm = {
  name: '',
  category: '',
  defaultValue: 0,
  defaultCommission: 0,
  active: true,
  notes: '',
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function inputClass(extra?: string) {
  return cn(
    'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500',
    extra
  )
}

function ToggleRow({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2',
          checked ? 'bg-brand-600' : 'bg-gray-200'
        )}
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
  onSave: (data: ServiceForm) => Promise<void>
  initial?: Service | null
  saving: boolean
  error: string | null
}) {
  const [form, setForm] = useState<ServiceForm>(emptyForm)

  useEffect(() => {
    if (open) {
      setForm(initial ? { ...initial } : { ...emptyForm })
    }
  }, [open, initial])

  if (!open) return null

  const set = <K extends keyof ServiceForm>(key: K, value: ServiceForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 z-10">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50">
              <Wrench className="h-5 w-5 text-brand-700" />
            </div>
            <h2 className="text-base font-semibold text-gray-900">
              {initial ? 'Editar Serviço' : 'Novo Serviço'}
            </h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); onSave(form) }}
          className="px-6 py-5 space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Nome do serviço *</label>
              <input required className={inputClass()} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Revisão completa" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Categoria</label>
              <input className={inputClass()} value={form.category} onChange={(e) => set('category', e.target.value)} placeholder="Ex: Manutenção, Estética, Documentação..." />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Valor padrão (R$)</label>
              <input
                type="text"
                inputMode="numeric"
                className={inputClass()}
                value={maskBRL(form.defaultValue ? Math.round(form.defaultValue * 100).toString() : '')}
                onChange={(e) => set('defaultValue', parseBRL(maskBRL(e.target.value)) ?? 0)}
                placeholder="0,00"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Comissão padrão (R$)</label>
              <input
                type="text"
                inputMode="numeric"
                className={inputClass()}
                value={maskBRL(form.defaultCommission ? Math.round(form.defaultCommission * 100).toString() : '')}
                onChange={(e) => set('defaultCommission', parseBRL(maskBRL(e.target.value)) ?? 0)}
                placeholder="0,00"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Observações</label>
              <textarea
                rows={3}
                className={inputClass('resize-none')}
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                placeholder="Informações adicionais sobre o serviço..."
              />
            </div>
          </div>

          <ToggleRow label="Serviço ativo" checked={form.active} onChange={(v) => set('active', v)} />

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-brand-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60 transition-colors"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Salvando...' : 'Salvar'}
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

export default function ServicosPage() {
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Service | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/services')
      const json = await res.json()
      setServices(json?.data ?? [])
    } catch {
      setServices([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const openCreate = () => { setEditing(null); setSaveError(null); setModalOpen(true) }
  const openEdit = (s: Service) => { setEditing(s); setSaveError(null); setModalOpen(true) }

  const handleSave = async (data: ServiceForm) => {
    setSaving(true)
    setSaveError(null)
    try {
      const url = editing ? `/api/services/${editing.id}` : '/api/services'
      const method = editing ? 'PUT' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json?.message ?? 'Erro ao salvar')
      }
      setModalOpen(false)
      setSuccessMsg(editing ? 'Serviço atualizado!' : 'Serviço criado!')
      setTimeout(() => setSuccessMsg(null), 3000)
      await fetchData()
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Serviços</h1>
          <p className="mt-1 text-sm text-gray-500">Gerencie os serviços disponíveis para venda.</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-800 transition-colors">
          <Plus className="h-4 w-4" />
          Novo Serviço
        </button>
      </div>

      {successMsg && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
          <CheckCircle className="h-4 w-4" />
          {successMsg}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                {['Nome', 'Categoria', 'Valor Padrão', 'Comissão', 'Status', 'Ações'].map((h) => (
                  <th key={h} className="px-4 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>
                    ))}
                  </tr>
                ))
              ) : services.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-sm text-gray-400">
                    Nenhum serviço cadastrado.{' '}
                    <button onClick={openCreate} className="text-brand-600 hover:underline">Criar agora</button>
                  </td>
                </tr>
              ) : (
                services.map((s) => (
                  <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-100">
                          <Wrench className="h-3.5 w-3.5 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{s.name}</p>
                          {s.notes && <p className="max-w-xs truncate text-xs text-gray-400">{s.notes}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{s.category || '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{formatMoney(s.defaultValue)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-green-700">{formatMoney(s.defaultCommission)}</td>
                    <td className="px-4 py-3">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', s.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                        {s.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => openEdit(s)} className="rounded-lg p-1.5 text-gray-400 hover:bg-brand-50 hover:text-brand-700 transition-colors" title="Editar">
                        <Pencil className="h-4 w-4" />
                      </button>
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
