// =============================================================================
// POST /api/seller-queue/compliance/occurrences/create
// Gestão registra manualmente uma ocorrência de conformidade (favorecimento,
// manipulação, disputa, etc.) sobre um vendedor.
// Body: { sellerId, kind, severity, detail, unitId? }
// Gate: sellerQueue.manage.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { unitFromRequest } from '@/lib/seller-queue/queue'

export const dynamic = 'force-dynamic'

const VALID_KINDS = ['CHECK_IN_OUTSIDE','FAKE_CUSTOMER','FAVORITISM','IMPROPER_SKIP','DUPLICATE','OFF_SYSTEM','DISPUTE','MANIPULATION','TIMEOUT','OTHER'] as const
const VALID_SEVERITIES = ['LOW','MEDIUM','HIGH'] as const

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'sellerQueue.manage')) return forbiddenResponse('Sem permissão para registrar ocorrências.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))

  try {
    const b = await req.json().catch(() => ({}))
    const sellerId = b?.sellerId ? String(b.sellerId).trim() : null
    const kind      = VALID_KINDS.includes(b?.kind)        ? String(b.kind)     : null
    const severity  = VALID_SEVERITIES.includes(b?.severity) ? String(b.severity) : 'MEDIUM'
    const detail    = b?.detail ? String(b.detail).trim().slice(0, 1000) : null
    const unitId    = b?.unitId ? String(b.unitId) : unitFromRequest(req, user.unitId)

    if (!kind) return NextResponse.json({ success: false, error: 'Tipo de ocorrência inválido.' }, { status: 400 })
    if (!sellerId) return NextResponse.json({ success: false, error: 'Informe o vendedor.' }, { status: 400 })
    if (!detail || detail.length < 10) return NextResponse.json({ success: false, error: 'Descreva a ocorrência (mín. 10 caracteres).' }, { status: 400 })

    // Verifica que o vendedor existe no tenant.
    const seller = await prisma.user.findFirst({ where: { id: sellerId, tenantId }, select: { id: true, name: true } })
    if (!seller) return NextResponse.json({ success: false, error: 'Vendedor não encontrado.' }, { status: 404 })

    const flag = await prisma.sellerQueueFraudFlag.create({ data: {
      tenantId, unitId: unitId ?? undefined, sellerId,
      actorId: user.id, kind, severity, detail, status: 'OPEN',
      metadata: { source: 'MANUAL', createdByName: user.name, createdByRole: user.role },
    }})

    // Notifica o vendedor sobre a ocorrência aberta.
    await prisma.notification.create({ data: { userId: sellerId, tenantId, type: 'PENDENCIA_CRITICA' as never, title: '⚠️ Ocorrência de conformidade registrada', message: `Uma ocorrência foi aberta para revisão: ${kind}${detail ? `. ${detail.slice(0,80)}` : ''}.`, actionUrl: '/vendedor-da-vez/conformidade' } }).catch(() => {})

    await createSafeAuditLog({ userId: user.id, tenantId, action: 'COMPLIANCE_FLAG_CREATED', entity: 'SellerQueueFraudFlag', entityId: flag.id, userName: user.name, userRole: user.role, afterData: { sellerId, kind, severity, detail } })
    return NextResponse.json({ success: true, data: { id: flag.id, kind, severity, sellerId, sellerName: seller.name } }, { status: 201 })
  } catch (err) { return handlePrismaError(err) }
}
