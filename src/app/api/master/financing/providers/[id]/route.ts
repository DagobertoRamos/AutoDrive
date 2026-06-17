// =============================================================================
// /api/master/financing/providers/[id] — editar/excluir provedor (Master).
//   PATCH  : master.financing — edita campos (inclui fieldMappings)
//   DELETE : master.financing — remove (cascade nos bancos homologados)
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { updateProviderSchema, fieldMappingsSchema } from '@/lib/validators/financing'
import { zodErrorResponse } from '@/lib/finance/finance-service'

type Ctx = { params: Promise<{ id: string }> }
const notFound = () => NextResponse.json({ success: false, error: 'Provedor não encontrado.' }, { status: 404 })

export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'master.financing')) return forbiddenResponse('Área exclusiva do MASTER.')
  const { id } = await params
  try {
    const existing = await prisma.financeProvider.findUnique({ where: { id }, select: { id: true } })
    if (!existing) return notFound()
    const body = await req.json()
    // Atualização do mapeamento de campos (Parte 4) via { mappings: {...} }.
    if (body && typeof body === 'object' && 'mappings' in body) {
      const { mappings } = fieldMappingsSchema.parse(body)
      await prisma.financeProvider.update({ where: { id }, data: { fieldMappings: mappings as never } })
      await createSafeAuditLog({ userId: user.id, action: 'UPDATE_MAPPINGS', entity: 'FinanceProvider', entityId: id, userName: user.name, userRole: user.role })
      return NextResponse.json({ success: true })
    }
    const d = updateProviderSchema.parse(body)
    const data: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(d)) if (v !== undefined) data[k] = v === null && (k === 'baseUrlHomolog' || k === 'baseUrlProd' || k === 'apiVersion' || k === 'notes') ? null : v
    await prisma.financeProvider.update({ where: { id }, data })
    await createSafeAuditLog({ userId: user.id, action: 'UPDATE', entity: 'FinanceProvider', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'master.financing')) return forbiddenResponse('Área exclusiva do MASTER.')
  const { id } = await params
  try {
    const existing = await prisma.financeProvider.findUnique({ where: { id }, select: { id: true } })
    if (!existing) return notFound()
    await prisma.financeProvider.delete({ where: { id } })
    await createSafeAuditLog({ userId: user.id, action: 'DELETE', entity: 'FinanceProvider', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
