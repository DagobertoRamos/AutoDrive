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
  ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const ctx = await loadEvaluationContext(params.id)
    if (!ctx) return NextResponse.json({ error: 'Avaliação não encontrada' }, { status: 404 })
    const user = { id: session.user.id, role: session.user.role, tenantId: session.user.tenantId }
    if (!canEditEvaluation(user, ctx))
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

    // Tudo em uma transação serializável: evita race condition quando o
    // frontend dispara 2x simultaneamente (ex: React Strict Mode em dev).
    // A 2ª chamada vê o estado depois da 1ª e nada cria.
    const result = await prisma.$transaction(async (tx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existing: Array<{ catalogKey: string | null; section: string; name: string }> =
        await (tx as any).evaluationItem.findMany({
          where:  { evaluationId: params.id },
          select: { catalogKey: true, section: true, name: true },
        })

      // Dedup das chaves já presentes: catalogKey OU section+name normalizado.
      const have = new Set<string>()
      for (const e of existing) {
        if (e.catalogKey) have.add(`k::${e.catalogKey}`)
        have.add(`n::${e.section}::${e.name.trim().toLowerCase()}`)
      }

      const sections: SectionKey[] = ['INTERIOR', 'FRENTE', 'DIREITA', 'TRASEIRA', 'ESQUERDA', 'TEST_DRIVE']
      const rows = sections.flatMap((sec) =>
        ITEMS[sec]
          .filter((it) => {
            const kKey = `k::${it.key}`
            const nKey = `n::${sec}::${it.name.trim().toLowerCase()}`
            return !have.has(kKey) && !have.has(nKey)
          })
          .map((it) => ({
            tenantId:     ctx.tenantId ?? null,
            evaluationId: params.id,
            section:      sec,
            catalogKey:   it.key,
            name:         it.name,
            status:       'PENDING' as const,
            totalExpenses: 0,
          })),
      )

      if (rows.length === 0) return { created: 0 }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (tx as any).evaluationItem.createMany({ data: rows })
      return { created: rows.length }
    }, { isolationLevel: 'Serializable' })

    return NextResponse.json({ data: result })
  } catch (err) {
    return handlePrismaError(err)
  }
}
