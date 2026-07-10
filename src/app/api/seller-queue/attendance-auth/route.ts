// =============================================================================
// Autorização anti-fraude de atendimento (agendamento/retorno).
//   POST — o VENDEDOR pede autorização para atender (fica PENDENTE). Notifica
//          líderes+gerência (push Aprovar/Recusar + sininho). Gate: sellerQueue.attend.
//   GET  — líder+/gerência listam os pedidos PENDENTES da unidade. Gate: sellerQueue.lead.
// Tenant/unit-scoped.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { unitFromRequest } from '@/lib/seller-queue/queue'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { notify } from '@/services/notification.service'

export const dynamic = 'force-dynamic'

const VISIT_TYPES = ['AGENDAMENTO', 'RETORNO']
const APPROVER_ROLES = ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE', 'VENDEDOR_LIDER'] as const

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'sellerQueue.attend')) return forbiddenResponse('Sem acesso à fila.')
  { const gate = await assertModuleEnabled(user, 'sellerQueue.view'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const unitId = unitFromRequest(req, user.unitId)
  if (!unitId) return forbiddenResponse('Seu usuário não tem unidade vinculada.')

  try {
    const body = await req.json().catch(() => ({}))
    const visitType = typeof body?.visitType === 'string' && VISIT_TYPES.includes(body.visitType) ? body.visitType : ''
    if (!visitType) return NextResponse.json({ success: false, error: 'Tipo inválido (AGENDAMENTO ou RETORNO).' }, { status: 400 })
    const customerName = typeof body?.customerName === 'string' ? body.customerName.trim() : ''
    if (!customerName) return NextResponse.json({ success: false, error: 'Informe o nome do cliente.' }, { status: 400 })

    // Evita pedido duplicado em aberto do mesmo vendedor.
    const openReq = await prisma.sellerAttendanceAuthorization.findFirst({ where: { requesterUserId: user.id, status: 'PENDING' }, select: { id: true } })
    if (openReq) return NextResponse.json({ success: false, error: 'Você já tem um pedido de autorização pendente.' }, { status: 409 })

    const auth = await prisma.sellerAttendanceAuthorization.create({
      data: {
        tenantId, unitId, requesterUserId: user.id, visitType,
        customerName,
        customerPhone: typeof body?.customerPhone === 'string' ? body.customerPhone.trim() || null : null,
        customerEmail: typeof body?.customerEmail === 'string' ? body.customerEmail.trim() || null : null,
        notes: typeof body?.notes === 'string' ? body.notes.trim() || null : null,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2h
      },
    })

    // Notifica os aprovadores da unidade (líder + gerência), menos o próprio.
    const approvers = await prisma.user.findMany({
      where: { tenantId, unitId, status: 'ATIVO', role: { in: APPROVER_ROLES as unknown as never[] }, id: { not: user.id } },
      select: { id: true },
    }).catch(() => [])
    const label = visitType === 'AGENDAMENTO' ? 'agendamento' : 'retorno'
    await Promise.all(approvers.map((a) => notify({
      userId: a.id,
      tenantId,
      type: 'WARNING',
      title: '🔐 Autorização de atendimento',
      message: `${user.name} pediu para atender ${label}: ${customerName}. Aprove ou recuse.`,
      actionUrl: '/vendedor-da-vez?authRequest=' + auth.id,
      metadata: { kind: 'attendance_auth', authId: auth.id, priority: 'high' },
      channels: ['APP_WEB', 'APP_MOBILE', 'PUSH'],
    }).catch(() => {})))

    return NextResponse.json({ success: true, data: { id: auth.id, status: auth.status, approvers: approvers.length } })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'sellerQueue.lead')) return forbiddenResponse('Sem acesso à autorização de atendimentos.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const unitId = unitFromRequest(req, user.unitId)

  try {
    const rows = await prisma.sellerAttendanceAuthorization.findMany({
      where: { tenantId, status: 'PENDING', ...(unitId ? { unitId } : {}) },
      orderBy: { createdAt: 'asc' },
      take: 50,
    }).catch(() => [] as never[])

    const requesterIds = Array.from(new Set(rows.map((r) => r.requesterUserId)))
    const users = requesterIds.length
      ? await prisma.user.findMany({ where: { id: { in: requesterIds } }, select: { id: true, name: true } }).catch(() => [])
      : []
    const nameMap = new Map(users.map((u) => [u.id, u.name]))

    const data = rows.map((r) => ({
      id: r.id, visitType: r.visitType, customerName: r.customerName, customerPhone: r.customerPhone,
      notes: r.notes, createdAt: r.createdAt, requesterUserId: r.requesterUserId,
      requesterName: nameMap.get(r.requesterUserId) ?? '—',
    }))
    return NextResponse.json({ success: true, data })
  } catch (err) {
    return handlePrismaError(err)
  }
}
