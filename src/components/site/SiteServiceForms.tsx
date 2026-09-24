'use client'

// Formulários dos serviços opcionais do site (porta dos SellCarLeadForm e
// FindCarLeadForm do dagobertoeasycar): pré-avaliação do carro do cliente e
// busca de um carro que não está no estoque. Viram lead no CRM da loja.
import { useState, type FormEvent } from 'react'
import { MessageCircle } from 'lucide-react'
import { HONEYPOT_STYLE, moneyMask, phoneMask, submitSiteLead } from './lead-utils'

type State = 'idle' | 'sending' | 'done' | 'error'

function useSubmit(apiUrl: string, kind: 'sell_car' | 'find_car') {
  const [state, setState] = useState<State>('idle')
  const [msg, setMsg] = useState('')
  const [protocol, setProtocol] = useState<string | null>(null)
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setState('sending')
    const form = e.currentTarget
    const fd = new FormData(form)
    const data: Record<string, unknown> = Object.fromEntries(fd.entries())
    data.vehicleStatus = fd.getAll('vehicleStatus')
    const r = await submitSiteLead(apiUrl, { ...data, kind })
    if (r.ok) { setState('done'); setProtocol(r.protocol); setMsg(''); form.reset() }
    else { setState('error'); setMsg(r.error) }
  }
  return { state, msg, protocol, submit }
}

const Common = ({ privacyHref }: { privacyHref: string }) => (
  <>
    <div style={HONEYPOT_STYLE} aria-hidden="true"><label>Site<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
    <label className="consent"><input name="consent" type="checkbox" value="yes" required /> <span>Autorizo o contato sobre esta solicitação e li a <a href={privacyHref}>Política de Privacidade</a>.</span></label>
  </>
)

const Contact = () => (
  <>
    <label>Nome *<input name="name" required maxLength={120} autoComplete="name" /></label>
    <div className="form-row">
      <label>WhatsApp *<input name="phone" required maxLength={16} inputMode="tel" autoComplete="tel" onInput={(e) => { e.currentTarget.value = phoneMask(e.currentTarget.value) }} /></label>
      <label>E-mail<input name="email" type="email" maxLength={160} autoComplete="email" /></label>
    </div>
  </>
)

const money = (e: FormEvent<HTMLInputElement>) => { e.currentTarget.value = moneyMask(e.currentTarget.value) }

export function SiteSellCarForm({ apiUrl, privacyHref, whatsappHref }: { apiUrl: string; privacyHref: string; whatsappHref: string }) {
  const { state, msg, protocol, submit } = useSubmit(apiUrl, 'sell_car')
  if (state === 'done') {
    const text = `Olá! Enviei pelo site a pré-avaliação do meu carro${protocol ? ` (protocolo ${protocol})` : ''}. Seguem as fotos:`
    const wa = whatsappHref ? `${whatsappHref.split('?')[0]}?text=${encodeURIComponent(text)}` : ''
    return (
      <div className="lead-form">
        <h2>Recebemos sua pré-avaliação{protocol ? ` ${protocol}` : ''}</h2>
        <p>Nossa equipe vai analisar os dados e chamar você pelo WhatsApp.</p>
        {wa && <><p><strong>Adiante a avaliação:</strong> mande fotos reais do carro (frente, traseira, laterais, painel ligado, interior, motor, pneus e qualquer avaria).</p><a className="button" href={wa} target="_blank" rel="noreferrer"><MessageCircle size={18} aria-hidden="true" />Enviar fotos pelo WhatsApp</a></>}
      </div>
    )
  }
  return (
    <form className="lead-form structured-form" method="post" onSubmit={submit}>
      <h2>Pré-avaliação do veículo</h2>
      <p className="form-help">Campos com * são obrigatórios.</p>
      <h3>Seus dados</h3>
      <Contact />
      <label>Cidade *<input name="city" required maxLength={100} autoComplete="address-level2" /></label>
      <h3>Seu carro</h3>
      <div className="form-row">
        <label>Marca *<input name="brand" required maxLength={80} /></label>
        <label>Modelo *<input name="model" required maxLength={100} /></label>
      </div>
      <label>Versão<input name="version" maxLength={140} /></label>
      <div className="form-row">
        <label>Ano *<input name="year" required inputMode="numeric" maxLength={9} placeholder="Ex.: 2020/2021" /></label>
        <label>Quilometragem *<input name="mileage" required inputMode="numeric" maxLength={20} /></label>
      </div>
      <div className="form-row">
        <label>Câmbio<select name="transmission" defaultValue=""><option value="">Selecione</option><option>Manual</option><option>Automático</option><option>CVT</option><option>Automatizado</option></select></label>
        <label>Combustível<select name="fuel" defaultValue=""><option value="">Selecione</option><option>Flex</option><option>Gasolina</option><option>Etanol</option><option>Diesel</option><option>Híbrido</option><option>Elétrico</option></select></label>
      </div>
      <div className="form-row">
        <label>Placa<input name="plate" maxLength={8} autoCapitalize="characters" /></label>
        <label>Cor<input name="color" maxLength={60} /></label>
      </div>
      <label>Valor pretendido *<input name="targetPrice" required inputMode="numeric" placeholder="R$ 0,00" onInput={money} /></label>
      <h3>Situação</h3>
      <div className="checkbox-grid">
        {['Quitado', 'Financiado', 'Possui débitos', 'Possui sinistro', 'Possui leilão'].map((s) => <label key={s}><input type="checkbox" name="vehicleStatus" value={s} />{s}</label>)}
      </div>
      <label>Observações<textarea name="message" rows={4} maxLength={2000} placeholder="Revisões, avarias, opcionais..." /></label>
      <Common privacyHref={privacyHref} />
      <button className="button" disabled={state === 'sending'}>{state === 'sending' ? 'Enviando...' : 'Enviar pré-avaliação'}</button>
      <p className={`form-status ${state}`} aria-live="polite">{state === 'error' ? msg : ''}</p>
    </form>
  )
}

export function SiteFindCarForm({ apiUrl, privacyHref }: { apiUrl: string; privacyHref: string }) {
  const { state, msg, protocol, submit } = useSubmit(apiUrl, 'find_car')
  return (
    <form className="lead-form structured-form" method="post" onSubmit={submit}>
      <h2>Qual carro você procura?</h2>
      <p className="form-help">Campos com * são obrigatórios.</p>
      <Contact />
      <div className="form-row">
        <label>Marca *<input name="brand" required maxLength={80} /></label>
        <label>Modelo *<input name="model" required maxLength={100} /></label>
      </div>
      <div className="form-row">
        <label>Ano mínimo<input name="yearMin" inputMode="numeric" maxLength={4} /></label>
        <label>Orçamento *<input name="budget" required maxLength={40} placeholder="Ex.: até R$ 90.000" /></label>
      </div>
      <div className="form-row">
        <label>Entrada<input name="downPayment" inputMode="numeric" placeholder="R$ 0,00" onInput={money} /></label>
        <label>Carro na troca?<select name="hasTrade" defaultValue=""><option value="">Selecione</option><option>Sim</option><option>Não</option></select></label>
      </div>
      <label>Pretende financiar?<select name="wantsFinancing" defaultValue=""><option value="">Selecione</option><option>Sim</option><option>Não</option><option>Ainda não sei</option></select></label>
      <label>Observações<textarea name="message" rows={4} maxLength={2000} placeholder="Versões, cores, opcionais ou lojas onde já pesquisou" /></label>
      <Common privacyHref={privacyHref} />
      <button className="button" disabled={state === 'sending'}>{state === 'sending' ? 'Enviando...' : 'Enviar busca'}</button>
      <p className={`form-status ${state}`} aria-live="polite">
        {state === 'done' ? `Recebemos sua busca${protocol ? ` (protocolo ${protocol})` : ''}. Vamos procurar e chamar você pelo WhatsApp com as opções.` : state === 'error' ? msg : ''}
      </p>
    </form>
  )
}
