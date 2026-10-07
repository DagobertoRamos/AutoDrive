// =============================================================================
// /api/settings/operations — Configurações › Operações (por loja).
//   GET → provedores disponíveis, acompanhamento, régua antes da venda,
//         capacidades efetivas por UF, filiais (IE/IM/série), certificados.
//   PUT { config }            → salva a configuração da loja (ops.settings)
//   PUT { global }            → overrides de capacidade por UF (só MASTER)
//   POST { action: 'certificate.upload', pfx (base64), password, unitId? }
//   POST { action: 'certificate.revoke', id }
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { resolveActingTenant } from '@/lib/acting-tenant'
import { prisma } from '@/lib/prisma'
import { CAPABILITY_KEYS, CAPABILITY_LABEL, resolveCapabilities, type GlobalCapabilityOverrides } from '@/lib/automotive/capabilities'
import { listCertificates, revokeCertificate, saveCertificate } from '@/lib/automotive/certificates'
import { loadGlobalCapabilities, loadOpsConfig, operationUf, saveGlobalCapabilities, saveOpsConfig } from '@/lib/automotive/config'
import { listProviders, testProvider } from '@/lib/automotive/gateways/registry'
import { activateConnection, connectionById, connectionWebhookUrl, disableConnection, listConnections, recordTest, saveConnection } from '@/lib/automotive/connections'
import { PROVIDERS, DOMAIN_LABEL } from '@/lib/automotive/providers-catalog'
import { defaultFiscalRules, normalizeFiscalRules } from '@/lib/automotive/fiscal-rules'
import { vehicleDataProvider } from '@/lib/automotive/gateways/vehicle-data'
import { opsError, opsSession, requireOps } from '@/lib/automotive/route-helpers'

export const dynamic = 'force-dynamic'

async function ctx(req: NextRequest) {
  const s = await opsSession()
  if (s instanceof NextResponse) return s
  const d = await requireOps(s, 'ops.settings'); if (d) return d
  const tenantId = s.tenantId ?? await resolveActingTenant(s.user, req)
  return { s, tenantId }
}

export async function GET(req: NextRequest) {
  try {
    const c = await ctx(req)
    if (c instanceof NextResponse) return c
    const global = await loadGlobalCapabilities()
    if (!c.tenantId) return NextResponse.json({ success: true, data: { tenant: null, global: c.s.user.role === 'MASTER' ? global : undefined, capabilityKeys: CAPABILITY_KEYS, capabilityLabels: CAPABILITY_LABEL } })
    const [config, units, certs, uf, connections] = await Promise.all([
      loadOpsConfig(c.tenantId),
      prisma.unit.findMany({ where: { tenantId: c.tenantId, active: true }, select: { id: true, name: true, cnpj: true, state: true }, orderBy: { name: 'asc' } }),
      listCertificates(c.tenantId),
      operationUf(c.tenantId, null),
      listConnections(c.tenantId),
    ])
    return NextResponse.json({
      success: true,
      data: {
        tenant: c.tenantId, config, units, certificates: certs, uf,
        fiscalRules: normalizeFiscalRules(config.fiscalRules, uf),
        fiscalDefaults: defaultFiscalRules(uf, normalizeFiscalRules(config.fiscalRules, uf).regime),
        catalog: PROVIDERS, domainLabels: DOMAIN_LABEL,
        connections: connections.map((x) => ({ ...x, webhookUrl: connectionWebhookUrl(x.id) })),
        effective: resolveCapabilities(uf, global, config.capabilities),
        providers: { renave: listProviders('renave'), fiscal: listProviders('fiscal'), transfer: listProviders('transfer') },
        capabilityKeys: CAPABILITY_KEYS, capabilityLabels: CAPABILITY_LABEL,
        ...(c.s.user.role === 'MASTER' ? { global } : {}),
      },
    })
  } catch (err) {
    return opsError(err)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const c = await ctx(req)
    if (c instanceof NextResponse) return c
    const b = await req.json().catch(() => ({})) as { config?: unknown; global?: GlobalCapabilityOverrides }
    if (b.global !== undefined) {
      if (c.s.user.role !== 'MASTER') return NextResponse.json({ success: false, error: 'Somente o MASTER altera as capacidades por estado.' }, { status: 403 })
      await saveGlobalCapabilities(b.global, c.s.user.id)
      await prisma.auditLog.create({ data: { userId: c.s.user.id, userName: c.s.user.name ?? null, userRole: c.s.user.role, action: 'OPS_CAPABILITIES_UPDATE', entity: 'SystemSetting', entityId: 'ops:capabilities', afterData: b.global as never } }).catch(() => {})
      return NextResponse.json({ success: true })
    }
    if (!c.tenantId) return NextResponse.json({ success: false, error: 'Escolha a loja.' }, { status: 400 })
    const before = await loadOpsConfig(c.tenantId)
    const incoming = (b.config && typeof b.config === 'object' ? b.config : {}) as Record<string, unknown>
    // Regras fiscais sempre normalizadas (CFOP com 4 dígitos, NCM com 8, percentuais válidos).
    if (incoming.fiscalRules !== undefined) incoming.fiscalRules = normalizeFiscalRules(incoming.fiscalRules, await operationUf(c.tenantId, null))
    else incoming.fiscalRules = before.fiscalRules
    const saved = await saveOpsConfig(c.tenantId, incoming, c.s.user.id)
    await prisma.auditLog.create({ data: { tenantId: c.tenantId, userId: c.s.user.id, userName: c.s.user.name ?? null, userRole: c.s.user.role, action: 'OPS_CONFIG_UPDATE', entity: 'SystemSetting', entityId: `ops:config:${c.tenantId}`, beforeData: before as never, afterData: saved as never } }).catch(() => {})
    return NextResponse.json({ success: true, data: saved })
  } catch (err) {
    return opsError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const c = await ctx(req)
    if (c instanceof NextResponse) return c
    if (!c.tenantId) return NextResponse.json({ success: false, error: 'Escolha a loja.' }, { status: 400 })
    const b = await req.json().catch(() => ({})) as Record<string, any>
    if (b.action === 'certificate.upload') {
      const unitId = typeof b.unitId === 'string' && b.unitId ? b.unitId : null
      if (unitId && !(await prisma.unit.findFirst({ where: { id: unitId, tenantId: c.tenantId }, select: { id: true } }))) return NextResponse.json({ success: false, error: 'Filial inválida.' }, { status: 400 })
      const saved = await saveCertificate(c.tenantId, unitId, String(b.pfx ?? ''), String(b.password ?? ''), c.s.actor)
      return NextResponse.json({ success: true, data: saved })
    }
    if (b.action === 'connection.save') {
      const saved = await saveConnection(c.tenantId, { domain: String(b.domain ?? ''), providerId: String(b.providerId ?? ''), environment: b.environment, unitId: b.unitId ?? null, fields: (b.fields ?? {}) as Record<string, unknown> }, c.s.actor)
      return NextResponse.json({ success: true, data: { id: saved.id, webhookUrl: connectionWebhookUrl(saved.id) } })
    }
    if (b.action === 'connection.test') {
      const conn = await connectionById(String(b.id ?? ''))
      if (!conn || conn.tenantId !== c.tenantId) return NextResponse.json({ success: false, error: 'Conexão não encontrada.' }, { status: 404 })
      const ctxP = { tenantId: c.tenantId, credentials: conn.credentials, environment: conn.environment, connectionId: conn.id }
      const r = await testProvider(conn.domain, conn.providerId, ctxP)
      await recordTest(conn.id!, r.ok, r.ok ? null : r.message)
      // Consulta veicular por webhook: cadastra o endereço da loja no provedor quando a API permite.
      let webhookRegistered: boolean | null = null
      if (r.ok && conn.domain === 'VEHICLE_DATA') {
        const p = vehicleDataProvider(conn.providerId)
        if (p?.registerWebhook) webhookRegistered = await p.registerWebhook(ctxP, connectionWebhookUrl(conn.id!))
      }
      return NextResponse.json({ success: true, data: { ...r, webhookRegistered } })
    }
    if (b.action === 'connection.activate') {
      await activateConnection(c.tenantId, String(b.id ?? ''), c.s.actor)
      return NextResponse.json({ success: true })
    }
    if (b.action === 'connection.disable') {
      await disableConnection(c.tenantId, String(b.id ?? ''), c.s.actor)
      return NextResponse.json({ success: true })
    }
    if (b.action === 'certificate.revoke') {
      await revokeCertificate(c.tenantId, String(b.id ?? ''), c.s.actor)
      return NextResponse.json({ success: true })
    }
    return NextResponse.json({ success: false, error: 'Ação inválida.' }, { status: 400 })
  } catch (err) {
    return opsError(err)
  }
}
