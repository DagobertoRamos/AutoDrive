'use client'

// =============================================================================
// Cadastro de Gerentes — AutoDrive
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, UserCog, X, Save, CheckCircle, AlertCircle, Bell } from 'lucide-react'
import { cn, formatCPF, formatPhone } from '@/lib/utils'
import { maskCPF, maskPhone } from '@/lib/masks'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface Unit {
  id: string
  name: string
}

interface Position {
  id: string
  name: string
  slug: string
  baseRole?: string | null
}

interface Manager {
  id: string
  fullName: string
  cpf: string
  whatsapp: string
  email: string
  unitId: string
  unitName?: string
  accessProfile: 'GERENTE' | 'ADM'
  positionId: string | null
  position?: { id: string; name: string; slug: string } | null
  active: boolean
  receivesNotifications: boolean
}

type ManagerForm = Omit<Manager, 'id' | 'unitName' | 'position'>

const emptyForm: ManagerForm = {
  fullName: '',
  cpf: '',
  whatsapp: '',
  email: '',
  unitId: '',
  accessProfile: 'GERENTE',
  positionId: null,
  active: true,
  receivesNotifications: true,
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
  open, onClose, onSave, initial, saving, error, units, positions,
}: {
  open: boolean
  onClose: () => void
  onSave: (data: ManagerForm) => Promise<void>
  initial?: Manager | null
  saving: boolean
  error: string | null
  units: Unit[]
  positions: Position[]
}) {
  const [form, setForm] = useState<ManagerForm>(emptyForm)

  useEffect(() => {
    if (open) {
      if (initial) {
        const { id: _id, unitName: _un, position: _p, ...rest } = initial
        setForm({ ...rest, positionId: initial.positionId ?? null })
      } else {
        const defaultPos = positions.find((p) => p.slug === 'gerente')
        setForm({ ...emptyForm, positionId: defaultPos?.id ?? null })
      }
    }
  }, [open, initial, positions])

  if (!open) return null

  const set = <K extends keyof ManagerForm>(key: K, value: ManagerForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 z-10">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50">
              <UserCog className="h-5 w-5 text-brand-700" />
            </div>
            <h2 className="text-base font-semibold text-gray-900">
              {initial ? 'Editar Gerente' : 'Novo Gerente'}
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
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Nome completo *</label>
              <input required className={inputClass()} value={form.fullName} onChange={(e) => set('fullName', e.target.value)} placeholder="Maria Oliveira" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">CPF</label>
              <input className={inputClass()} value={maskCPF(form.cpf)} onChange={(e) => set('cpf', maskCPF(e.target.value))} placeholder="000.000.000-00" inputMode="numeric" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">WhatsApp *</label>
              <input required type="tel" className={inputClass()} value={maskPhone(form.whatsapp)} onChange={(e) => set('whatsapp', maskPhone(e.target.value))} placeholder="(11) 99999-9999" inputMode="numeric" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-gray-700">E-mail</label>
              <input type="email" className={inputClass()} value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="gerente@autodrive.com.br" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Unidade *</label>
              <select required className={inputClass()} value={form.unitId} onChange={(e) => set('unitId', e.target.value)}>
                <option value="">Selecione</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Perfil de acesso</label>
              <select className={inputClass()} value={form.accessProfile} onChange={(e) => set('accessProfile', e.target.value as ManagerForm['accessProfile'])}>
                <option value="GERENTE">Gerente</option>
                <option value="ADM">Administrador</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Cargo</label>
              <select
                className={inputClass()}
                value={form.positionId ?? ''}
                onChange={(e) => set('positionId', e.target.value || null)}
              >
                <option value="">— selecione —</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <ToggleRow label="Gerente ativo" checked={form.active} onChange={(v) => set('active', v)} />
            <ToggleRow label="Recebe notificações" checked={form.receivesNotifications} onChange={(v) => set('receivesNotifications', v)} />
          </div>

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

export default function GerentesPage() {
  const [managers, setManagers] = useState<Manager[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Manager | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [mRes, uRes, pRes] = await Promise.all([
        fetch('/api/managers'),
        fetch('/api/units'),
        fetch('/api/positions?active=true'),
      ])
      const [mJson, uJson, pJson] = await Promise.all([mRes.json(), uRes.json(), pRes.json()])
      setManagers(mJson?.data ?? [])
      setUnits(uJson?.data ?? [])
      setPositions(pJson?.data ?? [])
    } catch {
      setManagers([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const openCreate = () => { setEditing(null); setSaveError(null); setModalOpen(true) }
  const openEdit = (m: Manager) => { setEditing(m); setSaveError(null); setModalOpen(true) }

  const handleSave = async (data: ManagerForm) => {
    setSaving(true)
    setSaveError(null)
    try {
      const url = editing ? `/api/managers/${editing.id}` : '/api/managers'
      const method = editing ? 'PUT' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error ?? json?.message ?? `Erro ao salvar (HTTP ${res.status}).`)
      }
      setModalOpen(false)
      setSuccessMsg(editing ? 'Gerente atualizado!' : 'Gerente criado!')
      setTimeout(() => setSuccessMsg(null), 3000)
      await fetchData()
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  const profileLabel: Record<string, string> = { GERENTE: 'Gerente', ADM: 'Admin' }
  const profileColor: Record<string, string> = {
    GERENTE: 'bg-blue-100 text-blue-700',
    ADM: 'bg-purple-100 text-purple-700',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gerentes</h1>
          <p className="mt-1 text-sm text-gray-500">Gerencie os gerentes e administradores do sistema.</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-800 transition-colors">
          <Plus className="h-4 w-4" />
          Novo Gerente
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
                {['Nome', 'WhatsApp', 'Loja', 'Cargo', 'Status', 'Notif.', 'Perfil', 'Ações'].map((h) => (
                  <th key={h} className="px-4 py-3 whitespace-nowrap">{h}</th>
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
              ) : managers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-sm text-gray-400">
                    Nenhum gerente cadastrado.{' '}
                    <button onClick={openCreate} className="text-brand-600 hover:underline">Adicionar agora</button>
                  </td>
                </tr>
              ) : (
                managers.map((m) => (
                  <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                          {m.fullName.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{m.fullName}</p>
                          {m.cpf && <p className="text-xs text-gray-400">{formatCPF(m.cpf)}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{m.whatsapp ? formatPhone(m.whatsapp) : '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{m.unitName || units.find((u) => u.id === m.unitId)?.name || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                        {m.position?.name ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', m.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                        {m.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span title={m.receivesNotifications ? 'Recebe notificações' : 'Sem notificações'}>
                        <Bell className={cn('h-4 w-4', m.receivesNotifications ? 'text-brand-600' : 'text-gray-300')} />
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', profileColor[m.accessProfile] ?? 'bg-gray-100 text-gray-600')}>
                        {profileLabel[m.accessProfile] ?? m.accessProfile}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => openEdit(m)} className="rounded-lg p-1.5 text-gray-400 hover:bg-brand-50 hover:text-brand-700 transition-colors" title="Editar">
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} onSave={handleSave} initial={editing} saving={saving} error={saveError} units={units} positions={positions} />
    </div>
  )
}
