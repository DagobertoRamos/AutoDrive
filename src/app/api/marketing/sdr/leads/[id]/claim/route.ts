// =============================================================================
// /api/marketing/sdr/leads/[id]/claim — Tanque de Tubarão: assumir um lead.
// POST : marketing.leads.claim.
//
// LOCK TRANSACIONAL (compare-and-set): a tomada usa um updateMany guardado por
// `claimedByUserId IS NULL`. Sob READ COMMITTED (Postgres), apenas UMA transação
// concorrente casa o WHERE — as demais veem count=0 e perdem a corrida. Assim
// dois usuários nunca assumem o mesmo lead. Registra quem assumiu / perdeu.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/marketing/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { ownsTenant } from '@/lib/finance/finance-service'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'marketing.leads.claim')) return forbiddenResponse('Sem permissão para assumir leads.')
  const tid = await resolveActingTenant(user, req)
  if (!tid) return forbiddenResponse(actingTenantError(user))
  const { id } = await params
  try {
    const lead = await prisma.marketingLead.findUnique({ where: { id }, select: { id: true, tenantId: true } })
    if (!lead) return NextResponse.json({ success: false, error: 'Lead não encontrado.' }, { status: 404 })
    if (!ownsTenant(user.role, user.tenantId, lead.tenantId)) return forbiddenResponse('Lead de outro tenant.')

    const won = await prisma.$transaction(async (tx) => {
      // Compare-and-set atômico: só vence quem encontrar o lead ainda não assumido.
      const upd = await tx.marketingLead.updateMany({
        where: { id, tenantId: tid, claimedByUserId: null, status: { in: ['NEW', 'RECYCLED'] } },
        data: { claimedByUserId: user.id, claimedAt: new Date(), assignedToUserId: user.id, status: 'WORKING' },
      })
      const success = upd.count === 1
      // Auditoria da corrida (quem tentou / assumiu / perdeu).
      await tx.marketingLeadClaim.create({
        data: { tenantId: tid, leadId: id, userId: user.id, action: success ? 'CLAIMED' : 'LOST_RACE', succeeded: success },
      })
      if (success) {
        await tx.marketingLeadAssignment.create({
          data: { tenantId: tid, leadId: id, assignedToUserId: user.id, assignedByUserId: user.id, mode: 'SHARK_TANK', status: 'ACCEPTED', respondedAt: new Date() },
        })
      }
      return success
    })

    if (!won) {
      return NextResponse.json({ success: false, claimed: false, error: 'Este lead já foi assumido por outro usuário.' }, { status: 409 })
    }
    await createSafeAuditLog({ userId: user.id, tenantId: tid, action: 'CLAIM', entity: 'MarketingLead', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, claimed: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
