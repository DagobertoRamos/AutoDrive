'use client'

// =============================================================================
// Simulador de financiamento do site (F&I) — formulário progressivo.
//   1) Valor do veículo, entrada e prazo → parcela estimada (se a loja ativou).
//   2) Nome, CPF, nascimento e celular → ficha + lead no CRM + link para
//      acompanhar. Estimativa nunca é aprovação: quem aprova é o banco.
// Visual do site da loja (SiteFormKit), sem iframe.
// =============================================================================

import { useMemo, useState } from 'react'
import { CheckCircle2, MessageCircle } from 'lucide-react'
import { Chips, FormCard, Section, onMoney } from './SiteFormKit'

export interface SimVehicle { id: string; label: string; price: number | null }
interface Estimate { installments: number; installmentValue: number }

const toNumber = (s: string) => Number(s.replace(/[^\d,]/g, '').replace(',', '.')) || 0
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtInput = (n: number | null) => (n ? n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '')
const TERMS = ['24x', '36x', '48x', '60x']

function utm() {
  if (typeof window === 'undefined') return {}
  const q = new URLSearchParams(window.location.search)
  return { pageUrl: window.location.href.slice(0, 400), utmSource: q.get('utm_source') ?? undefined, utmMedium: q.get('utm_medium') ?? undefined, utmCampaign: q.get('utm_campaign') ?? undefined, referrer: document.referrer || undefined }
}

export function SiteFinanceSimulator({ simulateUrl, vehicles, preselected, privacyHref, whatsappHref }: { simulateUrl: string; vehicles: SimVehicle[]; preselected?: string; privacyHref: string; whatsappHref?: string }) {
  const initial = vehicles.find((v) => v.id === preselected || v.label === preselected) ?? null
  const [vehicleId, setVehicleId] = useState(initial?.id ?? '')
  const [value, setValue] = useState(fmtInput(initial?.price ?? null))
  const [down, setDown] = useState('')
  const [term, setTerm] = useState('48x')
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [estimate, setEstimate] = useState<Estimate[] | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState<{ protocol: string | null; code: string | null; portalUrl: string } | null>(null)
  const chosen = vehicles.find((v) => v.id === vehicleId) ?? null

  const values = useMemo(() => ({ vehicleId: vehicleId || undefined, vehicleValue: toNumber(value), downPayment: toNumber(down), installments: Number(term.replace('x', '')) }), [vehicleId, value, down, term])

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch(simulateUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.success) throw new Error(json?.error ?? 'Não foi possível enviar agora.')
    return json.data
  }

  const goValues = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setSending(true)
    try {
      const d = await post({ step: 'valores', ...values })
      setEstimate(d.estimate); setNote(d.estimateNote); setStep(2)
    } catch (err) { setError((err as Error).message) } finally { setSending(false) }
  }

  const goIdentity = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setError(''); setSending(true)
    const f = new FormData(e.currentTarget)
    try {
      const d = await post({
        step: 'identificacao', ...values, ...utm(),
        name: f.get('name'), cpf: f.get('cpf'), birthDate: f.get('birthDate'), phone: f.get('phone'), email: f.get('email') || undefined,
        consent: f.get('consent') === 'yes', website: f.get('website') || undefined,
      })
      setDone({ protocol: d.protocol, code: d.code, portalUrl: d.portalUrl }); setStep(3)
    } catch (err) { setError((err as Error).message) } finally { setSending(false) }
  }

  const head = { eyebrow: 'Simulação de financiamento', title: chosen ? chosen.label : 'Simule seu financiamento', subtitle: 'Sem compromisso. A aprovação é feita pelo banco.' }

  if (step === 3 && done) {
    const wa = whatsappHref ? `${whatsappHref.split('?')[0]}?text=${encodeURIComponent(`Olá! Fiz uma simulação de financiamento pelo site${done.protocol ? ` (protocolo ${done.protocol})` : ''}.`)}` : ''
    return (
      <FormCard {...head}>
        <div className="vlead-done">
          <CheckCircle2 size={52} aria-hidden="true" />
          <h2>Recebemos sua simulação!</h2>
          {done.protocol && <p className="vlead-protocol">Protocolo <b>{done.protocol}</b></p>}
          <p>Nossa equipe vai buscar as condições dos bancos. Você pode acompanhar e completar seus dados pelo link abaixo.</p>
          <div className="vlead-done-actions">
            <a className="button" href={done.portalUrl}>Acompanhar minha ficha</a>
            {wa && <a className="button button-outline" href={wa} target="_blank" rel="noreferrer"><MessageCircle size={18} aria-hidden="true" />Falar no WhatsApp</a>}
          </div>
        </div>
      </FormCard>
    )
  }

  if (step === 2) {
    return (
      <FormCard {...head}>
        <form key="identificacao" className="vlead-form" method="post" onSubmit={goIdentity}>
          {estimate && estimate.length > 0 ? (
            <Section legend="Parcelas estimadas">
              <ul className="vlead-full" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
                {estimate.map((e) => <li key={e.installments} style={{ display: 'flex', justifyContent: 'space-between', fontWeight: e.installments === values.installments ? 700 : 400 }}><span>{e.installments}x</span><span>{brl(e.installmentValue)}</span></li>)}
              </ul>
              {note && <p className="vlead-full" style={{ fontSize: 12, opacity: .75 }}>{note}</p>}
            </Section>
          ) : (
            <p className="vlead-lead">Financiando {brl(Math.max(0, values.vehicleValue - values.downPayment))} em {values.installments}x. Para ver as condições dos bancos, informe seus dados.</p>
          )}
          <Section legend="Seus dados">
            <label className="vlead-full">Nome completo *<input name="name" required minLength={5} maxLength={120} autoComplete="name" /></label>
            <label>CPF *<input name="cpf" autoComplete="off" required inputMode="numeric" maxLength={14} placeholder="000.000.000-00" /></label>
            <label>Data de nascimento *<input name="birthDate" type="date" required /></label>
            <label>Celular (WhatsApp) *<input name="phone" required inputMode="tel" autoComplete="tel" maxLength={16} placeholder="(11) 90000-0000" /></label>
            <label>E-mail<input name="email" type="email" maxLength={160} autoComplete="email" /></label>
          </Section>
          <div style={{ position: 'absolute', left: '-9999px' }} aria-hidden="true"><label>Site<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
          <label className="consent vlead-full"><input name="consent" type="checkbox" value="yes" required /> <span>Autorizo o uso destes dados para a simulação e a análise de crédito pelos bancos parceiros e li a <a href={privacyHref} target="_blank" rel="noreferrer">Política de Privacidade</a>.</span></label>
          <button className="button vlead-submit" disabled={sending}>{sending ? 'Enviando...' : 'Ver condições dos bancos'}</button>
          <button type="button" className="button button-outline vlead-submit" onClick={() => setStep(1)}>Voltar</button>
          {error && <p className="form-status error" role="alert">{error}</p>}
        </form>
      </FormCard>
    )
  }

  return (
    <FormCard {...head}>
      <form key="valores" className="vlead-form" method="post" onSubmit={goValues}>
        <Section legend="Veículo">
          <label className="vlead-full">Carro do estoque
            <select value={vehicleId} onChange={(e) => { const v = vehicles.find((x) => x.id === e.target.value); setVehicleId(e.target.value); if (v?.price) setValue(fmtInput(v.price)) }}>
              <option value="">Outro veículo</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </label>
        </Section>
        <Section legend="Valores">
          <label>Valor do veículo *<input required inputMode="numeric" placeholder="R$ 0,00" value={value} onChange={(e) => { onMoney(e); setValue(e.currentTarget.value) }} /></label>
          <label>Entrada<input inputMode="numeric" placeholder="R$ 0,00" value={down} onChange={(e) => { onMoney(e); setDown(e.currentTarget.value) }} /></label>
          <Chips name="installments" label="Prazo" options={TERMS} value={term} onChange={setTerm} />
        </Section>
        <button className="button vlead-submit" disabled={sending}>{sending ? 'Calculando...' : 'Simular'}</button>
        {error && <p className="form-status error" role="alert">{error}</p>}
      </form>
    </FormCard>
  )
}
