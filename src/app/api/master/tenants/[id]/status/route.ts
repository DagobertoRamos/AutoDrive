// =============================================================================
// PATCH /api/master/tenants/[id]/status
// Desativar, suspender, cancelar, reativar tenant (MASTER only)
//
// Todas as ações são auditadas. Soft status — nunca hard delete aqui.
// DESATIVAR (status BANIDO no banco; BANIR segue aceito como sinônimo) corta o
// acesso de todos os usuários da loja e inicia o prazo de guarda de 5 anos —
// vencido, o cron apaga tudo (ver src/lib/tenant-lifecycle). Reativar encerra
// o prazo e mantém os dados.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { invalidateTenantStatus } from '@/lib/tenant-lifecycle/access'
import { countsRetention } from '@/lib/tenant-lifecycle/core'
import { startRetention, clearRetention, getRetention } from '@/lib/tenant-lifecycle/retention'

type StatusAction = 'REATIVAR' | 'SUSPENDER' | 'DESATIVAR' | 'BANIR' | 'DESBANIR' | 'CANCELAR' | 'TESTE'

const ACTION_RESULT: Record<StatusAction, string> = {
  REATIVAR:  'ATIVO',
  SUSPENDER: 'SUSPENSO',
  DESATIVAR: 'BANIDO',
  BANIR:     'BANIDO',
  DESBANIR:  'ATIVO',
  CANCELAR:  'CANCELADO',
  TESTE:     'TESTE',
}

const REASON_REQUIRED: StatusAction[] = ['DESATIVAR', 'BANIR', 'SUSPENDER', 'CANCELAR']

export async function PATCH(
  req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
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

    // Vale na hora nesta instância (as demais pegam em até 30s).
    invalidateTenantStatus(params.id)
    if (countsRetention(newStatus)) await startRetention(tenant.id, tenant.name)
    else await clearRetention(tenant.id)
    const retention = await getRetention(tenant.id)

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
      DESATIVAR: 'desativado',
      BANIR:     'desativado',
      DESBANIR:  'reativado',
      CANCELAR:  'cancelado',
      TESTE:     'retornado ao modo teste',
    }

    return NextResponse.json({
      success: true,
      message: `Tenant "${tenant.name}" ${actionLabels[action]} com sucesso.`,
      data:    { ...updated, retention },
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
