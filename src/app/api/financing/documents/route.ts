// =============================================================================
// /api/financing/documents — documentos de todas as fichas da loja (F&I).
// GET (financing read): lista FinanceProposalDocument do tenant, com a ficha e
// o proponente. Filtros: ?status= ?q= (proponente/tipo). Multi-tenant.
// =============================================================================

import { NextResponse } from 'next/server'
import { getSessionUser, assertTenantId, tenantWhere, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'
import { assertModuleEnabled } from '@/lib/tenant-modules'

const STATUSES = ['PENDENTE', 'APROVADO', 'REPROVADO']

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing')) return forbiddenResponse('Sem acesso ao financiamento.')
  { const gate = await assertModuleEnabled(user, 'financing'); if (gate) return gate }

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)
    const sp = new URL(req.url).searchParams
    const status = sp.get('status')
    const q = sp.get('q')?.trim()
    const extra: Record<string, unknown> = {}
    if (status && STATUSES.includes(status)) extra.status = status
    if (q) extra.OR = [
      { type: { contains: q, mode: 'insensitive' } },
      { proposal: { is: { proponent: { is: { nomeCompleto: { contains: q, mode: 'insensitive' } } } } } },
    ]
    const rows = await prisma.financeProposalDocument.findMany({
      where: tenantWhere(user.role, tenantId, extra) as never,
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: { proposal: { select: { id: true, vehicle: true, status: true, proponent: { select: { nomeCompleto: true } } } } },
    })
    return NextResponse.json({
      success: true,
      data: rows.map((d) => ({
        id: d.id, type: d.type, status: d.status, required: d.required, fileUrl: d.fileUrl, fileName: d.fileName,
        proposalId: d.proposalId, proponentNome: d.proposal?.proponent?.nomeCompleto ?? '—',
        vehicle: d.proposal?.vehicle ?? null, proposalStatus: d.proposal?.status ?? null, createdAt: d.createdAt,
      })),
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
