// =============================================================================
// Site da loja — envio dos e-mails de novo lead (aviso à equipe e confirmação
// ao cliente) pelo e-mail que a loja configurou na Central de Comunicação.
// Cada envio fica num histórico curto (últimos 30), mostrado no painel.
// Nunca lança: uma falha de e-mail não pode derrubar o lead, que já está salvo.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { sendMail } from '@/lib/mailer'
import { money } from './listing-core'
import { publicSiteRoot, whatsappLink, type SiteConfig } from './config-core'
import { buildCustomerEmail, buildInternalEmail, EMAIL_RE, type LeadEmailContext } from './lead-email-core'
import type { SiteLeadInput } from './leads-core'
import type { SiteVehicle } from './vehicles'

export interface EmailLogEntry { at: string; kind: 'INTERNO' | 'CLIENTE' | 'TESTE'; to: string; subject: string; status: 'ENVIADO' | 'FALHOU' | 'DESLIGADO'; error?: string }

const logKey = (tenantId: string) => `t:${tenantId}:site:emaillog`

export async function readEmailLog(tenantId: string): Promise<EmailLogEntry[]> {
  const row = await prisma.systemSetting.findFirst({ where: { key: logKey(tenantId) }, select: { value: true } }).catch(() => null)
  try { return row?.value ? (JSON.parse(row.value) as EmailLogEntry[]) : [] } catch { return [] }
}

export async function appendEmailLog(tenantId: string, entries: EmailLogEntry[]): Promise<void> {
  if (!entries.length) return
  try {
    const value = JSON.stringify([...entries.reverse(), ...await readEmailLog(tenantId)].slice(0, 30))
    const existing = await prisma.systemSetting.findFirst({ where: { key: logKey(tenantId) }, select: { id: true } })
    if (existing) await prisma.systemSetting.update({ where: { id: existing.id }, data: { value } })
    else await prisma.systemSetting.create({ data: { key: logKey(tenantId), value, tenantId, group: 'site', description: 'Site da loja — histórico de e-mails' } })
  } catch (e) {
    console.error('[site-email] histórico:', e instanceof Error ? e.message : e)
  }
}

export async function sendSiteLeadEmails(p: {
  tenantId: string; config: SiteConfig; input: SiteLeadInput; vehicle: SiteVehicle | null
  protocol: string | null; leadId: string; repeat: boolean; origin: string
}): Promise<void> {
  const { tenantId, config, input } = p
  const s = config.emails
  if (!s.enabled || !s.recipients.length) return
  const root = publicSiteRoot(config, process.env.SITE_BASE_DOMAIN, p.origin)
  const panel = (process.env.NEXTAUTH_URL || p.origin).replace(/\/+$/, '')
  const ctx: LeadEmailContext = {
    storeName: config.identity.name, brandColor: config.identity.primaryColor, protocol: p.protocol,
    vehicle: p.vehicle ? { title: p.vehicle.title, price: p.vehicle.price != null ? money(p.vehicle.price) : null, url: `${root}/veiculos/${p.vehicle.slug}` } : null,
    panelUrl: `${panel}/crm/leads/${p.leadId}`, whatsappUrl: whatsappLink(config), repeat: p.repeat,
  }
  const log: EmailLogEntry[] = []
  const at = () => new Date().toISOString()

  const internal = buildInternalEmail(input, ctx)
  const r1 = await sendMail({ to: s.recipients, subject: internal.subject, html: internal.html, text: internal.text, replyTo: EMAIL_RE.test(input.email) ? input.email : undefined }, { tenantId, purpose: 'TRANSACTIONAL' })
    .catch((e) => ({ success: false as const, errorMessage: e instanceof Error ? e.message : String(e) }))
  log.push({ at: at(), kind: 'INTERNO', to: s.recipients.join(', '), subject: internal.subject, status: r1.success ? 'ENVIADO' : 'FALHOU', ...(r1.success ? {} : { error: r1.errorMessage?.slice(0, 200) }) })

  if (s.notifyCustomer && !p.repeat && EMAIL_RE.test(input.email)) {
    const customer = buildCustomerEmail(input, ctx)
    const r2 = await sendMail({ to: input.email, subject: customer.subject, html: customer.html, text: customer.text }, { tenantId, purpose: 'TRANSACTIONAL' })
      .catch((e) => ({ success: false as const, errorMessage: e instanceof Error ? e.message : String(e) }))
    log.push({ at: at(), kind: 'CLIENTE', to: input.email, subject: customer.subject, status: r2.success ? 'ENVIADO' : 'FALHOU', ...(r2.success ? {} : { error: r2.errorMessage?.slice(0, 200) }) })
  }
  await appendEmailLog(tenantId, log)
}
