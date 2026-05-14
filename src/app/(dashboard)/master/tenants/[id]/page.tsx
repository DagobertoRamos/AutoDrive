'use client'

// =============================================================================
// /master/tenants/[id] — Detalhes, edição e gestão de um tenant
//
// Seções:
//   • Header com badge de status e ações rápidas de status (SUSPENDER/BANIR/etc.)
//   • Stats rápidos (usuários, unidades, negociações)
//   • Formulário: dados da empresa, endereço, plano, limites, identidade visual
//   • Sócios: lista paginada com edição/remoção inline
//   • Observações e zona de perigo (exclusão)
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { useSession }                        from 'next-auth/react'
import { useRouter, useParams }              from 'next/navigation'
import Link                                  from 'next/link'
import {
  Building2, ArrowLeft, Save, Trash2, Users, Package,
  TrendingUp, AlertCircle, ShieldBan, ShieldCheck, ShieldOff,
  RefreshCw, XCircle, UserPlus, Pencil, Loader2, ChevronDown,
  ChevronUp, BadgeAlert, CheckCircle2, UserRound,
} from 'lucide-react'
import { useImpersonationStore } from '@/store/impersonationStore'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Partner {
  id:            string
  cpf:           string
  nomeCompleto:  string
  rg:            string | null
  celular:       string | null
  email:         string | null
  role:          string
  participacao:  string | null
  principal:     boolean
  active:        boolean
}

interface TenantDetail {
  id:                      string
  publicId:                string
  slug:                    string
  name:                    string
  razaoSocial:             string | null
  nomeFantasia:            string | null
  cnpj:                    string | null
  phone:                   string | null
  email:                   string | null
  address:                 string | null
  logradouro:              string | null
  numero:                  string | null
  complemento:             string | null
  bairro:                  string | null
  city:                    string | null
  state:                   string | null
  logoUrl:                 string | null
  slogan:                  string | null
  primaryColor:            string | null
  secondaryColor:          string | null
  plan:                    string
  status:                  string
  statusReason:            string | null
  responsavel:             string | null
  responsavelEmail:        string | null
  responsavelPhone:        string | null
  maxUsers:                number
  maxVehicles:             number
  maxUnits:                number
  trialEndsAt:             string | null
  notes:                   string | null
  createdAt:               string
  partners:                Partner[]
  _count: {
    users:   number
    units:   number
    deals:   number
    modules: number
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PLAN_OPTIONS   = ['BASICO', 'PRO', 'VIP', 'CUSTOM']
const PLAN_LABELS: Record<string, string> = {
  BASICO: 'Básico', PRO: 'Pro', VIP: 'VIP', CUSTOM: 'Custom',
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  ATIVO:     { label: 'Ativo',     cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  SUSPENSO:  { label: 'Suspenso',  cls: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  BLOQUEADO: { label: 'Bloqueado', cls: 'bg-orange-100 text-orange-700 border-orange-200' },
  BANIDO:    { label: 'Banido',    cls: 'bg-red-100 text-red-700 border-red-200' },
  CANCELADO: { label: 'Cancelado', cls: 'bg-gray-100 text-gray-500 border-gray-200' },
  TESTE:     { label: 'Teste',     cls: 'bg-blue-100 text-blue-700 border-blue-200' },
}

const ROLE_LABELS: Record<string, string> = {
  SOCIO_ADMINISTRADOR: 'Sócio-Administrador',
  SOCIO:               'Sócio',
  REPRESENTANTE_LEGAL: 'Representante Legal',
  PROCURADOR:          'Procurador',
}

function formatCPF(cpf: string) {
  const d = cpf.replace(/\D/g, '')
  return d.length === 11
    ? `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`
    : cpf
}

// ── Modal simples de confirmação com motivo ───────────────────────────────────

interface ReasonModalProps {
  title:       string
  description: string
  required:    boolean
  loading:     boolean
  onConfirm:   (reason: string) => void
  onCancel:    () => void
}

function ReasonModal({ title, description, required, loading, onConfirm, onCancel }: ReasonModalProps) {
  const [reason, setReason] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl p-6 flex flex-col gap-4">
        <h3 className="text-base font-bold text-gray-900">{title}</h3>
        <p className="text-sm text-gray-500">{description}</p>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">
            Motivo {required ? '*' : '(opcional)'}
          </label>
          <textarea
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
            placeholder="Descreva o motivo desta ação..."
            value={reason}
            onChange={e => setReason(e.target.value)}
          />
        </div>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={loading}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={loading || (required && !reason.trim())}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 flex items-center gap-2"
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function TenantDetailPage() {
  const { data: session, status } = useSession()
  const router  = useRouter()
  const { id }  = useParams<{ id: string }>()

  const startImpersonation = useImpersonationStore(s => s.startImpersonation)

  const [tenant,  setTenant]  = useState<TenantDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState('')

  // Impersonation
  const [impersonating, setImpersonating] = useState(false)
  const [showImpModal,  setShowImpModal]  = useState(false)
  const [impReason,     setImpReason]     = useState('')

  // Status action modal
  const [modal, setModal] = useState<{
    action:      string
    title:       string
    description: string
    required:    boolean
  } | null>(null)
  const [modalLoading, setModalLoading] = useState(false)

  // Partners collapse
  const [partnersOpen, setPartnersOpen] = useState(true)

  // Form state
  const [form, setForm] = useState({
    name:             '',
    razaoSocial:      '',
    nomeFantasia:     '',
    cnpj:             '',
    phone:            '',
    email:            '',
    logradouro:       '',
    numero:           '',
    complemento:      '',
    bairro:           '',
    city:             '',
    state:            '',
    slogan:           '',
    primaryColor:     '#166534',
    secondaryColor:   '',
    plan:             'BASICO',
    maxUsers:         10,
    maxVehicles:      100,
    maxUnits:         1,
    responsavel:      '',
    responsavelEmail: '',
    responsavelPhone: '',
    notes:            '',
  })

  // Auth guard
  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role !== 'MASTER') {
      router.replace('/inicio')
    }
  }, [session, status, router])

  // Load tenant
  const loadTenant = useCallback(async () => {
    if (session?.user?.role !== 'MASTER' || !id || id === 'novo') return
    setLoading(true)
    try {
      const [tenantRes, partnersRes] = await Promise.all([
        fetch(`/api/master/tenants/${id}`),
        fetch(`/api/master/tenants/${id}/partners`),
      ])
      const tenantData   = await tenantRes.json()
      const partnersData = await partnersRes.json()

      if (tenantData.data) {
        const d = tenantData.data
        setTenant({ ...d, partners: partnersData.data ?? [] })
        setForm({
          name:             d.name             ?? '',
          razaoSocial:      d.razaoSocial      ?? '',
          nomeFantasia:     d.nomeFantasia     ?? '',
          cnpj:             d.cnpj             ?? '',
          phone:            d.phone            ?? '',
          email:            d.email            ?? '',
          logradouro:       d.logradouro       ?? '',
          numero:           d.numero           ?? '',
          complemento:      d.complemento      ?? '',
          bairro:           d.bairro           ?? '',
          city:             d.city             ?? '',
          state:            d.state            ?? '',
          slogan:           d.slogan           ?? '',
          primaryColor:     d.primaryColor     ?? '#166534',
          secondaryColor:   d.secondaryColor   ?? '',
          plan:             d.plan             ?? 'BASICO',
          maxUsers:         d.maxUsers         ?? 10,
          maxVehicles:      d.maxVehicles      ?? 100,
          maxUnits:         d.maxUnits         ?? 1,
          responsavel:      d.responsavel      ?? '',
          responsavelEmail: d.responsavelEmail ?? '',
          responsavelPhone: d.responsavelPhone ?? '',
          notes:            d.notes            ?? '',
        })
      }
    } catch {
      setError('Erro ao carregar tenant.')
    } finally {
      setLoading(false)
    }
  }, [session, id])

  useEffect(() => { loadTenant() }, [loadTenant])

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const res  = await fetch(`/api/master/tenants/${id}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao salvar')
      setSuccess('Dados salvos com sucesso.')
      setTenant(prev => prev ? { ...prev, ...data.data } : prev)
      setTimeout(() => setSuccess(''), 3000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  // ── Status actions ────────────────────────────────────────────────────────

  const openStatusModal = (action: string) => {
    const configs: Record<string, { title: string; description: string; required: boolean }> = {
      SUSPENDER: {
        title:       'Suspender tenant',
        description: 'O tenant ficará inacessível até ser reativado. Informe o motivo.',
        required:    true,
      },
      REATIVAR: {
        title:       'Reativar tenant',
        description: 'O tenant voltará ao status ATIVO.',
        required:    false,
      },
      BANIR: {
        title:       'Banir tenant',
        description: '⚠️ Ação severa: o tenant será banido da plataforma. Informe o motivo detalhado.',
        required:    true,
      },
      DESBANIR: {
        title:       'Desbanir tenant',
        description: 'O tenant retornará ao status ATIVO.',
        required:    false,
      },
      CANCELAR: {
        title:       'Cancelar tenant',
        description: 'O contrato do tenant será encerrado. Informe o motivo.',
        required:    true,
      },
      TESTE: {
        title:       'Colocar em período de teste',
        description: 'O tenant entrará no status TESTE.',
        required:    false,
      },
    }
    const cfg = configs[action]
    if (cfg) setModal({ action, ...cfg })
  }

  const handleStatusAction = async (reason: string) => {
    if (!modal) return
    setModalLoading(true)
    try {
      const res  = await fetch(`/api/master/tenants/${id}/status`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: modal.action, reason: reason || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao alterar status')
      setModal(null)
      await loadTenant()
      setSuccess(`Status alterado para ${data.data?.status ?? modal.action}.`)
      setTimeout(() => setSuccess(''), 4000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao alterar status')
      setModal(null)
    } finally {
      setModalLoading(false)
    }
  }

  // ── Remove partner ────────────────────────────────────────────────────────

  const handleRemovePartner = async (partnerId: string, name: string) => {
    if (!confirm(`Remover sócio "${name}"? Esta ação pode ser revertida reativando o registro.`)) return
    try {
      const res  = await fetch(`/api/master/tenants/${id}/partners/${partnerId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao remover sócio')
      await loadTenant()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao remover sócio')
    }
  }

  // ── Impersonation ─────────────────────────────────────────────────────────

  const handleImpersonate = async () => {
    if (!impReason.trim()) return
    setImpersonating(true)
    setError('')
    try {
      const res  = await fetch(`/api/master/tenants/${id}/impersonate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ reason: impReason.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao iniciar impersonation.')
      startImpersonation(data.data)
      setShowImpModal(false)
      setImpReason('')
      setSuccess(`Impersonation iniciado como ${data.data.targetUser.name}.`)
      setTimeout(() => setSuccess(''), 4000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao iniciar impersonation.')
    } finally {
      setImpersonating(false)
    }
  }

  // ── Delete tenant ─────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!confirm(`EXCLUIR o tenant "${tenant?.name}"?\n\nEsta ação é IRREVERSÍVEL e apaga todos os dados.`)) return
    try {
      const res = await fetch(`/api/master/tenants/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Erro ao excluir')
      }
      router.replace('/master/tenants')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao excluir')
    }
  }

  // ── Field helper ──────────────────────────────────────────────────────────

  const f = (k: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm(prev => ({ ...prev, [k]: e.target.value }))

  const fNum = (k: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => setForm(prev => ({ ...prev, [k]: Number(e.target.value) || 0 }))

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    )
  }

  const statusBadge = STATUS_BADGE[tenant?.status ?? ''] ?? STATUS_BADGE.ATIVO
  const currentStatus = tenant?.status ?? 'ATIVO'

  return (
    <div className="space-y-6 max-w-5xl">

      {/* ── Modal de motivo ───────────────────────────────────────────────── */}
      {modal && (
        <ReasonModal
          title={modal.title}
          description={modal.description}
          required={modal.required}
          loading={modalLoading}
          onConfirm={handleStatusAction}
          onCancel={() => setModal(null)}
        />
      )}

      {/* ── Modal de impersonation ─────────────────────────────────────────── */}
      {showImpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl p-6 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100">
                <UserRound size={18} className="text-amber-700" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Iniciar Impersonation</h3>
                <p className="text-xs text-gray-400">{tenant?.name}</p>
              </div>
            </div>
            <p className="text-sm text-gray-600">
              Você irá acessar o sistema como o administrador deste tenant. Toda a sessão será registrada para auditoria.
            </p>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Motivo *</label>
              <textarea
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
                placeholder="Ex: Suporte ao cliente, investigação de problema..."
                value={impReason}
                onChange={e => setImpReason(e.target.value)}
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowImpModal(false); setImpReason('') }}
                disabled={impersonating}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleImpersonate}
                disabled={impersonating || !impReason.trim()}
                className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {impersonating ? <Loader2 size={13} className="animate-spin" /> : <UserRound size={13} />}
                {impersonating ? 'Iniciando...' : 'Iniciar impersonation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/master/tenants" className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50">
          <ArrowLeft size={16} />
        </Link>
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl text-white text-sm font-bold shrink-0"
          style={{ backgroundColor: form.primaryColor || '#166534' }}
        >
          {(form.name || form.razaoSocial || 'T').slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900 truncate">{tenant?.name ?? 'Tenant'}</h1>
          <p className="text-xs text-gray-400 font-mono">{tenant?.publicId}</p>
        </div>
        <span className={`ml-1 inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusBadge.cls}`}>
          {statusBadge.label}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowImpModal(true)}
            title="Acessar sistema como um usuário deste tenant"
            className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100"
          >
            <UserRound size={14} />
            Impersonar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save size={14} />}
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>

      {/* ── Feedback ─────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={15} className="shrink-0" />
          {error}
          <button onClick={() => setError('')} className="ml-auto"><XCircle size={14} /></button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 size={15} className="shrink-0" />
          {success}
        </div>
      )}

      {/* ── Status reason banner ──────────────────────────────────────────── */}
      {tenant?.statusReason && currentStatus !== 'ATIVO' && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <BadgeAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-amber-800">Motivo do status atual</p>
            <p className="text-xs text-amber-700 mt-0.5">{tenant.statusReason}</p>
          </div>
        </div>
      )}

      {/* ── Ações de status ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Ações de Status</p>
        <div className="flex flex-wrap gap-2">
          {currentStatus !== 'ATIVO' && currentStatus !== 'TESTE' && (
            <button
              onClick={() => openStatusModal('REATIVAR')}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
            >
              <ShieldCheck size={13} /> Reativar
            </button>
          )}
          {currentStatus === 'ATIVO' && (
            <button
              onClick={() => openStatusModal('SUSPENDER')}
              className="flex items-center gap-1.5 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-1.5 text-xs font-semibold text-yellow-700 hover:bg-yellow-100"
            >
              <ShieldOff size={13} /> Suspender
            </button>
          )}
          {currentStatus === 'ATIVO' && (
            <button
              onClick={() => openStatusModal('TESTE')}
              className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
            >
              <RefreshCw size={13} /> Período de teste
            </button>
          )}
          {currentStatus !== 'BANIDO' && currentStatus !== 'CANCELADO' && (
            <button
              onClick={() => openStatusModal('BANIR')}
              className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
            >
              <ShieldBan size={13} /> Banir
            </button>
          )}
          {currentStatus === 'BANIDO' && (
            <button
              onClick={() => openStatusModal('DESBANIR')}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
            >
              <ShieldCheck size={13} /> Desbanir
            </button>
          )}
          {currentStatus !== 'CANCELADO' && (
            <button
              onClick={() => openStatusModal('CANCELAR')}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100"
            >
              <XCircle size={13} /> Cancelar
            </button>
          )}
        </div>
      </div>

      {/* ── Stats ────────────────────────────────────────────────────────── */}
      {tenant && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Usuários',    value: `${tenant._count.users} / ${form.maxUsers}`,      icon: Users },
            { label: 'Unidades',    value: `${tenant._count.units} / ${form.maxUnits}`,      icon: Building2 },
            { label: 'Negociações', value: tenant._count.deals,                               icon: TrendingUp },
            { label: 'Módulos',     value: tenant._count.modules,                             icon: Package },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-gray-200 bg-white p-3 flex items-center gap-3">
              <s.icon size={18} className="text-brand-600 shrink-0" />
              <div>
                <p className="text-lg font-bold text-gray-900 leading-none">{s.value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Formulário ───────────────────────────────────────────────────── */}
      <div className="grid gap-6 md:grid-cols-2">

        {/* Dados da empresa */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <h2 className="flex items-center gap-2 font-semibold text-gray-800 text-sm">
            <Building2 size={15} className="text-brand-600" /> Dados da Empresa
          </h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Nome de exibição *</label>
              <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" value={form.name} onChange={f('name')} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Razão Social</label>
              <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" value={form.razaoSocial} onChange={f('razaoSocial')} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Nome Fantasia</label>
              <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" value={form.nomeFantasia} onChange={f('nomeFantasia')} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">CNPJ</label>
              <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" placeholder="00.000.000/0001-00" value={form.cnpj} onChange={f('cnpj')} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">E-mail</label>
                <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" type="email" value={form.email} onChange={f('email')} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Telefone</label>
                <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" value={form.phone} onChange={f('phone')} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Slogan</label>
              <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" placeholder="Ex: Sua loja no piloto automático" value={form.slogan} onChange={f('slogan')} />
            </div>
          </div>
        </div>

        {/* Coluna direita */}
        <div className="space-y-4">

          {/* Plano */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
            <h2 className="flex items-center gap-2 font-semibold text-gray-800 text-sm">
              <Package size={15} className="text-brand-600" /> Plano
            </h2>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Plano contratado</label>
              <select className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" value={form.plan} onChange={f('plan')}>
                {PLAN_OPTIONS.map(p => <option key={p} value={p}>{PLAN_LABELS[p]}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Máx. usuários</label>
                <input type="number" min={1} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" value={form.maxUsers} onChange={fNum('maxUsers')} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Máx. veículos</label>
                <input type="number" min={1} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" value={form.maxVehicles} onChange={fNum('maxVehicles')} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Máx. unidades</label>
                <input type="number" min={1} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" value={form.maxUnits} onChange={fNum('maxUnits')} />
              </div>
            </div>
          </div>

          {/* Identidade visual */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
            <h2 className="font-semibold text-gray-800 text-sm">Identidade Visual</h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Cor primária',   key: 'primaryColor'   as const },
                { label: 'Cor secundária', key: 'secondaryColor' as const },
              ].map(({ label, key }) => (
                <div key={key}>
                  <label className="text-xs font-medium text-gray-600 block mb-1">{label}</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={form[key] || '#000000'}
                      onChange={f(key)}
                      className="h-9 w-10 cursor-pointer rounded border border-gray-300 bg-white p-0.5"
                    />
                    <input
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs font-mono focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      value={form[key]}
                      onChange={f(key)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Responsável */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
            <h2 className="font-semibold text-gray-800 text-sm">Responsável Técnico</h2>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Nome</label>
              <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" value={form.responsavel} onChange={f('responsavel')} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">E-mail</label>
                <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" type="email" value={form.responsavelEmail} onChange={f('responsavelEmail')} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Telefone</label>
                <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" value={form.responsavelPhone} onChange={f('responsavelPhone')} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Endereço ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <h2 className="font-semibold text-gray-800 text-sm">Endereço</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-gray-600 block mb-1">Logradouro</label>
            <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" placeholder="Rua, Av., etc." value={form.logradouro} onChange={f('logradouro')} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Número</label>
            <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" value={form.numero} onChange={f('numero')} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Complemento</label>
            <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" value={form.complemento} onChange={f('complemento')} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Bairro</label>
            <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" value={form.bairro} onChange={f('bairro')} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Cidade</label>
            <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" value={form.city} onChange={f('city')} />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Estado</label>
            <select className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" value={form.state} onChange={f('state')}>
              <option value="">—</option>
              {['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Sócios ───────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div
          className="flex items-center justify-between px-5 py-4 cursor-pointer select-none"
          onClick={() => setPartnersOpen(p => !p)}
        >
          <h2 className="flex items-center gap-2 font-semibold text-gray-800 text-sm">
            <Users size={15} className="text-brand-600" />
            Sócios / Responsáveis
            <span className="ml-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
              {tenant?.partners?.length ?? 0}
            </span>
          </h2>
          <div className="flex items-center gap-3">
            <Link
              href={`/master/tenants/${id}/partners/novo`}
              onClick={e => e.stopPropagation()}
              className="flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100"
            >
              <UserPlus size={12} /> Adicionar sócio
            </Link>
            {partnersOpen ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
          </div>
        </div>

        {partnersOpen && (
          <div className="border-t border-gray-100">
            {!tenant?.partners?.length ? (
              <p className="px-5 py-8 text-center text-sm text-gray-400">Nenhum sócio cadastrado.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {tenant.partners.map(p => (
                  <div key={p.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 text-xs font-bold">
                      {p.nomeCompleto.split(' ').map(n => n[0]).slice(0,2).join('')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900">{p.nomeCompleto}</span>
                        {p.principal && (
                          <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700">Principal</span>
                        )}
                        <span className="text-xs text-gray-400">{ROLE_LABELS[p.role] ?? p.role}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                        <span className="font-mono">{formatCPF(p.cpf)}</span>
                        {p.celular && <span>{p.celular}</span>}
                        {p.email && <span className="truncate max-w-[160px]">{p.email}</span>}
                        {p.participacao && <span>{p.participacao}%</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Link
                        href={`/master/tenants/${id}/partners/${p.id}/editar`}
                        className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                      >
                        <Pencil size={11} /> Editar
                      </Link>
                      <button
                        onClick={() => handleRemovePartner(p.id, p.nomeCompleto)}
                        className="flex items-center gap-1 rounded-lg border border-red-100 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        <Trash2 size={11} /> Remover
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Observações ──────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <label className="text-xs font-medium text-gray-600 block mb-1">Observações internas</label>
        <textarea
          rows={4}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-y focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          value={form.notes}
          onChange={f('notes')}
          placeholder="Notas internas sobre o tenant, histórico, acordos comerciais, etc."
        />
      </div>

      {/* ── Rodapé ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>Criado em {tenant ? new Date(tenant.createdAt).toLocaleString('pt-BR') : '—'}</span>
        <span className="font-mono">{tenant?.slug}</span>
      </div>

      {/* ── Zona de perigo ───────────────────────────────────────────────── */}
      <div className="rounded-xl border border-red-200 bg-red-50 p-5">
        <h3 className="text-sm font-bold text-red-700 mb-1">Zona de Perigo</h3>
        <p className="text-xs text-red-600 mb-3">
          A exclusão é permanente e remove todos os dados do tenant (usuários, unidades, negociações).
          Use as ações de status acima para suspender ou banir sem perder dados.
        </p>
        <button
          onClick={handleDelete}
          className="flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
        >
          <Trash2 size={14} /> Excluir tenant permanentemente
        </button>
      </div>

    </div>
  )
}
