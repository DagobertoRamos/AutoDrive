// =============================================================================
// whatsapp/credentials.ts — credenciais de WhatsApp POR LOJA (BYOC).
// Cada tenant usa o SEU número/token (configurado em Configurações › WhatsApp,
// gravado em SystemSetting `t:{tenantId}:whatsapp.*`). Fallback: linha própria
// na tabela WhatsappProvider do tenant. SEM fallback global/env para tenants —
// loja sem credencial simplesmente não envia (mesma filosofia do F&I/BYOC).
// =============================================================================

import { prisma } from '@/lib/prisma'
import type { MetaCreds } from '@/services/meta-whatsapp.service'

/**
 * Resolve as credenciais de WhatsApp da loja. Retorna null se a loja não
 * configurou (envio deve ser ignorado silenciosamente).
 */
export async function getTenantWhatsappCredentials(tenantId?: string | null): Promise<MetaCreds | null> {
  if (!tenantId) return null

  // 1) Configuração da loja (tela Configurações › WhatsApp → SystemSetting).
  const prefix = `t:${tenantId}:whatsapp.`
  const rows = await prisma.systemSetting.findMany({ where: { key: { startsWith: prefix } }, select: { key: true, value: true } })
  if (rows.length) {
    const m: Record<string, string> = {}
    for (const r of rows) m[r.key.slice(prefix.length)] = r.value
    const active = m.active === 'true' || m.active === '"true"'
    if (active && m.phoneNumberId && m.accessToken) {
      return { phoneNumberId: m.phoneNumberId, accessToken: m.accessToken, apiVersion: m.apiVersion || undefined }
    }
  }

  // 2) Linha própria do tenant em WhatsappProvider (compat/futuro).
  const p = await prisma.whatsappProvider.findFirst({
    where: { tenantId, active: true, accessToken: { not: null }, phoneNumberId: { not: null } },
    orderBy: { updatedAt: 'desc' },
    select: { phoneNumberId: true, accessToken: true, apiVersion: true },
  })
  if (p?.phoneNumberId && p?.accessToken) {
    return { phoneNumberId: p.phoneNumberId, accessToken: p.accessToken, apiVersion: p.apiVersion || undefined }
  }

  return null
}
