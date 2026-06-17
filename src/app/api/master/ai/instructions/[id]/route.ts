// =============================================================================
// /api/master/ai/instructions/[id] — editar/excluir instrução da IA (Master).
// PATCH: ao mudar o conteúdo, grava nova versão (histórico). DELETE remove.
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse } from '@/lib/finance/finance-service'
import { updateAiInstructionSchema } from '@/lib/validators/ai'

type Ctx = { params: Promise<{ id: string }> }
const notFound = () => NextResponse.json({ success: false, error: 'Instrução não encontrada.' }, { status: 404 })

export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'master.ai')) return forbiddenResponse('Área exclusiva do MASTER.')
  const { id } = await params
  try {
    const existing = await prisma.aiInstruction.findUnique({ where: { id }, include: { _count: { select: { versions: true } } } })
    if (!existing || existing.tenantId !== null) return notFound()
    const d = updateAiInstructionSchema.parse(await req.json())

    const data: Record<string, unknown> = { updatedById: user.id }
    for (const k of ['title', 'area', 'scope', 'content', 'status', 'priority'] as const) {
      const v = (d as Record<string, unknown>)[k]
      if (v !== undefined) data[k] = v === null && k === 'area' ? null : v
    }
    // Conteúdo alterado → snapshot de nova versão.
    if (d.content !== undefined && d.content !== existing.content) {
      data.versions = { create: { version: existing._count.versions + 1, content: d.content, scope: d.scope ?? existing.scope, createdById: user.id } }
    }
    await prisma.aiInstruction.update({ where: { id }, data })
    await createSafeAuditLog({ userId: user.id, action: 'UPDATE', entity: 'AiInstruction', entityId: id, userName: user.name, userRole: user.role })
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
    const existing = await prisma.aiInstruction.findUnique({ where: { id }, select: { id: true, tenantId: true } })
    if (!existing || existing.tenantId !== null) return notFound()
    await prisma.aiInstruction.delete({ where: { id } })
    await createSafeAuditLog({ userId: user.id, action: 'DELETE', entity: 'AiInstruction', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
