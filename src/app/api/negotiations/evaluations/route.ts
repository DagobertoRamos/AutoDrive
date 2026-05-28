// =============================================================================
// GET /api/negotiations/evaluations
// Avaliações aprovadas disponíveis para uso em negociações de TROCA.
// Requer permissão 'negotiations' (não exige 'stock.evaluate').
// Retorna apenas avaliações com result=APROVADO para seleção no wizard.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma }               from '@/lib/prisma'
import { requireModule }        from '@/lib/permissions'
import { handlePrismaError }    from '@/lib/prisma-errors'

export async function GET(req: NextRequest) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try { requireModule(session.user.role, 'negotiations') }
  catch { return NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }

  try {
    const { searchParams } = req.nextUrl
    const search  = searchParams.get('search')?.trim() ?? ''
    const unitId  = searchParams.get('unitId')  ?? ''
    const page    = Math.max(1, Number(searchParams.get('page') ?? 1))
    const take    = 20

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      // Aceita AMBOS os fluxos: legado (result=APROVADO) e novo (status=LIBERADA).
      // Avaliação só está pronta para uso em negociação quando o gerente já
      // precificou (evaluatedValue presente).
      AND: [
        {
          OR: [
            { result: 'APROVADO' },
            { status: 'LIBERADA' },
          ],
        },
        { evaluatedValue: { not: null, gt: 0 } },
      ],
    }

    // Isolamento por tenant:
    //  - MASTER (sem tenantId) vê tudo
    //  - Usuário com tenantId vê do próprio tenant E avaliações legacy com
    //    tenantId=null (criadas antes do multi-tenant ou pelo MASTER)
    if (session.user.tenantId) {
      where.AND.push({
        OR: [
          { tenantId: session.user.tenantId },
          { tenantId: null },
        ],
      })
    }

    // Filtro de unidade
    if (unitId) where.unitId = unitId
    else if (session.user.unitId && session.user.role === 'VENDEDOR') {
      where.unitId = session.user.unitId
    }

    // (Filtro de "não vinculado a deal ativo" removido — o relacionamento
    // vehicle.dealVehicles depende de o Vehicle já existir, o que NÃO
    // acontece mais antes da COMPRA ser finalizada. Avaliações LIBERADAS
    // e ainda não compradas ficam visíveis. Uma proteção adicional será
    // feita no momento de criar o DealVehicle, recusando avaliação que
    // já vire deal ativo.)

    if (search) {
      where.AND.push({
        OR: [
          { plate:      { contains: search, mode: 'insensitive' } },
          { brand:      { contains: search, mode: 'insensitive' } },
          { model:      { contains: search, mode: 'insensitive' } },
          { ownerName:  { contains: search, mode: 'insensitive' } },
          { ownerCpf:   { contains: search, mode: 'insensitive' } },
          { ownerPhone: { contains: search, mode: 'insensitive' } },
        ],
      })
    }

    const [data, total] = await Promise.all([
      prisma.vehicleEvaluation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip:    (page - 1) * take,
        take,
        select: {
          id:             true,
          plate:          true,
          brand:          true,
          model:          true,
          version:        true,
          manufactureYear:true,
          modelYear:      true,
          km:             true,
          color:          true,
          fuel:           true,
          evaluatedValue: true,
          fipeValue:      true,
          desiredValue:   true,
          suggestedSalePrice: true,
          minimumValue:   true,
          result:         true,
          intention:      true,
          ownerName:      true,
          ownerCpf:       true,
          ownerPhone:     true,
          evaluationNotes:true,
          pendencyNotes:  true,
          cautelarStatus: true,
          createdAt:      true,
          evaluatedAt:    true,
          evaluatedBy:    { select: { id: true, name: true } },
          unit:           { select: { id: true, name: true } },
        },
      }),
      prisma.vehicleEvaluation.count({ where }),
    ])

    return NextResponse.json({
      data,
      pagination: {
        page,
        total,
        totalPages: Math.ceil(total / take),
        limit: take,
      },
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
