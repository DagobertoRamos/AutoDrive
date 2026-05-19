// =============================================================================
// POST /api/evaluations/[id]/items/seed
// Cria os itens canônicos de checklist a partir do catálogo (idempotente).
// Útil quando a avaliação foi criada antes do reformulação ou via integração.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma }               from '@/lib/prisma'
import { handlePrismaError }    from '@/lib/prisma-errors'
import { loadEvaluationContext } from '@/lib/evaluation/service'
import { canEditEvaluation }    from '@/lib/evaluation/permissions'
import { ITEMS, type SectionKey } from '@/lib/evaluation/catalog'

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const ctx = await loadEvaluationContext(params.id)
    if (!ctx) return NextResponse.json({ error: 'Avaliação não encontrada' }, { status: 404 })
    const user = { id: session.user.id, role: session.user.role, tenantId: session.user.tenantId }
    if (!canEditEvaluation(user, ctx))
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

    // Carrega catalogKeys já existentes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing: Array<{ catalogKey: string | null }> = await (prisma as any).evaluationItem.findMany({
      where: { evaluationId: params.id },
      select: { catalogKey: true },
    }).catch(() => [])
    const have = new Set(existing.map((i) => i.catalogKey).filter(Boolean) as string[])

    const sections: SectionKey[] = ['INTERIOR', 'FRENTE', 'DIREITA', 'TRASEIRA', 'ESQUERDA', 'TEST_DRIVE']
    const rows = sections.flatMap((sec) =>
      ITEMS[sec]
        .filter((it) => !have.has(it.key))
        .map((it) => ({
          tenantId:     ctx.tenantId ?? null,
          evaluationId: params.id,
          section:      sec,
          catalogKey:   it.key,
          name:         it.name,
          status:       'PENDING',
          totalExpenses: 0,
        })),
    )

    if (rows.length === 0) return NextResponse.json({ data: { created: 0 } })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).evaluationItem.createMany({ data: rows }).catch(() => {})
    return NextResponse.json({ data: { created: rows.length } })
  } catch (err) {
    return handlePrismaError(err)
  }
}
