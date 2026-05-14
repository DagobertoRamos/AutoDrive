'use client'

// =============================================================================
// /negociacoes/nova — Nova negociação (wizard multi-step)
// =============================================================================

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  ArrowRight,
  Handshake,
  User,
  Car,
  DollarSign,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'

// ── Constantes ────────────────────────────────────────────────────────────────

const DEAL_TYPES = [
  { value: 'VENDA',       label: 'Venda',       desc: 'Venda de veículo ao cliente',              color: 'border-green-300  bg-green-50   text-green-700'  },
  { value: 'COMPRA',      label: 'Compra',      desc: 'Compra de veículo do cliente',             color: 'border-blue-300   bg-blue-50    text-blue-700'   },
  { value: 'TROCA',       label: 'Troca',       desc: 'Troca de veículo com o cliente',           color: 'border-purple-300 bg-purple-50  text-purple-700' },
  { value: 'CONSIGNACAO', label: 'Consignação', desc: 'Veículo do cliente em consignação',        color: 'border-amber-300  bg-amber-50   text-amber-700'  },
]

const STEPS = [
  { id: 'tipo',      label: 'Tipo',     icon: Handshake },
  { id: 'cliente',   label: 'Cliente',  icon: User      },
  { id: 'veiculo',   label: 'Veículo',  icon: Car       },
  { id: 'valores',   label: 'Valores',  icon: DollarSign },
  { id: 'resumo',    label: 'Resumo',   icon: CheckCircle2 },
]

// ── Formulário ────────────────────────────────────────────────────────────────

interface DealForm {
  type:           string
  // Cliente
  personType:     'FISICA' | 'JURIDICA'
  cpf:            string
  cnpj:           string
  nomeCompleto:   string
  email:          string
  phone:          string
  // Veículo
  plate:          string
  brand:          string
  model:          string
  year:           string
  color:          string
  vehicleValue:   string
  // Valores
  totalValue:     string
  tradeValue:     string
  downPayment:    string
  financedValue:  string
  notes:          string
}

const INITIAL_FORM: DealForm = {
  type: '',
  personType: 'FISICA',
  cpf: '', cnpj: '', nomeCompleto: '', email: '', phone: '',
  plate: '', brand: '', model: '', year: '', color: '', vehicleValue: '',
  totalValue: '', tradeValue: '', downPayment: '', financedValue: '', notes: '',
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function NovaNegociacaoPage() {
  const router = useRouter()
  const [step, setStep]       = useState(0)
  const [form, setForm]       = useState<DealForm>(INITIAL_FORM)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  const f = (k: keyof DealForm) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((prev) => ({ ...prev, [k]: e.target.value }))

  const canProceed = () => {
    if (step === 0) return !!form.type
    if (step === 1) return !!form.nomeCompleto && !!(form.type === 'JURIDICA' ? form.cnpj : form.cpf)
    if (step === 2) return true // veículo é opcional
    if (step === 3) return !!form.totalValue || !!form.vehicleValue
    return true
  }

  const handleSubmit = async () => {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/negotiations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type:  form.type,
          person: {
            type:         form.personType,
            cpf:          form.cpf || null,
            cnpj:         form.cnpj || null,
            nomeCompleto: form.nomeCompleto,
            email:        form.email || null,
            phone:        form.phone || null,
          },
          vehicle: form.plate ? {
            plate:        form.plate,
            brand:        form.brand || null,
            model:        form.model || null,
            year:         form.year ? Number(form.year) : null,
            color:        form.color || null,
          } : null,
          totalValue:    form.totalValue    ? parseFloat(form.totalValue.replace(',', '.'))    : null,
          tradeValue:    form.tradeValue    ? parseFloat(form.tradeValue.replace(',', '.'))    : null,
          downPayment:   form.downPayment   ? parseFloat(form.downPayment.replace(',', '.'))   : null,
          financedValue: form.financedValue ? parseFloat(form.financedValue.replace(',', '.')) : null,
          notes:         form.notes || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao criar negociação')
      router.replace(`/negociacoes/${data.data.id}`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro inesperado')
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/negociacoes" className="btn-secondary p-2">
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Nova Negociação</h1>
          <p className="text-sm text-gray-500">Preencha os dados em etapas</p>
        </div>
      </div>

      {/* Progress steps */}
      <div className="card p-4">
        <div className="flex items-center justify-between">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            const done    = i < step
            const current = i === step
            return (
              <div key={s.id} className="flex flex-1 items-center">
                <div className={`
                  flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors
                  ${done    ? 'bg-brand-700 text-white'             : ''}
                  ${current ? 'bg-brand-600 text-white ring-2 ring-brand-200' : ''}
                  ${!done && !current ? 'bg-gray-100 text-gray-400' : ''}
                `}>
                  {done ? <CheckCircle2 size={14} /> : <Icon size={14} />}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`h-0.5 flex-1 mx-1 ${i < step ? 'bg-brand-600' : 'bg-gray-200'}`} />
                )}
              </div>
            )
          })}
        </div>
        <div className="mt-2 flex justify-between">
          {STEPS.map((s) => (
            <p key={s.id} className="flex-1 text-center text-[10px] text-gray-400">{s.label}</p>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={15} />
          {error}
        </div>
      )}

      {/* Step content */}
      <div className="card space-y-5">
        {/* Passo 0 — Tipo de negociação */}
        {step === 0 && (
          <div>
            <h2 className="mb-4 font-semibold text-gray-800">Tipo de Negociação</h2>
            <div className="grid grid-cols-2 gap-3">
              {DEAL_TYPES.map((dt) => (
                <button
                  key={dt.value}
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, type: dt.value }))}
                  className={`
                    rounded-xl border-2 p-4 text-left transition-all
                    ${form.type === dt.value ? dt.color + ' ring-2 ring-offset-1' : 'border-gray-200 hover:border-gray-300'}
                  `}
                >
                  <p className="font-bold">{dt.label}</p>
                  <p className="mt-0.5 text-xs opacity-80">{dt.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Passo 1 — Cliente */}
        {step === 1 && (
          <div>
            <h2 className="mb-4 font-semibold text-gray-800">Dados do Cliente</h2>
            <div className="space-y-4">
              <div>
                <label className="label">Tipo de pessoa</label>
                <div className="flex gap-3">
                  {([['FISICA', 'Pessoa Física'], ['JURIDICA', 'Pessoa Jurídica']] as const).map(([v, l]) => (
                    <label key={v} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        value={v}
                        checked={form.personType === v}
                        onChange={() => setForm((p) => ({ ...p, personType: v }))}
                        className="accent-brand-600"
                      />
                      <span className="text-sm">{l}</span>
                    </label>
                  ))}
                </div>
              </div>

              {form.personType === 'FISICA' ? (
                <div>
                  <label className="label">CPF *</label>
                  <input className="input" placeholder="000.000.000-00" value={form.cpf} onChange={f('cpf')} />
                </div>
              ) : (
                <div>
                  <label className="label">CNPJ *</label>
                  <input className="input" placeholder="00.000.000/0001-00" value={form.cnpj} onChange={f('cnpj')} />
                </div>
              )}

              <div>
                <label className="label">Nome completo / Razão social *</label>
                <input className="input" value={form.nomeCompleto} onChange={f('nomeCompleto')} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">E-mail</label>
                  <input className="input" type="email" value={form.email} onChange={f('email')} />
                </div>
                <div>
                  <label className="label">Telefone / WhatsApp</label>
                  <input className="input" placeholder="(00) 00000-0000" value={form.phone} onChange={f('phone')} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Passo 2 — Veículo */}
        {step === 2 && (
          <div>
            <h2 className="mb-4 font-semibold text-gray-800">Veículo</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Placa</label>
                  <input className="input uppercase" placeholder="AAA0A000" value={form.plate} onChange={f('plate')} />
                </div>
                <div>
                  <label className="label">Ano</label>
                  <input className="input" placeholder="2024" value={form.year} onChange={f('year')} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Marca</label>
                  <input className="input" placeholder="Toyota" value={form.brand} onChange={f('brand')} />
                </div>
                <div>
                  <label className="label">Modelo</label>
                  <input className="input" placeholder="Corolla" value={form.model} onChange={f('model')} />
                </div>
              </div>
              <div>
                <label className="label">Cor</label>
                <input className="input" placeholder="Branco Pérola" value={form.color} onChange={f('color')} />
              </div>
              <div>
                <label className="label">Valor do veículo (R$)</label>
                <input className="input" placeholder="0,00" value={form.vehicleValue} onChange={f('vehicleValue')} />
              </div>
            </div>
          </div>
        )}

        {/* Passo 3 — Valores */}
        {step === 3 && (
          <div>
            <h2 className="mb-4 font-semibold text-gray-800">Valores e Financeiro</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Valor total da negociação (R$)</label>
                  <input className="input" placeholder="0,00" value={form.totalValue} onChange={f('totalValue')} />
                </div>
                {(form.type === 'TROCA' || form.type === 'COMPRA') && (
                  <div>
                    <label className="label">Valor de troca / entrada (R$)</label>
                    <input className="input" placeholder="0,00" value={form.tradeValue} onChange={f('tradeValue')} />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Entrada / Sinal (R$)</label>
                  <input className="input" placeholder="0,00" value={form.downPayment} onChange={f('downPayment')} />
                </div>
                <div>
                  <label className="label">Valor financiado (R$)</label>
                  <input className="input" placeholder="0,00" value={form.financedValue} onChange={f('financedValue')} />
                </div>
              </div>
              <div>
                <label className="label">Observações</label>
                <textarea
                  className="input min-h-20 resize-y"
                  placeholder="Condições especiais, observações..."
                  value={form.notes}
                  onChange={f('notes')}
                />
              </div>
            </div>
          </div>
        )}

        {/* Passo 4 — Resumo */}
        {step === 4 && (
          <div>
            <h2 className="mb-4 font-semibold text-gray-800">Resumo da Negociação</h2>
            <div className="space-y-3 rounded-xl bg-gray-50 p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Tipo:</span>
                <span className="font-semibold">{DEAL_TYPES.find(t => t.value === form.type)?.label}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Cliente:</span>
                <span className="font-semibold">{form.nomeCompleto}</span>
              </div>
              {form.plate && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Veículo:</span>
                  <span className="font-semibold">{form.brand} {form.model} {form.year} · {form.plate}</span>
                </div>
              )}
              {form.totalValue && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Valor total:</span>
                  <span className="font-bold text-brand-700">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parseFloat(form.totalValue.replace(',', '.') || '0'))}
                  </span>
                </div>
              )}
              {form.notes && (
                <div>
                  <span className="text-gray-500">Obs:</span>
                  <p className="mt-1 text-gray-700">{form.notes}</p>
                </div>
              )}
            </div>
            <p className="mt-3 text-xs text-gray-400">
              A negociação será criada como <strong>Rascunho</strong> e precisará ser enviada para aprovação.
            </p>
          </div>
        )}
      </div>

      {/* Navegação */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="btn-secondary flex items-center gap-1.5 disabled:opacity-40"
        >
          <ArrowLeft size={14} />
          Anterior
        </button>

        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            disabled={!canProceed()}
            className="btn-primary flex items-center gap-1.5 disabled:opacity-40"
          >
            Próximo
            <ArrowRight size={14} />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="btn-primary flex items-center gap-1.5"
          >
            <CheckCircle2 size={14} />
            {saving ? 'Criando...' : 'Criar Negociação'}
          </button>
        )}
      </div>
    </div>
  )
}
