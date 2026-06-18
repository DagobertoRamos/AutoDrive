// =============================================================================
// /api/marketing/telephony/numbers — números rastreáveis / ramais (loja).
//   GET  : marketing.telephony        — lista números do tenant
//   POST : marketing.telephony.manage — cria número (valida conexão do tenant)
// Tenant-scoped, auditado. (Fase 3B.)
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse } from '@/lib/finance/finance-service'
import { createNumberSchema } from '@/lib/validators/telephony'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'marketing.telephony')) return forbiddenResponse('Sem acesso à telefonia.')
  const tid = user.tenantId
  if (!tid) return forbiddenResponse('A telefonia pertence à loja.')
  try {
    const rows = await prisma.telephonyNumber.findMany({ where: { tenantId: tid }, orderBy: [{ active: 'desc' }, { number: 'asc' }] })
    return NextResponse.json({ success: true, data: rows })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'marketing.telephony.manage')) return forbiddenResponse('Sem permissão para gerenciar telefonia.')
  const tid = user.tenantId
  if (!tid) return forbiddenResponse('A telefonia pertence à loja.')
  try {
    const d = createNumberSchema.parse(await req.json())
    if (d.connectionId) {
      const conn = await prisma.telephonyTenantConnection.findFirst({ where: { id: d.connectionId, tenantId: tid }, select: { id: true } })
      if (!conn) return NextResponse.json({ success: false, error: 'Conexão inválida para esta loja.' }, { status: 400 })
    }
    const n = await prisma.telephonyNumber.create({
      data: {
        tenantId: tid, connectionId: d.connectionId ?? null, number: d.number, label: d.label ?? null,
        extension: d.extension ?? null, unitId: d.unitId ?? null, source: d.source ?? null,
        inbound: d.inbound, outbound: d.outbound, active: d.active, createdById: user.id,
      },
    })
    await createSafeAuditLog({ userId: user.id, tenantId: tid, action: 'CREATE', entity: 'TelephonyNumber', entityId: n.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: { id: n.id } }, { status: 201 })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
