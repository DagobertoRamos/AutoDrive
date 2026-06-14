// =============================================================================
// /api/warranties/[id] — Editar e inativar garantia (permissão + auditoria)
// Auditoria campo-a-campo (spec 2.7): grava beforeData/afterData só do que mudou.
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import {
  getSessionUser,
  unauthorizedResponse,
  forbiddenResponse,
} from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { updateWarrantySchema } from '@/lib/validators/warranty'

type Ctx = { params: Promise<{ id: string }> }

// Campos auditáveis (spec 2.7)
const AUDITED = [
  'name', 'coverageType', 'fullPrice', 'reducedPrice', 'hasPremiumAddon',
  'premiumAddonName', 'premiumAddonValue', 'reducedSaleCommissionValue',
  'fullSaleCommissionValue', 'premiumAddonCommissionValue', 'active',
] as const

function notFound() {
  return NextResponse.json({ success: false, error: 'Garantia não encontrada.' }, { status: 404 })
}

export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'registrations.warranties')) {
    return forbiddenResponse('Sem permissão para editar garantias.')
  }
  const { id } = await params

  try {
    const existing = await prisma.warranty.findUnique({ where: { id } })
    if (!existing) return notFound()
    if (user.role !== 'MASTER' && existing.tenantId !== user.tenantId) {
      return forbiddenResponse('Garantia de outro tenant.')
    }

    const data = updateWarrantySchema.parse(await req.json())

    // Normaliza prêmio quando desativado.
    const premiumOff = data.hasPremiumAddon === false
    const updateData: Record<string, unknown> = { updatedById: user.id }
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue
      updateData[k] = v
    }
    if (premiumOff) {
      updateData.premiumAddonName = null
      updateData.premiumAddonValue = 0
      updateData.premiumAddonCommissionValue = 0
    }

    // Diff campo-a-campo para auditoria.
    const before: Record<string, unknown> = {}
    const after: Record<string, unknown> = {}
    for (const f of AUDITED) {
      if (f in updateData) {
        const oldV = (existing as unknown as Record<string, unknown>)[f]
        const newV = updateData[f]
        const oldNorm = oldV != null && typeof (oldV as { toString?: () => string }).toString === 'function' ? String(oldV) : oldV
        if (String(oldNorm) !== String(newV)) {
          before[f] = oldV != null ? String(oldV) : oldV
          after[f] = newV
        }
      }
    }

    const warranty = await prisma.warranty.update({ where: { id }, data: updateData })

    if (Object.keys(after).length > 0) {
      await prisma.auditLog.create({
        data: {
          tenantId:  existing.tenantId,
          userId:    user.id,
          userName:  user.name,
          userRole:  user.role,
          action:    'UPDATE',
          entity:    'Warranty',
          entityId:  id,
          beforeData: before as never,
          afterData:  after as never,
        },
      }).catch(() => { /* auditoria não bloqueia */ })
    }

    return NextResponse.json({ success: true, data: warranty })
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

// DELETE — inativa a garantia (soft), preservando o histórico de vendas.
export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'registrations.warranties')) {
    return forbiddenResponse('Sem permissão para inativar garantias.')
  }
  const { id } = await params

  try {
    const existing = await prisma.warranty.findUnique({ where: { id } })
    if (!existing) return notFound()
    if (user.role !== 'MASTER' && existing.tenantId !== user.tenantId) {
      return forbiddenResponse('Garantia de outro tenant.')
    }

    await prisma.warranty.update({ where: { id }, data: { active: false, updatedById: user.id } })

    await prisma.auditLog.create({
      data: {
        tenantId: existing.tenantId, userId: user.id, userName: user.name, userRole: user.role,
        action: 'UPDATE', entity: 'Warranty', entityId: id,
        beforeData: { active: String(existing.active) } as never,
        afterData:  { active: 'false' } as never,
      },
    }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
