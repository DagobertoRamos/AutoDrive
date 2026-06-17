// =============================================================================
// /api/master/ai/instructions — instruções globais da IA (ensinar a IA). Master.
//   GET : lista instruções globais (tenantId null)
//   POST: cria instrução + snapshot de versão 1
// MASTER-only, auditado.
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse } from '@/lib/finance/finance-service'
import { createAiInstructionSchema } from '@/lib/validators/ai'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'master.ai')) return forbiddenResponse('Área exclusiva do MASTER.')
  try {
    const rows = await prisma.aiInstruction.findMany({
      where: { tenantId: null },
      orderBy: [{ status: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }],
      include: { _count: { select: { versions: true } } },
    })
    return NextResponse.json({ success: true, data: rows.map((r) => ({ id: r.id, title: r.title, area: r.area, scope: r.scope, content: r.content, status: r.status, priority: r.priority, versions: r._count.versions, updatedAt: r.updatedAt })) })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'master.ai')) return forbiddenResponse('Área exclusiva do MASTER.')
  try {
    const d = createAiInstructionSchema.parse(await req.json())
    const ins = await prisma.aiInstruction.create({
      data: {
        tenantId: null, title: d.title, area: d.area ?? null, scope: d.scope, content: d.content, status: d.status, priority: d.priority,
        createdById: user.id, updatedById: user.id,
        versions: { create: { version: 1, content: d.content, scope: d.scope, createdById: user.id } },
      },
    })
    await createSafeAuditLog({ userId: user.id, action: 'CREATE', entity: 'AiInstruction', entityId: ins.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: { id: ins.id } }, { status: 201 })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
