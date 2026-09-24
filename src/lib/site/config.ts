// =============================================================================
// Site da loja — leitura/gravação da configuração (SystemSetting JSON, sem
// migration) e resolução "endereço → loja".
// Índices únicos (a coluna `key` do SystemSetting é única):
//   site_slug:<slug>  → tenantId
//   site_host:<host>  → tenantId
// =============================================================================

import { prisma } from '@/lib/prisma'
import { defaultSiteConfig, isValidSiteSlug, sanitizeSiteConfig, type SiteConfig } from './config-core'
import { normalizeHost } from './host'

export * from './config-core'

const cfgKey = (tenantId: string) => `t:${tenantId}:site:v1`
const slugKey = (slug: string) => `site_slug:${slug}`
const hostKey = (host: string) => `site_host:${host}`

async function tenantBasics(tenantId: string) {
  return prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, nomeFantasia: true, slug: true } })
}

export async function loadSiteConfig(tenantId: string): Promise<SiteConfig> {
  const t = await tenantBasics(tenantId)
  const name = t?.nomeFantasia || t?.name || ''
  const row = await prisma.systemSetting.findFirst({ where: { key: cfgKey(tenantId) }, select: { value: true } }).catch(() => null)
  if (row) {
    try { return sanitizeSiteConfig(JSON.parse(row.value), name) } catch { /* cai no padrão */ }
  }
  const d = defaultSiteConfig(name)
  // Subdomínio padrão = slug da loja no SaaS (já é único).
  if (t?.slug && isValidSiteSlug(t.slug)) d.slug = t.slug
  return d
}

export class SiteConfigError extends Error {}

/** Grava a config e mantém os índices de slug/domínio. Lança SiteConfigError se conflitar. */
export async function saveSiteConfig(tenantId: string, input: unknown, userId: string): Promise<SiteConfig> {
  const t = await tenantBasics(tenantId)
  const cfg = sanitizeSiteConfig(input, t?.nomeFantasia || t?.name || '')
  if (!cfg.slug) throw new SiteConfigError('Escolha um endereço (subdomínio) válido: letras, números e hífen.')

  const wanted = [slugKey(cfg.slug), ...cfg.domains.map((d) => hostKey(d.host))]
  const taken = await prisma.systemSetting.findMany({ where: { key: { in: wanted } }, select: { key: true, value: true } })
  const conflict = taken.find((r) => r.value !== tenantId)
  if (conflict) {
    throw new SiteConfigError(conflict.key.startsWith('site_slug:')
      ? `O endereço "${cfg.slug}" já é usado por outra loja.`
      : `O domínio ${conflict.key.slice('site_host:'.length)} já está ligado a outra loja.`)
  }

  await prisma.$transaction(async (tx) => {
    // Remove índices antigos desta loja que saíram da config.
    await tx.systemSetting.deleteMany({
      where: { value: tenantId, OR: [{ key: { startsWith: 'site_slug:' } }, { key: { startsWith: 'site_host:' } }], NOT: { key: { in: wanted } } },
    })
    for (const key of wanted) {
      await tx.systemSetting.upsert({ where: { key }, create: { key, value: tenantId, tenantId, group: 'site' }, update: {} })
    }
    const value = JSON.stringify(cfg)
    const existing = await tx.systemSetting.findFirst({ where: { key: cfgKey(tenantId) }, select: { id: true } })
    if (existing) await tx.systemSetting.update({ where: { id: existing.id }, data: { value, updatedByUserId: userId } })
    else await tx.systemSetting.create({ data: { key: cfgKey(tenantId), value, tenantId, group: 'site', description: 'Site da loja', updatedByUserId: userId } })
  })
  return cfg
}

export interface ResolvedSite { tenantId: string; config: SiteConfig }

/**
 * Loja de um endereço: `key` é o slug (subdomínio / rota de teste /s/<slug>) ou
 * o host do domínio próprio. Só devolve sites LIGADOS.
 */
export async function resolveSite(key: string): Promise<ResolvedSite | null> {
  const k = decodeURIComponent(key).toLowerCase()
  let tenantId: string | null = null
  if (k.includes('.')) {
    const host = normalizeHost(k)
    const candidates = [hostKey(host), host.startsWith('www.') ? hostKey(host.slice(4)) : hostKey(`www.${host}`)]
    const row = await prisma.systemSetting.findFirst({ where: { key: { in: candidates } }, select: { value: true } }).catch(() => null)
    tenantId = row?.value ?? null
  } else {
    const row = await prisma.systemSetting.findFirst({ where: { key: slugKey(k) }, select: { value: true } }).catch(() => null)
    tenantId = row?.value ?? null
  }
  if (!tenantId) return null
  const config = await loadSiteConfig(tenantId)
  return config.enabled ? { tenantId, config } : null
}
