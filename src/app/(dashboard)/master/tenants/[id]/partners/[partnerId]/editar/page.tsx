'use client'

// =============================================================================
// /master/tenants/[id]/partners/[partnerId]/editar — Editar dados de um sócio
//
// • CPF é exibido mas não pode ser alterado (identificador permanente)
// • CEP com auto-lookup via /api/address/lookup-by-cep
// • PATCH /api/master/tenants/[id]/partners/[partnerId]
// • Se sócio não tem User e é promovido a principal / SOCIO_ADMINISTRADOR:
//   → a API cria o User ADM automaticamente (senha = CPF, mustChangePassword = true)
// =============================================================================

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession }                               from 'next-auth/react'
import { useRouter, useParams }                     from 'next/navigation'
import Link                                         from 'next/link'
import {
  ArrowLeft, Save, Loader2, AlertCircle,
  CheckCircle2, User, MapPin, KeyRound, ShieldCheck,
  UserCheck, Clock,
} from 'lucide-react'
import { maskPhone } from '@/lib/masks'

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeCEP(v: string) { return v.replace(/\D/g, '').slice(0, 8) }

function maskCPF(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
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

const ROLE_LABELS: Record<string, string> = {
  MASTER:          'Master',
  ADM:             'Administrador',
  GERENTE_GERAL:   'Gerente Geral',
  GERENTE:         'Gerente',
  VENDEDOR_LIDER:  'Vendedor Líder',
  VENDEDOR:        'Vendedor',
  USUARIO_LIDER:   'Usuário Líder',
  USUARIO:         'Usuário',
}

// ── Tipos ─────────────────────────────────────────────────────────────────────

type CepStatus = 'idle' | 'loading' | 'found' | 'not_found' | 'error'

interface PartnerUser {
  id:                string
  email:             string
  role:              string
  status:            string
  lastLoginAt:       string | null
  mustChangePassword: boolean
}

interface FormState {
  nomeCompleto:   string
  rg:             string
  celular:        string
  email:          string
  dataNascimento: string
  role:           string
  participacao:   string
  principal:      boolean
  // endereço
  cep:            string
  logradouro:     string
  numero:         string
  complemento:    string
  bairro:         string
  cidade:         string
  estado:         string
}

const EMPTY: FormState = {
  nomeCompleto: '', rg: '', celular: '', email: '',
  dataNascimento: '', role: 'SOCIO', participacao: '',
  principal: false,
  cep: '', logradouro: '', numero: '', complemento: '',
  bairro: '', cidade: '', estado: '',
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function EditarPartnerPage() {
  const { data: session, status } = useSession()
  const router      = useRouter()
  const { id, partnerId } = useParams<{ id: string; partnerId: string }>()

  const [form,        setForm]        = useState<FormState>(EMPTY)
  const [cpfDisplay,  setCpfDisplay]  = useState('')
  const [partnerUser, setPartnerUser] = useState<PartnerUser | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')
  const [successInfo, setSuccessInfo] = useState<{ userCreated?: boolean; email?: string } | null>(null)

  // Auto-redirect após sucesso simples
  useEffect(() => {
    if (successInfo && !successInfo.userCreated) {
      const t = setTimeout(() => router.replace(`/master/tenants/${id}`), 1500)
      return () => clearTimeout(t)
    }
    return undefined
  }, [successInfo, router, id])

  // CEP lookup
  const [cepStatus, setCepStatus] = useState<CepStatus>('idle')
  const cepTimer = useRef<ReturnType<typeof setTimeout>>()

  // Determina se sócio vai precisar de usuário com os dados atuais do form
  const willNeedUser = form.principal || form.role === 'SOCIO_ADMINISTRADOR'
  const willCreateUser = willNeedUser && !partnerUser

  // Auth guard
  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role !== 'MASTER') {
      router.replace('/inicio')
    }
  }, [session, status, router])

  // Load partner data
  const load = useCallback(async () => {
    if (session?.user?.role !== 'MASTER') return
    setLoadingData(true)
    try {
      const res  = await fetch(`/api/master/tenants/${id}/partners`)
      const data = await res.json()
      const list: Array<{
        id: string; cpf: string; nomeCompleto: string; rg: string | null;
        celular: string | null; email: string | null; dataNascimento: string | null;
        role: string; participacao: string | null; principal: boolean;
        cep: string | null; logradouro: string | null; numero: string | null;
        complemento: string | null; bairro: string | null; cidade: string | null;
        estado: string | null;
        user: PartnerUser | null;
      }> = data.data ?? []

      const partner = list.find(p => p.id === partnerId)
      if (!partner) {
        setError('Sócio não encontrado.')
        return
      }

      setCpfDisplay(maskCPF(partner.cpf))
      setPartnerUser(partner.user)
      setForm({
        nomeCompleto:   partner.nomeCompleto,
        rg:             partner.rg            ?? '',
        celular:        partner.celular        ?? '',
        email:          partner.email          ?? '',
        dataNascimento: partner.dataNascimento
          ? partner.dataNascimento.slice(0, 10) : '',
        role:          partner.role,
        participacao:  partner.participacao !== null && partner.participacao !== undefined
          ? String(partner.participacao) : '',
        principal:     partner.principal,
        cep:           partner.cep        ? maskCEP(partner.cep) : '',
        logradouro:    partner.logradouro  ?? '',
        numero:        partner.numero      ?? '',
        complemento:   partner.complemento ?? '',
        bairro:        partner.bairro      ?? '',
        cidade:        partner.cidade      ?? '',
        estado:        partner.estado      ?? '',
      })
    } catch {
      setError('Erro ao carregar dados do sócio.')
    } finally {
      setLoadingData(false)
    }
  }, [session, id, partnerId])

  useEffect(() => { load() }, [load])

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

  // ── Field helper ─────────────────────────────────────────────────────────

  function set(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(p => ({ ...p, [key]: e.target.value }))
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.nomeCompleto.trim()) { setError('Nome completo é obrigatório.'); return }
    if (willCreateUser && !form.email.trim()) {
      setError('E-mail é obrigatório para sócio-administrador ou sócio principal.')
      return
    }

    setSaving(true)
    try {
      const res  = await fetch(`/api/master/tenants/${id}/partners/${partnerId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          nomeCompleto:  form.nomeCompleto.trim(),
          rg:            form.rg.trim()         || null,
          celular:       form.celular.trim()     || null,
          email:         form.email.trim()       || null,
          dataNascimento:form.dataNascimento     || null,
          role:          form.role,
          participacao:  form.participacao ? parseFloat(form.participacao) : null,
          principal:     form.principal,
          address: {
            cep:         normalizeCEP(form.cep)  || null,
            logradouro:  form.logradouro.trim()  || null,
            numero:      form.numero.trim()      || null,
            complemento: form.complemento.trim() || null,
            bairro:      form.bairro.trim()      || null,
            cidade:      form.cidade.trim()      || null,
            estado:      form.estado             || null,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao salvar.')

      setSuccessInfo({
        userCreated: data.userCreated ?? false,
        email:       form.email.trim() || undefined,
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
  const labelCls = 'text-xs font-medium text-gray-600 block mb-1'

  if (loadingData) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    )
  }

  // ── Tela de sucesso ────────────────────────────────────────────────────────

  if (successInfo) {
    if (successInfo.userCreated) {
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
                    <span className="font-mono font-semibold text-gray-800">{successInfo.email}</span>
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
      <div className="flex h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          <p className="text-base font-semibold text-emerald-700">Sócio atualizado!</p>
          <p className="text-xs text-gray-400">Redirecionando...</p>
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
          <h1 className="text-xl font-bold text-gray-900">Editar sócio</h1>
          <p className="text-xs text-gray-400 font-mono">{cpfDisplay}</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={15} className="shrink-0" />
          {error}
        </div>
      )}

      {/* ── Painel de acesso ao sistema ───────────────────────────────────── */}
      {partnerUser ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-800">
            <UserCheck size={15} /> Acesso ao sistema vinculado
          </p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
            <div className="flex items-center gap-1.5 text-gray-600">
              <span className="text-gray-400">Login:</span>
              <span className="font-mono font-medium text-gray-800">{partnerUser.email}</span>
            </div>
            <div className="flex items-center gap-1.5 text-gray-600">
              <span className="text-gray-400">Perfil:</span>
              <span className="font-medium text-gray-800">{ROLE_LABELS[partnerUser.role] ?? partnerUser.role}</span>
            </div>
            <div className="flex items-center gap-1.5 text-gray-600">
              <span className="text-gray-400">Status:</span>
              <span className={`font-medium ${partnerUser.status === 'ATIVO' ? 'text-emerald-700' : 'text-red-600'}`}>
                {partnerUser.status}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-gray-600">
              <Clock size={11} className="text-gray-400" />
              {partnerUser.lastLoginAt
                ? `Último acesso: ${new Date(partnerUser.lastLoginAt).toLocaleDateString('pt-BR')}`
                : 'Nunca acessou'}
            </div>
          </div>
          {partnerUser.mustChangePassword && (
            <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
              <ShieldCheck size={12} />
              Aguardando troca de senha obrigatória no próximo acesso
            </div>
          )}
        </div>
      ) : willNeedUser ? (
        <div className="flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3.5">
          <KeyRound size={16} className="text-brand-700 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-brand-800">Acesso será criado ao salvar</p>
            <p className="text-xs text-brand-700">
              Este sócio receberá um usuário <strong>ADM</strong> da loja.
              Login: e-mail informado &bull; Senha inicial: CPF sem pontuação.
              Troca de senha obrigatória no 1.º acesso.
            </p>
          </div>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* ── Dados pessoais ─────────────────────────────────────────────── */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <h2 className="flex items-center gap-2 font-semibold text-gray-800 text-sm">
            <User size={14} className="text-brand-600" /> Dados pessoais
          </h2>

          {/* CPF (somente leitura) */}
          <div>
            <label className={labelCls}>CPF (não editável)</label>
            <input
              readOnly
              value={cpfDisplay}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-mono text-gray-500 cursor-not-allowed"
            />
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
              <input className={inputCls} value={maskPhone(form.celular)} onChange={(e) => setForm(p => ({ ...p, celular: maskPhone(e.target.value) }))} placeholder="(11) 99999-9999" inputMode="numeric" />
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
              />
              {willCreateUser && !form.email && (
                <p className="mt-1 text-xs text-amber-600">Obrigatório — será o login do usuário ADM</p>
              )}
              {partnerUser && (
                <p className="mt-1 text-xs text-gray-400">Alterar o e-mail aqui também atualizará o login do usuário</p>
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
            <MapPin size={14} className="text-brand-600" /> Endereço
          </h2>

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
                {cepStatus === 'loading' && <Loader2       size={13} className="animate-spin text-gray-400" />}
                {cepStatus === 'found'   && <CheckCircle2  size={13} className="text-emerald-500" />}
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
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {saving
              ? <><Loader2 size={14} className="animate-spin" />Salvando...</>
              : <><Save    size={14} />
                  {willCreateUser ? 'Salvar e criar acesso' : 'Salvar alterações'}
                </>
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
