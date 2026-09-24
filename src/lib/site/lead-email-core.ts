// =============================================================================
// Site da loja — e-mails de novo lead (porta do email.ts do dagobertoeasycar):
// aviso interno para a equipe e confirmação para o cliente. PURO (testado).
// Tudo que vem do formulário é escapado: o e-mail nunca executa HTML do cliente.
// =============================================================================

import { KIND_LABEL, VEHICLE_INTENTS, type SiteLeadInput } from './leads-core'

export interface SiteEmailSettings { enabled: boolean; recipients: string[]; notifyCustomer: boolean }

export const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/i
export const MAX_RECIPIENTS = 5

export function sanitizeEmailSettings(v: unknown): SiteEmailSettings {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const raw = Array.isArray(o.recipients) ? o.recipients : String(o.recipients ?? '').split(/[\s,;]+/)
  const recipients = [...new Set(raw.map((x) => String(x ?? '').trim().toLowerCase()).filter((x) => EMAIL_RE.test(x)))].slice(0, MAX_RECIPIENTS)
  return { enabled: Boolean(o.enabled), recipients, notifyCustomer: Boolean(o.notifyCustomer) }
}

const DETAIL_LABELS: Record<string, string> = {
  paymentMethod: 'Forma de pagamento', downPayment: 'Entrada', installments: 'Prazo desejado', installmentGoal: 'Parcela desejada',
  hasTrade: 'Carro na troca', tradeVehicle: 'Veículo da troca', tradeYear: 'Ano da troca', tradeMileage: 'Km da troca',
  visitDate: 'Data preferida', visitPeriod: 'Período', desiredVehicle: 'Veículo desejado',
  city: 'Cidade', brand: 'Marca', model: 'Modelo', version: 'Versão', year: 'Ano', mileage: 'Km', transmission: 'Câmbio', fuel: 'Combustível',
  plate: 'Placa', color: 'Cor', targetPrice: 'Valor pretendido', vehicleStatus: 'Situação', yearMin: 'Ano mínimo', budget: 'Orçamento', wantsFinancing: 'Pretende financiar',
  vehicleValue: 'Valor combinado', companyName: 'Empresa', cnpj: 'CNPJ', interest: 'Interesse',
}

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export interface LeadEmailContext {
  storeName: string
  brandColor: string
  protocol: string | null
  vehicle: { title: string; price: string | null; url: string | null } | null
  /** Link do lead no painel (CRM). */
  panelUrl: string | null
  whatsappUrl: string
  /** Cliente já tinha um lead em aberto: a solicitação entrou nele. */
  repeat: boolean
}

export interface BuiltEmail { subject: string; html: string; text: string }

function requestLabel(l: SiteLeadInput): string {
  return l.intent ? VEHICLE_INTENTS[l.intent] : KIND_LABEL[l.kind]
}

function frame(color: string, title: string, inner: string, footer: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:${color};color:#ffffff;padding:18px 24px;font-size:18px;font-weight:bold">${title}</td></tr>
<tr><td style="padding:20px 24px;font-size:14px;line-height:1.55">${inner}</td></tr>
<tr><td style="padding:14px 24px;background:#f9fafb;color:#6b7280;font-size:12px">${footer}</td></tr>
</table></td></tr></table></body></html>`
}

const row = (k: string, v: string) => `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:4px 0">${esc(v)}</td></tr>`
const button = (href: string, label: string, color: string) => `<a href="${esc(href)}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold">${esc(label)}</a>`

export function buildInternalEmail(l: SiteLeadInput, c: LeadEmailContext): BuiltEmail {
  const what = requestLabel(l)
  const subject = `${c.repeat ? 'Nova solicitação de cliente em atendimento' : 'Novo lead do site'}: ${what}${c.vehicle ? ` — ${c.vehicle.title}` : ''}${c.protocol ? ` (${c.protocol})` : ''}`
  const fields: [string, string][] = [['Nome', l.name], ['Telefone', l.phone], ...(l.email ? [['E-mail', l.email] as [string, string]] : []), ['Solicitação', what]]
  if (c.vehicle) fields.push(['Veículo', `${c.vehicle.title}${c.vehicle.price ? ` · ${c.vehicle.price}` : ''}`])
  for (const [k, v] of Object.entries(l.details)) if (v && DETAIL_LABELS[k]) fields.push([DETAIL_LABELS[k], v])
  if (l.tracking.utmSource || l.tracking.utmCampaign) fields.push(['Campanha', [l.tracking.utmSource, l.tracking.utmMedium, l.tracking.utmCampaign].filter(Boolean).join(' / ')])
  const phoneDigits = l.phone.replace(/\D/g, '')
  const waClient = phoneDigits ? `https://wa.me/${phoneDigits.length <= 11 ? `55${phoneDigits}` : phoneDigits}` : ''
  const inner = [
    c.repeat ? '<p style="margin:0 0 12px;color:#92400e">Este cliente já tinha um lead em aberto: a solicitação foi registrada nele.</p>' : '',
    `<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px">${fields.map(([k, v]) => row(k, v)).join('')}</table>`,
    l.message ? `<p style="margin:14px 0 4px;color:#6b7280">Mensagem</p><p style="margin:0;white-space:pre-wrap">${esc(l.message)}</p>` : '',
    `<p style="margin:18px 0 0">${[c.panelUrl ? button(c.panelUrl, 'Abrir no CRM', c.brandColor) : '', waClient ? button(waClient, 'Chamar no WhatsApp', '#16a34a') : ''].filter(Boolean).join(' &nbsp; ')}</p>`,
  ].join('')
  const text = [subject, '', ...fields.map(([k, v]) => `${k}: ${v}`), ...(l.message ? ['', 'Mensagem:', l.message] : []), ...(c.panelUrl ? ['', `CRM: ${c.panelUrl}`] : [])].join('\n')
  return { subject, html: frame(c.brandColor, esc(`${c.storeName} · ${c.repeat ? 'Nova solicitação' : 'Novo lead do site'}`), inner, 'Aviso automático do site da loja. Responda direto ao cliente pelos botões acima.'), text }
}

export function buildCustomerEmail(l: SiteLeadInput, c: LeadEmailContext): BuiltEmail {
  const first = l.name.split(/\s+/)[0] ?? l.name
  const subject = `Recebemos sua solicitação${c.protocol ? ` ${c.protocol}` : ''} — ${c.storeName}`
  const inner = [
    `<p style="margin:0 0 12px">Olá, ${esc(first)}!</p>`,
    `<p style="margin:0 0 12px">Recebemos sua solicitação de <b>${esc(requestLabel(l).toLowerCase())}</b>${c.vehicle ? ` do <b>${esc(c.vehicle.title)}</b>` : ''}. Nossa equipe vai entrar em contato em breve.</p>`,
    c.protocol ? `<p style="margin:0 0 12px">Protocolo: <b>${esc(c.protocol)}</b></p>` : '',
    c.vehicle?.url ? `<p style="margin:0 0 12px"><a href="${esc(c.vehicle.url)}" style="color:${c.brandColor}">Ver o veículo no site</a></p>` : '',
    c.whatsappUrl ? `<p style="margin:16px 0 0">${button(c.whatsappUrl, 'Falar agora pelo WhatsApp', '#16a34a')}</p>` : '',
  ].join('')
  const text = [`Olá, ${first}!`, '', `Recebemos sua solicitação de ${requestLabel(l).toLowerCase()}${c.vehicle ? ` do ${c.vehicle.title}` : ''}. Nossa equipe vai entrar em contato em breve.`, ...(c.protocol ? [`Protocolo: ${c.protocol}`] : []), ...(c.whatsappUrl ? ['', `WhatsApp: ${c.whatsappUrl}`] : [])].join('\n')
  return { subject, html: frame(c.brandColor, esc(c.storeName), inner, 'Este é um e-mail automático, não precisa responder.'), text }
}
