'use client'

// =============================================================================
// StepCliente — Etapa 1 do wizard de Avaliação.
// Busca por CPF/CNPJ/telefone/nome com debounce. Suporta cadastro rápido.
// =============================================================================

import { useEffect, useRef, useState } from 'react'
import { Search, UserPlus, X, CheckCircle, User as UserIcon, Phone, Mail } from 'lucide-react'
import { maskCPF, maskCNPJ, maskPhone } from '@/lib/masks'
import { RequiredMark } from '@/components/ui/field'
import { isValidCNPJ } from '@/lib/br-docs/cnpj'
import {
  docKind, isoToBR, maskCepQuick, maskDateBR, maskDoc, maskPhoneQuick, onlyDigits, validateQuickCustomer,
} from '@/lib/customers/quick-create'
import { formatCPF } from '@/lib/br-docs/cpf'

export interface CustomerLite {
  id:    string
  name:  string
  cpf?:  string | null
  phone?: string | null
  email?: string | null
}

interface StepClienteProps {
  selected:  CustomerLite | null
  onSelect:  (c: CustomerLite | null) => void
}

function formatDoc(doc?: string | null): string {
  if (!doc) return ''
  const d = String(doc).replace(/\D/g, '')
  if (d.length === 11) return maskCPF(d)
  if (d.length === 14) return maskCNPJ(d)
  return d
}

function Avatar({ name }: { name: string }) {
  const letter = (name?.trim()?.[0] ?? '?').toUpperCase()
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
      {letter}
    </div>
  )
}

const inputCls = 'rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 w-full'

export function StepCliente({ selected, onSelect }: StepClienteProps) {
  const [q,       setQ]       = useState('')
  const [results, setResults] = useState<CustomerLite[]>([])
  const [loading, setLoading] = useState(false)
  const [drawer,  setDrawer]  = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (selected) { setResults([]); return }
    const term = q.trim()
    if (term.length < 2) { setResults([]); return }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const r = await fetch(`/api/customers/search?q=${encodeURIComponent(term)}`, { cache: 'no-store' })
        const d = await r.json()
        setResults(Array.isArray(d?.data) ? d.data : [])
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [q, selected])

  // ── Selecionado: render card de confirmação ─────────────────────────────────
  if (selected) {
    return (
      <div className="rounded-xl border-2 border-brand-200 bg-brand-50/40 p-4 flex items-start gap-4">
        <Avatar name={selected.name} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
            <p className="text-sm font-semibold text-gray-900 truncate">{selected.name}</p>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
            {selected.cpf   && <span className="font-mono">{formatDoc(selected.cpf)}</span>}
            {selected.phone && <span>{maskPhone(selected.phone)}</span>}
            {selected.email && <span className="truncate">{selected.email}</span>}
          </div>
        </div>
        <button
          type="button"
          onClick={() => { onSelect(null); setQ('') }}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          Trocar cliente
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className={inputCls + ' pl-9'}
            placeholder="CPF, CNPJ, telefone ou nome"
          />
        </div>
        <button
          type="button"
          onClick={() => setDrawer(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-brand-400 bg-white px-3 py-2 text-xs font-medium text-brand-700 hover:bg-brand-50 whitespace-nowrap"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Cadastrar cliente rápido
        </button>
      </div>

      {/* Resultados */}
      {loading && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-4 text-xs text-gray-500 text-center">
          Buscando...
        </div>
      )}
      {!loading && q.trim().length >= 2 && results.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-4 text-xs text-gray-500 text-center">
          Nenhum cliente encontrado.
        </div>
      )}
      {!loading && results.length > 0 && (
        <ul className="flex flex-col gap-2">
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onSelect(c)}
                className="w-full text-left flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-3 hover:border-brand-300 hover:bg-brand-50/30 transition-colors"
              >
                <Avatar name={c.name} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
                    {c.cpf   && <span className="font-mono inline-flex items-center gap-1"><UserIcon className="h-3 w-3" />{formatDoc(c.cpf)}</span>}
                    {c.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{maskPhone(c.phone)}</span>}
                    {c.email && <span className="inline-flex items-center gap-1 truncate"><Mail className="h-3 w-3" />{c.email}</span>}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Drawer cadastro rápido */}
      {drawer && (
        <QuickCreateDrawer
          onClose={() => setDrawer(false)}
          onCreated={(c) => { onSelect(c); setDrawer(false) }}
        />
      )}
    </div>
  )
}

// ── Drawer cadastro rápido ──────────────────────────────────────────────────
type AddrKey = 'logradouro' | 'bairro' | 'cidade' | 'estado'

interface Address { cep: string; logradouro: string; numero: string; complemento: string; bairro: string; cidade: string; estado: string }
const EMPTY_ADDR: Address = { cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '' }
const EMPTY_SOCIO = { nome: '', cpf: '', rg: '', nascimento: '', email: '', phone: '', cota: '' }
const lbl = 'text-xs font-medium text-gray-600'

/** Endereço com CEP automático: o que a consulta preencher fica travado. */
function AddressFields({ value, onChange }: { value: Address; onChange: (a: Address) => void }) {
  const [locked, setLocked] = useState<Partial<Record<AddrKey, boolean>>>({})
  const [loading, setLoading] = useState(false)
  const cep = onlyDigits(value.cep)
  const valueRef = useRef(value)
  useEffect(() => { valueRef.current = value })

  useEffect(() => {
    if (cep.length !== 8) return
    let alive = true
    const t = setTimeout(() => { if (alive) setLoading(true) }, 0)
    fetch(`/api/address/lookup-by-cep?cep=${cep}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return
        const data = d?.data ?? {}
        const next: Partial<Address> = {}
        const lock: Partial<Record<AddrKey, boolean>> = {}
        for (const k of ['logradouro', 'bairro', 'cidade', 'estado'] as AddrKey[]) {
          const v = String(data?.[k] ?? '').trim()
          if (d?.success && v) { next[k] = k === 'estado' ? v.toUpperCase() : v; lock[k] = true }
        }
        onChange({ ...valueRef.current, ...next })
        setLocked(lock)
      })
      .catch(() => { if (alive) setLocked({}) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false; clearTimeout(t) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cep])

  const set = (k: keyof Address, v: string) => onChange({ ...value, [k]: v })
  const addrInput = (k: AddrKey, label: string) => (
    <label className="flex flex-col gap-1">
      <span className={lbl}>{label} <RequiredMark /></span>
      <input
        className={inputCls + (locked[k] ? ' bg-gray-50 text-gray-600' : '')}
        value={value[k]} readOnly={!!locked[k]} maxLength={k === 'estado' ? 2 : 120}
        onChange={(e) => set(k, k === 'estado' ? e.target.value.toUpperCase().replace(/[^A-Z]/g, '') : e.target.value)}
      />
    </label>
  )
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className={lbl}>CEP <RequiredMark /></span>
          <input className={inputCls} value={maskCepQuick(value.cep)} onChange={(e) => { setLocked({}); set('cep', onlyDigits(e.target.value).slice(0, 8)) }} placeholder="00000-000" inputMode="numeric" />
        </label>
        {loading && <span className="self-end pb-2 text-xs text-gray-400">Buscando...</span>}
      </div>
      {addrInput('logradouro', 'Logradouro')}
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className={lbl}>Número <RequiredMark /></span>
          <input className={inputCls} value={value.numero} onChange={(e) => set('numero', e.target.value)} maxLength={20} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={lbl}>Complemento</span>
          <input className={inputCls} value={value.complemento} onChange={(e) => set('complemento', e.target.value)} maxLength={120} />
        </label>
      </div>
      {addrInput('bairro', 'Bairro')}
      <div className="grid grid-cols-[1fr_5rem] gap-3">
        {addrInput('cidade', 'Cidade')}
        {addrInput('estado', 'UF')}
      </div>
    </>
  )
}

function QuickCreateDrawer({
  onClose, onCreated,
}: {
  onClose: () => void
  onCreated: (c: CustomerLite) => void
}) {
  const [name,       setName]       = useState('')
  const [doc,        setDoc]        = useState('')
  const [birthDate,  setBirthDate]  = useState('')
  const [regDoc,     setRegDoc]     = useState('')
  const [email,      setEmail]      = useState('')
  const [phone,      setPhone]      = useState('')
  const [addr,       setAddr]       = useState<Address>(EMPTY_ADDR)
  const [socio,      setSocio]      = useState(EMPTY_SOCIO)
  const [socioAddr,  setSocioAddr]  = useState<Address>(EMPTY_ADDR)
  const [submitting, setSubmitting] = useState(false)
  const [err,        setErr]        = useState('')

  const docDigits = onlyDigits(doc)
  const pj = docKind(docDigits) === 'PJ' && docDigits.length === 14
  const setS = (k: keyof typeof EMPTY_SOCIO, v: string) => setSocio((x) => ({ ...x, [k]: v }))

  // CNPJ válido → preenche razão social, fundação, contato, endereço e o sócio (QSA) vazios.
  useEffect(() => {
    if (docDigits.length !== 14 || !isValidCNPJ(docDigits)) return
    let alive = true
    fetch(`/api/integrations/brasilapi/cnpj/${docDigits}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!alive || !d?.ok || !d?.data) return
        const c = d.data
        const fill = (cur: string, v: unknown) => (cur.trim() ? cur : String(v ?? '').trim())
        setName((v) => fill(v, c.razaoSocial))
        setBirthDate((v) => fill(v, isoToBR(c.dataAbertura)))
        setEmail((v) => fill(v, String(c.email ?? '').toLowerCase()))
        setPhone((v) => fill(v, onlyDigits(c.telefone1).slice(0, 11)))
        setAddr((a) => ({
          cep: fill(a.cep, onlyDigits(c.cep).slice(0, 8)), numero: fill(a.numero, c.numero), complemento: fill(a.complemento, c.complemento),
          logradouro: fill(a.logradouro, c.logradouro), bairro: fill(a.bairro, c.bairro), cidade: fill(a.cidade, c.cidade),
          estado: fill(a.estado, String(c.estado ?? '').toUpperCase()),
        }))
        const qsa = Array.isArray(c.qsa) ? c.qsa as Array<{ nome_socio?: string; qualificacao_socio?: string }> : []
        const adm = qsa.find((q) => /administrador/i.test(q.qualificacao_socio ?? '')) ?? qsa[0]
        if (adm?.nome_socio) setSocio((x) => ({ ...x, nome: fill(x.nome, adm.nome_socio) }))
        if (qsa.length === 1) setSocio((x) => ({ ...x, cota: fill(x.cota, '100') }))
      })
      .catch(() => {})
    return () => { alive = false }
  }, [docDigits])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const trimAddr = (a: Address) => ({
      cep: onlyDigits(a.cep), logradouro: a.logradouro.trim(), numero: a.numero.trim(), complemento: a.complemento.trim(),
      bairro: a.bairro.trim(), cidade: a.cidade.trim(), estado: a.estado.trim().toUpperCase(),
    })
    const payload = {
      name: name.trim(), doc: docDigits, birthDate, regDoc: regDoc.trim(),
      email: email.trim(), phone: onlyDigits(phone), ...trimAddr(addr),
      socio: pj ? {
        nome: socio.nome.trim(), cpf: onlyDigits(socio.cpf), rg: socio.rg.trim(), nascimento: socio.nascimento,
        email: socio.email.trim(), phone: onlyDigits(socio.phone), cota: socio.cota.trim(), ...trimAddr(socioAddr),
      } : null,
    }
    const invalid = validateQuickCustomer(payload)
    if (invalid) { setErr(invalid); return }
    setSubmitting(true)
    setErr('')
    try {
      const r = await fetch('/api/customers/quick-create', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      const d = await r.json()
      if (!r.ok || !d?.data?.id) setErr(d?.error ?? 'Erro ao criar cliente.')
      else onCreated(d.data as CustomerLite)
    } catch {
      setErr('Erro de conexão.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" />
      <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white shadow-xl flex flex-col">
        <header className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h3 className="text-base font-semibold text-gray-900">Cadastrar cliente rápido</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <X className="h-4 w-4" />
          </button>
        </header>
        <form onSubmit={submit} noValidate className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className={lbl}>CPF/CNPJ <RequiredMark /></span>
            <input
              className={inputCls + ' font-mono'}
              value={maskDoc(doc)}
              onChange={(e) => setDoc(onlyDigits(e.target.value).slice(0, 14))}
              placeholder="000.000.000-00"
              inputMode="numeric"
              autoFocus
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={lbl}>{pj ? 'Razão social' : 'Nome completo'} <RequiredMark /></span>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className={lbl}>{pj ? 'Data de fundação' : 'Data de nascimento'} <RequiredMark /></span>
              <input className={inputCls} value={birthDate} onChange={(e) => setBirthDate(maskDateBR(e.target.value))} placeholder="dd/mm/aaaa" inputMode="numeric" />
            </label>
            <label className="flex flex-col gap-1">
              <span className={lbl}>{pj ? 'Inscrição estadual' : 'RG'} <RequiredMark /></span>
              <input className={inputCls} value={regDoc} onChange={(e) => setRegDoc(e.target.value.toUpperCase())} placeholder={pj ? 'ISENTO' : undefined} maxLength={20} />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className={lbl}>E-mail <RequiredMark /></span>
            <input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" />
          </label>
          <label className="flex flex-col gap-1">
            <span className={lbl}>Telefone <RequiredMark /></span>
            <input className={inputCls} value={maskPhoneQuick(phone)} onChange={(e) => setPhone(onlyDigits(e.target.value).slice(0, 11))} placeholder="(00)0.0000-0000" inputMode="tel" />
          </label>
          <AddressFields value={addr} onChange={setAddr} />

          {pj && (
            <div className="mt-2 flex flex-col gap-3 border-t border-gray-200 pt-4">
              <p className="text-sm font-semibold text-gray-900">Sócio proprietário</p>
              <label className="flex flex-col gap-1">
                <span className={lbl}>Nome completo <RequiredMark /></span>
                <input className={inputCls} value={socio.nome} onChange={(e) => setS('nome', e.target.value)} maxLength={200} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className={lbl}>CPF <RequiredMark /></span>
                  <input className={inputCls + ' font-mono'} value={formatCPF(socio.cpf)} onChange={(e) => setS('cpf', onlyDigits(e.target.value).slice(0, 11))} placeholder="000.000.000-00" inputMode="numeric" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={lbl}>RG <RequiredMark /></span>
                  <input className={inputCls} value={socio.rg} onChange={(e) => setS('rg', e.target.value.toUpperCase())} maxLength={20} />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className={lbl}>Data de nascimento <RequiredMark /></span>
                  <input className={inputCls} value={socio.nascimento} onChange={(e) => setS('nascimento', maskDateBR(e.target.value))} placeholder="dd/mm/aaaa" inputMode="numeric" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={lbl}>Participação (%) <RequiredMark /></span>
                  <input className={inputCls} value={socio.cota} onChange={(e) => setS('cota', e.target.value.replace(/[^\d,.]/g, '').slice(0, 6))} placeholder="100" inputMode="decimal" />
                </label>
              </div>
              <label className="flex flex-col gap-1">
                <span className={lbl}>E-mail <RequiredMark /></span>
                <input type="email" className={inputCls} value={socio.email} onChange={(e) => setS('email', e.target.value)} placeholder="email@exemplo.com" />
              </label>
              <label className="flex flex-col gap-1">
                <span className={lbl}>Telefone <RequiredMark /></span>
                <input className={inputCls} value={maskPhoneQuick(socio.phone)} onChange={(e) => setS('phone', onlyDigits(e.target.value).slice(0, 11))} placeholder="(00)0.0000-0000" inputMode="tel" />
              </label>
              <AddressFields value={socioAddr} onChange={setSocioAddr} />
            </div>
          )}

          {err && <p className="text-xs text-red-600">{err}</p>}

          <div className="mt-auto flex justify-end gap-2 border-t border-gray-100 pt-4">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
              Cancelar
            </button>
            <button type="submit" disabled={submitting} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">
              {submitting ? 'Salvando...' : 'Cadastrar'}
            </button>
          </div>
        </form>
      </aside>
    </>
  )
}
