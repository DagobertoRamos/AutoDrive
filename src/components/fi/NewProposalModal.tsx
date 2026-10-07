'use client'

// Nova ficha em 2 passos: cliente (busca ou cadastro rápido PF/PJ) → operação.
// Só o essencial; o restante da ficha é pedido depois, conforme os bancos.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, UserPlus } from 'lucide-react'
import { MoneyInput } from '@/components/ui/money-input'
import { FieldLabel } from '@/components/ui/field'
import { HelpHint } from '@/components/ui/help-hint'
import { maskCNPJ, maskCPF, maskPhone } from '@/lib/masks'
import { api, brl, btnPrimary, btnSecondary, inputClass, Modal } from './ui'

interface PersonHit { id: string; nomeCompleto: string; cpf: string | null }

export function PersonPicker({ value, onChange, exclude, label }: { value: PersonHit | null; onChange: (p: PersonHit | null) => void; exclude?: string | null; label: string }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<PersonHit[]>([])
  const [creating, setCreating] = useState(false)
  const [type, setType] = useState<'PF' | 'PJ'>('PF')
  const [f, setF] = useState({ nomeCompleto: '', razaoSocial: '', cpf: '', cnpj: '', dataNascimento: '', celular: '', email: '' })
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (q.trim().length < 3) return
    const t = setTimeout(async () => {
      const r = await api<PersonHit[]>(`/api/financing/proponents?q=${encodeURIComponent(q.trim())}`)
      setHits((r.data ?? []).filter((p) => p.id !== exclude).slice(0, 8))
    }, 300)
    return () => clearTimeout(t)
  }, [q, exclude])

  const create = async () => {
    const need = type === 'PF' ? [f.nomeCompleto, f.cpf, f.dataNascimento, f.celular, f.email] : [f.razaoSocial, f.cnpj, f.celular, f.email]
    if (need.some((x) => !x.trim())) { setErr('Preencha os campos obrigatórios.'); return }
    setBusy(true); setErr(null)
    const body = type === 'PF'
      ? { personType: 'PF', nomeCompleto: f.nomeCompleto, cpf: f.cpf, dataNascimento: f.dataNascimento, celular: f.celular, email: f.email }
      : { personType: 'PJ', razaoSocial: f.razaoSocial, cnpj: f.cnpj, celular: f.celular, email: f.email }
    const r = await api<{ id: string }>('/api/financing/proponents/quick', { method: 'POST', body })
    setBusy(false)
    if (!r.ok || !r.data) { setErr(r.error); return }
    onChange({ id: r.data.id, nomeCompleto: type === 'PF' ? f.nomeCompleto : f.razaoSocial, cpf: null })
    setCreating(false)
  }

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
        <span className="font-medium text-gray-900">{value.nomeCompleto}</span>
        <button type="button" onClick={() => onChange(null)} className="text-xs text-brand-700 hover:underline">Trocar</button>
      </div>
    )
  }
  if (creating) {
    return (
      <div className="space-y-3 rounded-lg border border-gray-200 p-3">
        <div className="flex gap-2" role="radiogroup" aria-label="Tipo de cliente">
          {(['PF', 'PJ'] as const).map((t) => (
            <button key={t} type="button" onClick={() => setType(t)} className={`rounded-full px-3 py-1 text-xs font-medium ${type === t ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-700'}`} aria-pressed={type === t}>{t === 'PF' ? 'Pessoa física' : 'Empresa'}</button>
          ))}
        </div>
        {type === 'PF' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><FieldLabel required>Nome completo</FieldLabel><input className={inputClass} value={f.nomeCompleto} onChange={(e) => setF({ ...f, nomeCompleto: e.target.value })} /></div>
            <div><FieldLabel required>CPF</FieldLabel><input className={inputClass} inputMode="numeric" placeholder="000.000.000-00" value={maskCPF(f.cpf)} onChange={(e) => setF({ ...f, cpf: e.target.value.replace(/\D/g, '') })} /></div>
            <div><FieldLabel required>Nascimento</FieldLabel><input type="date" className={inputClass} value={f.dataNascimento} onChange={(e) => setF({ ...f, dataNascimento: e.target.value })} /></div>
            <div><FieldLabel required>Celular</FieldLabel><input className={inputClass} inputMode="tel" placeholder="(00) 00000-0000" value={maskPhone(f.celular)} onChange={(e) => setF({ ...f, celular: e.target.value.replace(/\D/g, '') })} /></div>
            <div><FieldLabel required>E-mail</FieldLabel><input className={inputClass} type="email" inputMode="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value.trim() })} /></div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><FieldLabel required>Razão social</FieldLabel><input className={inputClass} value={f.razaoSocial} onChange={(e) => setF({ ...f, razaoSocial: e.target.value })} /></div>
            <div><FieldLabel required>CNPJ</FieldLabel><input className={inputClass} inputMode="numeric" placeholder="00.000.000/0000-00" value={maskCNPJ(f.cnpj)} onChange={(e) => setF({ ...f, cnpj: e.target.value.replace(/\D/g, '') })} /></div>
            <div><FieldLabel required>Celular</FieldLabel><input className={inputClass} inputMode="tel" placeholder="(00) 00000-0000" value={maskPhone(f.celular)} onChange={(e) => setF({ ...f, celular: e.target.value.replace(/\D/g, '') })} /></div>
            <div className="sm:col-span-2"><FieldLabel required>E-mail</FieldLabel><input className={inputClass} type="email" inputMode="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value.trim() })} /></div>
          </div>
        )}
        {err && <p className="text-sm text-red-600" role="alert">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={btnSecondary} onClick={() => setCreating(false)}>Voltar</button>
          <button type="button" className={btnPrimary} onClick={create} disabled={busy}>{busy ? 'Salvando…' : 'Usar este cliente'}</button>
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden />
        <input className={`${inputClass} pl-9`} placeholder="Nome, CPF ou celular" value={q} onChange={(e) => setQ(e.target.value)} aria-label={label} />
      </div>
      {q.trim().length >= 3 && hits.length > 0 && (
        <ul className="max-h-48 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
          {hits.map((h) => (
            <li key={h.id}><button type="button" onClick={() => onChange(h)} className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50">{h.nomeCompleto}</button></li>
          ))}
        </ul>
      )}
      <button type="button" onClick={() => setCreating(true)} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline"><UserPlus size={15} />Cadastrar cliente</button>
    </div>
  )
}

const TERMS = [12, 18, 24, 36, 48, 60, 72]

export function NewProposalModal({ onClose, dealId }: { onClose: () => void; dealId?: string }) {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2>(1)
  const [person, setPerson] = useState<PersonHit | null>(null)
  const [co, setCo] = useState<PersonHit | null>(null)
  const [withCo, setWithCo] = useState(false)
  const [vehicle, setVehicle] = useState('')
  const [vehicleValue, setVehicleValue] = useState<number | null>(null)
  const [downPayment, setDownPayment] = useState<number | null>(null)
  const [installments, setInstallments] = useState(48)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const financed = vehicleValue != null ? Math.max(0, vehicleValue - (downPayment ?? 0)) : null
  const submit = async () => {
    if (!person) { setErr('Escolha o cliente.'); return }
    if (!vehicleValue || vehicleValue <= 0) { setErr('Informe o valor do veículo.'); return }
    if ((downPayment ?? 0) >= vehicleValue) { setErr('A entrada precisa ser menor que o valor do veículo.'); return }
    setBusy(true); setErr(null)
    const r = await api<{ id: string }>('/api/financing/proposals', {
      method: 'POST',
      body: { proponentId: person.id, coProponentId: withCo ? co?.id ?? null : null, vehicle: vehicle || null, vehicleValue, downPayment: downPayment ?? 0, installments, dealId: dealId ?? null },
    })
    setBusy(false)
    if (!r.ok || !r.data) { setErr(r.error); return }
    router.push(`/financiamento/fichas/${r.data.id}`)
  }

  return (
    <Modal title="Nova ficha" onClose={onClose} wide footer={step === 1 ? (
      <><button className={btnSecondary} onClick={onClose}>Cancelar</button><button className={btnPrimary} disabled={!person} onClick={() => setStep(2)}>Continuar</button></>
    ) : (
      <><button className={btnSecondary} onClick={() => setStep(1)}>Voltar</button><button className={btnPrimary} disabled={busy} onClick={submit}>{busy ? 'Criando…' : 'Criar ficha'}</button></>
    )}>
      {step === 1 ? (
        <div className="space-y-4">
          <div><FieldLabel required>Cliente</FieldLabel><PersonPicker value={person} onChange={setPerson} label="Buscar cliente" /></div>
          {person && (
            <div>
              <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={withCo} onChange={(e) => setWithCo(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />Incluir co-comprador<HelpHint term="CO_COMPRADOR" size={12} /></label>
              {withCo && <div className="mt-2"><PersonPicker value={co} onChange={setCo} exclude={person.id} label="Buscar co-comprador" /></div>}
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><FieldLabel>Veículo</FieldLabel><input className={inputClass} value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="Ex.: Toyota Corolla 2022" /></div>
          <div><FieldLabel required>Valor do veículo</FieldLabel><MoneyInput className={inputClass} value={vehicleValue} onChange={setVehicleValue} /></div>
          <div><FieldLabel>Entrada</FieldLabel><MoneyInput className={inputClass} value={downPayment} onChange={setDownPayment} /></div>
          <div><FieldLabel required>Parcelas</FieldLabel>
            <select className={inputClass} value={installments} onChange={(e) => setInstallments(Number(e.target.value))}>{TERMS.map((t) => <option key={t} value={t}>{t}x</option>)}</select>
          </div>
          <div><FieldLabel helpTerm="VALOR_FINANCIADO">Valor financiado</FieldLabel><p className="rounded-lg bg-gray-50 px-3 py-2.5 text-sm font-semibold text-gray-900">{financed == null ? '—' : brl(financed)}</p></div>
          {err && <p className="text-sm text-red-600 sm:col-span-2" role="alert">{err}</p>}
        </div>
      )}
      {step === 1 && err && <p className="mt-3 text-sm text-red-600" role="alert">{err}</p>}
    </Modal>
  )
}
