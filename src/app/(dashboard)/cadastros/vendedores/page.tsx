'use client'

// =============================================================================
// Cadastro de Vendedores — AutoDrive
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, User, X, Save, CheckCircle, AlertCircle, KeyRound } from 'lucide-react'
import { cn, formatPhone } from '@/lib/utils'
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

interface Seller {
  id: string
  userId?: string | null
  fullName: string
  shortName: string
  cpf: string
  whatsapp: string
  email: string
  unitId: string
  unitName?: string
  cargo: string
  positionId: string | null
  position?: { id: string; name: string; slug: string } | null
  active: boolean
  receivesCharge: boolean
}

type SellerForm = Omit<Seller, 'id' | 'unitName' | 'position'>

const emptyForm: SellerForm = {
  fullName: '',
  shortName: '',
  cpf: '',
  whatsapp: '',
  email: '',
  unitId: '',
  cargo: 'VENDEDOR',
  positionId: null,
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
// Editor de módulos por colaborador (override do cargo)
// -----------------------------------------------------------------------------

interface ModFeature { key: string; label: string; tenantDisabled: boolean; enabled: boolean }
interface ModGroup { area: string; features: ModFeature[] }

function ModulesEditor({ userId }: { userId: string }) {
  const [groups, setGroups] = useState<ModGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch(`/api/users/${userId}/modules`, { credentials: 'include' })
        const j = await r.json()
        if (!cancelled && j?.success) setGroups(j.data.groups ?? [])
      } catch { /* noop */ } finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [userId])

  const toggle = (key: string) => setGroups((gs) => gs.map((g) => ({ ...g, features: g.features.map((f) => (f.key === key ? { ...f, enabled: !f.enabled } : f)) })))
  const save = async () => {
    setSaving(true); setMsg(null)
    try {
      const denied = groups.flatMap((g) => g.features).filter((f) => !f.enabled).map((f) => f.key)
      const r = await fetch(`/api/users/${userId}/modules`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ denied }) })
      setMsg(r.ok ? 'Módulos salvos.' : 'Falha ao salvar.')
    } catch { setMsg('Erro de rede.') } finally { setSaving(false); setTimeout(() => setMsg(null), 2500) }
  }

  if (loading) return <p className="text-xs text-gray-400">Carregando módulos…</p>
  if (!groups.length) return <p className="text-xs text-gray-400">Este cargo não dá acesso a módulos configuráveis.</p>
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g.area}>
          <p className="mb-1 text-xs font-semibold text-gray-600">{g.area}</p>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {g.features.map((f) => (
              <label key={f.key} className={cn('flex items-center gap-2 text-sm', f.tenantDisabled && 'opacity-50')}>
                <input type="checkbox" checked={f.enabled} disabled={f.tenantDisabled} onChange={() => toggle(f.key)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                <span className={f.enabled ? 'text-gray-800' : 'text-gray-400 line-through'}>{f.label}{f.tenantDisabled ? ' (desligado p/ loja)' : ''}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={saving} className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60">{saving ? 'Salvando…' : 'Salvar módulos'}</button>
        {msg && <span className={cn('text-xs', /salvos/.test(msg) ? 'text-green-600' : 'text-red-600')}>{msg}</span>}
      </div>
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
  onSave: (data: SellerForm) => Promise<void>
  initial?: Seller | null
  saving: boolean
  error: string | null
  units: Unit[]
  positions: Position[]
}) {
  const [form, setForm] = useState<SellerForm>(emptyForm)

  useEffect(() => {
    if (open) {
      if (initial) {
        const { id: _id, userId: _uid, unitName: _unitName, position: _p, ...rest } = initial
        setForm({ ...rest, positionId: initial.positionId ?? null })
      } else {
        // default: cargo "Vendedor" do sistema
        const defaultPos = positions.find((p) => p.slug === 'vendedor')
        setForm({ ...emptyForm, positionId: defaultPos?.id ?? null })
      }
    }
  }, [open, initial, positions])

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
              {initial ? 'Editar Colaborador' : 'Novo Colaborador'}
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
              <input className={inputClass()} value={maskCPF(form.cpf)} onChange={(e) => set('cpf', maskCPF(e.target.value))} placeholder="000.000.000-00" inputMode="numeric" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">WhatsApp *</label>
              <input required type="tel" className={inputClass()} value={maskPhone(form.whatsapp)} onChange={(e) => set('whatsapp', maskPhone(e.target.value))} placeholder="(11) 99999-9999" inputMode="numeric" />
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
            <Toggle label="Colaborador ativo" checked={form.active} onChange={(v) => set('active', v)} />
            <Toggle label="Recebe cobranças" checked={form.receivesCharge} onChange={(v) => set('receivesCharge', v)} />
          </div>

          {initial?.userId && (
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="mb-2 text-xs font-semibold text-gray-700">Módulos liberados (acesso deste colaborador)</p>
              <p className="-mt-1 mb-2 text-[11px] text-gray-400">Desmarque para remover o acesso. A lista mostra só o que o cargo permite. Salva separadamente.</p>
              <ModulesEditor userId={initial.userId} />
            </div>
          )}

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
  const [positions, setPositions] = useState<Position[]>([])
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
      const [sellersRes, unitsRes, positionsRes] = await Promise.all([
        fetch('/api/sellers'),
        fetch('/api/units'),
        fetch('/api/positions?active=true'),
      ])
      const [sellersJson, unitsJson, positionsJson] = await Promise.all([
        sellersRes.json(),
        unitsRes.json(),
        positionsRes.json(),
      ])
      setSellers(sellersJson?.data ?? [])
      setUnits(unitsJson?.data ?? [])
      setPositions(positionsJson?.data ?? [])
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
          <h1 className="text-2xl font-bold text-gray-900">Colaboradores</h1>
          <p className="mt-1 text-sm text-gray-500">Cadastre colaboradores (vendedor, auxiliar, financeiro, pós-vendas…). O cargo define o acesso.</p>
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
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                        {s.position?.name ?? s.cargo ?? '—'}
                      </span>
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} onSave={handleSave} initial={editing} saving={saving} error={saveError} units={units} positions={positions} />
    </div>
  )
}
