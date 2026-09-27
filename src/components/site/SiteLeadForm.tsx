'use client'

// Formulário de contato do site (porta do LeadForm), no visual do pop-up. Vai para o CRM da loja.
import { useState } from 'react'
import { Chips, ContactFields, DonePanel, FormCard, FormFooter, Section } from './SiteFormKit'
import { useSubmit } from './SiteServiceForms'

export function SiteLeadForm({ apiUrl, title, privacyHref, whatsappHref }: { apiUrl: string; title: string; privacyHref: string; whatsappHref?: string }) {
  const { state, msg, protocol, submit, reset, sending } = useSubmit(apiUrl, 'contact')
  const [subject, setSubject] = useState('')
  const head = { eyebrow: 'Atendimento', title, subtitle: 'Respondemos pelo WhatsApp ou e-mail.' }
  if (state === 'done') {
    return <FormCard {...head}><DonePanel protocol={protocol} text="A equipe vai entrar em contato." whatsappHref={whatsappHref} whatsappText={`Olá! Enviei uma mensagem pelo site${protocol ? ` (protocolo ${protocol})` : ''}.`} onAgain={reset} /></FormCard>
  }
  return (
    <FormCard {...head}>
      <form className="vlead-form" method="post" onSubmit={submit}>
        <h2>Como podemos ajudar?</h2>
        <p className="vlead-lead">Conte o que você precisa e a equipe retorna com os próximos passos.</p>
        <Section legend="Seus dados"><ContactFields /></Section>
        <Section legend="Assunto">
          <Chips name="subject" label="Assunto" options={['Comprar um carro', 'Financiamento', 'Vender ou trocar', 'Outro assunto']} value={subject} onChange={setSubject} />
          <label className="vlead-full">Mensagem *<textarea name="message" required rows={4} maxLength={2000} /></label>
        </Section>
        <FormFooter privacyHref={privacyHref} button="Enviar mensagem" sending={sending} error={state === 'error' ? msg : ''} notes={false} />
      </form>
    </FormCard>
  )
}
