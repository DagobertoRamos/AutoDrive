'use client'

// Formulário de contato do site (porta do LeadForm). Vai para o CRM da loja.
import { useState, type FormEvent } from 'react'
import { HONEYPOT_STYLE, phoneMask, submitSiteLead } from './lead-utils'

export function SiteLeadForm({ apiUrl, title, privacyHref }: { apiUrl: string; title: string; privacyHref: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [msg, setMsg] = useState('')

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setState('sending')
    const form = e.currentTarget
    const data = Object.fromEntries(new FormData(form).entries())
    const r = await submitSiteLead(apiUrl, { ...data, kind: 'contact' })
    if (r.ok) { setState('done'); setMsg(`Recebemos sua mensagem${r.protocol ? ` (protocolo ${r.protocol})` : ''}. A equipe vai entrar em contato.`); form.reset() }
    else { setState('error'); setMsg(r.error) }
  }

  return (
    <form className="lead-form" method="post" onSubmit={submit}>
      <h2>{title}</h2>
      <label>Nome<input name="name" required maxLength={120} autoComplete="name" /></label>
      <div className="form-row">
        <label>Telefone / WhatsApp<input name="phone" required maxLength={16} inputMode="tel" autoComplete="tel" onInput={(e) => { e.currentTarget.value = phoneMask(e.currentTarget.value) }} /></label>
        <label>E-mail<input name="email" type="email" maxLength={160} autoComplete="email" /></label>
      </div>
      <label>Mensagem<textarea name="message" required maxLength={2000} rows={5} /></label>
      <div style={HONEYPOT_STYLE} aria-hidden="true"><label>Site<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <label className="consent"><input name="consent" type="checkbox" value="yes" required /> <span>Autorizo o contato sobre esta solicitação e li a <a href={privacyHref}>Política de Privacidade</a>.</span></label>
      <button className="button" disabled={state === 'sending'}>{state === 'sending' ? 'Enviando...' : 'Enviar mensagem'}</button>
      <p className={`form-status ${state}`} aria-live="polite">{state === 'done' || state === 'error' ? msg : ''}</p>
    </form>
  )
}
