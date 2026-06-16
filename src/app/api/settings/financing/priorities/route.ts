// =============================================================================
// /api/settings/financing/priorities — ordem de envio das fichas aos bancos.
//   GET : financing.config — bancos ativos da loja + sua prioridade (se houver)
//   PUT : financing.config — salva a lista inteira (upsert por banco), auditado
// Tenant-scoped. MASTER não gerencia config da loja.
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { savePrioritiesSchema } from '@/lib/validators/financing'
import { zodErrorResponse } from '@/lib/finance/finance-service'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing.config')) return forbiddenResponse('Sem acesso às configurações de F&I.')
  if (user.role === 'MASTER' || !user.tenantId) return forbiddenResponse('Prioridades são gerenciadas pela loja, não pelo MASTER.')

  try {
    const tenantId = user.tenantId
    const [banks, priorities] = await Promise.all([
      prisma.financeBank.findMany({ where: { tenantId, active: true }, select: { id: true, name: true, code: true }, orderBy: { name: 'asc' } }),
      prisma.financeBankPriority.findMany({ where: { tenantId }, select: { bankId: true, priority: true, active: true } }),
    ])
    const map = new Map(priorities.map((p) => [p.bankId, p]))
    // Ordena: quem tem prioridade primeiro (asc), depois bancos sem prioridade (nome).
    const rows = banks.map((b) => {
      const p = map.get(b.id)
      return { bankId: b.id, bankName: b.name, code: b.code, priority: p?.priority ?? null, active: p?.active ?? true }
    }).sort((a, z) => {
      if (a.priority == null && z.priority == null) return a.bankName.localeCompare(z.bankName)
      if (a.priority == null) return 1
      if (z.priority == null) return -1
      return a.priority - z.priority
    })
    return NextResponse.json({ success: true, data: rows })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function PUT(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing.config')) return forbiddenResponse('Sem permissão para alterar prioridades.')
  if (user.role === 'MASTER' || !user.tenantId) return forbiddenResponse('Prioridades são gerenciadas pela loja, não pelo MASTER.')

  try {
    const tenantId = user.tenantId
    const { items } = savePrioritiesSchema.parse(await req.json())
    // Garante que os bancos pertencem ao tenant antes de gravar.
    const ids = items.map((i) => i.bankId)
    const owned = await prisma.financeBank.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true } })
    const ownedSet = new Set(owned.map((b) => b.id))
    const valid = items.filter((i) => ownedSet.has(i.bankId))

    await prisma.$transaction(
      valid.map((i) =>
        prisma.financeBankPriority.upsert({
          where: { tenantId_bankId: { tenantId, bankId: i.bankId } },
          update: { priority: i.priority, active: i.active },
          create: { tenantId, bankId: i.bankId, priority: i.priority, active: i.active },
        }),
      ),
    )
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'UPDATE', entity: 'FinanceBankPriority', userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, saved: valid.length })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
