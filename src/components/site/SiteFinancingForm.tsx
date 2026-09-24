'use client'

// Formulário da página Financiamento: escolhe um carro do estoque (ou descreve o
// que procura) e envia a simulação para o CRM da loja.
import { useState, type FormEvent } from 'react'
import { HONEYPOT_STYLE, moneyMask, phoneMask, submitSiteLead } from './lead-utils'

export interface FinancingChoice { id: string; label: string }

export function SiteFinancingForm({ apiUrl, vehicles, preselected, privacyHref }: { apiUrl: string; vehicles: FinancingChoice[]; preselected?: string; privacyHref: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [msg, setMsg] = useState('')
  const [vehicleId, setVehicleId] = useState(preselected && vehicles.some((v) => v.id === preselected) ? preselected : '')

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setState('sending')
    const form = e.currentTarget
    const data = Object.fromEntries(new FormData(form).entries()) as Record<string, string>
    const r = await submitSiteLead(apiUrl, { ...data, kind: 'financing', vehicleId: vehicleId || undefined, intent: vehicleId ? 'simulacao' : undefined })
    if (r.ok) { setState('done'); setMsg(`Recebemos sua simulação${r.protocol ? ` (protocolo ${r.protocol})` : ''}. Um consultor vai falar com você.`); form.reset(); setVehicleId('') }
    else { setState('error'); setMsg(r.error) }
  }

  return (
    <form className="lead-form" method="post" onSubmit={submit}>
      <h2>Simular financiamento</h2>
      <label>Veículo
        <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
          <option value="">Ainda não escolhi / outro veículo</option>
          {vehicles.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>
      </label>
      {!vehicleId && <label>Qual carro você procura?<input name="desiredVehicle" maxLength={160} placeholder="Ex.: SUV automático até R$ 90 mil" /></label>}
      <label>Nome<input name="name" required maxLength={120} autoComplete="name" /></label>
      <div className="form-row">
        <label>WhatsApp<input name="phone" required maxLength={16} inputMode="tel" autoComplete="tel" onInput={(e) => { e.currentTarget.value = phoneMask(e.currentTarget.value) }} /></label>
        <label>E-mail<input name="email" type="email" maxLength={160} autoComplete="email" /></label>
      </div>
      <div className="form-row">
        <label>Entrada aproximada<input name="downPayment" inputMode="numeric" placeholder="R$ 0,00" onInput={(e) => { e.currentTarget.value = moneyMask(e.currentTarget.value) }} /></label>
        <label>Parcela desejada<input name="installmentGoal" inputMode="numeric" placeholder="R$ 0,00" onInput={(e) => { e.currentTarget.value = moneyMask(e.currentTarget.value) }} /></label>
      </div>
      <label>Observações<textarea name="message" maxLength={1500} rows={3} /></label>
      <div style={HONEYPOT_STYLE} aria-hidden="true"><label>Site<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <label className="consent"><input name="consent" type="checkbox" value="yes" required /> <span>Autorizo o contato sobre esta simulação e li a <a href={privacyHref}>Política de Privacidade</a>. Não pedimos CPF nesta etapa.</span></label>
      <button className="button" disabled={state === 'sending'}>{state === 'sending' ? 'Enviando...' : 'Enviar simulação'}</button>
      <p className={`form-status ${state}`} aria-live="polite">{state === 'done' || state === 'error' ? msg : ''}</p>
    </form>
  )
}
