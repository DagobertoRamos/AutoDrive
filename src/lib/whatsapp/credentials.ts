// =============================================================================
// whatsapp/credentials.ts — configuração de WhatsApp POR LOJA (BYOC).
// Cada tenant escolhe o provedor e informa as credenciais dele (tela
// Configurações › WhatsApp → SystemSetting `t:{tenantId}:whatsapp.*`). Fallback:
// linha própria do tenant em WhatsappProvider (provedor Meta). SEM fallback
// global/env para tenants — loja sem credencial não envia (filosofia BYOC).
// =============================================================================

import { prisma } from '@/lib/prisma'
import type { WhatsappCreds, WhatsappProviderKind } from './types'

export interface TenantWhatsappConfig {
  kind:  WhatsappProviderKind
  creds: WhatsappCreds
}

/**
 * Resolve o provedor + credenciais da loja. Retorna null se não configurado/ativo
 * (o envio deve ser ignorado silenciosamente).
 */
export async function getTenantWhatsappConfig(tenantId?: string | null): Promise<TenantWhatsappConfig | null> {
  if (!tenantId) return null

  // 1) Configuração da loja (tela Configurações › WhatsApp → SystemSetting).
  const prefix = `t:${tenantId}:whatsapp.`
  const rows = await prisma.systemSetting.findMany({ where: { key: { startsWith: prefix } }, select: { key: true, value: true } })
  if (rows.length) {
    const m: Record<string, string> = {}
    for (const r of rows) m[r.key.slice(prefix.length)] = r.value
    const active = m.active === 'true' || m.active === '"true"'
    if (active) {
      const kind = (m.provider || 'META').toUpperCase() as WhatsappProviderKind
      // creds = tudo menos os campos de controle (provider/active).
      const creds: WhatsappCreds = {}
      for (const [k, v] of Object.entries(m)) { if (k !== 'provider' && k !== 'active' && v) creds[k] = v }
      // Só considera configurado se houver alguma credencial.
      if (Object.keys(creds).length) return { kind, creds }
    }
  }

  // 2) Linha própria do tenant em WhatsappProvider (sempre Meta).
  const p = await prisma.whatsappProvider.findFirst({
    where: { tenantId, active: true, accessToken: { not: null }, phoneNumberId: { not: null } },
    orderBy: { updatedAt: 'desc' },
    select: { phoneNumberId: true, accessToken: true, apiVersion: true },
  })
  if (p?.phoneNumberId && p?.accessToken) {
    return { kind: 'META', creds: { phoneNumberId: p.phoneNumberId, accessToken: p.accessToken, ...(p.apiVersion ? { apiVersion: p.apiVersion } : {}) } }
  }

  return null
}
