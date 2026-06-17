// =============================================================================
// /api/master/ai/knowledge — base de conhecimento global da IA (Master).
//   GET : lista bases globais (tenantId null)   POST: cria base
// MASTER-only, auditado.
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse } from '@/lib/finance/finance-service'
import { createAiKnowledgeSchema } from '@/lib/validators/ai'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'master.ai')) return forbiddenResponse('Área exclusiva do MASTER.')
  try {
    const rows = await prisma.aiKnowledgeBase.findMany({
      where: { tenantId: null },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { chunks: true } } },
    })
    return NextResponse.json({ success: true, data: rows.map((r) => ({ id: r.id, scope: r.scope, title: r.title, description: r.description, sourceType: r.sourceType, status: r.status, chunks: r._count.chunks, hasContent: !!r.content, updatedAt: r.updatedAt })) })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'master.ai')) return forbiddenResponse('Área exclusiva do MASTER.')
  try {
    const d = createAiKnowledgeSchema.parse(await req.json())
    const kb = await prisma.aiKnowledgeBase.create({
      data: { tenantId: null, scope: 'global', title: d.title, description: d.description ?? null, content: d.content ?? null, sourceType: d.sourceType, status: d.status, createdByUserId: user.id },
    })
    await createSafeAuditLog({ userId: user.id, action: 'CREATE', entity: 'AiKnowledgeBase', entityId: kb.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: { id: kb.id } }, { status: 201 })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
