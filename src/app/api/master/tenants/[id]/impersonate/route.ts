// =============================================================================
// POST /api/master/tenants/[id]/impersonate — Iniciar impersonation (MASTER only)
//
// Permite ao MASTER "logar como" um usuário de um tenant para suporte.
// • Registra ImpersonationSession obrigatoriamente
// • Registra AuditLog obrigatoriamente
// • Não exige senha do usuário alvo
// • Retorna dados suficientes para o frontend exibir banner de impersonation
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireMaster, logMasterAction } from '@/lib/master-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { prisma } from '@/lib/prisma'

export async function POST(
  req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const { session, error } = await requireMaster()
  if (error) return error

  try {
    const body = await req.json()
    const { targetUserId, reason } = body

    if (!reason?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Motivo obrigatório para impersonation.' },
        { status: 400 },
      )
    }

    // Verificar tenant
    const tenant = await prisma.tenant.findUnique({
      where: { id: params.id },
      select: { id: true, name: true, status: true },
    })
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant não encontrado.' }, { status: 404 })
    }

    // Resolver usuário alvo: se fornecido usa-o, senão busca o ADM do tenant
    let targetUser: { id: string; name: string; email: string; role: string } | null = null

    if (targetUserId) {
      const user = await prisma.user.findFirst({
        where: { id: targetUserId, tenantId: params.id },
        select: { id: true, name: true, email: true, role: true, status: true },
      })
      if (!user) {
        return NextResponse.json(
          { success: false, error: 'Usuário não encontrado no tenant informado.' },
          { status: 404 },
        )
      }
      if (user.status !== 'ATIVO') {
        return NextResponse.json(
          { success: false, error: 'Não é possível impersonar usuário inativo/bloqueado.' },
          { status: 400 },
        )
      }
      targetUser = user
    } else {
      // Pega o ADM ou usuário mais antigo do tenant
      const adm = await prisma.user.findFirst({
        where:   { tenantId: params.id, role: 'ADM', status: 'ATIVO' },
        orderBy: { createdAt: 'asc' },
        select:  { id: true, name: true, email: true, role: true },
      })
      targetUser = adm ?? await prisma.user.findFirst({
        where:   { tenantId: params.id, status: 'ATIVO' },
        orderBy: { createdAt: 'asc' },
        select:  { id: true, name: true, email: true, role: true },
      })
    }

    if (!targetUser) {
      return NextResponse.json(
        { success: false, error: 'Nenhum usuário ativo encontrado neste tenant.' },
        { status: 404 },
      )
    }

    const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
                    ?? req.headers.get('x-real-ip')
                    ?? undefined
    const userAgent = req.headers.get('user-agent') ?? undefined

    // Registrar sessão de impersonation
    const impSession = await prisma.impersonationSession.create({
      data: {
        masterId:       session.id,
        targetUserId:   targetUser.id,
        targetTenantId: params.id,
        reason:         String(reason).trim(),
        ipAddress,
        userAgent,
      },
    })

    // Audit obrigatório
    await logMasterAction(session, 'IMPERSONATE_USER', 'ImpersonationSession', impSession.id, {
      tenantId:  params.id,
      afterData: {
        targetUserId:   targetUser.id,
        targetUserName: targetUser.name,
        targetTenantId: params.id,
        tenantName:     tenant.name,
        reason,
      },
      req,
    })

    return NextResponse.json({
      success: true,
      data: {
        impersonationSessionId: impSession.id,
        masterId:     session.id,
        masterName:   session.name,
        targetUser:   { id: targetUser.id, name: targetUser.name, email: targetUser.email, role: targetUser.role },
        tenant:       { id: tenant.id, name: tenant.name },
        reason:       impSession.reason,
        startedAt:    impSession.startedAt,
      },
      message: `Impersonation iniciado como ${targetUser.name} (${tenant.name}).`,
    })
  } catch (err) {
    console.error('[POST /api/master/tenants/:id/impersonate]', err)
    return handlePrismaError(err)
  }
}

// Encerrar sessão de impersonation
export async function DELETE(
  req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const { session, error } = await requireMaster()
  if (error) return error

  try {
    const body = await req.json()
    const { impersonationSessionId } = body

    if (!impersonationSessionId) {
      return NextResponse.json({ success: false, error: 'impersonationSessionId obrigatório.' }, { status: 400 })
    }

    const impSession = await prisma.impersonationSession.findFirst({
      where: { id: impersonationSessionId, masterId: session.id, endedAt: null },
    })

    if (!impSession) {
      return NextResponse.json({ success: false, error: 'Sessão de impersonation não encontrada.' }, { status: 404 })
    }

    await prisma.impersonationSession.update({
      where: { id: impersonationSessionId },
      data:  { endedAt: new Date() },
    })

    await logMasterAction(session, 'END_IMPERSONATION', 'ImpersonationSession', impersonationSessionId, {
      tenantId:  params.id,
      afterData: { endedAt: new Date().toISOString() },
      req,
    })

    return NextResponse.json({ success: true, message: 'Impersonation encerrado.' })
  } catch (err) {
    console.error('[DELETE /api/master/tenants/:id/impersonate]', err)
    return handlePrismaError(err)
  }
}
