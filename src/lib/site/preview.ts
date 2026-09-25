// =============================================================================
// Site da loja — pré-visualização antes de salvar. O painel manda a config em
// edição; ela fica 60 min em SystemSetting com um token, e o token vai num
// cookie do domínio do PAINEL. O site aberto pelo painel (/s/<slug>) com esse
// cookie mostra o rascunho; o site público (domínio da loja) nunca vê o cookie.
// =============================================================================

import { randomBytes, timingSafeEqual } from 'crypto'
import { prisma } from '@/lib/prisma'
import type { SiteConfig } from './config-core'

export const PREVIEW_COOKIE = 'site_preview'
export const PREVIEW_TTL_MS = 60 * 60_000
const previewKey = (tenantId: string) => `t:${tenantId}:site:preview:v1`

interface Stored { token: string; expiresAt: number; config: SiteConfig }

export async function savePreview(tenantId: string, config: SiteConfig, userId: string): Promise<string> {
  const token = `${tenantId}.${randomBytes(18).toString('base64url')}`
  const value = JSON.stringify({ token, expiresAt: Date.now() + PREVIEW_TTL_MS, config } satisfies Stored)
  const key = previewKey(tenantId)
  const existing = await prisma.systemSetting.findFirst({ where: { key }, select: { id: true } })
  if (existing) await prisma.systemSetting.update({ where: { id: existing.id }, data: { value, updatedByUserId: userId } })
  else await prisma.systemSetting.create({ data: { key, value, tenantId, group: 'site', description: 'Pré-visualização do site', updatedByUserId: userId } })
  return token
}

/** Rascunho da loja se o token do cookie for o atual e não tiver expirado. */
export async function loadPreview(tenantId: string, token: string | undefined): Promise<SiteConfig | null> {
  if (!token || !token.startsWith(`${tenantId}.`)) return null
  const row = await prisma.systemSetting.findFirst({ where: { key: previewKey(tenantId) }, select: { value: true } }).catch(() => null)
  if (!row) return null
  try {
    const s = JSON.parse(row.value) as Stored
    const a = Buffer.from(s.token)
    const b = Buffer.from(token)
    if (a.length !== b.length || !timingSafeEqual(a, b) || s.expiresAt < Date.now()) return null
    return s.config
  } catch {
    return null
  }
}
