'use client'

// =============================================================================
// /master/tenants/novo — Cadastro profissional de Tenant
//
// Fluxo: CNPJ → Empresa → Endereço → Sócios → Plano → Revisão → Criar
// =============================================================================

import { useState, useRef, useCallback, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, ArrowRight, Building2, MapPin, Users, Package,
  ClipboardCheck, CheckCircle2, AlertTriangle, Info,
  Loader2, Search, XCircle, AlertCircle, Plus, Trash2,
  RefreshCw, ShieldCheck, KeyRound,
} from 'lucide-react'
import { normalizeCNPJ, formatCNPJ, isValidCNPJ, isCNPJComplete } from '@/lib/br-docs/cnpj'
import { normalizeCPF, formatCPF, isValidCPF, isCPFComplete } from '@/lib/br-docs/cpf'
import { normalizeCEP, formatCEP, isValidCEP } from '@/lib/br-docs/cep'
import { formatPhone, normalizePhone } from '@/lib/br-docs/phone'

// ── Tipos ─────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4 | 5

type CnpjStatus = 'idle' | 'checking' | 'valid' | 'invalid' | 'duplicate' | 'found' | 'not_found' | 'error'
type CepStatus  = 'idle' | 'loading' | 'found' | 'not_found' | 'error'
type CpfStatus  = 'idle' | 'checking' | 'found' | 'not_found' | 'invalid' | 'error'

interface Address {
  cep:         string
  logradouro:  string
  numero:      string
  complemento: string
  bairro:      string
  cidade:      string
  estado:      string
}

interface Partner {
  cpf:            string
  nomeCompleto:   string
  rg:             string
  celular:        string
  email:          string
  dataNascimento: string
  role:           string
  participacao:   string
  principal:      boolean
  address:        Address
  cpfStatus:      CpfStatus
  cpfMessage:     string
  cepStatus:      CepStatus
}

const EMPTY_ADDRESS: Address = {
  cep: '', logradouro: '', numero: '', complemento: '',
  bairro: '', cidade: '', estado: '',
}

const EMPTY_PARTNER: Partner = {
  cpf: '', nomeCompleto: '', rg: '', celular: '', email: '',
  dataNascimento: '', role: 'SOCIO', participacao: '', principal: false,
  address: { ...EMPTY_ADDRESS }, cpfStatus: 'idle', cpfMessage: '', cepStatus: 'idle',
}

// ── Medidor de força de senha ────────────────────────────────────────────────

interface PasswordStrength {
  score:    0 | 1 | 2 | 3 | 4   // 0=fraca … 4=muito forte
  label:    string
  color:    string
  rules: {
    uppercase: boolean
    lowercase: boolean
    digit:     boolean
    specials:  number            // contagem
    length:    boolean
  }
  valid: boolean                 // true quando atende TODOS os requisitos mínimos
}

function analyzePassword(pwd: string): PasswordStrength {
  const uppercase = /[A-Z]/.test(pwd)
  const lowercase = /[a-z]/.test(pwd)
  const digit     = /\d/.test(pwd)
  const specials  = (pwd.match(/[^A-Za-z0-9]/g) ?? []).length
  const length    = pwd.length >= 8

  const mandatoryOk = uppercase && lowercase && digit && specials >= 2 && length

  // Score adicional por comprimento e quantidade de specials
  let score = 0
  if (length)           score++
  if (pwd.length >= 12) score++
  if (uppercase)        score++
  if (lowercase)        score++
  if (digit)            score++
  if (specials >= 1)    score++
  if (specials >= 2)    score++

  // Normaliza para 0-4
  const normalized = Math.min(4, Math.floor(score / 2)) as 0 | 1 | 2 | 3 | 4

  const labels = ['Muito fraca', 'Fraca', 'Média', 'Forte', 'Muito forte']
  const colors = ['bg-red-500', 'bg-orange-400', 'bg-yellow-400', 'bg-emerald-400', 'bg-emerald-600']

  return {
    score:    normalized,
    label:    labels[normalized],
    color:    colors[normalized],
    rules:    { uppercase, lowercase, digit, specials, length },
    valid:    mandatoryOk,
  }
}

// ── Helpers de UI ─────────────────────────────────────────────────────────────

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const selectCls = inputCls

function Field({ label, required, hint, error, children }: {
  label: string; required?: boolean; hint?: string; error?: string; children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-600">
        {label}{required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="h-3 w-3 shrink-0" />{error}</p>}
      {hint  && !error && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  )
}

function Grid({ cols = 2, children }: { cols?: 2 | 3 | 4; children: React.ReactNode }) {
  const map = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' }
  return <div className={`grid grid-cols-1 gap-4 ${map[cols]}`}>{children}</div>
}

function Section({ title, icon, children }: {
  title: string; icon?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        {icon && <span className="text-brand-600">{icon}</span>}
        <h3 className="font-semibold text-gray-800">{title}</h3>
      </div>
      {children}
    </div>
  )
}

// ── StepBar ───────────────────────────────────────────────────────────────────

const STEPS = [
  { num: 1, label: 'Empresa',   icon: <Building2 className="h-4 w-4" /> },
  { num: 2, label: 'Endereço',  icon: <MapPin    className="h-4 w-4" /> },
  { num: 3, label: 'Sócios',    icon: <Users     className="h-4 w-4" /> },
  { num: 4, label: 'Plano',     icon: <Package   className="h-4 w-4" /> },
  { num: 5, label: 'Revisão',   icon: <ClipboardCheck className="h-4 w-4" /> },
]

function StepBar({ current, maxReached }: { current: Step; maxReached: Step }) {
  return (
    <div className="flex items-center overflow-x-auto pb-1 gap-0">
      {STEPS.map((s, i) => {
        const done    = s.num < current
        const active  = s.num === current
        const enabled = s.num <= maxReached
        return (
          <div key={s.num} className="flex items-center">
            <div className={[
              'flex flex-col items-center gap-1 px-3 py-2 rounded-lg whitespace-nowrap',
              active  ? 'bg-brand-600 text-white shadow-sm' : '',
              done    ? 'text-brand-700' : '',
              !enabled ? 'text-gray-300' : '',
            ].join(' ')}>
              <span className={[
                'flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold',
                active  ? 'bg-white text-brand-600'   : '',
                done    ? 'bg-brand-100 text-brand-600' : '',
                !enabled && !active ? 'bg-gray-100 text-gray-300' : '',
              ].join(' ')}>
                {done ? <CheckCircle2 className="h-4 w-4" /> : s.num}
              </span>
              <span className="text-xs font-medium">{s.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 w-6 shrink-0 ${s.num < current ? 'bg-brand-400' : 'bg-gray-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Componente CEP Input reutilizável ─────────────────────────────────────────

function CepInput({
  value, onChange, onAddressFilled, label = 'CEP', required,
}: {
  value:           string
  onChange:        (raw: string, display: string) => void
  onAddressFilled: (addr: Partial<Address>) => void
  label?:          string
  required?:       boolean
}) {
  const [status, setStatus] = useState<CepStatus>('idle')
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const lookup = useCallback(async (cep: string) => {
    setStatus('loading')
    try {
      const res  = await fetch(`/api/address/lookup-by-cep?cep=${cep}`)
      const data = await res.json()
      if (data.success && data.found) {
        setStatus('found')
        onAddressFilled(data.data)
      } else {
        setStatus('not_found')
      }
    } catch {
      setStatus('error')
    }
  }, [onAddressFilled])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const masked = formatCEP(e.target.value)
    const raw    = normalizeCEP(masked)
    onChange(raw, masked)
    setStatus('idle')
    if (debounce.current) clearTimeout(debounce.current)
    if (isValidCEP(raw)) {
      debounce.current = setTimeout(() => lookup(raw), 500)
    }
  }

  return (
    <Field label={label} required={required}>
      <div className="relative">
        <input
          value={formatCEP(value)}
          onChange={handleChange}
          maxLength={9}
          placeholder="00000-000"
          className={inputCls + (status === 'found' ? ' border-emerald-400 bg-emerald-50' : '')}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {status === 'loading'   && <Loader2    className="h-4 w-4 animate-spin text-brand-500" />}
          {status === 'found'     && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
          {status === 'not_found' && <AlertCircle  className="h-4 w-4 text-amber-500" />}
          {status === 'error'     && <XCircle      className="h-4 w-4 text-red-500" />}
        </div>
      </div>
      {status === 'found'     && <p className="text-xs text-emerald-600">Endereço preenchido automaticamente.</p>}
      {status === 'not_found' && <p className="text-xs text-amber-600">CEP não encontrado. Preencha manualmente.</p>}
      {status === 'error'     && <p className="text-xs text-red-600">Erro ao consultar CEP. Preencha manualmente.</p>}
    </Field>
  )
}

// ── Formulário principal ──────────────────────────────────────────────────────

function NovoTenantForm() {
  const router = useRouter()

  const [step,       setStep]       = useState<Step>(1)
  const [maxReached, setMaxReached] = useState<Step>(1)
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')
  const [success,    setSuccess]    = useState(false)
  const [createdId,  setCreatedId]  = useState('')

  // ── Etapa 1 — CNPJ + Empresa ─────────────────────────────────────────────
  const [cnpjRaw,      setCnpjRaw]      = useState('')
  const [cnpjStatus,   setCnpjStatus]   = useState<CnpjStatus>('idle')
  const [cnpjMessage,  setCnpjMessage]  = useState('')
  const [lookupSource, setLookupSource] = useState('')

  const [razaoSocial,    setRazaoSocial]    = useState('')
  const [nomeFantasia,   setNomeFantasia]   = useState('')
  const [ie,             setIe]             = useState('')
  const [isentoIE,       setIsentoIE]       = useState(false)
  const [situacao,       setSituacao]       = useState('')
  const [dataAbertura,   setDataAbertura]   = useState('')
  const [telefone,       setTelefone]       = useState('')
  const [email,          setEmail]          = useState('')

  // ── Etapa 2 — Endereço ────────────────────────────────────────────────────
  const [address, setAddress] = useState<Address>({ ...EMPTY_ADDRESS })

  // ── Etapa 3 — Sócios ─────────────────────────────────────────────────────
  const [partners, setPartners] = useState<Partner[]>([{ ...EMPTY_PARTNER, principal: true }])

  // ── Etapa 4 — Plano ───────────────────────────────────────────────────────
  const [tenantPlan,    setTenantPlan]    = useState('BASICO')
  const [tenantStatus,  setTenantStatus]  = useState('TESTE')
  const [trialEndsAt,   setTrialEndsAt]   = useState('')
  const [maxUsers,      setMaxUsers]      = useState('10')
  const [maxVehicles,   setMaxVehicles]   = useState('100')
  const [maxUnits,      setMaxUnits]      = useState('1')
  const [activeModules, setActiveModules] = useState<string[]>([
    'dashboard', 'estoque', 'negociacoes', 'comissoes', 'clientes',
  ])

  // ── Consulta CNPJ ─────────────────────────────────────────────────────────

  const cnpjDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function checkAndLookupCNPJ(cnpj: string) {
    // IMPORTANTE: cnpj aqui já vem normalizado (string com zero à esquerda).
    // Nunca converter para Number — `Number("03367717000164")` perde o zero.
    setCnpjStatus('checking')
    setCnpjMessage('Verificando...')

    try {
      // 1. Verifica duplicidade
      const checkRes  = await fetch(`/api/master/tenants/check-cnpj?cnpj=${encodeURIComponent(cnpj)}`)
      const checkData = await checkRes.json()

      if (!checkData.success && checkData.duplicated) {
        setCnpjStatus('duplicate')
        setCnpjMessage('Já existe um tenant cadastrado com este CNPJ.')
        return
      }

      // 2. Busca dados da empresa via BrasilAPI
      setCnpjMessage('Consultando dados da empresa na BrasilAPI...')
      const lookupRes  = await fetch(`/api/companies/lookup-by-cnpj?cnpj=${encodeURIComponent(cnpj)}`)
      const lookupData = await lookupRes.json()

      // ── (a) Erro técnico — HTTP 502 ou success=false ─────────────────────
      // BrasilAPI fora, URL errada, timeout, credencial mal configurada.
      // NÃO mostrar "empresa não encontrada" — isso é um erro de integração.
      if (!lookupRes.ok || lookupData.success === false) {
        setCnpjStatus('error')
        const isConfigError = /URL inválida|configurada incorretamente/i.test(lookupData.error ?? '')
        setCnpjMessage(
          isConfigError
            ? 'Integração BrasilAPI configurada incorretamente. Verifique em Master → Integrações.'
            : 'Não foi possível consultar a BrasilAPI neste momento. Preencha manualmente ou tente novamente.',
        )
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[tenant/novo] BrasilAPI erro técnico:', lookupData)
        }
        return
      }

      // ── (b) Sucesso com dados ────────────────────────────────────────────
      if (lookupData.found && lookupData.data) {
        const d = lookupData.data
        setCnpjStatus('found')
        setCnpjMessage('Dados carregados automaticamente. Revise e corrija se necessário.')
        setLookupSource(lookupData.source ?? 'api')

        if (d.razaoSocial)  setRazaoSocial(d.razaoSocial)
        if (d.nomeFantasia) setNomeFantasia(d.nomeFantasia)
        if (d.inscricaoEstadual) setIe(d.inscricaoEstadual)
        setIsentoIE(Boolean(d.isentoInscricaoEstadual))
        if (d.situacaoCadastral) setSituacao(d.situacaoCadastral)
        if (d.dataAbertura) setDataAbertura(d.dataAbertura.slice(0, 10))
        if (d.telefone)     setTelefone(formatPhone(d.telefone))
        if (d.email)        setEmail(d.email)

        if (d.address) {
          setAddress({
            cep:         d.address.cep         || '',
            logradouro:  d.address.logradouro   || '',
            numero:      d.address.numero       || '',
            complemento: d.address.complemento  || '',
            bairro:      d.address.bairro       || '',
            cidade:      d.address.cidade       || '',
            estado:      d.address.estado       || '',
          })
        }

        // Alerta se empresa não está ATIVA
        if (d.situacaoCadastral && d.situacaoCadastral !== 'ATIVA') {
          setCnpjMessage(`⚠️ Empresa com situação cadastral: ${d.situacaoCadastral}. Verifique antes de prosseguir.`)
        }
        return
      }

      // ── (c) CNPJ válido mas não está na Receita ─────────────────────────
      setCnpjStatus('not_found')
      setCnpjMessage('Empresa não encontrada na BrasilAPI. Preencha os dados manualmente.')
    } catch (e) {
      setCnpjStatus('error')
      setCnpjMessage('Não foi possível consultar a BrasilAPI neste momento. Preencha manualmente ou tente novamente.')
      if (process.env.NODE_ENV !== 'production') console.warn('[tenant/novo] fetch erro:', e)
    }
  }

  function handleCNPJChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = normalizeCNPJ(e.target.value)
    setCnpjRaw(raw)
    setCnpjStatus('idle')
    setCnpjMessage('')

    if (cnpjDebounce.current) clearTimeout(cnpjDebounce.current)

    if (isCNPJComplete(raw)) {
      if (!isValidCNPJ(raw)) {
        setCnpjStatus('invalid')
        setCnpjMessage('CNPJ inválido. Verifique os dígitos.')
        return
      }
      cnpjDebounce.current = setTimeout(() => checkAndLookupCNPJ(raw), 500)
    }
  }

  // ── CEP da empresa ────────────────────────────────────────────────────────

  function handleCompanyCEPFilled(addr: Partial<Address>) {
    setAddress(prev => ({
      ...prev,
      logradouro:  addr.logradouro  || prev.logradouro,
      complemento: addr.complemento || prev.complemento,
      bairro:      addr.bairro      || prev.bairro,
      cidade:      addr.cidade      || prev.cidade,
      estado:      addr.estado      || prev.estado,
    }))
  }

  // ── Sócios ────────────────────────────────────────────────────────────────

  function updatePartner(idx: number, patch: Partial<Partner>) {
    setPartners(prev => prev.map((p, i) => i === idx ? { ...p, ...patch } : p))
  }

  function handlePartnerCPFChange(idx: number, raw: string) {
    const display = formatCPF(raw)
    updatePartner(idx, { cpf: raw, cpfStatus: 'idle', cpfMessage: '' })

    if (!isCPFComplete(raw)) return
    if (!isValidCPF(raw)) {
      updatePartner(idx, { cpfStatus: 'invalid', cpfMessage: 'CPF inválido.' })
      return
    }

    // Lookup
    updatePartner(idx, { cpfStatus: 'checking', cpfMessage: 'Verificando...' })
    fetch(`/api/people/check-cpf?cpf=${raw}`)
      .then(r => r.json())
      .then(data => {
        if (data.found) {
          updatePartner(idx, {
            cpfStatus:    'found',
            cpfMessage:   data.message ?? 'CPF já cadastrado.',
            nomeCompleto: data.data?.nomeCompleto || '',
            celular:      data.data?.celular ? formatPhone(data.data.celular) : '',
            email:        data.data?.email   || '',
          })
        } else {
          updatePartner(idx, { cpfStatus: 'not_found', cpfMessage: 'CPF não encontrado. Preencha manualmente.' })
        }
      })
      .catch(() => updatePartner(idx, { cpfStatus: 'error', cpfMessage: 'Erro ao verificar CPF.' }))
    void display
  }

  function handlePartnerCEPFilled(idx: number, addr: Partial<Address>) {
    setPartners(prev => prev.map((p, i) => i === idx
      ? { ...p, address: { ...p.address, ...addr } }
      : p
    ))
  }

  function addPartner() {
    setPartners(prev => [...prev, { ...EMPTY_PARTNER, address: { ...EMPTY_ADDRESS } }])
  }

  function removePartner(idx: number) {
    if (partners.length === 1) return
    setPartners(prev => {
      const next = prev.filter((_, i) => i !== idx)
      // Garante que sempre haja um principal
      if (!next.some(p => p.principal)) next[0].principal = true
      return next
    })
  }

  function setPrincipal(idx: number) {
    setPartners(prev => prev.map((p, i) => ({ ...p, principal: i === idx })))
  }

  // ── Módulos ───────────────────────────────────────────────────────────────

  const ALL_MODULES = [
    { key: 'dashboard',     label: 'Dashboard' },
    { key: 'estoque',       label: 'Estoque' },
    { key: 'negociacoes',   label: 'Negociações' },
    { key: 'comissoes',     label: 'Comissões' },
    { key: 'clientes',      label: 'Clientes' },
    { key: 'financeiro',    label: 'Financeiro' },
    { key: 'comunicacao',   label: 'Comunicação' },
    { key: 'documentacao',  label: 'Documentação' },
    { key: 'auditoria',     label: 'Auditoria' },
    { key: 'configuracoes', label: 'Configurações' },
  ]

  function toggleModule(key: string) {
    setActiveModules(prev =>
      prev.includes(key) ? prev.filter(m => m !== key) : [...prev, key]
    )
  }

  // ── Navegação de etapas ───────────────────────────────────────────────────

  function goToStep(s: Step) {
    setStep(s)
    if (s > maxReached) setMaxReached(s)
  }

  function nextStep() {
    const next = (step + 1) as Step
    goToStep(next)
  }

  function prevStep() {
    setStep((step - 1) as Step)
  }

  // ── Validação por etapa ───────────────────────────────────────────────────

  function validateStep1(): string {
    if (!isValidCNPJ(cnpjRaw))       return 'CNPJ inválido.'
    if (cnpjStatus === 'duplicate')   return 'CNPJ já cadastrado em outro tenant.'
    if (!razaoSocial.trim())          return 'Razão social é obrigatória.'
    return ''
  }

  function validateStep2(): string {
    if (!address.cep || !isValidCEP(normalizeCEP(address.cep))) return 'CEP inválido.'
    if (!address.logradouro.trim()) return 'Logradouro é obrigatório.'
    if (!address.numero.trim())     return 'Número é obrigatório.'
    if (!address.bairro.trim())     return 'Bairro é obrigatório.'
    if (!address.cidade.trim())     return 'Cidade é obrigatória.'
    if (!address.estado.trim())     return 'Estado é obrigatório.'
    return ''
  }

  function validateStep3(): string {
    if (partners.length === 0) return 'Pelo menos um sócio é obrigatório.'
    for (let i = 0; i < partners.length; i++) {
      const p = partners[i]
      if (!isValidCPF(p.cpf))          return `Sócio ${i + 1}: CPF inválido.`
      if (!p.nomeCompleto.trim())        return `Sócio ${i + 1}: Nome completo é obrigatório.`
      if (!p.email.trim())               return `Sócio ${i + 1}: E-mail é obrigatório (usado como login do ADM).`
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) return `Sócio ${i + 1}: E-mail inválido.`
    }
    return ''
  }

  function handleNextStep() {
    setError('')
    let err = ''
    if (step === 1) err = validateStep1()
    if (step === 2) err = validateStep2()
    if (step === 3) err = validateStep3()
    if (err) { setError(err); return }
    nextStep()
  }

  // ── Salvar ─────────────────────────────────────────────────────────────────

  async function handleCreate() {
    const err1 = validateStep1()
    const err2 = validateStep2()
    const err3 = validateStep3()
    if (err1 || err2 || err3) {
      setError(err1 || err2 || err3)
      return
    }

    setSaving(true)
    setError('')

    try {
      const payload = {
        company: {
          cnpj:                    cnpjRaw,
          razaoSocial:             razaoSocial.trim(),
          nomeFantasia:            nomeFantasia.trim() || undefined,
          inscricaoEstadual:       isentoIE ? '' : ie.trim(),
          isentoInscricaoEstadual: isentoIE,
          situacaoCadastral:       situacao || undefined,
          dataAbertura:            dataAbertura || undefined,
          telefone:                normalizePhone(telefone) || undefined,
          email:                   email.trim().toLowerCase() || undefined,
          address: {
            cep:         normalizeCEP(address.cep),
            logradouro:  address.logradouro.trim(),
            numero:      address.numero.trim(),
            complemento: address.complemento.trim(),
            bairro:      address.bairro.trim(),
            cidade:      address.cidade.trim(),
            estado:      address.estado.toUpperCase().trim(),
          },
        },
        partners: partners.map(p => ({
          cpf:           p.cpf,
          nomeCompleto:  p.nomeCompleto.trim(),
          rg:            p.rg.trim()    || undefined,
          celular:       normalizePhone(p.celular) || undefined,
          email:         p.email.trim().toLowerCase(),
          dataNascimento: p.dataNascimento || undefined,
          role:          p.role,
          participacao:  p.participacao ? Number(p.participacao) : undefined,
          principal:     p.principal,
          address: {
            cep:         normalizeCEP(p.address.cep) || undefined,
            logradouro:  p.address.logradouro.trim()  || undefined,
            numero:      p.address.numero.trim()      || undefined,
            complemento: p.address.complemento.trim() || undefined,
            bairro:      p.address.bairro.trim()      || undefined,
            cidade:      p.address.cidade.trim()      || undefined,
            estado:      p.address.estado.toUpperCase().trim() || undefined,
          },
        })),
        plan: {
          tenantPlan:   tenantPlan,
          tenantStatus: tenantStatus,
          modules:      activeModules,
          limits: {
            maxUsers:    Number(maxUsers)    || 10,
            maxVehicles: Number(maxVehicles) || 100,
            maxUnits:    Number(maxUnits)    || 1,
          },
          trialEndsAt: trialEndsAt || undefined,
        },
      }

      // ── Sanitização final do payload ──────────────────────────────────────
      // Limpa recursivamente "" / "null" / undefined para evitar que o backend
      // receba strings vazias em campos de relação ou opcionais.
      // - "" → undefined  (campo não enviado)
      // - "null" string → undefined
      // - whitespace puro → undefined
      // Mantém zero numérico, false booleano e objetos vazios.
      const sanitized = sanitizePayload(payload)

      const res  = await fetch('/api/master/tenants', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(sanitized),
      })
      const data = await res.json()

      if (data.success) {
        setCreatedId(data.data?.tenant?.id ?? '')
        setSuccess(true)
      } else {
        // Mensagens vindas de P2003 incluem `hint` específico (campo, ação).
        const msg = data.error ?? 'Erro ao criar tenant.'
        const hint = data.hint ? ` — ${data.hint}` : ''
        setError(msg + hint)
      }
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  // ── Helper de sanitização recursiva ─────────────────────────────────────────
  // Coloca aqui (não em escopo de componente externo) para manter o file conciso.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function sanitizePayload(value: any): any {
    if (value === null || value === undefined) return undefined
    if (typeof value === 'string') {
      const t = value.trim()
      if (!t || t.toLowerCase() === 'null' || t.toLowerCase() === 'undefined') return undefined
      return t
    }
    if (Array.isArray(value)) {
      const arr = value.map(sanitizePayload).filter((v) => v !== undefined)
      return arr.length ? arr : undefined
    }
    if (typeof value === 'object') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const out: any = {}
      for (const [k, v] of Object.entries(value)) {
        const cleaned = sanitizePayload(v)
        if (cleaned !== undefined) out[k] = cleaned
      }
      return Object.keys(out).length ? out : undefined
    }
    return value
  }

  // ── Tela de sucesso ───────────────────────────────────────────────────────

  if (success) {
    const principal = partners.find(p => p.principal) ?? partners[0]
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-5">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 className="h-10 w-10 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-emerald-700">Tenant criado com sucesso!</h2>
          <p className="mt-2 text-sm text-gray-500 max-w-md">
            O tenant <strong>{nomeFantasia || razaoSocial}</strong> foi cadastrado.
          </p>
        </div>

        <div className="w-full max-w-md rounded-xl border border-brand-200 bg-brand-50 p-4 text-left space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700 mb-1 flex items-center gap-1.5">
            <KeyRound className="h-3.5 w-3.5" /> Credenciais do usuário ADM
          </p>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Nome:</span>
              <strong>{principal.nomeCompleto}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Login (e-mail):</span>
              <strong className="font-mono">{principal.email}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Senha inicial:</span>
              <strong className="font-mono">CPF sem pontuação</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Perfil:</span>
              <strong>ADM</strong>
            </div>
          </div>
        </div>

        <div className="w-full max-w-md rounded-xl border border-amber-200 bg-amber-50 p-4 text-left">
          <div className="flex items-start gap-2">
            <ShieldCheck className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-700">Troca de senha obrigatória</p>
              <p className="text-xs text-amber-600 mt-1">
                O sócio será solicitado a criar uma senha segura no primeiro acesso ao sistema,
                respeitando os critérios mínimos de segurança (maiúsculas, números e caracteres especiais).
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Link
            href="/master/tenants"
            className="rounded-lg border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Ver todos os tenants
          </Link>
          {createdId && (
            <Link
              href={`/master/tenants/${createdId}`}
              className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
            >
              Abrir tenant criado
            </Link>
          )}
        </div>
      </div>
    )
  }

  // ── Render principal ──────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 pb-20">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/master/tenants" className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
          <ArrowLeft className="h-4 w-4" />
          Tenants
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-bold text-gray-900">Cadastrar Tenant</h1>
      </div>

      {/* StepBar */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm overflow-x-auto">
        <StepBar current={step} maxReached={maxReached} />
      </div>

      {/* Erro global */}
      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* ═══ ETAPA 1 — CNPJ + Empresa ═══ */}
      {step === 1 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm flex flex-col gap-6">
          <Section title="CNPJ e Dados da Empresa" icon={<Building2 className="h-5 w-5" />}>

            {/* CNPJ */}
            <div className="max-w-sm">
              <Field label="CNPJ" required>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    value={formatCNPJ(cnpjRaw)}
                    onChange={handleCNPJChange}
                    maxLength={18}
                    placeholder="00.000.000/0000-00"
                    className={[
                      inputCls, 'pl-10 pr-10 font-mono text-base font-semibold tracking-wider',
                      cnpjStatus === 'found'     ? 'border-emerald-400 bg-emerald-50' : '',
                      cnpjStatus === 'invalid'   ? 'border-red-300 bg-red-50' : '',
                      cnpjStatus === 'duplicate' ? 'border-red-300 bg-red-50' : '',
                    ].join(' ')}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {cnpjStatus === 'checking'  && <Loader2    className="h-4 w-4 animate-spin text-brand-500" />}
                    {cnpjStatus === 'found'      && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                    {cnpjStatus === 'not_found'  && <AlertCircle  className="h-4 w-4 text-amber-500" />}
                    {cnpjStatus === 'invalid'    && <XCircle      className="h-4 w-4 text-red-500" />}
                    {cnpjStatus === 'duplicate'  && <XCircle      className="h-4 w-4 text-red-500" />}
                    {cnpjStatus === 'error'      && <RefreshCw    className="h-4 w-4 text-gray-400" />}
                  </div>
                </div>

                {/* Mensagem de status do CNPJ */}
                {cnpjMessage && (
                  <p className={[
                    'mt-1 text-xs font-medium flex items-start gap-1',
                    cnpjStatus === 'found'                            ? 'text-emerald-600' : '',
                    cnpjStatus === 'not_found' || cnpjStatus === 'error' ? 'text-amber-600' : '',
                    cnpjStatus === 'invalid'   || cnpjStatus === 'duplicate' ? 'text-red-600' : '',
                    cnpjStatus === 'checking'                          ? 'text-brand-600' : '',
                  ].join(' ')}>
                    <span>{cnpjMessage}</span>
                  </p>
                )}
              </Field>
            </div>

            {/* Alerta situação cadastral */}
            {situacao && situacao !== 'ATIVA' && (
              <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-700">Empresa com situação: {situacao}</p>
                  <p className="text-xs text-red-600 mt-0.5">Verifique com o cliente antes de prosseguir. O MASTER pode continuar ciente desta situação.</p>
                </div>
              </div>
            )}

            <Grid>
              <Field label="Razão Social" required>
                <input value={razaoSocial} onChange={e => setRazaoSocial(e.target.value)} className={inputCls} placeholder="EMPRESA EXEMPLO LTDA" />
              </Field>
              <Field label="Nome Fantasia">
                <input value={nomeFantasia} onChange={e => setNomeFantasia(e.target.value)} className={inputCls} placeholder="Empresa Exemplo" />
              </Field>
            </Grid>

            <Grid>
              <Field label="Inscrição Estadual">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="isentoIE"
                      checked={isentoIE}
                      onChange={e => setIsentoIE(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-brand-600"
                    />
                    <label htmlFor="isentoIE" className="text-xs text-gray-600">Isento de Inscrição Estadual</label>
                  </div>
                  {!isentoIE && (
                    <input
                      value={ie}
                      onChange={e => setIe(e.target.value)}
                      className={inputCls}
                      placeholder="Número da IE"
                      disabled={isentoIE}
                    />
                  )}
                </div>
              </Field>
              <Field label="Situação Cadastral" hint="Preenchida automaticamente via consulta">
                <select value={situacao} onChange={e => setSituacao(e.target.value)} className={selectCls}>
                  <option value="">Não informado</option>
                  <option value="ATIVA">Ativa</option>
                  <option value="INAPTA">Inapta</option>
                  <option value="BAIXADA">Baixada</option>
                  <option value="SUSPENSA">Suspensa</option>
                </select>
              </Field>
              <Field label="Data de Abertura">
                <input type="date" value={dataAbertura} onChange={e => setDataAbertura(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Telefone / WhatsApp">
                <input
                  value={telefone}
                  onChange={e => setTelefone(formatPhone(e.target.value))}
                  maxLength={15}
                  className={inputCls}
                  placeholder="(11) 99999-9999"
                />
              </Field>
              <Field label="E-mail da empresa">
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} placeholder="contato@empresa.com" />
              </Field>
            </Grid>

            {cnpjStatus === 'found' && lookupSource && (
              <div className="flex items-center gap-2 rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-xs text-brand-700">
                <Info className="h-3.5 w-3.5 shrink-0" />
                Dados obtidos via {lookupSource}. Revise e edite se necessário.
              </div>
            )}
          </Section>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleNextStep}
              disabled={!isValidCNPJ(cnpjRaw) || cnpjStatus === 'duplicate'}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              Próxima <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ═══ ETAPA 2 — Endereço ═══ */}
      {step === 2 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm flex flex-col gap-6">
          <Section title="Endereço da Empresa" icon={<MapPin className="h-5 w-5" />}>
            <div className="max-w-xs">
              <CepInput
                value={address.cep}
                onChange={(raw) => setAddress(p => ({ ...p, cep: raw }))}
                onAddressFilled={handleCompanyCEPFilled}
                label="CEP"
                required
              />
            </div>

            <Grid>
              <Field label="Logradouro" required>
                <input value={address.logradouro} onChange={e => setAddress(p => ({ ...p, logradouro: e.target.value }))} className={inputCls} placeholder="Rua, Avenida, Travessa..." />
              </Field>
              <Field label="Número" required>
                <input value={address.numero} onChange={e => setAddress(p => ({ ...p, numero: e.target.value }))} className={inputCls} placeholder="100" />
              </Field>
              <Field label="Complemento">
                <input value={address.complemento} onChange={e => setAddress(p => ({ ...p, complemento: e.target.value }))} className={inputCls} placeholder="Sala 1, Andar 3..." />
              </Field>
              <Field label="Bairro" required>
                <input value={address.bairro} onChange={e => setAddress(p => ({ ...p, bairro: e.target.value }))} className={inputCls} placeholder="Centro" />
              </Field>
              <Field label="Cidade" required>
                <input value={address.cidade} onChange={e => setAddress(p => ({ ...p, cidade: e.target.value }))} className={inputCls} placeholder="Osasco" />
              </Field>
              <Field label="Estado" required>
                <select value={address.estado} onChange={e => setAddress(p => ({ ...p, estado: e.target.value }))} className={selectCls}>
                  <option value="">Selecione</option>
                  {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(uf => (
                    <option key={uf} value={uf}>{uf}</option>
                  ))}
                </select>
              </Field>
            </Grid>
          </Section>

          <div className="flex justify-between">
            <button type="button" onClick={prevStep} className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
              <ArrowLeft className="h-4 w-4" /> Anterior
            </button>
            <button type="button" onClick={handleNextStep} className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700">
              Próxima <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ═══ ETAPA 3 — Sócios ═══ */}
      {step === 3 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm flex flex-col gap-6">
          <Section title="Sócios / Responsáveis" icon={<Users className="h-5 w-5" />}>
            <div className="flex items-start gap-3 rounded-lg border border-brand-100 bg-brand-50 px-4 py-3">
              <Info className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" />
              <p className="text-xs text-brand-700">
                O <strong>primeiro sócio marcado como principal</strong> será criado automaticamente como usuário <strong>ADM</strong> do tenant.
                A senha inicial será o <strong>CPF sem pontuação</strong>. O sistema exigirá troca no primeiro acesso.
              </p>
            </div>

            {partners.map((partner, idx) => (
              <div key={idx} className="rounded-xl border border-gray-200 p-5 flex flex-col gap-4">
                {/* Header do sócio */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                      {idx + 1}
                    </span>
                    <span className="text-sm font-semibold text-gray-700">
                      {partner.nomeCompleto || `Sócio ${idx + 1}`}
                    </span>
                    {partner.principal && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        Principal / ADM
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {!partner.principal && (
                      <button
                        type="button"
                        onClick={() => setPrincipal(idx)}
                        className="text-xs text-brand-600 hover:underline"
                      >
                        Marcar como principal
                      </button>
                    )}
                    {partners.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removePartner(idx)}
                        className="flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3 w-3" />
                        Remover
                      </button>
                    )}
                  </div>
                </div>

                {/* CPF */}
                <div className="max-w-xs">
                  <Field label="CPF" required>
                    <div className="relative">
                      <input
                        value={formatCPF(partner.cpf)}
                        onChange={e => handlePartnerCPFChange(idx, normalizeCPF(e.target.value))}
                        maxLength={14}
                        placeholder="000.000.000-00"
                        className={[
                          inputCls, 'font-mono pr-8',
                          partner.cpfStatus === 'invalid' ? 'border-red-300 bg-red-50' : '',
                          partner.cpfStatus === 'found'   ? 'border-emerald-300 bg-emerald-50' : '',
                        ].join(' ')}
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        {partner.cpfStatus === 'checking'  && <Loader2    className="h-3.5 w-3.5 animate-spin text-brand-500" />}
                        {partner.cpfStatus === 'found'     && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                        {partner.cpfStatus === 'not_found' && <AlertCircle  className="h-3.5 w-3.5 text-amber-500" />}
                        {partner.cpfStatus === 'invalid'   && <XCircle      className="h-3.5 w-3.5 text-red-500" />}
                      </div>
                    </div>
                    {partner.cpfMessage && (
                      <p className={`text-xs mt-1 ${partner.cpfStatus === 'found' ? 'text-amber-600' : partner.cpfStatus === 'invalid' ? 'text-red-600' : 'text-gray-500'}`}>
                        {partner.cpfMessage}
                      </p>
                    )}
                  </Field>
                </div>

                <Grid cols={3}>
                  <Field label="Nome Completo" required>
                    <input
                      value={partner.nomeCompleto}
                      onChange={e => updatePartner(idx, { nomeCompleto: e.target.value })}
                      className={inputCls}
                      placeholder="Nome como no documento"
                    />
                  </Field>
                  <Field label="RG">
                    <input value={partner.rg} onChange={e => updatePartner(idx, { rg: e.target.value })} className={inputCls} placeholder="RG" />
                  </Field>
                  <Field label="Data de Nascimento">
                    <input type="date" value={partner.dataNascimento} onChange={e => updatePartner(idx, { dataNascimento: e.target.value })} className={inputCls} />
                  </Field>
                  <Field label="Celular / WhatsApp" required={partner.principal}>
                    <input
                      value={partner.celular}
                      onChange={e => updatePartner(idx, { celular: formatPhone(e.target.value) })}
                      maxLength={15}
                      className={inputCls}
                      placeholder="(11) 99999-9999"
                    />
                  </Field>
                  <Field label="E-mail" required hint={partner.principal ? 'Será o login do usuário ADM' : ''}>
                    <input
                      type="email"
                      value={partner.email}
                      onChange={e => updatePartner(idx, { email: e.target.value })}
                      className={inputCls}
                      placeholder="email@empresa.com"
                    />
                  </Field>
                  <Field label="Cargo / Função">
                    <select
                      value={partner.role}
                      onChange={e => updatePartner(idx, { role: e.target.value })}
                      className={selectCls}
                    >
                      <option value="SOCIO_ADMINISTRADOR">Sócio Administrador</option>
                      <option value="SOCIO">Sócio</option>
                      <option value="REPRESENTANTE_LEGAL">Representante Legal</option>
                      <option value="PROCURADOR">Procurador</option>
                    </select>
                  </Field>
                  <Field label="% de Participação">
                    <input
                      type="number"
                      value={partner.participacao}
                      onChange={e => updatePartner(idx, { participacao: e.target.value })}
                      min={0} max={100} step={0.01}
                      className={inputCls}
                      placeholder="60.00"
                    />
                  </Field>
                </Grid>

                {/* Endereço do sócio */}
                <div className="border-t border-gray-100 pt-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Endereço do Sócio</p>
                  <div className="max-w-xs mb-4">
                    <CepInput
                      value={partner.address.cep}
                      onChange={(raw) => updatePartner(idx, { address: { ...partner.address, cep: raw } })}
                      onAddressFilled={addr => handlePartnerCEPFilled(idx, addr)}
                      label="CEP"
                    />
                  </div>
                  <Grid cols={3}>
                    <Field label="Logradouro">
                      <input value={partner.address.logradouro} onChange={e => updatePartner(idx, { address: { ...partner.address, logradouro: e.target.value } })} className={inputCls} />
                    </Field>
                    <Field label="Número">
                      <input value={partner.address.numero} onChange={e => updatePartner(idx, { address: { ...partner.address, numero: e.target.value } })} className={inputCls} />
                    </Field>
                    <Field label="Complemento">
                      <input value={partner.address.complemento} onChange={e => updatePartner(idx, { address: { ...partner.address, complemento: e.target.value } })} className={inputCls} />
                    </Field>
                    <Field label="Bairro">
                      <input value={partner.address.bairro} onChange={e => updatePartner(idx, { address: { ...partner.address, bairro: e.target.value } })} className={inputCls} />
                    </Field>
                    <Field label="Cidade">
                      <input value={partner.address.cidade} onChange={e => updatePartner(idx, { address: { ...partner.address, cidade: e.target.value } })} className={inputCls} />
                    </Field>
                    <Field label="Estado">
                      <select value={partner.address.estado} onChange={e => updatePartner(idx, { address: { ...partner.address, estado: e.target.value } })} className={selectCls}>
                        <option value="">UF</option>
                        {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(uf => (
                          <option key={uf} value={uf}>{uf}</option>
                        ))}
                      </select>
                    </Field>
                  </Grid>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={addPartner}
              className="flex items-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-4 py-3 text-sm font-medium text-gray-500 hover:border-brand-400 hover:text-brand-600 transition-colors w-full justify-center"
            >
              <Plus className="h-4 w-4" />
              Adicionar sócio
            </button>
          </Section>

          <div className="flex justify-between">
            <button type="button" onClick={prevStep} className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
              <ArrowLeft className="h-4 w-4" /> Anterior
            </button>
            <button type="button" onClick={handleNextStep} className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700">
              Próxima <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ═══ ETAPA 4 — Plano / Módulos ═══ */}
      {step === 4 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm flex flex-col gap-6">
          <Section title="Plano e Configurações" icon={<Package className="h-5 w-5" />}>
            <Grid cols={3}>
              <Field label="Plano" required>
                <select value={tenantPlan} onChange={e => setTenantPlan(e.target.value)} className={selectCls}>
                  <option value="BASICO">Básico</option>
                  <option value="PRO">Pro</option>
                  <option value="VIP">VIP</option>
                  <option value="CUSTOM">Custom</option>
                </select>
              </Field>
              <Field label="Status inicial" required>
                <select value={tenantStatus} onChange={e => setTenantStatus(e.target.value)} className={selectCls}>
                  <option value="TESTE">Teste</option>
                  <option value="ATIVO">Ativo</option>
                  <option value="SUSPENSO">Suspenso</option>
                </select>
              </Field>
              {tenantStatus === 'TESTE' && (
                <Field label="Fim do período de teste">
                  <input type="date" value={trialEndsAt} onChange={e => setTrialEndsAt(e.target.value)} className={inputCls} />
                </Field>
              )}
            </Grid>

            <div className="border-t border-gray-100 pt-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Limites do plano</p>
              <Grid cols={3}>
                <Field label="Máx. usuários">
                  <input type="number" value={maxUsers} onChange={e => setMaxUsers(e.target.value)} min={1} className={inputCls} />
                </Field>
                <Field label="Máx. veículos">
                  <input type="number" value={maxVehicles} onChange={e => setMaxVehicles(e.target.value)} min={1} className={inputCls} />
                </Field>
                <Field label="Máx. unidades">
                  <input type="number" value={maxUnits} onChange={e => setMaxUnits(e.target.value)} min={1} className={inputCls} />
                </Field>
              </Grid>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Módulos ativos</p>
              <div className="flex flex-wrap gap-2">
                {ALL_MODULES.map(m => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => toggleModule(m.key)}
                    className={[
                      'rounded-lg border-2 px-3 py-1.5 text-sm font-medium transition-colors',
                      activeModules.includes(m.key)
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300',
                    ].join(' ')}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </Section>

          <div className="flex justify-between">
            <button type="button" onClick={prevStep} className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
              <ArrowLeft className="h-4 w-4" /> Anterior
            </button>
            <button type="button" onClick={() => goToStep(5)} className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700">
              Revisar <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ═══ ETAPA 5 — Revisão ═══ */}
      {step === 5 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm flex flex-col gap-6">
          <Section title="Revisão e Confirmação" icon={<ClipboardCheck className="h-5 w-5" />}>

            {/* Empresa */}
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Empresa</p>
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                <div><span className="text-xs text-gray-400">CNPJ</span><p className="font-mono font-medium">{formatCNPJ(cnpjRaw)}</p></div>
                <div><span className="text-xs text-gray-400">Razão Social</span><p className="font-medium truncate">{razaoSocial}</p></div>
                <div><span className="text-xs text-gray-400">Nome Fantasia</span><p className="font-medium">{nomeFantasia || '—'}</p></div>
                <div><span className="text-xs text-gray-400">Situação</span><p className="font-medium">{situacao || '—'}</p></div>
                <div><span className="text-xs text-gray-400">IE</span><p className="font-medium">{isentoIE ? 'Isento' : ie || '—'}</p></div>
                <div><span className="text-xs text-gray-400">E-mail</span><p className="font-medium truncate">{email || '—'}</p></div>
              </div>
            </div>

            {/* Endereço */}
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Endereço</p>
              <p className="text-sm font-medium">
                {[address.logradouro, address.numero, address.complemento].filter(Boolean).join(', ')}
              </p>
              <p className="text-sm text-gray-600">
                {[address.bairro, address.cidade, address.estado, formatCEP(address.cep)].filter(Boolean).join(' — ')}
              </p>
            </div>

            {/* Sócios */}
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Sócios ({partners.length})</p>
              <div className="flex flex-col gap-3">
                {partners.map((p, i) => (
                  <div key={i} className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">
                        {p.nomeCompleto}
                        {p.principal && <span className="ml-2 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">ADM</span>}
                      </p>
                      <p className="text-xs text-gray-500">{formatCPF(p.cpf)} · {p.email}</p>
                    </div>
                    <p className="text-xs text-gray-400 shrink-0">{p.role.replace(/_/g, ' ')}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Plano */}
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Plano e Módulos</p>
              <div className="grid grid-cols-3 gap-2 text-sm mb-3">
                <div><span className="text-xs text-gray-400">Plano</span><p className="font-medium">{tenantPlan}</p></div>
                <div><span className="text-xs text-gray-400">Status inicial</span><p className="font-medium">{tenantStatus}</p></div>
                <div><span className="text-xs text-gray-400">Módulos</span><p className="font-medium">{activeModules.length} ativos</p></div>
              </div>
              <div className="flex flex-wrap gap-1">
                {activeModules.map(m => (
                  <span key={m} className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">{m}</span>
                ))}
              </div>
            </div>

            {/* Aviso de senha */}
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <ShieldCheck className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-amber-700">Senha inicial do ADM</p>
                <p className="text-xs text-amber-600 mt-0.5">
                  O usuário ADM (<strong>{(partners.find(p => p.principal) ?? partners[0])?.email}</strong>) receberá como senha inicial o CPF sem pontuação.
                  O sistema exigirá troca obrigatória no primeiro acesso, com critérios mínimos de segurança.
                </p>
              </div>
            </div>
          </Section>

          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={prevStep} className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
              <ArrowLeft className="h-4 w-4" /> Anterior
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleCreate}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors shadow-sm"
            >
              {saving ? <><Loader2 className="h-4 w-4 animate-spin" />Criando tenant...</> : <><CheckCircle2 className="h-4 w-4" />Confirmar e criar tenant</>}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Export ────────────────────────────────────────────────────────────────────

export default function NovoTenantPage() {
  return (
    <Suspense fallback={<div className="animate-pulse h-96 rounded-xl bg-gray-100" />}>
      <NovoTenantForm />
    </Suspense>
  )
}
