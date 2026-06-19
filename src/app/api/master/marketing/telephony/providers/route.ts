// =============================================================================
// /api/master/marketing/telephony/providers — provedores de telefonia (GLOBAL).
// MASTER-only (gate master.marketing.telephony). É a camada técnica da
// plataforma (provedores homologados/adapters); a loja conecta com as PRÓPRIAS
// credenciais (BYOC) — aqui NÃO há credencial de tenant. Auditado.
//   GET  : lista todos (+contagem de conexões)
//   POST : cria provedor
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse } from '@/lib/finance/finance-service'
import { createProviderSchema } from '@/lib/validators/telephony'
import type { Prisma } from '@prisma/client'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'master.marketing.telephony')) return forbiddenResponse('Área exclusiva do MASTER.')
  try {
    const rows = await prisma.telephonyProvider.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { connections: true } } },
    })
    return NextResponse.json({
      success: true,
      data: rows.map((p) => ({
        id: p.id, name: p.name, kind: p.kind, active: p.active,
        supportsInbound: p.supportsInbound, supportsOutbound: p.supportsOutbound,
        supportsRecording: p.supportsRecording, supportsWebhook: p.supportsWebhook,
        baseUrl: p.baseUrl, apiVersion: p.apiVersion, notes: p.notes, fieldMappings: p.fieldMappings,
        connections: p._count.connections,
      })),
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'master.marketing.telephony')) return forbiddenResponse('Área exclusiva do MASTER.')
  try {
    const d = createProviderSchema.parse(await req.json())
    const p = await prisma.telephonyProvider.create({
      data: {
        name: d.name, kind: d.kind, active: d.active,
        supportsInbound: d.supportsInbound, supportsOutbound: d.supportsOutbound,
        supportsRecording: d.supportsRecording, supportsWebhook: d.supportsWebhook,
        baseUrl: d.baseUrl ?? null, apiVersion: d.apiVersion ?? null, notes: d.notes ?? null,
        fieldMappings: (d.fieldMappings ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    })
    await createSafeAuditLog({ userId: user.id, tenantId: 'MASTER', action: 'CREATE', entity: 'TelephonyProvider', entityId: p.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: { id: p.id } }, { status: 201 })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
