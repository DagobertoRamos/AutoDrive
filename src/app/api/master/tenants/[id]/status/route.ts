// =============================================================================
// PATCH /api/master/tenants/[id]/status
// Pausar, banir, desbanir, suspender, reativar tenant (MASTER only)
//
// Todas as ações são auditadas. Soft status — nunca hard delete.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'

type StatusAction = 'REATIVAR' | 'SUSPENDER' | 'BANIR' | 'DESBANIR' | 'CANCELAR' | 'TESTE'

const ACTION_RESULT: Record<StatusAction, string> = {
  REATIVAR:  'ATIVO',
  SUSPENDER: 'SUSPENSO',
  BANIR:     'BANIDO',
  DESBANIR:  'ATIVO',
  CANCELAR:  'CANCELADO',
  TESTE:     'TESTE',
}

const REASON_REQUIRED: StatusAction[] = ['BANIR', 'SUSPENDER', 'CANCELAR']

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerAuthSession()
  if (!session || session.user.role !== 'MASTER') {
    return NextResponse.json({ success: false, error: 'Acesso negado.' }, { status: 403 })
  }

  try {
    const body:   { action?: string; reason?: string } = await req.json()
    const action  = String(body.action ?? '').toUpperCase() as StatusAction
    const reason  = body.reason?.trim() || null

    if (!Object.keys(ACTION_RESULT).includes(action)) {
      return NextResponse.json(
        { success: false, error: `Ação inválida. Use: ${Object.keys(ACTION_RESULT).join(', ')}` },
        { status: 400 },
      )
    }

    if (REASON_REQUIRED.includes(action) && !reason) {
      return NextResponse.json(
        { success: false, error: `Motivo obrigatório para a ação "${action}".` },
        { status: 400 },
      )
    }

    const tenant = await prisma.tenant.findUnique({
      where:  { id: params.id },
      select: { id: true, name: true, status: true },
    })

    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant não encontrado.' }, { status: 404 })
    }

    const newStatus = ACTION_RESULT[action]

    const updated = await prisma.tenant.update({
      where: { id: params.id },
      data:  {
        status:       newStatus as never,
        statusReason: reason,
      },
      select: { id: true, name: true, status: true, statusReason: true, updatedAt: true },
    })

    await createSafeAuditLog({
      userId:   session.user.id,
      tenantId: params.id,
      action:   `STATUS_${action}`,
      entity:   'Tenant',
      entityId: params.id,
      userName: session.user.name,
      userRole: session.user.role,
      status:   'SUCCESS',
    })

    const actionLabels: Record<StatusAction, string> = {
      REATIVAR:  'reativado',
      SUSPENDER: 'suspenso',
      BANIR:     'banido',
      DESBANIR:  'desbanido',
      CANCELAR:  'cancelado',
      TESTE:     'retornado ao modo teste',
    }

    return NextResponse.json({
      success: true,
      message: `Tenant "${tenant.name}" ${actionLabels[action]} com sucesso.`,
      data:    updated,
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
