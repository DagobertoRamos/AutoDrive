// =============================================================================
// Configurações da Central de Publicações POR EMPRESA (SystemSetting JSON,
// chave t:<tenantId>:publications:v1 — sem coluna nova).
//   • fuso horário (padrão America/Sao_Paulo; agendamentos gravados em UTC)
//   • contatos usados nos anúncios (WhatsApp, telefone, e-mail, Instagram, site)
//   • regra de venda (pausar na negociação ou só na aprovação; reativar no cancelamento)
//   • publicação automática após aprovação das fotos — só com ativação expressa
// Cada loja do SaaS usa a própria marca e os próprios contatos.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { loadSiteConfig } from '@/lib/site/config'
import type { ContactSettings } from './content-core'
import { DEFAULT_SALE_RULES, type SaleRules } from './sale-rules-core'
import { DEFAULT_TIMEZONE, isValidTimeZone } from './schedule-core'

export interface AutoPublishRule {
  enabled: boolean
  /** Destinos (ids de conexão) que recebem o veículo quando as fotos são aprovadas. */
  connectionIds: string[]
  enabledById: string | null
  enabledByName: string | null
  enabledAt: string | null
}

export interface PublicationSettings {
  timezone: string
  contacts: Required<Pick<ContactSettings, 'whatsapp' | 'phone' | 'email' | 'instagram' | 'site' | 'contactName'>>
  sale: SaleRules
  autoPublish: AutoPublishRule
  /** Worker: máximo de envios por minuto por conexão (proteção extra além do limite do portal). */
  perConnectionPerMinute: number
}

const key = (tenantId: string) => `t:${tenantId}:publications:v1`
const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export function sanitizeSettings(input: unknown, fallback: PublicationSettings): PublicationSettings {
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  const c = (i.contacts ?? {}) as Record<string, unknown>
  const s = (i.sale ?? {}) as Record<string, unknown>
  const a = (i.autoPublish ?? {}) as Record<string, unknown>
  const tz = str(i.timezone, 64)
  const per = Number(i.perConnectionPerMinute)
  return {
    timezone: tz && isValidTimeZone(tz) ? tz : fallback.timezone,
    contacts: {
      whatsapp: 'whatsapp' in c ? str(c.whatsapp, 30) : fallback.contacts.whatsapp,
      phone: 'phone' in c ? str(c.phone, 30) : fallback.contacts.phone,
      email: 'email' in c ? str(c.email, 120) : fallback.contacts.email,
      instagram: 'instagram' in c ? str(c.instagram, 60).replace(/^https?:\/\/(www\.)?instagram\.com\//i, '@').replace(/\/$/, '') : fallback.contacts.instagram,
      site: 'site' in c ? str(c.site, 120) : fallback.contacts.site,
      contactName: 'contactName' in c ? str(c.contactName, 80) : fallback.contacts.contactName,
    },
    sale: {
      pauseOn: s.pauseOn === 'APROVACAO' ? 'APROVACAO' : s.pauseOn === 'NEGOCIACAO' ? 'NEGOCIACAO' : fallback.sale.pauseOn,
      resumeOnCancel: typeof s.resumeOnCancel === 'boolean' ? s.resumeOnCancel : fallback.sale.resumeOnCancel,
      whenNoPause: s.whenNoPause === 'AVISAR' ? 'AVISAR' : s.whenNoPause === 'RETIRAR' ? 'RETIRAR' : fallback.sale.whenNoPause,
    },
    autoPublish: {
      enabled: typeof a.enabled === 'boolean' ? a.enabled : fallback.autoPublish.enabled,
      connectionIds: Array.isArray(a.connectionIds) ? a.connectionIds.filter((x): x is string => typeof x === 'string').slice(0, 30) : fallback.autoPublish.connectionIds,
      enabledById: typeof a.enabledById === 'string' ? a.enabledById : fallback.autoPublish.enabledById,
      enabledByName: typeof a.enabledByName === 'string' ? a.enabledByName : fallback.autoPublish.enabledByName,
      enabledAt: typeof a.enabledAt === 'string' ? a.enabledAt : fallback.autoPublish.enabledAt,
    },
    perConnectionPerMinute: Number.isFinite(per) && per >= 1 && per <= 120 ? Math.round(per) : fallback.perConnectionPerMinute,
  }
}

/** Padrão a partir do cadastro da loja e do site (a loja ajusta depois). */
async function defaults(tenantId: string): Promise<PublicationSettings> {
  const [t, site] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, nomeFantasia: true, phone: true, email: true } }),
    loadSiteConfig(tenantId).catch(() => null),
  ])
  return {
    timezone: DEFAULT_TIMEZONE,
    contacts: {
      whatsapp: site?.contact.whatsapp || '',
      phone: site?.contact.phone || t?.phone || '',
      email: site?.contact.email || t?.email || '',
      instagram: '',
      site: '',
      contactName: t?.nomeFantasia || t?.name || '',
    },
    sale: DEFAULT_SALE_RULES,
    autoPublish: { enabled: false, connectionIds: [], enabledById: null, enabledByName: null, enabledAt: null },
    perConnectionPerMinute: 20,
  }
}

export async function loadPublicationSettings(tenantId: string): Promise<PublicationSettings> {
  const base = await defaults(tenantId)
  const row = await prisma.systemSetting.findFirst({ where: { key: key(tenantId) }, select: { value: true } }).catch(() => null)
  if (!row) return base
  try { return sanitizeSettings(JSON.parse(row.value), base) } catch { return base }
}

export async function savePublicationSettings(tenantId: string, input: unknown, user: { id: string; name?: string | null }): Promise<PublicationSettings> {
  const before = await loadPublicationSettings(tenantId)
  const next = sanitizeSettings(input, before)
  // Ativação da regra automática é expressa e fica registrada (quem e quando).
  if (next.autoPublish.enabled && !before.autoPublish.enabled) {
    next.autoPublish.enabledById = user.id
    next.autoPublish.enabledByName = user.name ?? null
    next.autoPublish.enabledAt = new Date().toISOString()
  }
  if (!next.autoPublish.enabled) { next.autoPublish.enabledById = null; next.autoPublish.enabledByName = null; next.autoPublish.enabledAt = null }
  const value = JSON.stringify(next)
  await prisma.systemSetting.upsert({
    where: { key: key(tenantId) },
    create: { key: key(tenantId), tenantId, value, group: 'publications', description: 'Central de Publicações', updatedByUserId: user.id },
    update: { value, updatedByUserId: user.id },
  })
  return next
}
