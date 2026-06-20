// =============================================================================
// /api/stock/pendency-options — Opções de pendências do estoque
// MASTER cria opções globais (tenantId null, createdByMaster true)
// ADM cria opções específicas do tenant (tenantId = seu tenant)
// ADM NÃO pode editar/excluir opções criadas pelo MASTER
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  getSessionUser,
  assertTenantId,
  unauthorizedResponse,
  forbiddenResponse,
  createSafeAuditLog,
} from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModule } from '@/lib/permissions'
import { assertModuleEnabled } from '@/lib/tenant-modules'

// ── GET — Listar opções disponíveis para o tenant ────────────────────────────

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'stock.view')) return forbiddenResponse()
  { const gate = await assertModuleEnabled(user, 'stock.view'); if (gate) return gate }

  try {
    const tenantId = user.role === 'MASTER' ? null : assertTenantId(user.tenantId, user.role)

    const { searchParams } = new URL(req.url)
    const category    = searchParams.get('category') ?? ''
    const includeInactive = searchParams.get('includeInactive') === 'true'
    const tenantParam = searchParams.get('tenantId') ?? ''  // MASTER pode filtrar por tenant específico

    // MASTER pode ver tudo; outros veem global (tenantId null) + as do seu tenant
    let whereOr: object[]
    if (user.role === 'MASTER') {
      whereOr = tenantParam
        ? [{ tenantId: tenantParam }, { tenantId: null }]
        : [{}]  // sem filtro — retorna tudo
    } else {
      whereOr = [
        { tenantId: null },       // globais
        { tenantId: tenantId! },  // do tenant
      ]
    }

    const where: Record<string, unknown> = {
      OR: whereOr,
      ...(includeInactive ? {} : { active: true }),
      ...(category ? { category } : {}),
    }

    const options = await prisma.stockPendencyOption.findMany({
      where: where as never,
      orderBy: [{ order: 'asc' }, { label: 'asc' }],
    })

    return NextResponse.json({ success: true, data: options })
  } catch (err) {
    return handlePrismaError(err)
  }
}

// ── POST — Criar opção de pendência ──────────────────────────────────────────

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'stock.pendencies.configure')) {
    return forbiddenResponse('Apenas administradores podem configurar opções de pendência.')
  }
  { const gate = await assertModuleEnabled(user, 'stock.pendencies.configure'); if (gate) return gate }

  try {
    const tenantId = user.role === 'MASTER' ? null : assertTenantId(user.tenantId, user.role)

    const body = await req.json()
    const { label, category, order, active } = body

    if (!label?.trim()) {
      return NextResponse.json(
        { success: false, error: 'O nome da opção é obrigatório.' },
        { status: 400 },
      )
    }

    const option = await prisma.stockPendencyOption.create({
      data: {
        tenantId:         user.role === 'MASTER' ? null : tenantId,
        createdByMaster:  user.role === 'MASTER',
        label:            String(label).trim(),
        category:         category?.trim() || null,
        order:            order != null ? Number(order) : 0,
        active:           active !== false,
      },
    })

    await createSafeAuditLog({
      userId:   user.id,
      tenantId: tenantId ?? 'MASTER',
      action:   'CREATE',
      entity:   'StockPendencyOption',
      entityId: option.id,
      userName: user.name,
      userRole: user.role,
    })

    return NextResponse.json(
      { success: true, data: option, message: 'Opção criada com sucesso.' },
      { status: 201 },
    )
  } catch (err) {
    return handlePrismaError(err)
  }
}

// ── PATCH — Editar opção ──────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'stock.pendencies.configure')) {
    return forbiddenResponse('Sem permissão para editar opções de pendência.')
  }
  { const gate = await assertModuleEnabled(user, 'stock.pendencies.configure'); if (gate) return gate }

  try {
    const tenantId = user.role === 'MASTER' ? null : assertTenantId(user.tenantId, user.role)

    const body = await req.json()
    const { id, label, category, order, active } = body

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID é obrigatório.' }, { status: 400 })
    }

    const existing = await prisma.stockPendencyOption.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Opção não encontrada.' }, { status: 404 })
    }

    // ADM não pode editar opções criadas pelo MASTER
    if (user.role !== 'MASTER' && existing.createdByMaster) {
      return forbiddenResponse('Esta opção é global e não pode ser alterada por administradores de tenant.')
    }

    // ADM só pode editar suas próprias opções de tenant
    if (user.role !== 'MASTER' && existing.tenantId !== tenantId) {
      return forbiddenResponse('Sem permissão para editar esta opção.')
    }

    const updated = await prisma.stockPendencyOption.update({
      where: { id },
      data: {
        ...(label    != null && { label:    String(label).trim() }),
        ...(category != null && { category: category?.trim() || null }),
        ...(order    != null && { order:    Number(order) }),
        ...(active   != null && { active:   Boolean(active) }),
      },
    })

    await createSafeAuditLog({
      userId:   user.id,
      tenantId: tenantId ?? 'MASTER',
      action:   'UPDATE',
      entity:   'StockPendencyOption',
      entityId: id,
      userName: user.name,
      userRole: user.role,
    })

    return NextResponse.json({ success: true, data: updated })
  } catch (err) {
    return handlePrismaError(err)
  }
}

// ── DELETE — Remover opção ────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'stock.pendencies.configure')) {
    return forbiddenResponse('Sem permissão para remover opções de pendência.')
  }
  { const gate = await assertModuleEnabled(user, 'stock.pendencies.configure'); if (gate) return gate }

  try {
    const tenantId = user.role === 'MASTER' ? null : assertTenantId(user.tenantId, user.role)

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID é obrigatório.' }, { status: 400 })
    }

    const existing = await prisma.stockPendencyOption.findUnique({
      where: { id },
      include: { _count: { select: { vehicleStockPendencies: true } } },
    })

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Opção não encontrada.' }, { status: 404 })
    }

    // ADM não pode excluir opções criadas pelo MASTER
    if (user.role !== 'MASTER' && existing.createdByMaster) {
      return forbiddenResponse('Esta opção é global e não pode ser removida por administradores de tenant.')
    }

    // ADM só pode excluir suas próprias opções
    if (user.role !== 'MASTER' && existing.tenantId !== tenantId) {
      return forbiddenResponse('Sem permissão para remover esta opção.')
    }

    // Se há pendências vinculadas, desativa em vez de excluir
    if (existing._count.vehicleStockPendencies > 0) {
      await prisma.stockPendencyOption.update({
        where: { id },
        data:  { active: false },
      })

      return NextResponse.json({
        success: true,
        message: 'Opção desativada (há pendências vinculadas a ela).',
      })
    }

    await prisma.stockPendencyOption.delete({ where: { id } })

    await createSafeAuditLog({
      userId:   user.id,
      tenantId: tenantId ?? 'MASTER',
      action:   'DELETE',
      entity:   'StockPendencyOption',
      entityId: id,
      userName: user.name,
      userRole: user.role,
    })

    return NextResponse.json({ success: true, message: 'Opção removida com sucesso.' })
  } catch (err) {
    return handlePrismaError(err)
  }
}
