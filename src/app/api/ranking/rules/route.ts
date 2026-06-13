// =============================================================================
// /api/ranking/rules — Ler e configurar os pesos/desempate do ranking do tenant
// =============================================================================

import { NextResponse } from 'next/server'
import { z, ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import {
  getSessionUser,
  assertTenantId,
  unauthorizedResponse,
  forbiddenResponse,
  createSafeAuditLog,
} from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canManageRanking, getRankingRule, DEFAULT_TIEBREAKERS } from '@/lib/ranking/service'

const weightField = z.number().int().min(-1000).max(1000)

const rulesSchema = z.object({
  name:                  z.string().max(80).optional(),
  weightSale:            weightField.optional(),
  weightPurchase:        weightField.optional(),
  weightReturn:          weightField.optional(),
  weightDocumentation:   weightField.optional(),
  weightWarranty:        weightField.optional(),
  weightService:         weightField.optional(),
  weightOverduePendency: weightField.optional(),
  weightCanceledSale:    weightField.optional(),
  weightLateDocument:    weightField.optional(),
  tiebreakers:           z.array(z.string()).max(12).optional(),
})

// ── GET — regra atual (ou defaults) ───────────────────────────────────────────

export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()

  try {
    const tenantId = user.role === 'MASTER' ? null : assertTenantId(user.tenantId, user.role)
    const rule = await getRankingRule(tenantId)
    return NextResponse.json({ success: true, data: rule, defaults: { tiebreakers: [...DEFAULT_TIEBREAKERS] } })
  } catch (err) {
    return handlePrismaError(err)
  }
}

// ── PUT — criar/atualizar a regra ativa do tenant (apenas gestão) ─────────────

export async function PUT(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canManageRanking(user.role)) return forbiddenResponse('Apenas gestores podem configurar o ranking.')

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'Configuração de ranking exige um tenant.' },
        { status: 400 },
      )
    }

    const data = rulesSchema.parse(await req.json())
    const { tiebreakers, name, ...weights } = data

    const existing = await prisma.rankingRule.findFirst({
      where: { tenantId, active: true },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    })

    const payload = {
      ...weights,
      ...(name !== undefined ? { name } : {}),
      ...(tiebreakers !== undefined ? { tiebreakers } : {}),
      updatedBy: user.id,
    }

    const rule = existing
      ? await prisma.rankingRule.update({ where: { id: existing.id }, data: payload })
      : await prisma.rankingRule.create({
          data: { tenantId, createdBy: user.id, ...payload },
        })

    await createSafeAuditLog({
      userId:   user.id,
      tenantId,
      action:   existing ? 'UPDATE' : 'CREATE',
      entity:   'RankingRule',
      entityId: rule.id,
      userName: user.name,
      userRole: user.role,
    })

    return NextResponse.json({ success: true, data: rule })
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { success: false, error: err.errors[0]?.message ?? 'Dados inválidos.', issues: err.errors },
        { status: 400 },
      )
    }
    return handlePrismaError(err)
  }
}
