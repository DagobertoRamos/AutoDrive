'use client'
/* eslint-disable @next/next/no-img-element -- fotos/logos da loja vêm de URLs arbitrárias */

// Botões da lateral do anúncio + modal de lead (porta do VehicleLeadForm do
// dagobertoeasycar): simulação, interesse e agendamento de visita. Cada envio
// vira lead no CRM da loja já com o veículo vinculado.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { CalendarDays, CheckCircle2, HandCoins, MessageCircle, X } from 'lucide-react'
import { HONEYPOT_STYLE, moneyMask, phoneMask, submitSiteLead, todayIso } from './lead-utils'

type Intent = 'simulacao' | 'interesse' | 'visita'
export interface LeadVehicle { id: string; title: string; version: string; price: string; image: string | null }

const COPY: Record<Intent, { title: string; lead: string; button: string }> = {
  simulacao: { title: 'Simule seu financiamento', lead: 'Preencha os dados e um consultor envia as condições das financeiras parceiras.', button: 'Enviar simulação' },
  interesse: { title: 'Tenho interesse neste carro', lead: 'Conte como pretende pagar e se tem carro na troca. Retornamos rapidinho.', button: 'Enviar interesse' },
  visita: { title: 'Agendar visita', lead: 'Escolha o melhor dia e período. Confirmamos o horário com você.', button: 'Solicitar agendamento' },
}

function Modal({ intent, vehicle, apiUrl, storeName, whatsappHref, privacyHref, onClose }: {
  intent: Intent; vehicle: LeadVehicle; apiUrl: string; storeName: string; whatsappHref: string; privacyHref: string; onClose: () => void
}) {
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')
  const [protocol, setProtocol] = useState<string | null>(null)
  const [payment, setPayment] = useState(intent === 'simulacao' ? 'Financiamento' : '')
  const [trade, setTrade] = useState('')
  const dialog = useRef<HTMLDivElement>(null)
  const copy = COPY[intent]

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    document.body.style.overflow = 'hidden'
    dialog.current?.querySelector<HTMLInputElement>('input[name=name]')?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey); previous?.focus() }
  }, [onClose])

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setState('sending'); setError('')
    const data = Object.fromEntries(new FormData(e.currentTarget).entries())
    const r = await submitSiteLead(apiUrl, { ...data, kind: intent === 'simulacao' ? 'financing' : 'vehicle_interest', intent, vehicleId: vehicle.id })
    if (r.ok) { setProtocol(r.protocol); setState('done') } else { setError(r.error); setState('error') }
  }

  const followUp = whatsappHref ? `${whatsappHref.split('?')[0]}?text=${encodeURIComponent(`Olá! Acabei de enviar uma solicitação pelo site sobre o ${vehicle.title}${protocol ? ` (protocolo ${protocol})` : ''}.`)}` : ''

  return (
    <div className="vlead-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="vlead-dialog" role="dialog" aria-modal="true" aria-labelledby="vlead-title" ref={dialog}>
        <button type="button" className="vlead-close" onClick={onClose} aria-label="Fechar"><X size={20} /></button>
        <div className="vlead-vehicle">
          {vehicle.image && <img src={vehicle.image} alt="" />}
          <div><small>Veículo de interesse</small><strong>{vehicle.title}</strong><span>{vehicle.version}</span><b>{vehicle.price}</b></div>
        </div>
        {state === 'done' ? (
          <div className="vlead-done">
            <CheckCircle2 size={52} aria-hidden="true" />
            <h2>Solicitação enviada!</h2>
            {protocol && <p className="vlead-protocol">Protocolo <b>{protocol}</b></p>}
            <p>Um consultor da {storeName} vai falar com você em breve.</p>
            <div className="vlead-done-actions">
              {followUp && <a className="button" href={followUp} target="_blank" rel="noreferrer"><MessageCircle size={18} aria-hidden="true" />Adiantar pelo WhatsApp</a>}
              <button type="button" className="button button-outline" onClick={onClose}>Fechar</button>
            </div>
          </div>
        ) : (
          <form className="vlead-form" method="post" onSubmit={submit}>
            <h2 id="vlead-title">{copy.title}</h2>
            <p className="vlead-lead">{copy.lead}</p>
            <fieldset>
              <legend>Seus dados</legend>
              <label className="vlead-full">Nome completo *<input name="name" required minLength={2} maxLength={120} autoComplete="name" /></label>
              <label>WhatsApp *<input name="phone" required inputMode="tel" autoComplete="tel" placeholder="(11) 90000-0000" maxLength={16} onInput={(e) => { e.currentTarget.value = phoneMask(e.currentTarget.value) }} /></label>
              <label>E-mail<input name="email" type="email" maxLength={160} autoComplete="email" /></label>
            </fieldset>
            <fieldset>
              <legend>Forma de pagamento</legend>
              <div className="vlead-chips" role="radiogroup" aria-label="Forma de pagamento">
                {['À vista', 'Financiamento', 'Consórcio', 'Ainda não sei'].map((o) => (
                  <label key={o} className={payment === o ? 'active' : ''}><input type="radio" name="paymentMethod" value={o} required checked={payment === o} onChange={() => setPayment(o)} />{o}</label>
                ))}
              </div>
              {payment === 'Financiamento' && (
                <>
                  <label>Valor de entrada<input name="downPayment" inputMode="numeric" placeholder="R$ 0,00" onInput={(e) => { e.currentTarget.value = moneyMask(e.currentTarget.value) }} /></label>
                  <label>Prazo desejado<select name="installments" defaultValue="48x">{['12x', '24x', '36x', '48x', '60x'].map((n) => <option key={n}>{n}</option>)}</select></label>
                </>
              )}
            </fieldset>
            <fieldset>
              <legend>Tem carro na troca?</legend>
              <div className="vlead-chips" role="radiogroup" aria-label="Carro na troca">
                {['Sim', 'Não'].map((o) => (
                  <label key={o} className={trade === o ? 'active' : ''}><input type="radio" name="hasTrade" value={o} required checked={trade === o} onChange={() => setTrade(o)} />{o}</label>
                ))}
              </div>
              {trade === 'Sim' && (
                <>
                  <label className="vlead-full">Marca e modelo *<input name="tradeVehicle" required maxLength={120} placeholder="Ex.: VW Gol 1.0" /></label>
                  <label>Ano<input name="tradeYear" inputMode="numeric" maxLength={9} placeholder="2019/2020" /></label>
                  <label>Quilometragem<input name="tradeMileage" inputMode="numeric" maxLength={9} placeholder="Ex.: 65000" /></label>
                </>
              )}
            </fieldset>
            {intent === 'visita' && (
              <fieldset>
                <legend>Melhor dia para a visita</legend>
                <label>Data *<input name="visitDate" type="date" required min={todayIso()} /></label>
                <label>Período<select name="visitPeriod" defaultValue="Manhã"><option>Manhã</option><option>Tarde</option><option>Sábado</option></select></label>
              </fieldset>
            )}
            <label className="vlead-full">Observações<textarea name="message" rows={3} maxLength={1500} placeholder="Dúvidas, melhor horário para contato..." /></label>
            <div style={HONEYPOT_STYLE} aria-hidden="true"><label>Site<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
            <label className="consent vlead-full"><input name="consent" type="checkbox" value="yes" required /> <span>Autorizo o contato da {storeName} sobre esta solicitação e li a <a href={privacyHref} target="_blank" rel="noreferrer">Política de Privacidade</a>.</span></label>
            <button className="button vlead-submit" disabled={state === 'sending'}>{state === 'sending' ? 'Enviando...' : copy.button}</button>
            {state === 'error' && <p className="form-status error" role="alert">{error}</p>}
          </form>
        )}
      </div>
    </div>
  )
}

function IntentButton({ intent, className, children, ...rest }: { intent: Intent; className: string; children: ReactNode } & Omit<Parameters<typeof Modal>[0], 'intent' | 'onClose'>) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>{children}</button>
      {open && <Modal intent={intent} {...rest} onClose={() => setOpen(false)} />}
    </>
  )
}

export function SiteVehicleLeadActions(props: { vehicle: LeadVehicle; apiUrl: string; storeName: string; whatsappHref: string; phone: string; privacyHref: string; showFinancing: boolean }) {
  const { whatsappHref, phone, showFinancing, ...common } = props
  const shared = { ...common, whatsappHref }
  return (
    <>
      {showFinancing && <IntentButton intent="simulacao" className="button detail-sim-btn" {...shared}><HandCoins size={18} aria-hidden="true" />Faça sua simulação online</IntentButton>}
      <div className="detail-contact-card">
        {whatsappHref && (
          <a href={whatsappHref} className="detail-contact-item" target="_blank" rel="noreferrer">
            <span className="detail-contact-icon"><MessageCircle size={18} aria-hidden="true" /></span><span>{phone || 'Falar no WhatsApp'}</span>
          </a>
        )}
        <IntentButton intent="interesse" className="button" {...shared}>Tenho interesse</IntentButton>
        <IntentButton intent="visita" className="button button-outline" {...shared}><CalendarDays size={17} aria-hidden="true" />Agendar visita</IntentButton>
      </div>
    </>
  )
}
