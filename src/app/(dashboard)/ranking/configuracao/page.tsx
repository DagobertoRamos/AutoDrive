'use client'

// =============================================================================
// Configurações do Ranking — AutoDrive
// Pesos gerais + participantes por tipo/unidade.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Trophy, Save, RefreshCw, CheckCircle, AlertCircle, RotateCcw, Users, Search, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

interface RuleWeights {
  weightSale:            number
  weightPurchase:        number
  weightReturn:          number
  weightDocumentation:   number
  weightWarranty:        number
  weightService:         number
  weightOverduePendency: number
  weightCanceledSale:    number
  weightLateDocument:    number
}

type WeightKey = keyof RuleWeights
type RankingType = 'GENERAL' | 'UNIT' | 'ATTENDANCE' | 'QUALITY' | 'SALES' | 'CONVERSION' | 'QUEUE' | 'CRM' | 'COMMISSION'

interface UnitOption {
  id: string
  name: string
}

interface TypeOption {
  value: RankingType
  label: string
  unitScoped: boolean
}

interface ParticipantUser {
  id: string
  name: string
  email: string
  role: string
  status: string
  unitId: string | null
  unitName: string | null
  participates: boolean
  explicit: boolean
}

const FIELDS: { key: WeightKey; label: string; hint?: string }[] = [
  { key: 'weightSale',            label: 'Venda / Troca concluída' },
  { key: 'weightPurchase',        label: 'Compra concluída' },
  { key: 'weightReturn',          label: 'Retorno concluído' },
  { key: 'weightDocumentation',   label: 'Documento / despachante concluído' },
  { key: 'weightWarranty',        label: 'Garantia estendida vendida' },
  { key: 'weightService',         label: 'Serviço vendido' },
  { key: 'weightOverduePendency', label: 'Pendência vencida', hint: 'penalização (negativo)' },
  { key: 'weightCanceledSale',    label: 'Venda cancelada', hint: 'penalização (negativo)' },
  { key: 'weightLateDocument',    label: 'Documento atrasado', hint: 'penalização (negativo)' },
]

const DEFAULTS: RuleWeights = {
  weightSale: 100, weightPurchase: 40, weightReturn: 25, weightDocumentation: 20,
  weightWarranty: 30, weightService: 20, weightOverduePendency: -15,
  weightCanceledSale: -50, weightLateDocument: -10,
}

const DEFAULT_TYPES: TypeOption[] = [
  { value: 'GENERAL', label: 'Ranking Geral', unitScoped: false },
  { value: 'UNIT', label: 'Ranking da Unidade', unitScoped: true },
  { value: 'ATTENDANCE', label: 'Ranking de Atendimento', unitScoped: true },
  { value: 'QUALITY', label: 'Ranking de Qualidade', unitScoped: true },
  { value: 'SALES', label: 'Ranking de Vendas', unitScoped: false },
  { value: 'CONVERSION', label: 'Ranking de Conversão', unitScoped: false },
  { value: 'QUEUE', label: 'Ranking da Fila', unitScoped: true },
  { value: 'CRM', label: 'Ranking CRM', unitScoped: false },
  { value: 'COMMISSION', label: 'Ranking de Comissão', unitScoped: false },
]

const num = (v: unknown): number => (v == null ? 0 : Number(v) || 0)

export default function RankingConfigPage() {
  const [name, setName] = useState('Padrão')
  const [weights, setWeights] = useState<RuleWeights>(DEFAULTS)
  const [tiebreakers, setTiebreakers] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [participantsLoading, setParticipantsLoading] = useState(true)
  const [participantsSaving, setParticipantsSaving] = useState(false)
  const [rankingType, setRankingType] = useState<RankingType>('GENERAL')
  const [unitId, setUnitId] = useState('')
  const [units, setUnits] = useState<UnitOption[]>([])
  const [typeOptions, setTypeOptions] = useState<TypeOption[]>(DEFAULT_TYPES)
  const [roleOptions, setRoleOptions] = useState<string[]>([])
  const [roleFilter, setRoleFilter] = useState('')
  const [search, setSearch] = useState('')
  const [includeInactive, setIncludeInactive] = useState(false)
  const [participantUsers, setParticipantUsers] = useState<ParticipantUser[]>([])
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  const flash = (text: string, ok: boolean) => { setMsg({ text, ok }); setTimeout(() => setMsg(null), 3000) }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/ranking/rules', { credentials: 'include' })
      const json = await res.json()
      const d = json?.data ?? {}
      setName(d.name ?? 'Padrão')
      setWeights({
        weightSale: num(d.weightSale), weightPurchase: num(d.weightPurchase),
        weightReturn: num(d.weightReturn), weightDocumentation: num(d.weightDocumentation),
        weightWarranty: num(d.weightWarranty), weightService: num(d.weightService),
        weightOverduePendency: num(d.weightOverduePendency), weightCanceledSale: num(d.weightCanceledSale),
        weightLateDocument: num(d.weightLateDocument),
      })
      setTiebreakers(Array.isArray(d.tiebreakers) ? d.tiebreakers : [])
    } catch {
      flash('Não foi possível carregar a configuração.', false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const set = (key: WeightKey, value: number) => setWeights((prev) => ({ ...prev, [key]: value }))
  const selectedType = typeOptions.find((type) => type.value === rankingType) ?? DEFAULT_TYPES[0]

  const loadParticipants = useCallback(async () => {
    setParticipantsLoading(true)
    try {
      const params = new URLSearchParams({
        rankingType,
        includeInactive: String(includeInactive),
      })
      if (selectedType.unitScoped && unitId) params.set('unitId', unitId)
      if (roleFilter) params.set('role', roleFilter)
      if (search.trim()) params.set('q', search.trim())

      const res = await fetch(`/api/ranking/participants?${params.toString()}`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? 'Erro ao carregar participantes')
      const data = json?.data ?? {}
      const nextUnits = Array.isArray(data.units) ? data.units : []
      setUnits(nextUnits)
      if (Array.isArray(data.types) && data.types.length) setTypeOptions(data.types)
      if (Array.isArray(data.roles)) setRoleOptions(data.roles)
      if (data.unitId && data.unitId !== unitId) setUnitId(data.unitId)
      setParticipantUsers(Array.isArray(data.users) ? data.users : [])
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Não foi possível carregar participantes.', false)
    } finally {
      setParticipantsLoading(false)
    }
  }, [includeInactive, rankingType, roleFilter, search, selectedType.unitScoped, unitId])

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/ranking/rules', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ name, ...weights }),
      })
      if (!res.ok) throw new Error((await res.json())?.error ?? 'Erro ao salvar')
      flash('Pesos do ranking salvos!', true)
      await load()
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Erro ao salvar.', false)
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => { loadParticipants() }, [loadParticipants])

  const toggleParticipant = (id: string, participates: boolean) => {
    setParticipantUsers((prev) => prev.map((user) => user.id === id ? { ...user, participates } : user))
  }

  const setAllParticipants = (participates: boolean) => {
    setParticipantUsers((prev) => prev.map((user) => ({ ...user, participates })))
  }

  const saveParticipants = async () => {
    setParticipantsSaving(true)
    try {
      const res = await fetch('/api/ranking/participants', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          rankingType,
          unitId: selectedType.unitScoped ? unitId : null,
          participants: participantUsers.map((user) => ({ userId: user.id, participates: user.participates })),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? 'Erro ao salvar participantes')
      flash('Participantes do ranking salvos!', true)
      await loadParticipants()
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Erro ao salvar participantes.', false)
    } finally {
      setParticipantsSaving(false)
    }
  }

  const restoreParticipants = async () => {
    setParticipantsSaving(true)
    try {
      const params = new URLSearchParams({ rankingType })
      if (selectedType.unitScoped && unitId) params.set('unitId', unitId)
      const res = await fetch(`/api/ranking/participants?${params.toString()}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? 'Erro ao restaurar padrão')
      flash('Padrão de participação restaurado.', true)
      await loadParticipants()
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Erro ao restaurar padrão.', false)
    } finally {
      setParticipantsSaving(false)
    }
  }

  const inputCls = 'w-32 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm tabular-nums text-right focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Configurações do Ranking</h1>
          <p className="mt-1 text-sm text-gray-500">Pesos gerais e participação por tipo de ranking.</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary text-xs">
          <RefreshCw size={13} className={cn(loading && 'animate-spin')} />Recarregar
        </button>
      </div>

      {msg && (
        <div className={cn('flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium', msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700')}>
          {msg.ok ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}{msg.text}
        </div>
      )}

      <div className="card">
        <div className="section-header">
          <Trophy size={16} className="text-amber-500" />
          <h2 className="text-sm font-semibold text-gray-800">Pesos (pontos)</h2>
        </div>
        <div className="p-5 space-y-1">
          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-medium text-gray-700">Nome da configuração</label>
            <input className="w-full max-w-xs rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {FIELDS.map((f) => (
            <div key={f.key} className="flex items-center justify-between border-b border-gray-50 py-2.5">
              <div>
                <p className="text-sm text-gray-800">{f.label}</p>
                {f.hint && <p className="text-xs text-gray-400">{f.hint}</p>}
              </div>
              <input
                type="number" step="1" className={inputCls}
                value={weights[f.key]}
                onChange={(e) => set(f.key, Math.round(Number(e.target.value) || 0))}
              />
            </div>
          ))}

          {tiebreakers.length > 0 && (
            <div className="pt-4 text-xs text-gray-500">
              <span className="font-medium text-gray-600">Critérios de desempate:</span> {tiebreakers.join(' › ')}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button onClick={() => setWeights(DEFAULTS)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
          <RotateCcw size={14} />Restaurar padrões
        </button>
        <button onClick={save} disabled={saving} className="flex items-center gap-2 rounded-lg bg-brand-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60">
          <Save size={15} />{saving ? 'Salvando...' : 'Salvar pesos'}
        </button>
      </div>

      <div className="card">
        <div className="section-header">
          <Users size={16} className="text-brand-600" />
          <h2 className="text-sm font-semibold text-gray-800">Participantes do ranking</h2>
        </div>
        <div className="space-y-4 p-5">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-gray-700">Tipo de ranking</span>
              <select
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                value={rankingType}
                onChange={(e) => {
                  setRankingType(e.target.value as RankingType)
                  setUnitId('')
                }}
              >
                {typeOptions.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-gray-700">Unidade</span>
              <select
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                value={unitId}
                disabled={!selectedType.unitScoped}
                onChange={(e) => setUnitId(e.target.value)}
              >
                {!selectedType.unitScoped && <option value="">Todas as unidades</option>}
                {selectedType.unitScoped && units.length === 0 && <option value="">Nenhuma unidade</option>}
                {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-gray-700">Cargo</span>
              <select
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
              >
                <option value="">Todos</option>
                {roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-gray-700">Busca</span>
              <span className="relative block">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nome ou e-mail"
                />
              </span>
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                checked={includeInactive}
                onChange={(e) => setIncludeInactive(e.target.checked)}
              />
              Mostrar inativos
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setAllParticipants(true)} className="btn-secondary text-xs">
                Marcar todos
              </button>
              <button type="button" onClick={() => setAllParticipants(false)} className="btn-secondary text-xs">
                Desmarcar todos
              </button>
              <button type="button" onClick={restoreParticipants} disabled={participantsSaving} className="btn-secondary text-xs">
                <RotateCcw size={13} />Restaurar padrão
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-gray-200">
            <div className="hidden grid-cols-[1fr_150px_120px_110px] gap-3 bg-gray-50 px-4 py-2 text-xs font-semibold uppercase text-gray-500 md:grid">
              <span>Colaborador</span>
              <span>Unidade</span>
              <span>Cargo</span>
              <span className="text-right">Participa</span>
            </div>

            {participantsLoading ? (
              <div className="flex items-center gap-2 px-4 py-6 text-sm text-gray-500">
                <RefreshCw className="h-4 w-4 animate-spin" />Carregando participantes...
              </div>
            ) : participantUsers.length === 0 ? (
              <div className="px-4 py-6 text-sm text-gray-500">Nenhum colaborador encontrado para este filtro.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {participantUsers.map((user) => (
                  <div key={user.id} className="grid gap-2 px-4 py-3 md:grid-cols-[1fr_150px_120px_110px] md:items-center md:gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">{user.name}</p>
                      <p className="truncate text-xs text-gray-500">{user.email}</p>
                    </div>
                    <p className="text-xs text-gray-600 md:text-sm">{user.unitName ?? 'Sem unidade'}</p>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-600">{user.role}</span>
                      {user.status !== 'ATIVO' && <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700">{user.status}</span>}
                    </div>
                    <label className="flex items-center justify-between gap-3 text-sm text-gray-700 md:justify-end">
                      <span className="md:hidden">Participa</span>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                        checked={user.participates}
                        onChange={(e) => toggleParticipant(user.id, e.target.checked)}
                      />
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <SlidersHorizontal size={14} />
              Sem marcação explícita, o colaborador participa por padrão.
            </div>
            <button
              type="button"
              onClick={saveParticipants}
              disabled={participantsSaving || participantsLoading}
              className="flex items-center gap-2 rounded-lg bg-brand-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
            >
              <Save size={15} />{participantsSaving ? 'Salvando...' : 'Salvar participantes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
