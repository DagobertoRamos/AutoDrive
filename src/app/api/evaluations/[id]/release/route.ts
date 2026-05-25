// =============================================================================
// POST /api/evaluations/[id]/release
// Libera o resultado da avaliação ao vendedor (gerência+).
// Define status='LIBERADA' (mantém compatível com o enum String existente).
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma }               from '@/lib/prisma'
import { handlePrismaError }    from '@/lib/prisma-errors'
import { loadEvaluationContext } from '@/lib/evaluation/service'
import { canApproveServices }   from '@/lib/evaluation/permissions'
import { recordHistory }        from '@/lib/evaluation/history'

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
    if (!canApproveServices(user)) {
      return NextResponse.json({ error: 'Apenas gerência pode liberar o resultado.' }, { status: 403 })
    }

    const updated = await prisma.vehicleEvaluation.update({
      where: { id: params.id },
      data:  {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        status: 'LIBERADA' as any,
      },
    })

    await recordHistory({
      tenantId: ctx.tenantId ?? '',
      evaluationId: params.id,
      userId: session.user.id,
      userName: session.user.name,
      userRole: session.user.role,
      action: 'RELEASE',
      oldValue: { status: ctx.status },
      newValue: { status: 'LIBERADA' },
    }).catch(() => {})

    return NextResponse.json({ data: updated })
  } catch (err) {
    return handlePrismaError(err)
  }
}
