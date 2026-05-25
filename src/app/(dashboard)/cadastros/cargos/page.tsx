'use client'

// =============================================================================
// Cadastro de Cargos — EasyCar
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  Plus, Pencil, Trash2, Briefcase, X, Save, CheckCircle, AlertCircle, ShieldCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { canAccessModule, ROLE_LABELS, type UserRole } from '@/lib/permissions'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface Position {
  id:          string
  tenantId:    string | null
  name:        string
  slug:        string
  description: string | null
  baseRole:    UserRole | null
  isSystem:    boolean
  active:      boolean
  sortOrder:   number
}

type PositionForm = {
  name:        string
  description: string
  baseRole:    UserRole | ''
  sortOrder:   number
  active:      boolean
}

const EMPTY_FORM: PositionForm = {
  name:        '',
  description: '',
  baseRole:    '',
  sortOrder:   0,
  active:      true,
}

const ROLE_OPTIONS: UserRole[] = [
  'MASTER',
  'ADM',
  'GERENTE_GERAL',
  'GERENTE',
  'VENDEDOR_LIDER',
  'VENDEDOR',
  'USUARIO_LIDER',
  'USUARIO',
]

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function inputClass(extra?: string) {
  return cn(
    'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500',
    extra,
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
          checked ? 'bg-brand-600' : 'bg-gray-200',
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
  open:    boolean
  onClose: () => void
  onSave:  (data: PositionForm) => Promise<void>
  initial?: Position | null
  saving:  boolean
  error:   string | null
}) {
  const [form, setForm] = useState<PositionForm>(EMPTY_FORM)

  useEffect(() => {
    if (open) {
      setForm(
        initial
          ? {
              name:        initial.name,
              description: initial.description ?? '',
              baseRole:    initial.baseRole ?? '',
              sortOrder:   initial.sortOrder,
              active:      initial.active,
            }
          : { ...EMPTY_FORM },
      )
    }
  }, [open, initial])

  if (!open) return null

  const set = <K extends keyof PositionForm>(key: K, value: PositionForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 z-10">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50">
              <Briefcase className="h-5 w-5 text-brand-700" />
            </div>
            <h2 className="text-base font-semibold text-gray-900">
              {initial ? 'Editar Cargo' : 'Novo Cargo'}
            </h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); onSave(form) }} className="px-6 py-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Nome do cargo *</label>
              <input required className={inputClass()} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex: Vendedor Sênior" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Descrição</label>
              <textarea
                rows={2}
                className={inputClass('resize-none')}
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder="Descreva as responsabilidades..."
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Role base (sistema)</label>
              <select
                className={inputClass()}
                value={form.baseRole}
                onChange={(e) => set('baseRole', e.target.value as UserRole | '')}
              >
                <option value="">— Nenhum —</option>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Ordem</label>
              <input
                type="number"
                min={0}
                className={inputClass()}
                value={form.sortOrder}
                onChange={(e) => set('sortOrder', Number(e.target.value) || 0)}
              />
            </div>
          </div>

          <ToggleRow label="Cargo ativo" checked={form.active} onChange={(v) => set('active', v)} />

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

export default function CargosPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const role = (session?.user?.role as UserRole | undefined) ?? undefined

  const [positions, setPositions]   = useState<Position[]>([])
  const [loading, setLoading]       = useState(true)
  const [modalOpen, setModalOpen]   = useState(false)
  const [editing, setEditing]       = useState<Position | null>(null)
  const [saving, setSaving]         = useState(false)
  const [saveError, setSaveError]   = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [listError, setListError]   = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setListError(null)
    try {
      const res  = await fetch('/api/positions', { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? 'Erro ao carregar cargos')
      setPositions(json?.data ?? [])
    } catch (err: unknown) {
      setListError(err instanceof Error ? err.message : 'Erro ao carregar')
      setPositions([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (status === 'authenticated') {
      if (!canAccessModule(role, 'registrations.positions')) {
        router.replace('/inicio')
        return
      }
      fetchData()
    }
  }, [status, role, router, fetchData])

  if (status === 'loading') {
    return <div className="p-8 text-sm text-gray-500">Carregando...</div>
  }
  if (status === 'authenticated' && !canAccessModule(role, 'registrations.positions')) {
    return <div className="p-8 text-sm text-gray-500">Sem acesso a este módulo.</div>
  }

  const openCreate = () => { setEditing(null); setSaveError(null); setModalOpen(true) }
  const openEdit   = (p: Position) => { setEditing(p); setSaveError(null); setModalOpen(true) }

  const handleSave = async (data: PositionForm) => {
    setSaving(true)
    setSaveError(null)
    try {
      const url    = editing ? `/api/positions/${editing.id}` : '/api/positions'
      const method = editing ? 'PATCH' : 'POST'
      const payload = {
        name:        data.name,
        description: data.description || null,
        baseRole:    data.baseRole || null,
        sortOrder:   data.sortOrder,
        active:      data.active,
      }
      const res  = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? 'Erro ao salvar')
      setModalOpen(false)
      setSuccessMsg(editing ? 'Cargo atualizado!' : 'Cargo criado!')
      setTimeout(() => setSuccessMsg(null), 3000)
      await fetchData()
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (p: Position) => {
    if (!confirm(`Excluir o cargo "${p.name}"?`)) return
    try {
      const res  = await fetch(`/api/positions/${p.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? 'Erro ao excluir')
      setSuccessMsg('Cargo excluído!')
      setTimeout(() => setSuccessMsg(null), 3000)
      await fetchData()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao excluir')
    }
  }

  const handleToggleActive = async (p: Position) => {
    try {
      const res = await fetch(`/api/positions/${p.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ active: !p.active }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? 'Erro ao atualizar')
      await fetchData()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao atualizar')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cargos</h1>
          <p className="mt-1 text-sm text-gray-500">Gerencie os cargos do time e vincule-os às regras de comissão.</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-800 transition-colors">
          <Plus className="h-4 w-4" />
          Novo cargo
        </button>
      </div>

      {successMsg && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
          <CheckCircle className="h-4 w-4" />
          {successMsg}
        </div>
      )}

      {listError && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          <AlertCircle className="h-4 w-4" />
          {listError}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                {['Nome', 'Descrição', 'Role base', 'Origem', 'Status', 'Ações'].map((h) => (
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
              ) : positions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-sm text-gray-400">
                    Nenhum cargo cadastrado.{' '}
                    <button onClick={openCreate} className="text-brand-600 hover:underline">Criar agora</button>
                  </td>
                </tr>
              ) : (
                positions.map((p) => (
                  <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-100">
                          <Briefcase className="h-3.5 w-3.5 text-brand-700" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{p.name}</p>
                          <p className="text-xs text-gray-400">{p.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-xs">
                      <span className="block truncate">{p.description || '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {p.baseRole ? ROLE_LABELS[p.baseRole] : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {p.isSystem ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                          <ShieldCheck className="h-3 w-3" />
                          Sistema
                        </span>
                      ) : (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                          Personalizado
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggleActive(p)}
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-medium transition-colors',
                          p.active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
                        )}
                        title="Clique para alternar"
                      >
                        {p.active ? 'Ativo' : 'Inativo'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button
                          onClick={() => openEdit(p)}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-brand-50 hover:text-brand-700 transition-colors"
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(p)}
                          disabled={p.isSystem}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400"
                          title={p.isSystem ? 'Cargo do sistema — não pode ser excluído' : 'Excluir'}
                        >
                          <Trash2 className="h-4 w-4" />
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
