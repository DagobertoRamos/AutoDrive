'use client'

// =============================================================================
// /master/plans — Gestão completa de planos da plataforma (MASTER)
//
// Funcionalidades:
//   • Lista planos vindos do banco com contagem de tenants
//   • Criar / editar / excluir plano
//   • Configurar: preços, limites, recursos e módulos do menu
//   • Ativar / desativar plano sem excluir
// =============================================================================

import { useState, useEffect, useCallback, Fragment } from 'react'
import { useSession }                                  from 'next-auth/react'
import { useRouter }                                   from 'next/navigation'
import {
  Plus, Pencil, Trash2, CheckCircle2, XCircle,
  Loader2, Globe, Users, Car, Building2, HardDrive,
  MessageSquare, Mail, Clock, ChevronRight, ToggleLeft,
  ToggleRight, AlertTriangle, X, Save, DollarSign,
  LayoutGrid, ShieldCheck, Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { maskBRL, parseBRL } from '@/lib/masks'

// ── Módulos disponíveis no sistema ────────────────────────────────────────────
// Chaves mapeadas 1-para-1 com o campo `module` do Sidebar
const ALL_MODULES = [
  { key: 'dashboard',      label: 'Dashboard',      desc: 'Visão geral e KPIs',                group: 'Core'         },
  { key: 'stock',          label: 'Estoque',         desc: 'Gestão de veículos e avaliações',   group: 'Operacional'  },
  { key: 'negotiations',   label: 'Negociações',     desc: 'Pipeline de vendas e aprovações',   group: 'Operacional'  },
  { key: 'pendencies',     label: 'Pendências',      desc: 'Controle de tarefas e alertas',     group: 'Operacional'  },
  { key: 'commissions',    label: 'Comissões',       desc: 'Extrato, cálculo e regras',         group: 'Financeiro'   },
  { key: 'communication',  label: 'Comunicação',     desc: 'Disparos WhatsApp e templates',     group: 'Canais'       },
  { key: 'documents',      label: 'Documentos',      desc: 'PDF, contratos e importação',       group: 'Gestão'       },
  { key: 'registrations',  label: 'Cadastros',       desc: 'Vendedores, clientes, unidades',    group: 'Gestão'       },
  { key: 'logs',           label: 'Relatórios',      desc: 'Logs de sistema e auditoria',       group: 'Gestão'       },
  { key: 'settings',       label: 'Configurações',   desc: 'Identidade, e-mail e integrações',  group: 'Avançado'     },
  { key: 'profile',        label: 'Perfil',          desc: 'Dados e preferências do usuário',   group: 'Core'         },
]

const MODULE_GROUPS = ['Core', 'Operacional', 'Financeiro', 'Canais', 'Gestão', 'Avançado']

// ── Tipo da API ───────────────────────────────────────────────────────────────

interface Plan {
  id:                  string
  code:                string
  name:                string
  description:         string | null
  priceMonthly:        number | null
  priceYearly:         number | null
  active:              boolean
  maxUsers:            number
  maxVehicles:         number
  maxUnits:            number
  maxStorageMb:        number
  whatsappMonthly:     number
  emailMonthly:        number
  trialDays:           number
  allowWhiteLabel:     boolean
  allowCustomDomain:   boolean
  allowGoogleSheets:   boolean
  allowAdvancedReports:boolean
  allowApiAccess:      boolean
  modules:             string[]
  sortOrder:           number
  notes:               string | null
  tenantCount:         number
}

// ── Form vazio ────────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  code:                '',
  name:                '',
  description:         '',
  priceMonthly:        '',
  priceYearly:         '',
  active:              true,
  maxUsers:            '10',
  maxVehicles:         '100',
  maxUnits:            '1',
  maxStorageMb:        '1024',
  whatsappMonthly:     '1000',
  emailMonthly:        '5000',
  trialDays:           '14',
  allowWhiteLabel:     false,
  allowCustomDomain:   false,
  allowGoogleSheets:   true,
  allowAdvancedReports:false,
  allowApiAccess:      false,
  modules:             ['dashboard', 'pendencies', 'registrations', 'profile'] as string[],
  sortOrder:           '0',
  notes:               '',
}

type FormState = typeof EMPTY_FORM

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtPrice(v: number | null) {
  if (v == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function planToForm(p: Plan): FormState {
  return {
    code:                p.code,
    name:                p.name,
    description:         p.description    ?? '',
    priceMonthly:        p.priceMonthly   != null ? maskBRL(String(Math.round(p.priceMonthly * 100))) : '',
    priceYearly:         p.priceYearly    != null ? maskBRL(String(Math.round(p.priceYearly  * 100))) : '',
    active:              p.active,
    maxUsers:            String(p.maxUsers),
    maxVehicles:         String(p.maxVehicles),
    maxUnits:            String(p.maxUnits),
    maxStorageMb:        String(p.maxStorageMb),
    whatsappMonthly:     String(p.whatsappMonthly),
    emailMonthly:        String(p.emailMonthly),
    trialDays:           String(p.trialDays),
    allowWhiteLabel:     p.allowWhiteLabel,
    allowCustomDomain:   p.allowCustomDomain,
    allowGoogleSheets:   p.allowGoogleSheets,
    allowAdvancedReports:p.allowAdvancedReports,
    allowApiAccess:      p.allowApiAccess,
    modules:             p.modules,
    sortOrder:           String(p.sortOrder),
    notes:               p.notes ?? '',
  }
}

function formToPayload(f: FormState) {
  return {
    code:                f.code.trim().toUpperCase(),
    name:                f.name.trim(),
    description:         f.description.trim()  || null,
    priceMonthly:        f.priceMonthly  !== '' ? parseBRL(f.priceMonthly)  : null,
    priceYearly:         f.priceYearly   !== '' ? parseBRL(f.priceYearly)   : null,
    active:              f.active,
    maxUsers:            parseInt(f.maxUsers)        || 10,
    maxVehicles:         parseInt(f.maxVehicles)     || 100,
    maxUnits:            parseInt(f.maxUnits)        || 1,
    maxStorageMb:        parseInt(f.maxStorageMb)    || 1024,
    whatsappMonthly:     parseInt(f.whatsappMonthly) || 0,
    emailMonthly:        parseInt(f.emailMonthly)    || 0,
    trialDays:           parseInt(f.trialDays)       || 0,
    allowWhiteLabel:     f.allowWhiteLabel,
    allowCustomDomain:   f.allowCustomDomain,
    allowGoogleSheets:   f.allowGoogleSheets,
    allowAdvancedReports:f.allowAdvancedReports,
    allowApiAccess:      f.allowApiAccess,
    modules:             f.modules,
    sortOrder:           parseInt(f.sortOrder) || 0,
    notes:               f.notes.trim() || null,
  }
}

// ── Subcomponentes ────────────────────────────────────────────────────────────

function Toggle({
  checked, onChange, label, desc,
}: { checked: boolean; onChange: (v: boolean) => void; label: string; desc?: string }) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer select-none py-1">
      <div>
        <p className="text-sm font-medium text-gray-800">{label}</p>
        {desc && <p className="text-xs text-gray-400">{desc}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={cn(
          'relative shrink-0 inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none',
          checked ? 'bg-brand-600' : 'bg-gray-300',
        )}
      >
        <span className={cn(
          'inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0.5',
        )} />
      </button>
    </label>
  )
}

function InputNum({
  label, value, onChange, min = 0, suffix,
}: { label: string; value: string; onChange: (v: string) => void; min?: number; suffix?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <div className="relative">
        <input
          type="number"
          min={min}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 pr-12"
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────────────────────

export default function MasterPlansPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [plans,   setPlans]   = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  // Drawer de criação/edição
  const [drawerOpen,  setDrawerOpen]  = useState(false)
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null)
  const [form,        setForm]        = useState<FormState>(EMPTY_FORM)
  const [saving,      setSaving]      = useState(false)
  const [formError,   setFormError]   = useState('')

  // Confirmação de exclusão
  const [deletingId,  setDeletingId]  = useState<string | null>(null)
  const [deleting,    setDeleting]    = useState(false)

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role !== 'MASTER') {
      router.replace('/inicio')
    }
  }, [session, status, router])

  const loadPlans = useCallback(async () => {
    if (session?.user?.role !== 'MASTER') return
    setLoading(true)
    setError('')
    try {
      const res  = await fetch('/api/master/plans')
      const data = await res.json()
      if (data.success) setPlans(data.data ?? [])
      else setError(data.error ?? 'Erro ao carregar planos.')
    } catch {
      setError('Erro de conexão.')
    } finally {
      setLoading(false)
    }
  }, [session])

  useEffect(() => { loadPlans() }, [loadPlans])

  // ── Abrir drawer ───────────────────────────────────────────────────────────

  function openNew() {
    setEditingPlan(null)
    setForm({ ...EMPTY_FORM })
    setFormError('')
    setDrawerOpen(true)
  }

  function openEdit(plan: Plan) {
    setEditingPlan(plan)
    setForm(planToForm(plan))
    setFormError('')
    setDrawerOpen(true)
  }

  function closeDrawer() {
    setDrawerOpen(false)
    setEditingPlan(null)
    setFormError('')
  }

  // ── Set form field ─────────────────────────────────────────────────────────

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(p => ({ ...p, [k]: v }))
  }

  function toggleModule(key: string) {
    setForm(p => ({
      ...p,
      modules: p.modules.includes(key)
        ? p.modules.filter(m => m !== key)
        : [...p.modules, key],
    }))
  }

  // ── Salvar (criar ou editar) ───────────────────────────────────────────────

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')

    if (!form.code.trim())  { setFormError('Código é obrigatório.'); return }
    if (!form.name.trim())  { setFormError('Nome é obrigatório.');   return }
    if (form.modules.length === 0) { setFormError('Selecione ao menos um módulo do menu.'); return }

    setSaving(true)
    try {
      const payload = formToPayload(form)
      const isEdit  = Boolean(editingPlan)

      const res = await fetch(
        isEdit ? `/api/master/plans/${editingPlan!.id}` : '/api/master/plans',
        {
          method:  isEdit ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(payload),
        },
      )
      const data = await res.json()
      if (!data.success) throw new Error(data.error ?? 'Erro ao salvar.')
      closeDrawer()
      loadPlans()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  // ── Toggle ativo ──────────────────────────────────────────────────────────

  async function toggleActive(plan: Plan) {
    try {
      const res  = await fetch(`/api/master/plans/${plan.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ active: !plan.active }),
      })
      const data = await res.json()
      if (data.success) loadPlans()
    } catch { /* silent */ }
  }

  // ── Excluir ───────────────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    setDeleting(true)
    try {
      const res  = await fetch(`/api/master/plans/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!data.success) throw new Error(data.error ?? 'Erro ao excluir.')
      setDeletingId(null)
      loadPlans()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao excluir.')
    } finally {
      setDeleting(false)
    }
  }

  // ── Cores por ordem de plano ───────────────────────────────────────────────

  const PLAN_COLORS = [
    { ring: 'ring-gray-300',   bg: 'bg-gray-50',   badge: 'bg-gray-100 text-gray-700'  },
    { ring: 'ring-blue-300',   bg: 'bg-blue-50',   badge: 'bg-blue-100 text-blue-700'  },
    { ring: 'ring-purple-300', bg: 'bg-purple-50', badge: 'bg-purple-100 text-purple-700'},
    { ring: 'ring-brand-300',  bg: 'bg-brand-50',  badge: 'bg-brand-100 text-brand-700' },
  ]

  function planColor(idx: number) {
    return PLAN_COLORS[idx % PLAN_COLORS.length]
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

  return (
    <div className="space-y-6 max-w-6xl">

      {/* Header ─────────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Globe size={22} className="text-brand-700" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Planos da Plataforma</h1>
            <p className="text-sm text-gray-500">
              Configure preços, limites, recursos e módulos do menu por plano
            </p>
          </div>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 transition-colors"
        >
          <Plus size={15} />
          Novo plano
        </button>
      </div>

      {/* Error ──────────────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={15} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Loading ─────────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex h-52 items-center justify-center">
          <Loader2 size={28} className="animate-spin text-brand-600" />
        </div>
      ) : plans.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 py-20 text-center">
          <Globe size={36} className="text-gray-300 mb-3" />
          <p className="text-base font-semibold text-gray-500">Nenhum plano cadastrado</p>
          <p className="text-sm text-gray-400 mt-1">Crie o primeiro plano da plataforma</p>
          <button
            onClick={openNew}
            className="mt-4 flex items-center gap-2 rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
          >
            <Plus size={14} /> Criar plano
          </button>
        </div>
      ) : (
        /* Cards de planos ───────────────────────────────────────────────────── */
        <div className="grid gap-5 lg:grid-cols-2">
          {plans.map((plan, idx) => {
            const color = planColor(idx)
            return (
              <div
                key={plan.id}
                className={cn(
                  'relative rounded-2xl border-2 bg-white shadow-sm overflow-hidden transition-all',
                  plan.active ? color.ring : 'ring-1 ring-gray-200 opacity-60',
                )}
              >
                {/* Status pill */}
                {!plan.active && (
                  <div className="absolute top-3 right-3 rounded-full bg-gray-200 px-2.5 py-0.5 text-[11px] font-semibold text-gray-600">
                    Inativo
                  </div>
                )}

                {/* Header do card */}
                <div className={cn('px-5 pt-5 pb-4', color.bg)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide', color.badge)}>
                          {plan.code}
                        </span>
                        <span className="text-[11px] text-gray-400 font-medium">
                          {plan.tenantCount} tenant{plan.tenantCount !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <h2 className="text-lg font-bold text-gray-900 truncate">{plan.name}</h2>
                      {plan.description && (
                        <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">{plan.description}</p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      {plan.priceMonthly != null ? (
                        <div>
                          <p className="text-xl font-bold text-gray-900">{fmtPrice(plan.priceMonthly)}</p>
                          <p className="text-xs text-gray-400">por mês</p>
                        </div>
                      ) : (
                        <p className="text-sm font-semibold text-gray-400">Sob consulta</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Corpo do card */}
                <div className="px-5 py-4 space-y-4">

                  {/* Limites */}
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Limites</p>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { icon: Users,     label: 'Usuários',  val: plan.maxUsers    },
                        { icon: Car,       label: 'Veículos',  val: plan.maxVehicles },
                        { icon: Building2, label: 'Unidades',  val: plan.maxUnits    },
                        { icon: HardDrive, label: 'Storage',   val: `${plan.maxStorageMb >= 1024 ? `${plan.maxStorageMb / 1024}GB` : `${plan.maxStorageMb}MB`}` },
                        { icon: MessageSquare, label: 'WhatsApp/mês', val: plan.whatsappMonthly.toLocaleString('pt-BR') },
                        { icon: Mail,      label: 'E-mails/mês', val: plan.emailMonthly.toLocaleString('pt-BR') },
                      ].map(({ icon: Icon, label, val }) => (
                        <div key={label} className="rounded-lg bg-gray-50 border border-gray-100 px-2.5 py-2 text-center">
                          <Icon size={13} className="mx-auto mb-1 text-gray-400" />
                          <p className="text-[11px] text-gray-500 leading-none mb-0.5">{label}</p>
                          <p className="text-xs font-bold text-gray-800">{val}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Recursos */}
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Recursos</p>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { key: 'allowGoogleSheets',    label: 'Google Sheets',    ok: plan.allowGoogleSheets    },
                        { key: 'allowWhiteLabel',       label: 'White Label',      ok: plan.allowWhiteLabel      },
                        { key: 'allowCustomDomain',     label: 'Domínio próprio',  ok: plan.allowCustomDomain    },
                        { key: 'allowAdvancedReports',  label: 'Relatórios +',     ok: plan.allowAdvancedReports },
                        { key: 'allowApiAccess',        label: 'API Access',       ok: plan.allowApiAccess       },
                        { key: 'trial', label: `Trial ${plan.trialDays}d`, ok: plan.trialDays > 0 },
                      ].map(({ key, label, ok }) => (
                        <span
                          key={key}
                          className={cn(
                            'flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
                            ok
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-gray-100 text-gray-400 border border-gray-200',
                          )}
                        >
                          {ok
                            ? <CheckCircle2 size={10} className="shrink-0" />
                            : <XCircle      size={10} className="shrink-0" />
                          }
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Módulos do menu */}
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Módulos no menu</p>
                    <div className="flex flex-wrap gap-1">
                      {plan.modules.length === 0 ? (
                        <span className="text-xs text-gray-400 italic">Nenhum módulo</span>
                      ) : plan.modules.map(m => {
                        const mod = ALL_MODULES.find(x => x.key === m)
                        return (
                          <span key={m} className="flex items-center gap-1 rounded-full bg-brand-50 border border-brand-200 px-2 py-0.5 text-[11px] font-medium text-brand-700">
                            <ChevronRight size={9} />
                            {mod?.label ?? m}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* Footer — ações */}
                <div className="flex items-center gap-1 border-t border-gray-100 px-4 py-2.5 bg-gray-50">
                  <button
                    onClick={() => openEdit(plan)}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-white hover:text-brand-700 transition-colors"
                  >
                    <Pencil size={12} /> Editar
                  </button>
                  <button
                    onClick={() => toggleActive(plan)}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-white transition-colors"
                  >
                    {plan.active
                      ? <><ToggleRight size={13} className="text-emerald-500" /> Desativar</>
                      : <><ToggleLeft  size={13} className="text-gray-400"    /> Ativar</>
                    }
                  </button>
                  <div className="ml-auto">
                    {deletingId === plan.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-red-600 font-medium">Confirmar exclusão?</span>
                        <button
                          onClick={() => handleDelete(plan.id)}
                          disabled={deleting}
                          className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                        >
                          {deleting ? <Loader2 size={11} className="animate-spin" /> : 'Sim'}
                        </button>
                        <button
                          onClick={() => setDeletingId(null)}
                          className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-white"
                        >
                          Não
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeletingId(plan.id)}
                        disabled={plan.tenantCount > 0}
                        title={plan.tenantCount > 0 ? 'Há tenants usando este plano' : 'Excluir plano'}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <Trash2 size={12} /> Excluir
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Drawer de criação/edição ────────────────────────────────────────── */}
      {drawerOpen && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
            onClick={closeDrawer}
          />

          {/* Painel */}
          <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col bg-white shadow-2xl animate-slide-in-right overflow-hidden">

            {/* Cabeçalho do drawer */}
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <h2 className="text-base font-bold text-gray-900">
                  {editingPlan ? `Editar — ${editingPlan.name}` : 'Novo Plano'}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {editingPlan ? 'Atualize as configurações do plano' : 'Configure o novo plano da plataforma'}
                </p>
              </div>
              <button
                onClick={closeDrawer}
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            </div>

            {/* Corpo do drawer (scroll) */}
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto">
              <div className="px-6 py-5 space-y-6">

                {/* Erro do form */}
                {formError && (
                  <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    <AlertTriangle size={14} className="shrink-0" />
                    {formError}
                  </div>
                )}

                {/* ── Identificação ────────────────────────────────────────── */}
                <section>
                  <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
                    <Globe size={12} /> Identificação
                  </h3>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Código *</label>
                        <input
                          value={form.code}
                          onChange={e => set('code', e.target.value.toUpperCase())}
                          placeholder="BASICO"
                          disabled={Boolean(editingPlan)}
                          className={cn(inputCls, editingPlan && 'bg-gray-50 cursor-not-allowed font-mono text-gray-500')}
                          maxLength={20}
                        />
                        {editingPlan && (
                          <p className="text-[11px] text-gray-400 mt-0.5">Código não pode ser alterado</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Nome *</label>
                        <input
                          value={form.name}
                          onChange={e => set('name', e.target.value)}
                          placeholder="Plano Básico"
                          className={inputCls}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Descrição</label>
                      <input
                        value={form.description}
                        onChange={e => set('description', e.target.value)}
                        placeholder="Para pequenas equipes que estão começando"
                        className={inputCls}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3 items-center">
                      <Toggle
                        checked={form.active}
                        onChange={v => set('active', v)}
                        label="Plano ativo"
                        desc="Disponível para novos tenants"
                      />
                      <InputNum
                        label="Ordem de exibição"
                        value={form.sortOrder}
                        onChange={v => set('sortOrder', v)}
                        min={0}
                      />
                    </div>
                  </div>
                </section>

                {/* ── Preços ──────────────────────────────────────────────── */}
                <section className="border-t border-gray-100 pt-5">
                  <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
                    <DollarSign size={12} /> Preços
                  </h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Mensalidade (R$)</label>
                      <input
                        inputMode="numeric"
                        value={maskBRL(form.priceMonthly)}
                        onChange={e => set('priceMonthly', maskBRL(e.target.value))}
                        placeholder="299,00"
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Anualidade (R$)</label>
                      <input
                        inputMode="numeric"
                        value={maskBRL(form.priceYearly)}
                        onChange={e => set('priceYearly', maskBRL(e.target.value))}
                        placeholder="2990,00"
                        className={inputCls}
                      />
                    </div>
                    <InputNum
                      label="Dias de trial"
                      value={form.trialDays}
                      onChange={v => set('trialDays', v)}
                      suffix="dias"
                    />
                  </div>
                </section>

                {/* ── Limites ──────────────────────────────────────────────── */}
                <section className="border-t border-gray-100 pt-5">
                  <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
                    <ShieldCheck size={12} /> Limites
                  </h3>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <InputNum label="Usuários"    value={form.maxUsers}        onChange={v => set('maxUsers', v)}        min={1} />
                    <InputNum label="Veículos"    value={form.maxVehicles}     onChange={v => set('maxVehicles', v)}     min={1} />
                    <InputNum label="Unidades"    value={form.maxUnits}        onChange={v => set('maxUnits', v)}        min={1} />
                    <InputNum label="Storage (MB)"value={form.maxStorageMb}    onChange={v => set('maxStorageMb', v)}    min={1} suffix="MB" />
                    <InputNum label="WhatsApp/mês"value={form.whatsappMonthly} onChange={v => set('whatsappMonthly', v)} min={0} />
                    <InputNum label="E-mails/mês" value={form.emailMonthly}    onChange={v => set('emailMonthly', v)}    min={0} />
                  </div>
                </section>

                {/* ── Recursos / Feature flags ──────────────────────────────── */}
                <section className="border-t border-gray-100 pt-5">
                  <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
                    <Zap size={12} /> Recursos liberados
                  </h3>
                  <div className="divide-y divide-gray-50 rounded-xl border border-gray-200 px-4 py-1">
                    <Toggle
                      checked={form.allowGoogleSheets}
                      onChange={v => set('allowGoogleSheets', v)}
                      label="Google Sheets"
                      desc="Integração com planilhas Google"
                    />
                    <Toggle
                      checked={form.allowAdvancedReports}
                      onChange={v => set('allowAdvancedReports', v)}
                      label="Relatórios avançados"
                      desc="Exportações e dashboards extras"
                    />
                    <Toggle
                      checked={form.allowApiAccess}
                      onChange={v => set('allowApiAccess', v)}
                      label="Acesso à API"
                      desc="Permite uso de API tokens"
                    />
                    <Toggle
                      checked={form.allowWhiteLabel}
                      onChange={v => set('allowWhiteLabel', v)}
                      label="White Label"
                      desc="Oculta marca AutoDrive da interface"
                    />
                    <Toggle
                      checked={form.allowCustomDomain}
                      onChange={v => set('allowCustomDomain', v)}
                      label="Domínio personalizado"
                      desc="Acesso via subdomínio próprio"
                    />
                  </div>
                </section>

                {/* ── Módulos do menu ───────────────────────────────────────── */}
                <section className="border-t border-gray-100 pt-5">
                  <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">
                    <LayoutGrid size={12} /> Módulos visíveis no menu
                  </h3>
                  <p className="text-xs text-gray-400 mb-3">
                    Selecione quais itens aparecerão na barra lateral para tenants neste plano.
                  </p>

                  <div className="space-y-4">
                    {MODULE_GROUPS.map(group => {
                      const mods = ALL_MODULES.filter(m => m.group === group)
                      return (
                        <div key={group}>
                          <p className="text-[11px] font-semibold text-gray-500 mb-1.5">{group}</p>
                          <div className="grid grid-cols-2 gap-2">
                            {mods.map(mod => {
                              const selected = form.modules.includes(mod.key)
                              return (
                                <button
                                  key={mod.key}
                                  type="button"
                                  onClick={() => toggleModule(mod.key)}
                                  className={cn(
                                    'flex items-start gap-2.5 rounded-xl border-2 px-3 py-2.5 text-left transition-all',
                                    selected
                                      ? 'border-brand-500 bg-brand-50'
                                      : 'border-gray-200 bg-white hover:border-gray-300',
                                  )}
                                >
                                  <div className={cn(
                                    'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
                                    selected
                                      ? 'border-brand-600 bg-brand-600'
                                      : 'border-gray-300 bg-white',
                                  )}>
                                    {selected && <CheckCircle2 size={9} className="text-white" />}
                                  </div>
                                  <div className="min-w-0">
                                    <p className={cn(
                                      'text-xs font-semibold',
                                      selected ? 'text-brand-800' : 'text-gray-700',
                                    )}>
                                      {mod.label}
                                    </p>
                                    <p className="text-[10px] text-gray-400 truncate">{mod.desc}</p>
                                  </div>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Resumo da seleção */}
                  <div className="mt-3 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
                    <p className="text-xs text-gray-500">
                      <span className="font-semibold text-gray-700">{form.modules.length}</span> módulo{form.modules.length !== 1 ? 's' : ''} selecionado{form.modules.length !== 1 ? 's' : ''}:
                      {' '}
                      <span className="text-gray-600">
                        {form.modules
                          .map(m => ALL_MODULES.find(x => x.key === m)?.label ?? m)
                          .join(', ') || '—'}
                      </span>
                    </p>
                  </div>
                </section>

                {/* ── Observações ──────────────────────────────────────────── */}
                <section className="border-t border-gray-100 pt-5">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Observações internas (opcional)</label>
                  <textarea
                    value={form.notes}
                    onChange={e => set('notes', e.target.value)}
                    rows={2}
                    placeholder="Notas sobre este plano..."
                    className={cn(inputCls, 'resize-none')}
                  />
                </section>

              </div>

              {/* Footer fixo */}
              <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-gray-200 bg-white px-6 py-4">
                <button
                  type="button"
                  onClick={closeDrawer}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 rounded-lg bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
                >
                  {saving
                    ? <><Loader2 size={14} className="animate-spin" />Salvando...</>
                    : <><Save size={14} />{editingPlan ? 'Salvar alterações' : 'Criar plano'}</>
                  }
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  )
}
