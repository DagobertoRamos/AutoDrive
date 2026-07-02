'use client'

// =============================================================================
// Cadastro de Unidades — AutoDrive
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Building2, X, Save, CheckCircle, AlertCircle, Coins, Trophy } from 'lucide-react'
import { cn, formatCNPJ } from '@/lib/utils'
import { maskCNPJ, maskPhone } from '@/lib/masks'
import { ROLE_LABELS } from '@/lib/permissions'

// Cargos que podem receber comissão (para a chave da unidade). ADM incluído:
// ADM também pode vender (em qualquer unidade) e receber comissão.
const COMMISSION_ROLES = ['ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE', 'VENDEDOR_LIDER', 'VENDEDOR', 'FINANCEIRO'] as const

interface CommissionCfg { enabled: boolean; roles: string[] }

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface Unit {
  id: string
  name: string
  razaoSocial: string
  cnpj: string
  address: string
  city: string
  state: string
  phone: string
  email: string
  responsavel: string
  active: boolean
}

type UnitForm = Omit<Unit, 'id'>

const emptyForm: UnitForm = {
  name: '',
  razaoSocial: '',
  cnpj: '',
  address: '',
  city: '',
  state: '',
  phone: '',
  email: '',
  responsavel: '',
  active: true,
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function inputClass(extra?: string) {
  return cn(
    'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-500',
    extra
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
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
  )
}

// -----------------------------------------------------------------------------
// Modal
// -----------------------------------------------------------------------------

interface ModalProps {
  open: boolean
  onClose: () => void
  onSave: (data: UnitForm, commission: CommissionCfg, rankingParticipates: boolean) => Promise<void>
  initial?: Unit | null
  saving: boolean
  error: string | null
}

function Modal({ open, onClose, onSave, initial, saving, error }: ModalProps) {
  const [form, setForm] = useState<UnitForm>(emptyForm)
  const [commEnabled, setCommEnabled] = useState(true)
  const [commRoles, setCommRoles] = useState<string[]>([])
  const [rankingOn, setRankingOn] = useState(true)

  useEffect(() => {
    if (!open) return
    // A API devolve null em campos opcionais; sem coerção, maskCNPJ/maskPhone
    // fazem null.replace(...) e o modal quebra (ex.: unidade sem telefone).
    setForm(initial ? {
      name:        initial.name        ?? '',
      razaoSocial: initial.razaoSocial ?? '',
      cnpj:        initial.cnpj         ?? '',
      address:     initial.address      ?? '',
      city:        initial.city         ?? '',
      state:       initial.state        ?? '',
      phone:       initial.phone        ?? '',
      email:       initial.email        ?? '',
      responsavel: initial.responsavel  ?? '',
      active:      initial.active        ?? true,
    } : { ...emptyForm })
    // Carrega a config de comissão da unidade (só quando editando; nova = padrão).
    if (initial?.id) {
      setCommEnabled(true); setCommRoles([]); setRankingOn(true)
      fetch(`/api/units/${initial.id}/commission`, { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { if (j?.data) { setCommEnabled(j.data.enabled !== false); setCommRoles(Array.isArray(j.data.roles) ? j.data.roles : []) } })
        .catch(() => {})
      // Participação da unidade no ranking (default: participa).
      fetch('/api/ranking/participation', { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { if (j?.success && Array.isArray(j.excludedUnits)) setRankingOn(!j.excludedUnits.includes(initial.id)) })
        .catch(() => {})
    } else {
      setCommEnabled(true); setCommRoles([]); setRankingOn(true)
    }
  }, [open, initial])

  if (!open) return null

  const set = <K extends keyof UnitForm>(key: K, value: UnitForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const toggleRole = (role: string) => {
    setCommRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(form, { enabled: commEnabled, roles: commEnabled ? commRoles : [] }, rankingOn)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Dialog */}
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 z-10">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50">
              <Building2 className="h-5 w-5 text-brand-700" />
            </div>
            <h2 className="text-base font-semibold text-gray-900">
              {initial ? 'Editar Unidade' : 'Nova Unidade'}
            </h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Nome fantasia *</label>
              <input required className={inputClass()} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="AutoDrive Centro" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Razão social</label>
              <input className={inputClass()} value={form.razaoSocial} onChange={(e) => set('razaoSocial', e.target.value)} placeholder="AutoDrive Comércio Ltda." />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">CNPJ</label>
              <input className={inputClass()} value={maskCNPJ(form.cnpj)} onChange={(e) => set('cnpj', maskCNPJ(e.target.value))} placeholder="00.000.000/0001-00" inputMode="numeric" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Telefone</label>
              <input type="tel" className={inputClass()} value={maskPhone(form.phone)} onChange={(e) => set('phone', maskPhone(e.target.value))} placeholder="(11) 3000-0000" inputMode="numeric" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Endereço</label>
              <input className={inputClass()} value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Rua das Flores, 123" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Cidade</label>
              <input className={inputClass()} value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="São Paulo" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Estado (UF)</label>
              <input maxLength={2} className={inputClass()} value={form.state} onChange={(e) => set('state', e.target.value.toUpperCase())} placeholder="SP" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">E-mail</label>
              <input type="email" className={inputClass()} value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="unidade@autodrive.com.br" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Responsável</label>
              <input className={inputClass()} value={form.responsavel} onChange={(e) => set('responsavel', e.target.value)} placeholder="Nome do responsável" />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <span className="text-sm font-medium text-gray-700">Unidade ativa</span>
            <Toggle checked={form.active} onChange={(v) => set('active', v)} />
          </div>

          {/* ── Comissões da unidade ─────────────────────────────────────── */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Coins className="h-4 w-4 text-amber-500" />
                Comissões nesta unidade
              </span>
              <Toggle checked={commEnabled} onChange={setCommEnabled} />
            </div>
            {commEnabled ? (
              <div>
                <p className="mb-2 text-xs text-gray-500">Selecione os <b>cargos que recebem comissão</b> nesta unidade (o gerente vende, mas a comissão dele segue as regras do cargo dele).</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {COMMISSION_ROLES.map((role) => (
                    <label key={role} className={cn('flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs', commRoles.includes(role) ? 'border-brand-300 bg-brand-50 text-brand-800' : 'border-gray-200 bg-white text-gray-600')}>
                      <input type="checkbox" checked={commRoles.includes(role)} onChange={() => toggleRole(role)} className="rounded" />
                      {ROLE_LABELS[role] ?? role}
                    </label>
                  ))}
                </div>
                {commRoles.length === 0 && (
                  <p className="mt-2 text-xs text-amber-600">Nenhum cargo marcado = <b>todos os cargos elegíveis</b> recebem. Marque para restringir.</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-red-600">Comissões <b>desligadas</b>: nenhum vendedor ou gerente recebe comissão nesta unidade (ex.: galpão).</p>
            )}
          </div>

          {/* ── Ranking da unidade ───────────────────────────────────────── */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Trophy className="h-4 w-4 text-amber-500" />
                Unidade participa do ranking
              </span>
              <Toggle checked={rankingOn} onChange={setRankingOn} />
            </div>
            <p className="text-xs text-gray-500">
              {rankingOn
                ? 'As negociações e atendimentos desta unidade contam para o ranking geral e da unidade.'
                : 'Fora do ranking: as negociações desta unidade não pontuam para ninguém e os colaboradores lotados nela não aparecem no ranking.'}
            </p>
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

export default function UnidadesPage() {
  const [units, setUnits] = useState<Unit[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Unit | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const fetchUnits = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/units')
      const json = await res.json()
      setUnits(json?.data ?? [])
    } catch {
      setUnits([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUnits()
  }, [fetchUnits])

  const openCreate = () => {
    setEditing(null)
    setSaveError(null)
    setModalOpen(true)
  }

  const openEdit = (unit: Unit) => {
    setEditing(unit)
    setSaveError(null)
    setModalOpen(true)
  }

  const handleSave = async (data: UnitForm, commission: CommissionCfg, rankingParticipates: boolean) => {
    setSaving(true)
    setSaveError(null)
    try {
      const url = editing ? `/api/units/${editing.id}` : '/api/units'
      const method = editing ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error ?? json?.message ?? 'Erro ao salvar unidade')
      }
      // Salva a chave de comissão da unidade (recém-criada ou editada).
      const saved = await res.json().catch(() => ({}))
      const unitId = editing ? editing.id : saved?.data?.id
      if (unitId) {
        await fetch(`/api/units/${unitId}/commission`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(commission),
        }).catch(() => {})
        // Participação da unidade no ranking (default: participa).
        await fetch('/api/ranking/participation', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ unitId, participates: rankingParticipates }),
        }).catch(() => {})
      }
      setModalOpen(false)
      setSuccessMsg(editing ? 'Unidade atualizada com sucesso!' : 'Unidade criada com sucesso!')
      setTimeout(() => setSuccessMsg(null), 3000)
      await fetchUnits()
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Unidades</h1>
          <p className="mt-1 text-sm text-gray-500">Gerencie as lojas e filiais do sistema.</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-800 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nova Unidade
        </button>
      </div>

      {successMsg && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
          <CheckCircle className="h-4 w-4" />
          {successMsg}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                {['Nome', 'CNPJ', 'Cidade / UF', 'Responsável', 'Status', 'Ações'].map((h) => (
                  <th key={h} className="px-4 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 animate-pulse rounded bg-gray-200" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : units.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-sm text-gray-400">
                    Nenhuma unidade cadastrada.{' '}
                    <button onClick={openCreate} className="text-brand-600 hover:underline">Criar agora</button>
                  </td>
                </tr>
              ) : (
                units.map((unit) => (
                  <tr key={unit.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-xs font-bold text-brand-700">
                          {unit.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{unit.name}</p>
                          {unit.razaoSocial && <p className="text-xs text-gray-400">{unit.razaoSocial}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{unit.cnpj ? formatCNPJ(unit.cnpj) : '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{[unit.city, unit.state].filter(Boolean).join(' / ') || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{unit.responsavel || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', unit.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                        {unit.active ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => openEdit(unit)}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-brand-50 hover:text-brand-700 transition-colors"
                        title="Editar"
                      >
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

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        initial={editing}
        saving={saving}
        error={saveError}
      />
    </div>
  )
}
