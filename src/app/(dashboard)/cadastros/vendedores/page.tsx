'use client'

// =============================================================================
// Cadastro de Vendedores — AutoDrive
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, User, X, Save, CheckCircle, AlertCircle, KeyRound } from 'lucide-react'
import { cn, formatCPF, formatPhone } from '@/lib/utils'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface Unit {
  id: string
  name: string
}

interface Seller {
  id: string
  fullName: string
  shortName: string
  cpf: string
  whatsapp: string
  email: string
  unitId: string
  unitName?: string
  cargo: string
  active: boolean
  receivesCharge: boolean
}

type SellerForm = Omit<Seller, 'id' | 'unitName'>

const emptyForm: SellerForm = {
  fullName: '',
  shortName: '',
  cpf: '',
  whatsapp: '',
  email: '',
  unitId: '',
  cargo: 'VENDEDOR',
  active: true,
  receivesCharge: true,
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

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
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
  open, onClose, onSave, initial, saving, error, units,
}: {
  open: boolean
  onClose: () => void
  onSave: (data: SellerForm) => Promise<void>
  initial?: Seller | null
  saving: boolean
  error: string | null
  units: Unit[]
}) {
  const [form, setForm] = useState<SellerForm>(emptyForm)

  useEffect(() => {
    if (open) {
      if (initial) {
        const { id: _id, unitName: _unitName, ...rest } = initial
        setForm(rest)
      } else {
        setForm({ ...emptyForm })
      }
    }
  }, [open, initial])

  if (!open) return null

  const set = <K extends keyof SellerForm>(key: K, value: SellerForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 z-10">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50">
              <User className="h-5 w-5 text-brand-700" />
            </div>
            <h2 className="text-base font-semibold text-gray-900">
              {initial ? 'Editar Vendedor' : 'Novo Vendedor'}
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
              <input required className={inputClass()} value={form.fullName} onChange={(e) => set('fullName', e.target.value)} placeholder="João da Silva" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Apelido / Nome curto</label>
              <input className={inputClass()} value={form.shortName} onChange={(e) => set('shortName', e.target.value)} placeholder="João" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">CPF</label>
              <input className={inputClass()} value={form.cpf} onChange={(e) => set('cpf', e.target.value)} placeholder="000.000.000-00" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">WhatsApp *</label>
              <input required type="tel" className={inputClass()} value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} placeholder="(11) 99999-9999" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">E-mail * <span className="font-normal text-gray-400">(usado como login)</span></label>
              <input required type="email" className={inputClass()} value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="vendedor@autodrive.com.br" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Unidade *</label>
              <select required className={inputClass()} value={form.unitId} onChange={(e) => set('unitId', e.target.value)}>
                <option value="">Selecione uma unidade</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Cargo</label>
              <select className={inputClass()} value={form.cargo} onChange={(e) => set('cargo', e.target.value)}>
                <option value="VENDEDOR">Vendedor</option>
                <option value="CONSULTOR">Consultor</option>
                <option value="SUPERVISOR">Supervisor</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Toggle label="Vendedor ativo" checked={form.active} onChange={(v) => set('active', v)} />
            <Toggle label="Recebe cobranças" checked={form.receivesCharge} onChange={(v) => set('receivesCharge', v)} />
          </div>

          {!initial && (
            <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs text-blue-700">
              <KeyRound className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                Um acesso ao sistema será criado automaticamente.{' '}
                <strong>Login:</strong> e-mail &nbsp;|&nbsp; <strong>Senha inicial:</strong> CPF (sem pontuação) ou dígitos do WhatsApp
              </span>
            </div>
          )}

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

export default function VendedoresPage() {
  const [sellers, setSellers] = useState<Seller[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Seller | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [createdCredentials, setCreatedCredentials] = useState<{
    email: string
    passwordHint: string
  } | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [sellersRes, unitsRes] = await Promise.all([
        fetch('/api/sellers'),
        fetch('/api/units'),
      ])
      const [sellersJson, unitsJson] = await Promise.all([sellersRes.json(), unitsRes.json()])
      setSellers(sellersJson?.data ?? [])
      setUnits(unitsJson?.data ?? [])
    } catch {
      setSellers([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const openCreate = () => { setEditing(null); setSaveError(null); setModalOpen(true) }
  const openEdit = (s: Seller) => { setEditing(s); setSaveError(null); setModalOpen(true) }

  const handleSave = async (data: SellerForm) => {
    setSaving(true)
    setSaveError(null)
    try {
      const url    = editing ? `/api/sellers/${editing.id}` : '/api/sellers'
      const method = editing ? 'PATCH' : 'POST'
      const res  = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json?.error ?? 'Erro ao salvar.')
      }
      setModalOpen(false)
      if (!editing && json.userCreated) {
        setCreatedCredentials({
          email:        data.email,
          passwordHint: json.initialPasswordHint ?? 'CPF sem pontuação',
        })
      }
      setSuccessMsg(editing ? 'Vendedor atualizado com sucesso!' : 'Vendedor cadastrado com sucesso!')
      setTimeout(() => setSuccessMsg(null), 8000)
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
          <h1 className="text-2xl font-bold text-gray-900">Vendedores</h1>
          <p className="mt-1 text-sm text-gray-500">Gerencie os vendedores cadastrados no sistema.</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-800 transition-colors">
          <Plus className="h-4 w-4" />
          Novo Vendedor
        </button>
      </div>

      {successMsg && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm font-medium text-emerald-700">
          <CheckCircle className="h-4 w-4 shrink-0" />
          {successMsg}
        </div>
      )}

      {createdCredentials && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-amber-700 shrink-0" />
            <p className="text-sm font-semibold text-amber-800">Acesso criado para o vendedor</p>
            <button
              onClick={() => setCreatedCredentials(null)}
              className="ml-auto text-amber-500 hover:text-amber-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-amber-200 bg-white px-3 py-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-amber-600">Login (e-mail)</p>
              <p className="mt-0.5 font-mono text-sm text-gray-800">{createdCredentials.email}</p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-white px-3 py-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-amber-600">Senha inicial</p>
              <p className="mt-0.5 font-mono text-sm text-gray-800">{createdCredentials.passwordHint}</p>
            </div>
          </div>
          <p className="text-xs text-amber-700">
            ⚠️ O vendedor deverá trocar a senha no primeiro acesso. Compartilhe essas credenciais com segurança.
          </p>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                {['Nome', 'WhatsApp', 'Loja', 'Cargo', 'Status', 'Cobrança', 'Ações'].map((h) => (
                  <th key={h} className="px-4 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>
                    ))}
                  </tr>
                ))
              ) : sellers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-sm text-gray-400">
                    Nenhum vendedor cadastrado.{' '}
                    <button onClick={openCreate} className="text-brand-600 hover:underline">Adicionar agora</button>
                  </td>
                </tr>
              ) : (
                sellers.map((s) => (
                  <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                          {s.fullName.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{s.fullName}</p>
                          {s.shortName && <p className="text-xs text-gray-400">{s.shortName}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{s.whatsapp ? formatPhone(s.whatsapp) : '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{s.unitName || units.find((u) => u.id === s.unitId)?.name || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">{s.cargo}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', s.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                        {s.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', s.receivesCharge ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-400')}>
                        {s.receivesCharge ? 'Sim' : 'Não'}
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} onSave={handleSave} initial={editing} saving={saving} error={saveError} units={units} />
    </div>
  )
}
