'use client'

// Formulários dos serviços do site (porta dos SellCarLeadForm e FindCarLeadForm
// do dagobertoeasycar), todos no visual do pop-up do anúncio (SiteFormKit):
// pré-avaliação do carro do cliente, busca de um carro que não está no estoque,
// Financia Fácil (carro de particular), atacado e parceria (lojistas). Viram
// lead no CRM da loja.
import { useState, type FormEvent } from 'react'
import { formatCnpj } from '@/lib/site/leads-core'
import { submitSiteLead } from './lead-utils'
import { Chips, ContactFields, DonePanel, FormCard, FormFooter, onMoney, Section } from './SiteFormKit'

// Venda seu carro: passo a passo de fotos (arquivo próprio).
export { SiteSellCarForm } from './SiteSellCarWizard'

const TERMS = ['12x', '24x', '36x', '48x', '60x']

type State = 'idle' | 'sending' | 'uploading' | 'done' | 'error'
export type ServiceKind = 'sell_car' | 'find_car' | 'private_financing' | 'wholesale' | 'partner' | 'contact' | 'financing'

/** Envio padrão: campos repetidos (chips de múltipla escolha) vão como lista. */
export function useSubmit(apiUrl: string, kind: ServiceKind, extra?: () => Record<string, unknown>, afterOk?: (uploadToken: string | undefined) => Promise<void>) {
  const [state, setState] = useState<State>('idle')
  const [msg, setMsg] = useState('')
  const [protocol, setProtocol] = useState<string | null>(null)
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setState('sending'); setMsg('')
    const fd = new FormData(e.currentTarget)
    fd.delete('photos')
    const data: Record<string, unknown> = {}
    for (const k of new Set(fd.keys())) { const v = fd.getAll(k); data[k] = v.length > 1 ? v : v[0] }
    const r = await submitSiteLead(apiUrl, { ...data, ...extra?.(), kind })
    if (!r.ok) { setState('error'); setMsg(r.error); return }
    setProtocol(r.protocol)
    if (afterOk) { setState('uploading'); await afterOk(r.uploadToken) }
    setState('done')
  }
  const reset = () => { setState('idle'); setMsg(''); setProtocol(null) }
  return { state, msg, protocol, submit, reset, sending: state === 'sending' }
}

function TradeFields() {
  const [trade, setTrade] = useState('')
  return (
    <Section legend="Tem carro na troca?">
      <Chips name="hasTrade" label="Carro na troca" options={['Sim', 'Não']} value={trade} onChange={setTrade} />
      {trade === 'Sim' && (
        <>
          <label className="vlead-full">Marca e modelo *<input name="tradeVehicle" required maxLength={120} placeholder="Ex.: VW Gol 1.0" /></label>
          <label>Ano<input name="tradeYear" inputMode="numeric" maxLength={9} placeholder="2019/2020" /></label>
          <label>Quilometragem<input name="tradeMileage" inputMode="numeric" maxLength={9} placeholder="Ex.: 65000" /></label>
        </>
      )}
    </Section>
  )
}

export function SiteFindCarForm({ apiUrl, privacyHref, whatsappHref }: { apiUrl: string; privacyHref: string; whatsappHref?: string }) {
  const { state, msg, protocol, submit, reset, sending } = useSubmit(apiUrl, 'find_car')
  const [financing, setFinancing] = useState('')
  const head = { eyebrow: 'Busca personalizada', title: 'Encontre seu carro', subtitle: 'Nós procuramos e avisamos você.' }
  if (state === 'done') {
    return <FormCard {...head}><DonePanel protocol={protocol} text="Vamos procurar e chamar você pelo WhatsApp com as opções." whatsappHref={whatsappHref} whatsappText={`Olá! Enviei pelo site uma busca de carro${protocol ? ` (protocolo ${protocol})` : ''}.`} onAgain={() => { setFinancing(''); reset() }} /></FormCard>
  }
  return (
    <FormCard {...head}>
      <form className="vlead-form" method="post" onSubmit={submit}>
        <h2>Qual carro você procura?</h2>
        <p className="vlead-lead">Quanto mais detalhes, mais rápido encontramos.</p>
        <Section legend="Seus dados"><ContactFields /></Section>
        <Section legend="Carro procurado">
          <label>Marca *<input name="brand" required maxLength={80} /></label>
          <label>Modelo *<input name="model" required maxLength={100} /></label>
          <label>Ano mínimo<input name="yearMin" inputMode="numeric" maxLength={4} /></label>
          <label>Orçamento *<input name="budget" required maxLength={40} placeholder="Ex.: até R$ 90.000" /></label>
        </Section>
        <Section legend="Pretende financiar?">
          <Chips name="wantsFinancing" label="Pretende financiar" options={['Sim', 'Não', 'Ainda não sei']} value={financing} onChange={setFinancing} />
          {financing === 'Sim' && <label className="vlead-full">Valor de entrada<input name="downPayment" inputMode="numeric" placeholder="R$ 0,00" onInput={onMoney} /></label>}
        </Section>
        <TradeFields />
        <FormFooter privacyHref={privacyHref} button="Enviar busca" sending={sending} error={state === 'error' ? msg : ''} notesPlaceholder="Versões, cores, opcionais ou lojas onde já pesquisou" />
      </form>
    </FormCard>
  )
}

export function SitePrivateFinancingForm({ apiUrl, privacyHref, whatsappHref }: { apiUrl: string; privacyHref: string; whatsappHref?: string }) {
  const { state, msg, protocol, submit, reset, sending } = useSubmit(apiUrl, 'private_financing')
  const [term, setTerm] = useState('48x')
  const head = { eyebrow: 'Financia Fácil', title: 'Financie o carro de um particular', subtitle: 'Sem CPF nesta primeira etapa.' }
  if (state === 'done') {
    return <FormCard {...head}><DonePanel protocol={protocol} text="Um consultor vai falar com você com as condições das financeiras." whatsappHref={whatsappHref} whatsappText={`Olá! Enviei pelo site uma simulação do Financia Fácil${protocol ? ` (protocolo ${protocol})` : ''}.`} onAgain={reset} /></FormCard>
  }
  return (
    <FormCard {...head}>
      <form className="vlead-form" method="post" onSubmit={submit}>
        <h2>Simule seu financiamento</h2>
        <p className="vlead-lead">Informe o carro que você está negociando e um consultor envia as condições.</p>
        <Section legend="Seus dados">
          <ContactFields />
          <label className="vlead-full">Cidade<input name="city" maxLength={100} autoComplete="address-level2" /></label>
        </Section>
        <Section legend="Carro que você está negociando">
          <label>Marca *<input name="brand" required maxLength={80} /></label>
          <label>Modelo *<input name="model" required maxLength={100} /></label>
          <label>Ano *<input name="year" required inputMode="numeric" maxLength={9} placeholder="Ex.: 2020/2021" /></label>
          <label>Quilometragem<input name="mileage" inputMode="numeric" maxLength={20} /></label>
          <label className="vlead-full">Valor combinado com o vendedor *<input name="vehicleValue" required inputMode="numeric" placeholder="R$ 0,00" onInput={onMoney} /></label>
        </Section>
        <Section legend="Condições">
          <label className="vlead-full">Valor de entrada<input name="downPayment" inputMode="numeric" placeholder="R$ 0,00" onInput={onMoney} /></label>
          <Chips name="installments" label="Prazo desejado" options={TERMS} value={term} onChange={setTerm} />
        </Section>
        <FormFooter privacyHref={privacyHref} button="Enviar simulação" sending={sending} error={state === 'error' ? msg : ''} notesPlaceholder="Ex.: o carro é de um amigo e está quitado" />
      </form>
    </FormCard>
  )
}

const cnpjMask = (e: FormEvent<HTMLInputElement>) => { e.currentTarget.value = formatCnpj(e.currentTarget.value) }

export function SiteWholesaleForm({ apiUrl, privacyHref, whatsappHref }: { apiUrl: string; privacyHref: string; whatsappHref?: string }) {
  const { state, msg, protocol, submit, reset, sending } = useSubmit(apiUrl, 'wholesale')
  const head = { eyebrow: 'Para lojistas', title: 'Cadastro no atacado', subtitle: 'Exclusivo para empresas com CNPJ.' }
  if (state === 'done') {
    return <FormCard {...head}><DonePanel protocol={protocol} text="A equipe de atacado vai falar com você." whatsappHref={whatsappHref} whatsappText={`Olá! Fiz pelo site o cadastro de lojista no atacado${protocol ? ` (protocolo ${protocol})` : ''}.`} onAgain={reset} /></FormCard>
  }
  return (
    <FormCard {...head}>
      <form className="vlead-form" method="post" onSubmit={submit}>
        <h2>Cadastre sua empresa</h2>
        <p className="vlead-lead">Receba as oportunidades de repasse antes de irem para a vitrine.</p>
        <Section legend="Empresa">
          <label className="vlead-full">Razão social *<input name="companyName" required maxLength={160} autoComplete="organization" /></label>
          <label>CNPJ *<input name="cnpj" required inputMode="numeric" maxLength={18} placeholder="00.000.000/0000-00" onInput={cnpjMask} /></label>
          <label>Cidade<input name="city" maxLength={100} /></label>
        </Section>
        <Section legend="Responsável"><ContactFields nameLabel="Nome" /></Section>
        <Section legend="Interesse">
          <label className="vlead-full">Que carros interessam?<input name="interest" maxLength={200} placeholder="Ex.: populares até 2018, SUVs, carros para repasse" /></label>
        </Section>
        <FormFooter privacyHref={privacyHref} button="Enviar cadastro" sending={sending} error={state === 'error' ? msg : ''} />
      </form>
    </FormCard>
  )
}

export function SitePartnerForm({ apiUrl, privacyHref, whatsappHref }: { apiUrl: string; privacyHref: string; whatsappHref?: string }) {
  const { state, msg, protocol, submit, reset, sending } = useSubmit(apiUrl, 'partner')
  const [type, setType] = useState('')
  const head = { eyebrow: 'Parceria', title: 'Quero ser parceiro', subtitle: 'Para lojistas e profissionais do setor.' }
  if (state === 'done') {
    return <FormCard {...head}><DonePanel protocol={protocol} text="Nossa equipe vai analisar o cadastro e falar com você pelo WhatsApp." whatsappHref={whatsappHref} whatsappText={`Olá! Fiz pelo site o cadastro de parceiro${protocol ? ` (protocolo ${protocol})` : ''}.`} onAgain={() => { setType(''); reset() }} /></FormCard>
  }
  return (
    <FormCard {...head}>
      <form className="vlead-form" method="post" onSubmit={submit}>
        <h2>Cadastre sua loja</h2>
        <p className="vlead-lead">Conte como quer trabalhar com a gente. A equipe retorna com os próximos passos.</p>
        <Section legend="Como quer ser parceiro?">
          <Chips name="partnerType" label="Tipo de parceria" required options={['Oferecer veículos do meu estoque', 'Procuro veículos para meu estoque', 'Os dois']} value={type} onChange={setType} />
        </Section>
        <Section legend="Sua loja">
          <label className="vlead-full">Nome da loja / empresa *<input name="companyName" required maxLength={160} autoComplete="organization" /></label>
          <label>CNPJ<input name="cnpj" inputMode="numeric" maxLength={18} placeholder="00.000.000/0000-00" onInput={cnpjMask} /></label>
          <label>Cidade *<input name="city" required maxLength={100} autoComplete="address-level2" /></label>
          <label className="vlead-full">Carros em estoque<select name="stockSize" defaultValue=""><option value="">Selecione</option><option>Até 10</option><option>11 a 30</option><option>31 a 60</option><option>Mais de 60</option></select></label>
        </Section>
        <Section legend="Responsável"><ContactFields nameLabel="Nome" /></Section>
        <Section legend="Veículos">
          <label className="vlead-full">Que carros você oferece ou procura?<input name="interest" maxLength={200} placeholder="Ex.: SUVs e sedãs 2018+, populares para repasse" /></label>
        </Section>
        <FormFooter privacyHref={privacyHref} button="Enviar cadastro" sending={sending} error={state === 'error' ? msg : ''} />
      </form>
    </FormCard>
  )
}
