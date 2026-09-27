'use client'

// Formulário da página Financiamento: escolhe um carro do estoque (ou descreve o
// que procura) e envia a simulação para o CRM da loja. Visual do pop-up (SiteFormKit).
import { useState } from 'react'
import { Chips, ContactFields, DonePanel, FormCard, FormFooter, onMoney, Section } from './SiteFormKit'
import { useSubmit } from './SiteServiceForms'

export interface FinancingChoice { id: string; label: string }

export function SiteFinancingForm({ apiUrl, vehicles, preselected, privacyHref, whatsappHref }: { apiUrl: string; vehicles: FinancingChoice[]; preselected?: string; privacyHref: string; whatsappHref?: string }) {
  const [vehicleId, setVehicleId] = useState(preselected && vehicles.some((v) => v.id === preselected) ? preselected : '')
  const [term, setTerm] = useState('48x')
  const [trade, setTrade] = useState('')
  const { state, msg, protocol, submit, reset, sending } = useSubmit(apiUrl, 'financing', () => ({ vehicleId: vehicleId || undefined, intent: vehicleId ? 'simulacao' : undefined, paymentMethod: 'Financiamento' }))
  const chosen = vehicles.find((v) => v.id === vehicleId)
  const head = { eyebrow: 'Crédito facilitado', title: chosen ? chosen.label : 'Financiamento com as parceiras', subtitle: 'Condições das financeiras parceiras.' }

  if (state === 'done') {
    return <FormCard {...head}><DonePanel protocol={protocol} text="Um consultor vai falar com você com as condições das financeiras." whatsappHref={whatsappHref} whatsappText={`Olá! Enviei pelo site uma simulação de financiamento${chosen ? ` do ${chosen.label}` : ''}${protocol ? ` (protocolo ${protocol})` : ''}.`} onAgain={() => { reset(); setTrade('') }} /></FormCard>
  }
  return (
    <FormCard {...head}>
      <form className="vlead-form" method="post" onSubmit={submit}>
        <h2>Simule seu financiamento</h2>
        <p className="vlead-lead">Preencha os dados e um consultor envia as condições das financeiras parceiras.</p>
        <Section legend="Veículo">
          <label className="vlead-full">Carro do estoque
            <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
              <option value="">Ainda não escolhi / outro veículo</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </label>
          {!vehicleId && <label className="vlead-full">Qual carro você procura?<input name="desiredVehicle" maxLength={160} placeholder="Ex.: SUV automático até R$ 90 mil" /></label>}
        </Section>
        <Section legend="Seus dados"><ContactFields /></Section>
        <Section legend="Condições">
          <label>Valor de entrada<input name="downPayment" inputMode="numeric" placeholder="R$ 0,00" onInput={onMoney} /></label>
          <label>Parcela desejada<input name="installmentGoal" inputMode="numeric" placeholder="R$ 0,00" onInput={onMoney} /></label>
          <Chips name="installments" label="Prazo desejado" options={['12x', '24x', '36x', '48x', '60x']} value={term} onChange={setTerm} />
        </Section>
        <Section legend="Tem carro na troca?">
          <Chips name="hasTrade" label="Carro na troca" options={['Sim', 'Não']} value={trade} onChange={setTrade} required />
          {trade === 'Sim' && (
            <>
              <label className="vlead-full">Marca e modelo *<input name="tradeVehicle" required maxLength={120} placeholder="Ex.: VW Gol 1.0" /></label>
              <label>Ano<input name="tradeYear" inputMode="numeric" maxLength={9} placeholder="2019/2020" /></label>
              <label>Quilometragem<input name="tradeMileage" inputMode="numeric" maxLength={9} placeholder="Ex.: 65000" /></label>
            </>
          )}
        </Section>
        <FormFooter privacyHref={privacyHref} button="Enviar simulação" sending={sending} error={state === 'error' ? msg : ''} consentText="Autorizo o contato sobre esta simulação (não pedimos CPF nesta etapa) e li a" />
      </form>
    </FormCard>
  )
}
