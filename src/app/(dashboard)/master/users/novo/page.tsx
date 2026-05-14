'use client'

// =============================================================================
// /master/users/novo — Criar novo usuário em qualquer tenant (MASTER only)
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useSession }                        from 'next-auth/react'
import { useRouter }                         from 'next/navigation'
import Link                                  from 'next/link'
import {
  UserPlus, Loader2, AlertCircle, CheckCircle2, Save,
  ChevronLeft, Eye, EyeOff, Building2, Search,
} from 'lucide-react'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface TenantOption {
  id:       string
  publicId: string
  name:     string
  plan:     string
  status:   string
}

interface UnitOption {
  id:   string
  name: string
}

// ── Constantes ────────────────────────────────────────────────────────────────

const ROLES = [
  'ADM',
  'GERENTE_GERAL',
  'GERENTE',
  'VENDEDOR_LIDER',
  'VENDEDOR',
  'USUARIO_LIDER',
  'USUARIO',
]

const ROLE_LABELS: Record<string, string> = {
  ADM:            'Administrador',
  GERENTE_GERAL:  'Gerente Geral',
  GERENTE:        'Gerente',
  VENDEDOR_LIDER: 'Vendedor Líder',
  VENDEDOR:       'Vendedor',
  USUARIO_LIDER:  'Usuário Líder',
  USUARIO:        'Usuário',
}

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const labelCls = 'text-xs font-medium text-gray-600 block mb-1'

// ── Página ────────────────────────────────────────────────────────────────────

export default function NewUserPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  // Form
  const [name,               setName]               = useState('')
  const [email,              setEmail]              = useState('')
  const [password,           setPassword]           = useState('')
  const [showPwd,            setShowPwd]            = useState(false)
  const [role,               setRole]               = useState('VENDEDOR')
  const [mustChangePassword, setMustChangePassword] = useState(true)
  const [selectedTenantId,   setSelectedTenantId]   = useState('')
  const [selectedUnitId,     setSelectedUnitId]     = useState('')

  // Data
  const [tenants, setTenants] = useState<TenantOption[]>([])
  const [units,   setUnits]   = useState<UnitOption[]>([])
  const [tenantSearch, setTenantSearch] = useState('')

  // UI state
  const [loadingTenants, setLoadingTenants] = useState(true)
  const [loadingUnits,   setLoadingUnits]   = useState(false)
  const [saving,         setSaving]         = useState(false)
  const [error,          setError]          = useState('')
  const [success,        setSuccess]        = useState('')

  // Guard
  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role !== 'MASTER') {
      router.replace('/inicio')
    }
  }, [session, status, router])

  // Load tenants
  useEffect(() => {
    if (session?.user?.role !== 'MASTER') return
    fetch('/api/master/tenants?limit=200&page=1')
      .then(r => r.json())
      .then(d => setTenants(d.data ?? []))
      .catch(() => setError('Erro ao carregar tenants.'))
      .finally(() => setLoadingTenants(false))
  }, [session])

  // Load units when tenant changes
  const loadUnits = useCallback(async (tenantId: string) => {
    if (!tenantId) { setUnits([]); setSelectedUnitId(''); return }
    setLoadingUnits(true)
    setSelectedUnitId('')
    try {
      const res  = await fetch(`/api/master/tenants/${tenantId}`)
      const data = await res.json()
      setUnits(data.data?.units ?? [])
    } catch {
      setUnits([])
    } finally {
      setLoadingUnits(false)
    }
  }, [])

  useEffect(() => {
    loadUnits(selectedTenantId)
  }, [selectedTenantId, loadUnits])

  // Filtered tenants
  const filteredTenants = tenantSearch.trim()
    ? tenants.filter(t =>
        t.name.toLowerCase().includes(tenantSearch.toLowerCase()) ||
        t.publicId.toLowerCase().includes(tenantSearch.toLowerCase()),
      )
    : tenants

  const selectedTenant = tenants.find(t => t.id === selectedTenantId)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!name.trim())        { setError('Nome é obrigatório.'); return }
    if (!email.trim())       { setError('E-mail é obrigatório.'); return }
    if (password.length < 6) { setError('Senha deve ter no mínimo 6 caracteres.'); return }
    if (!selectedTenantId)   { setError('Selecione um tenant para este usuário.'); return }

    setSaving(true)
    try {
      const res = await fetch('/api/master/users', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name:               name.trim(),
          email:              email.trim().toLowerCase(),
          password,
          role,
          tenantId:           selectedTenantId,
          unitId:             selectedUnitId || null,
          mustChangePassword,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao criar usuário.')
      setSuccess(`Usuário ${data.data?.name ?? ''} criado com sucesso!`)
      setTimeout(() => router.push('/master/users'), 1500)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao criar usuário.')
    } finally {
      setSaving(false)
    }
  }

  if (status === 'loading' || loadingTenants) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/master/users"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
        >
          <ChevronLeft size={16} />
        </Link>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600">
          <UserPlus size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Novo Usuário</h1>
          <p className="text-xs text-gray-400">Criar usuário em qualquer tenant da plataforma</p>
        </div>
      </div>

      {error   && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={15} className="shrink-0" />{error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 size={15} className="shrink-0" />{success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* ── Dados pessoais ── */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-800">Dados do usuário</h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className={labelCls}>Nome completo *</label>
              <input
                className={inputCls}
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="João da Silva"
                autoComplete="off"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={labelCls}>E-mail *</label>
              <input
                type="email"
                className={inputCls}
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="joao@loja.com.br"
                autoComplete="off"
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Senha inicial *</label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                className={`${inputCls} pr-9`}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPwd(p => !p)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <div>
            <label className={labelCls}>Papel (Role) *</label>
            <select
              className={inputCls}
              value={role}
              onChange={e => setRole(e.target.value)}
            >
              {ROLES.map(r => (
                <option key={r} value={r}>{ROLE_LABELS[r] ?? r} — {r}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-400">
              Define as permissões do usuário dentro do tenant.
            </p>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-brand-600"
              checked={mustChangePassword}
              onChange={e => setMustChangePassword(e.target.checked)}
            />
            <span className="text-sm text-gray-700">
              Exigir troca de senha no primeiro acesso
            </span>
          </label>
        </div>

        {/* ── Tenant ── */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800">
            <Building2 size={14} className="text-brand-600" />
            Tenant *
          </h2>

          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="w-full rounded-lg border border-gray-300 pl-8 pr-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              placeholder="Buscar tenant por nome ou ID..."
              value={tenantSearch}
              onChange={e => setTenantSearch(e.target.value)}
            />
          </div>

          {/* List */}
          <div className="max-h-52 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
            {filteredTenants.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-gray-400">Nenhum tenant encontrado.</p>
            ) : filteredTenants.map(t => (
              <label
                key={t.id}
                className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors ${selectedTenantId === t.id ? 'bg-brand-50' : ''}`}
              >
                <input
                  type="radio"
                  name="tenantId"
                  className="h-4 w-4 text-brand-600 border-gray-300 focus:ring-brand-500"
                  checked={selectedTenantId === t.id}
                  onChange={() => setSelectedTenantId(t.id)}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{t.name}</p>
                  <p className="text-xs text-gray-400">{t.publicId} · {t.plan} · {t.status}</p>
                </div>
              </label>
            ))}
          </div>

          {selectedTenant && (
            <div className="flex items-center gap-2 rounded-lg bg-brand-50 border border-brand-100 px-3 py-2">
              <Building2 size={13} className="text-brand-600 shrink-0" />
              <span className="text-sm text-brand-700 font-medium">{selectedTenant.name}</span>
              <span className="ml-auto text-xs text-brand-500">{selectedTenant.publicId}</span>
            </div>
          )}
        </div>

        {/* ── Unidade (opcional) ── */}
        {selectedTenantId && (
          <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-800">
              Unidade
              <span className="ml-1.5 text-xs font-normal text-gray-400">(opcional)</span>
            </h2>

            {loadingUnits ? (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2 size={14} className="animate-spin" />Carregando unidades...
              </div>
            ) : units.length === 0 ? (
              <p className="text-sm text-gray-400">Este tenant não possui unidades cadastradas.</p>
            ) : (
              <select
                className={inputCls}
                value={selectedUnitId}
                onChange={e => setSelectedUnitId(e.target.value)}
              >
                <option value="">Sem unidade específica</option>
                {units.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            )}
            <p className="text-xs text-gray-400">
              Associar a uma unidade restringe o acesso do usuário àquela unidade no tenant.
            </p>
          </div>
        )}

        {/* ── Resumo e submit ── */}
        <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-xs text-gray-500 space-y-0.5">
            {selectedTenant && (
              <p><span className="font-medium">Tenant:</span> {selectedTenant.name}</p>
            )}
            <p><span className="font-medium">Papel:</span> {ROLE_LABELS[role] ?? role}</p>
            <p><span className="font-medium">Troca de senha:</span> {mustChangePassword ? 'Sim, no primeiro acesso' : 'Não'}</p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/master/users"
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={saving || !selectedTenantId}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving
                ? <><Loader2 size={14} className="animate-spin" />Criando...</>
                : <><Save size={14} />Criar usuário</>
              }
            </button>
          </div>
        </div>

      </form>
    </div>
  )
}
