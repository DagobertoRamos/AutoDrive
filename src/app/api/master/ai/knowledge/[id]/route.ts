// =============================================================================
// /api/master/ai/knowledge/[id] — editar/excluir base de conhecimento (Master).
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse } from '@/lib/finance/finance-service'
import { updateAiKnowledgeSchema } from '@/lib/validators/ai'

type Ctx = { params: Promise<{ id: string }> }
const notFound = () => NextResponse.json({ success: false, error: 'Base não encontrada.' }, { status: 404 })

export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'master.ai')) return forbiddenResponse('Área exclusiva do MASTER.')
  const { id } = await params
  try {
    const existing = await prisma.aiKnowledgeBase.findUnique({ where: { id }, select: { id: true, tenantId: true } })
    if (!existing || existing.tenantId !== null) return notFound()
    const d = updateAiKnowledgeSchema.parse(await req.json())
    const data: Record<string, unknown> = {}
    for (const k of ['title', 'description', 'content', 'sourceType', 'status'] as const) {
      const v = (d as Record<string, unknown>)[k]
      if (v !== undefined) data[k] = v ?? null
    }
    await prisma.aiKnowledgeBase.update({ where: { id }, data })
    await createSafeAuditLog({ userId: user.id, action: 'UPDATE', entity: 'AiKnowledgeBase', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'master.ai')) return forbiddenResponse('Área exclusiva do MASTER.')
  const { id } = await params
  try {
    const existing = await prisma.aiKnowledgeBase.findUnique({ where: { id }, select: { id: true, tenantId: true } })
    if (!existing || existing.tenantId !== null) return notFound()
    await prisma.aiKnowledgeBase.delete({ where: { id } })
    await createSafeAuditLog({ userId: user.id, action: 'DELETE', entity: 'AiKnowledgeBase', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
