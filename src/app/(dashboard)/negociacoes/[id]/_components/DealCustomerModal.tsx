'use client'

// Janelinha "Dados do cliente" do resumo da negociação: mostra o cadastro
// completo e, para quem pode, edita (PATCH /api/negotiations/[id]/customer).

import { useState } from 'react'
import { Edit, Loader2, X } from 'lucide-react'
import { FieldLabel, FIELD_ERROR_CLASS } from '@/components/ui/field'
import { ResponsiveModalFrame, ResponsiveModalFooter } from '@/components/ui/responsive'
import { maskCPFInput, isValidCPF } from '@/lib/br-docs/cpf'
import { maskCNPJInput, isValidCNPJ } from '@/lib/br-docs/cnpj'
import { maskPhoneInput, formatPhone } from '@/lib/br-docs/phone'
import { maskCEPInput, formatCEP, normalizeCEP } from '@/lib/br-docs/cep'

export interface CustomerPerson {
  type?: string | null
  nomeCompleto?: string | null; cpf?: string | null; cnpj?: string | null
  rg?: string | null; dataNascimento?: string | null; nomeMae?: string | null
  razaoSocial?: string | null; nomeFantasia?: string | null; inscricaoEstadual?: string | null
  email?: string | null; phone?: string | null; whatsapp?: boolean | null
  cep?: string | null; logradouro?: string | null; numero?: string | null; complemento?: string | null
  bairro?: string | null; cidade?: string | null; estado?: string | null
}

export interface CustomerLegacy {
  name?: string | null; cpf?: string | null; email?: string | null; phone?: string | null
  address?: string | null; city?: string | null; state?: string | null
}

type Form = Record<Exclude<keyof CustomerPerson, 'whatsapp'>, string> & { whatsapp: boolean }

const KEYS = ['type', 'nomeCompleto', 'cpf', 'cnpj', 'rg', 'dataNascimento', 'nomeMae', 'razaoSocial', 'nomeFantasia', 'inscricaoEstadual', 'email', 'phone', 'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'estado'] as const

function initialForm(p: CustomerPerson | null, c: CustomerLegacy | null): Form {
  const f = Object.fromEntries(KEYS.map((k) => [k, ''])) as unknown as Form
  if (p) for (const k of KEYS) f[k] = String(p[k] ?? '')
  const doc = (p?.cpf ?? p?.cnpj ?? c?.cpf ?? '').replace(/\D/g, '')
  f.type = p?.type === 'JURIDICA' || (!p && doc.length === 14) ? 'JURIDICA' : 'FISICA'
  if (!p && c) {
    f.nomeCompleto = c.name ?? ''
    if (f.type === 'JURIDICA') { f.cnpj = doc; f.razaoSocial = c.name ?? '' } else f.cpf = doc
    f.email = c.email ?? ''; f.phone = c.phone ?? ''
    f.logradouro = c.address ?? ''; f.cidade = c.city ?? ''; f.estado = c.state ?? ''
  }
  f.cpf = maskCPFInput(f.cpf); f.cnpj = maskCNPJInput(f.cnpj)
  f.phone = maskPhoneInput(f.phone); f.cep = maskCEPInput(f.cep)
  f.dataNascimento = f.dataNascimento ? f.dataNascimento.slice(0, 10) : ''
  f.whatsapp = !!p?.whatsapp
  return f
}

const fmtDate = (s: string) => (s ? new Date(`${s.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '')

export default function DealCustomerModal({
  dealId, person, customer, canEdit, onClose, onSaved,
}: {
  dealId: string
  person: CustomerPerson | null
  customer: CustomerLegacy | null
  canEdit: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Form>(() => initialForm(person, customer))
  const [error, setError] = useState('')
  const [bad, setBad] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [cepLoading, setCepLoading] = useState(false)
  const isPJ = form.type === 'JURIDICA'
  const set = (patch: Partial<Form>) => { setForm((f) => ({ ...f, ...patch })); setError(''); setBad([]) }

  async function lookupCep(masked: string) {
    const cep = normalizeCEP(masked)
    if (cep.length !== 8) return
    setCepLoading(true)
    try {
      const d = await fetch(`/api/address/lookup-by-cep?cep=${cep}`).then((r) => r.json())
      if (d?.logradouro || d?.bairro) {
        setForm((f) => ({ ...f, logradouro: d.logradouro ?? f.logradouro, bairro: d.bairro ?? f.bairro, cidade: d.cidade ?? f.cidade, estado: d.estado ?? f.estado }))
      }
    } catch { /* sem consulta: preenche à mão */ } finally { setCepLoading(false) }
  }

  async function save() {
    const name = (isPJ ? form.razaoSocial : form.nomeCompleto).trim()
    const wrong: string[] = []
    if (!name) wrong.push(isPJ ? 'razaoSocial' : 'nomeCompleto')
    if (!isPJ && form.cpf && !isValidCPF(form.cpf)) wrong.push('cpf')
    if (isPJ && form.cnpj && !isValidCNPJ(form.cnpj)) wrong.push('cnpj')
    if (wrong.length) { setBad(wrong); setError(!name ? 'Preencha os campos obrigatórios.' : isPJ ? 'CNPJ inválido.' : 'CPF inválido.'); return }

    setSaving(true)
    try {
      const res = await fetch(`/api/negotiations/${dealId}/customer`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person: { ...form, nomeCompleto: isPJ ? form.razaoSocial : form.nomeCompleto } }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j?.error ?? 'Não foi possível salvar.'); return }
      onSaved()
      onClose()
    } catch {
      setError('Não foi possível salvar.')
    } finally {
      setSaving(false)
    }
  }

  const input = (k: (typeof KEYS)[number], opts: { label: string; required?: boolean; mask?: (v: string) => string; type?: string; className?: string; maxLength?: number; onBlur?: (v: string) => void } ) => (
    <div className={opts.className}>
      <FieldLabel htmlFor={`cli-${k}`} required={opts.required}>{opts.label}</FieldLabel>
      <input
        id={`cli-${k}`}
        type={opts.type ?? 'text'}
        value={form[k] as string}
        maxLength={opts.maxLength}
        onChange={(e) => set({ [k]: opts.mask ? opts.mask(e.target.value) : e.target.value } as Partial<Form>)}
        onBlur={opts.onBlur ? (e) => opts.onBlur!(e.target.value) : undefined}
        className={`mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 ${bad.includes(k) ? FIELD_ERROR_CLASS : ''}`}
      />
    </div>
  )

  const view = initialForm(person, customer)
  const address = [
    [view.logradouro, view.numero].filter(Boolean).join(', ') + (view.complemento ? ` — ${view.complemento}` : ''),
    view.bairro,
    [view.cidade, view.estado].filter(Boolean).join('/'),
    view.cep && `CEP ${formatCEP(view.cep)}`,
  ].filter(Boolean).join(' · ')
  const rows: [string, string][] = (view.type === 'JURIDICA'
    ? [['Razão social', view.razaoSocial || view.nomeCompleto], ['Nome fantasia', view.nomeFantasia], ['CNPJ', view.cnpj], ['Inscrição estadual', view.inscricaoEstadual]] as [string, string][]
    : [['Nome', view.nomeCompleto], ['CPF', view.cpf], ['RG', view.rg], ['Nascimento', fmtDate(view.dataNascimento)], ['Nome da mãe', view.nomeMae]] as [string, string][]
  ).concat([
    ['Telefone', view.phone ? `${formatPhone(view.phone)}${view.whatsapp ? ' (WhatsApp)' : ''}` : ''],
    ['E-mail', view.email],
    ['Endereço', address],
  ] as [string, string][])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" onClick={() => { if (!editing) onClose() }}>
      <ResponsiveModalFrame className="sm:max-w-2xl">
        <div onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
            <h3 className="text-sm font-semibold text-gray-900">{editing ? 'Editar dados do cliente' : 'Dados do cliente'}</h3>
            <button type="button" onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="Fechar"><X size={16} /></button>
          </div>

          {!editing ? (
            <dl className="divide-y divide-gray-50 px-5 py-2 text-sm">
              {rows.map(([label, value]) => (
                <div key={label} className="grid grid-cols-3 gap-3 py-2">
                  <dt className="text-gray-500">{label}</dt>
                  <dd className={`col-span-2 break-words ${value ? 'text-gray-900' : 'text-gray-300'}`}>{value || '—'}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <div className="space-y-4 p-5">
              <div className="inline-flex rounded-lg border border-gray-200 p-0.5 text-sm">
                {(['FISICA', 'JURIDICA'] as const).map((t) => (
                  <button key={t} type="button" onClick={() => set({ type: t })}
                    className={`rounded-md px-3 py-1 ${form.type === t ? 'bg-brand-600 font-medium text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                    {t === 'FISICA' ? 'Pessoa física' : 'Pessoa jurídica'}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
                {isPJ ? (
                  <>
                    {input('razaoSocial', { label: 'Razão social', required: true, className: 'sm:col-span-4' })}
                    {input('cnpj', { label: 'CNPJ', mask: maskCNPJInput, className: 'sm:col-span-2' })}
                    {input('nomeFantasia', { label: 'Nome fantasia', className: 'sm:col-span-4' })}
                    {input('inscricaoEstadual', { label: 'Inscrição estadual', className: 'sm:col-span-2', maxLength: 40 })}
                  </>
                ) : (
                  <>
                    {input('nomeCompleto', { label: 'Nome completo', required: true, className: 'sm:col-span-4' })}
                    {input('cpf', { label: 'CPF', mask: maskCPFInput, className: 'sm:col-span-2' })}
                    {input('rg', { label: 'RG', className: 'sm:col-span-2', maxLength: 30 })}
                    {input('dataNascimento', { label: 'Nascimento', type: 'date', className: 'sm:col-span-2' })}
                    {input('nomeMae', { label: 'Nome da mãe', className: 'sm:col-span-2' })}
                  </>
                )}
                {input('phone', { label: 'Telefone', mask: maskPhoneInput, className: 'sm:col-span-2' })}
                <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-700 sm:col-span-1">
                  <input type="checkbox" checked={form.whatsapp} onChange={(e) => set({ whatsapp: e.target.checked })} className="rounded border-gray-300" />
                  WhatsApp
                </label>
                {input('email', { label: 'E-mail', type: 'email', className: 'sm:col-span-3' })}
                <div className="relative sm:col-span-2">
                  {input('cep', { label: 'CEP', mask: maskCEPInput, onBlur: (v) => void lookupCep(v) })}
                  {cepLoading && <Loader2 size={14} className="absolute right-3 top-9 animate-spin text-gray-400" />}
                </div>
                {input('logradouro', { label: 'Logradouro', className: 'sm:col-span-4' })}
                {input('numero', { label: 'Número', className: 'sm:col-span-1', maxLength: 20 })}
                {input('complemento', { label: 'Complemento', className: 'sm:col-span-2' })}
                {input('bairro', { label: 'Bairro', className: 'sm:col-span-3' })}
                {input('cidade', { label: 'Cidade', className: 'sm:col-span-4' })}
                {input('estado', { label: 'UF', className: 'sm:col-span-2', maxLength: 2, mask: (v) => v.toUpperCase() })}
              </div>
              {error && <p role="alert" className="text-xs font-medium text-error">{error}</p>}
            </div>
          )}

          <ResponsiveModalFooter>
            {editing ? (
              <>
                <button type="button" onClick={() => { setEditing(false); setForm(initialForm(person, customer)); setError(''); setBad([]) }} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancelar</button>
                <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
                  {saving && <Loader2 size={14} className="animate-spin" />} Salvar
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Fechar</button>
                {canEdit && (
                  <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
                    <Edit size={14} /> Editar
                  </button>
                )}
              </>
            )}
          </ResponsiveModalFooter>
        </div>
      </ResponsiveModalFrame>
    </div>
  )
}
