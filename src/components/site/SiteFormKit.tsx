'use client'

// Peças do formulário padrão do site (o mesmo visual do pop-up do anúncio):
// cartão com faixa escura no topo, blocos com legenda, opções em "chips" e o
// painel de sucesso com protocolo. Usado por todas as páginas que geram lead.
import { useState, type FormEvent, type ReactNode } from 'react'
import { CheckCircle2, MessageCircle } from 'lucide-react'
import { HONEYPOT_STYLE, moneyMask, phoneMask } from './lead-utils'

export const onMoney = (e: FormEvent<HTMLInputElement>) => { e.currentTarget.value = moneyMask(e.currentTarget.value) }
export const onPhone = (e: FormEvent<HTMLInputElement>) => { e.currentTarget.value = phoneMask(e.currentTarget.value) }

/** Cartão do formulário: faixa escura (como a do carro no pop-up) + corpo. */
export function FormCard({ eyebrow, title, subtitle, children }: { eyebrow: string; title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="vlead-card">
      <div className="vlead-vehicle vlead-head">
        <div><small>{eyebrow}</small><strong>{title}</strong>{subtitle && <span>{subtitle}</span>}</div>
      </div>
      {children}
    </div>
  )
}

export function Section({ legend, children }: { legend: string; children: ReactNode }) {
  return <fieldset><legend>{legend}</legend>{children}</fieldset>
}

/** Opções de escolha única em chips (radio). Controlado para mostrar campos condicionais. */
export function Chips({ name, options, value, onChange, required, label }: {
  name: string; options: string[]; value: string; onChange: (v: string) => void; required?: boolean; label: string
}) {
  return (
    <div className="vlead-chips" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <label key={o} className={value === o ? 'active' : ''}><input type="radio" name={name} value={o} required={required} checked={value === o} onChange={() => onChange(o)} />{o}</label>
      ))}
    </div>
  )
}

/** Opções de múltipla escolha em chips (checkbox). */
export function MultiChips({ name, options, label }: { name: string; options: string[]; label: string }) {
  const [picked, setPicked] = useState<string[]>([])
  const toggle = (o: string) => setPicked((p) => (p.includes(o) ? p.filter((x) => x !== o) : [...p, o]))
  return (
    <div className="vlead-chips" role="group" aria-label={label}>
      {options.map((o) => (
        <label key={o} className={picked.includes(o) ? 'active' : ''}><input type="checkbox" name={name} value={o} checked={picked.includes(o)} onChange={() => toggle(o)} />{o}</label>
      ))}
    </div>
  )
}

/** Nome, WhatsApp e e-mail (bloco "Seus dados"). */
export function ContactFields({ nameLabel = 'Nome completo', children }: { nameLabel?: string; children?: ReactNode }) {
  return (
    <>
      <label className="vlead-full">{nameLabel} *<input name="name" required minLength={2} maxLength={120} autoComplete="name" /></label>
      <label>WhatsApp *<input name="phone" required inputMode="tel" autoComplete="tel" placeholder="(11) 90000-0000" maxLength={16} onInput={onPhone} /></label>
      <label>E-mail<input name="email" type="email" maxLength={160} autoComplete="email" /></label>
      {children}
    </>
  )
}

/** Observações + campo-isca + consentimento + botão + erro. */
export function FormFooter({ privacyHref, button, sending, error, notes = true, notesPlaceholder, consentText = 'Autorizo o contato sobre esta solicitação e li a' }: {
  privacyHref: string; button: string; sending: boolean; error: string; notes?: boolean; notesPlaceholder?: string; consentText?: string
}) {
  return (
    <>
      {notes && <label className="vlead-full">Observações<textarea name="message" rows={3} maxLength={2000} placeholder={notesPlaceholder ?? 'Dúvidas, melhor horário para contato...'} /></label>}
      <div style={HONEYPOT_STYLE} aria-hidden="true"><label>Site<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <label className="consent vlead-full"><input name="consent" type="checkbox" value="yes" required /> <span>{consentText} <a href={privacyHref} target="_blank" rel="noreferrer">Política de Privacidade</a>.</span></label>
      <button className="button vlead-submit" disabled={sending}>{sending ? 'Enviando...' : button}</button>
      {error && <p className="form-status error" role="alert">{error}</p>}
    </>
  )
}

/** Painel de sucesso (igual ao do pop-up). */
export function DonePanel({ protocol, text, whatsappHref, whatsappText, children, onAgain }: {
  protocol: string | null; text: string; whatsappHref?: string; whatsappText?: string; children?: ReactNode; onAgain?: () => void
}) {
  const wa = whatsappHref && whatsappText ? `${whatsappHref.split('?')[0]}?text=${encodeURIComponent(whatsappText)}` : ''
  return (
    <div className="vlead-done">
      <CheckCircle2 size={52} aria-hidden="true" />
      <h2>Solicitação enviada!</h2>
      {protocol && <p className="vlead-protocol">Protocolo <b>{protocol}</b></p>}
      <p>{text}</p>
      {children}
      <div className="vlead-done-actions">
        {wa && <a className="button" href={wa} target="_blank" rel="noreferrer"><MessageCircle size={18} aria-hidden="true" />Adiantar pelo WhatsApp</a>}
        {onAgain && <button type="button" className="button button-outline" onClick={onAgain}>Enviar outra</button>}
      </div>
    </div>
  )
}
