'use client'

// =============================================================================
// /master/tenants/[id]/partners/novo — Adicionar sócio ao tenant
//
// Regra de acesso:
//   • SOCIO_ADMINISTRADOR ou principal = true → usuário ADM criado automaticamente
//   • Login: e-mail   |   Senha inicial: CPF sem pontuação
//   • mustChangePassword = true no 1.º acesso
// =============================================================================

import { useState, useEffect, useRef } from 'react'
import { useSession }                   from 'next-auth/react'
import { useRouter, useParams }         from 'next/navigation'
import Link                             from 'next/link'
import {
  ArrowLeft, Save, Loader2, AlertCircle, CheckCircle2,
  AlertTriangle, User, MapPin, Search, KeyRound, ShieldCheck,
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeCPF(v: string)  { return v.replace(/\D/g, '').slice(0, 11) }
function normalizeCEP(v: string)  { return v.replace(/\D/g, '').slice(0, 8) }

function maskCPF(v: string) {
  const d = normalizeCPF(v)
  if (d.length <= 3)  return d
  if (d.length <= 6)  return `${d.slice(0,3)}.${d.slice(3)}`
  if (d.length <= 9)  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`
}

function maskCEP(v: string) {
  const d = normalizeCEP(v)
  return d.length <= 5 ? d : `${d.slice(0,5)}-${d.slice(5)}`
}

const ROLE_OPTIONS = [
  { value: 'SOCIO_ADMINISTRADOR', label: 'Sócio-Administrador' },
  { value: 'SOCIO',               label: 'Sócio' },
  { value: 'REPRESENTANTE_LEGAL', label: 'Representante Legal' },
  { value: 'PROCURADOR',          label: 'Procurador' },
]

const BR_STATES = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG',
  'MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO']

// ── Tipos ─────────────────────────────────────────────────────────────────────

type CpfStatus = 'idle' | 'checking' | 'ok' | 'duplicate' | 'error'
type CepStatus = 'idle' | 'loading' | 'found' | 'not_found' | 'error'

interface FormState {
  cpf:           string
  nomeCompleto:  string
  rg:            string
  celular:       string
  email:         string
  dataNascimento:string
  role:          string
  participacao:  string
  principal:     boolean
  // endereço
  cep:           string
  logradouro:    string
  numero:        string
  complemento:   string
  bairro:        string
  cidade:        string
  estado:        string
}

const EMPTY: FormState = {
  cpf: '', nomeCompleto: '', rg: '', celular: '', email: '',
  dataNascimento: '', role: 'SOCIO', participacao: '',
  principal: false,
  cep: '', logradouro: '', numero: '', complemento: '',
  bairro: '', cidade: '', estado: '',
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function NovoPartnerPage() {
  const { data: session, status } = useSession()
  const router  = useRouter()
  const { id }  = useParams<{ id: string }>()

  const [form,    setForm]    = useState<FormState>(EMPTY)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const [successData, setSuccessData] = useState<{ email: string } | null>(null)

  // CPF check state
  const [cpfStatus,  setCpfStatus]  = useState<CpfStatus>('idle')
  const [cpfWarning, setCpfWarning] = useState('')
  const cpfTimer = useRef<ReturnType<typeof setTimeout>>()

  // CEP lookup state
  const [cepStatus, setCepStatus] = useState<CepStatus>('idle')
  const cepTimer = useRef<ReturnType<typeof setTimeout>>()

  // Determina se este sócio vai gerar um usuário ADM
  const willCreateUser = form.principal || form.role === 'SOCIO_ADMINISTRADOR'

  // Auth guard
  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role !== 'MASTER') {
      router.replace('/inicio')
    }
  }, [session, status, router])

  // ── CPF debounced lookup ─────────────────────────────────────────────────

  function handleCpfChange(raw: string) {
    const masked = maskCPF(raw)
    setForm(p => ({ ...p, cpf: masked }))
    setCpfWarning('')

    const digits = normalizeCPF(raw)
    if (digits.length < 11) { setCpfStatus('idle'); return }

    setCpfStatus('checking')
    clearTimeout(cpfTimer.current)
    cpfTimer.current = setTimeout(async () => {
      try {
        const res  = await fetch(`/api/people/check-cpf?cpf=${digits}`)
        const data = await res.json()
        if (data.found) {
          if (data.existsInOtherTenant) {
            setCpfStatus('duplicate')
            setCpfWarning(`CPF já cadastrado em outro tenant (${data.tenant?.name ?? 'desconhecido'}).`)
          } else {
            setCpfStatus('duplicate')
            setCpfWarning(data.message ?? 'CPF já cadastrado.')
          }
        } else {
          setCpfStatus('ok')
        }
      } catch {
        setCpfStatus('error')
      }
    }, 500)
  }

  // ── CEP debounced lookup ─────────────────────────────────────────────────

  function handleCepChange(raw: string) {
    const masked = maskCEP(raw)
    setForm(p => ({ ...p, cep: masked }))

    const digits = normalizeCEP(raw)
    if (digits.length < 8) { setCepStatus('idle'); return }

    setCepStatus('loading')
    clearTimeout(cepTimer.current)
    cepTimer.current = setTimeout(async () => {
      try {
        const res  = await fetch(`/api/address/lookup-by-cep?cep=${digits}`)
        const data = await res.json()
        if (data.success && data.data) {
          const a = data.data
          setForm(p => ({
            ...p,
            logradouro: a.logradouro || p.logradouro,
            bairro:     a.bairro     || p.bairro,
            cidade:     a.cidade     || p.cidade,
            estado:     a.estado     || p.estado,
          }))
          setCepStatus('found')
        } else {
          setCepStatus('not_found')
        }
      } catch {
        setCepStatus('error')
      }
    }, 500)
  }

  // ── Field helpers ────────────────────────────────────────────────────────

  function set(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(p => ({ ...p, [key]: e.target.value }))
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const cpfDigits = normalizeCPF(form.cpf)
    if (cpfDigits.length !== 11) { setError('CPF inválido.'); return }
    if (!form.nomeCompleto.trim()) { setError('Nome completo é obrigatório.'); return }
    if (willCreateUser && !form.email.trim()) {
      setError('E-mail é obrigatório para sócio-administrador ou sócio principal.')
      return
    }

    setSaving(true)
    try {
      const res  = await fetch(`/api/master/tenants/${id}/partners`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          cpf:           cpfDigits,
          nomeCompleto:  form.nomeCompleto.trim(),
          rg:            form.rg.trim()             || null,
          celular:       form.celular.trim()         || null,
          email:         form.email.trim()           || null,
          dataNascimento:form.dataNascimento         || null,
          role:          form.role,
          participacao:  form.participacao ? parseFloat(form.participacao) : null,
          principal:     form.principal,
          address: {
            cep:         normalizeCEP(form.cep)     || null,
            logradouro:  form.logradouro.trim()      || null,
            numero:      form.numero.trim()          || null,
            complemento: form.complemento.trim()     || null,
            bairro:      form.bairro.trim()          || null,
            cidade:      form.cidade.trim()          || null,
            estado:      form.estado                 || null,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao adicionar sócio.')

      if (data.userCreated) {
        setSuccessData({ email: form.email.trim() })
      } else {
        router.replace(`/master/tenants/${id}`)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao adicionar sócio.')
    } finally {
      setSaving(false)
    }
  }

  // ── UI helpers ────────────────────────────────────────────────────────────

  const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
  const labelCls = 'text-xs font-medium text-gray-600 block mb-1'

  const cpfBorderCls =
    cpfStatus === 'ok'        ? 'border-emerald-400 focus:ring-emerald-400' :
    cpfStatus === 'duplicate' ? 'border-red-300    focus:ring-red-400' :
    'border-gray-300 focus:border-brand-500 focus:ring-brand-500'

  // ── Tela de sucesso com acesso criado ─────────────────────────────────────

  if (successData) {
    return (
      <div className="max-w-md">
        <div className="rounded-2xl border border-emerald-200 bg-white shadow-sm overflow-hidden">
          <div className="bg-emerald-600 px-6 py-5 text-white flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-bold text-base">Sócio e acesso criados!</h2>
              <p className="text-xs text-emerald-100">Usuário ADM gerado automaticamente</p>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 space-y-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-800">
                <KeyRound size={13} /> Credenciais de acesso
              </p>
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Login (e-mail):</span>
                  <span className="font-mono font-semibold text-gray-800">{successData.email}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Senha inicial:</span>
                  <span className="font-mono font-semibold text-gray-800">CPF sem pontuação</span>
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5">
              <ShieldCheck className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                O sócio será obrigado a criar uma nova senha no primeiro acesso ao sistema.
              </p>
            </div>
            <button
              onClick={() => router.replace(`/master/tenants/${id}`)}
              className="w-full rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 transition-colors"
            >
              Voltar ao tenant
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={`/master/tenants/${id}`}
          className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50"
        >
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Adicionar sócio</h1>
          <p className="text-xs text-gray-400">Preencha os dados do novo sócio / responsável</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={15} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Banner de aviso de acesso automático */}
      {willCreateUser && (
        <div className="flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3.5">
          <KeyRound size={16} className="text-brand-700 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-brand-800">Acesso ao sistema será criado</p>
            <p className="text-xs text-brand-700">
              Este sócio receberá um usuário <strong>ADM</strong> da loja.
              Login: e-mail informado &bull; Senha inicial: CPF sem pontuação.
              Troca de senha obrigatória no 1.º acesso.
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* ── CPF (campo principal) ─────────────────────────────────────── */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <h2 className="flex items-center gap-2 font-semibold text-gray-800 text-sm">
            <User size={14} className="text-brand-600" /> Identificação
          </h2>

          <div>
            <label className={labelCls}>CPF *</label>
            <div className="relative">
              <input
                className={`${inputCls} pr-8 font-mono ${cpfBorderCls}`}
                placeholder="000.000.000-00"
                value={form.cpf}
                onChange={e => handleCpfChange(e.target.value)}
                maxLength={14}
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
                {cpfStatus === 'checking' && <Loader2 size={14} className="animate-spin text-gray-400" />}
                {cpfStatus === 'ok'       && <CheckCircle2 size={14} className="text-emerald-500" />}
                {cpfStatus === 'duplicate'&& <AlertCircle  size={14} className="text-red-500" />}
              </span>
            </div>
            {cpfStatus === 'duplicate' && cpfWarning && (
              <p className="mt-1 flex items-center gap-1 text-xs text-amber-700">
                <AlertTriangle size={11} className="shrink-0" />
                {cpfWarning}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>Nome completo *</label>
              <input className={inputCls} value={form.nomeCompleto} onChange={set('nomeCompleto')} placeholder="Nome como no documento" />
            </div>
            <div>
              <label className={labelCls}>RG</label>
              <input className={inputCls} value={form.rg} onChange={set('rg')} placeholder="00.000.000-0" />
            </div>
            <div>
              <label className={labelCls}>Data de nascimento</label>
              <input type="date" className={inputCls} value={form.dataNascimento} onChange={set('dataNascimento')} />
            </div>
            <div>
              <label className={labelCls}>Celular</label>
              <input className={inputCls} value={form.celular} onChange={set('celular')} placeholder="(00) 9 0000-0000" />
            </div>
            <div>
              <label className={labelCls}>
                E-mail{willCreateUser && <span className="ml-1 text-red-500">*</span>}
              </label>
              <input
                type="email"
                className={`${inputCls} ${willCreateUser && !form.email ? 'border-amber-300 focus:ring-amber-400' : ''}`}
                value={form.email}
                onChange={set('email')}
                placeholder="nome@empresa.com.br"
                required={willCreateUser}
              />
              {willCreateUser && !form.email && (
                <p className="mt-1 text-xs text-amber-600">Obrigatório — será o login do usuário ADM</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Papel e participação ─────────────────────────────────────── */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <h2 className="font-semibold text-gray-800 text-sm">Papel no Tenant</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Função / papel</label>
              <select className={inputCls} value={form.role} onChange={set('role')}>
                {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Participação (%)</label>
              <input
                type="number" min={0} max={100} step={0.01}
                className={inputCls}
                value={form.participacao}
                onChange={set('participacao')}
                placeholder="Ex: 50.00"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              checked={form.principal}
              onChange={e => setForm(p => ({ ...p, principal: e.target.checked }))}
            />
            <span className="text-sm font-medium text-gray-700">Sócio principal (ADM do tenant)</span>
          </label>
        </div>

        {/* ── Endereço ─────────────────────────────────────────────────── */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <h2 className="flex items-center gap-2 font-semibold text-gray-800 text-sm">
            <MapPin size={14} className="text-brand-600" /> Endereço (opcional)
          </h2>

          {/* CEP */}
          <div className="max-w-[180px]">
            <label className={labelCls}>CEP</label>
            <div className="relative">
              <input
                className={`${inputCls} pr-8 font-mono`}
                placeholder="00000-000"
                value={form.cep}
                onChange={e => handleCepChange(e.target.value)}
                maxLength={9}
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
                {cepStatus === 'loading'   && <Loader2    size={13} className="animate-spin text-gray-400" />}
                {cepStatus === 'found'     && <CheckCircle2 size={13} className="text-emerald-500" />}
                {cepStatus === 'not_found' && <Search      size={13} className="text-gray-300" />}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>Logradouro</label>
              <input className={inputCls} value={form.logradouro} onChange={set('logradouro')} placeholder="Rua, Av., etc." />
            </div>
            <div>
              <label className={labelCls}>Número</label>
              <input className={inputCls} value={form.numero} onChange={set('numero')} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Complemento</label>
              <input className={inputCls} value={form.complemento} onChange={set('complemento')} placeholder="Apto, sala..." />
            </div>
            <div>
              <label className={labelCls}>Bairro</label>
              <input className={inputCls} value={form.bairro} onChange={set('bairro')} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>Cidade</label>
              <input className={inputCls} value={form.cidade} onChange={set('cidade')} />
            </div>
            <div>
              <label className={labelCls}>Estado</label>
              <select className={inputCls} value={form.estado} onChange={set('estado')}>
                <option value="">—</option>
                {BR_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* ── Botões ────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving || cpfStatus === 'checking'}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {saving
              ? <><Loader2 size={14} className="animate-spin" />Salvando...</>
              : <><Save    size={14} />{willCreateUser ? 'Adicionar sócio e criar acesso' : 'Adicionar sócio'}</>
            }
          </button>
          <Link
            href={`/master/tenants/${id}`}
            className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  )
}
