// =============================================================================
// POST /api/vehicles/evaluations/[id]/approve
// Aprova uma avaliação e cria o veículo correspondente no estoque
//
// Regras:
//   • Avaliação deve existir e pertencer ao tenant
//   • Se já tiver vehicleId, retorna 409 (já cadastrado)
//   • Cria Vehicle com origem rastreada pela avaliação
//   • Atualiza evaluation.vehicleId e result = APROVADO
//   • AuditLog registra ambas as ações
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  getSessionUser,
  assertTenantId,
  tenantWhere,
  unauthorizedResponse,
  forbiddenResponse,
  createSafeAuditLog,
} from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModule } from '@/lib/permissions'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'stock.manage')) {
    return forbiddenResponse('Apenas gerentes e administradores podem aprovar avaliações para o estoque.')
  }

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)

    const evaluation = await prisma.vehicleEvaluation.findFirst({
      where: { id: params.id, ...tenantWhere(user.role, tenantId) },
    })

    if (!evaluation) {
      return NextResponse.json(
        { success: false, error: 'Avaliação não encontrada.' },
        { status: 404 },
      )
    }

    if (evaluation.vehicleId) {
      return NextResponse.json(
        {
          success: false,
          error:   'Esta avaliação já gerou um veículo no estoque.',
          vehicleId: evaluation.vehicleId,
        },
        { status: 409 },
      )
    }

    // Valida dados mínimos obrigatórios
    if (!evaluation.brand?.trim() || !evaluation.model?.trim()) {
      return NextResponse.json(
        { success: false, error: 'A avaliação não possui marca e modelo preenchidos.' },
        { status: 400 },
      )
    }

    // Configurações adicionais do body (opcional)
    const body = await req.json().catch(() => ({}))
    const {
      stockStatus   = 'COMPRADO',
      stockType     = evaluation.stockType ?? 'PROPRIO',
      stockLocation,
      salePrice     = evaluation.suggestedSalePrice,
      purchasePrice = evaluation.evaluatedValue,
      unitId        = evaluation.unitId,
      notes,
    } = body

    // Cria o veículo em transação atômica
    const [vehicle] = await prisma.$transaction(async (tx) => {
      // 1. Cria o Vehicle
      const v = await tx.vehicle.create({
        data: {
          tenantId,
          originEvaluationId: evaluation.id,
          unitId:       unitId?.trim() || null,
          plate:        evaluation.plate?.toUpperCase()    || null,
          chassi:       evaluation.chassi?.toUpperCase()  || null,
          renavam:      evaluation.renavam                || null,
          brand:        String(evaluation.brand).trim(),
          model:        String(evaluation.model).trim(),
          version:      evaluation.version                || null,
          year:         evaluation.manufactureYear        ?? null,
          modelYear:    evaluation.modelYear              ?? null,
          km:           evaluation.km                     ?? null,
          color:        evaluation.color                  || null,
          fuel:         evaluation.fuel                   || null,
          transmission: evaluation.transmission           || null,
          doors:        evaluation.doors                  ?? null,
          vehicleType:  evaluation.vehicleType            ?? null,
          conditionType: evaluation.conditionType         ?? null,
          engine:       evaluation.engine                 || null,
          displacement: evaluation.displacement           || null,
          power:        evaluation.power                  || null,
          bodyType:     evaluation.bodyType               || null,
          fipeValue:    evaluation.fipeValue              ?? null,
          fipeCode:     evaluation.fipeCode               || null,
          fipeReferenceMonth: evaluation.fipeReferenceMonth || null,
          stockStatus:  stockStatus ?? 'COMPRADO',
          stockType:    stockType   ?? 'PROPRIO',
          stockLocation: stockLocation || null,
          salePrice:    salePrice     ?? null,
          purchasePrice: purchasePrice ?? null,
          notes:        notes?.trim() || evaluation.evaluationNotes || null,
          cautelarStatus: evaluation.cautelarStatus ?? 'SEM_CAUTELAR',
          cautelarNumber: evaluation.cautelarNumber  || null,
          cautelarNotes:  evaluation.cautelarNotes   || null,
          entryDate:    new Date(),
          active:       true,
        },
      })

      // 2. Vincula avaliação ao veículo criado e marca como aprovada
      await tx.vehicleEvaluation.update({
        where: { id: evaluation.id },
        data: {
          vehicleId: v.id,
          result:    'APROVADO',
        },
      })

      return [v]
    })

    // Audit logs
    await Promise.all([
      createSafeAuditLog({
        userId:   user.id,
        tenantId,
        action:   'CREATE',
        entity:   'Vehicle',
        entityId: vehicle.id,
        userName: user.name,
        userRole: user.role,
      }),
      createSafeAuditLog({
        userId:   user.id,
        tenantId,
        action:   'UPDATE',
        entity:   'VehicleEvaluation',
        entityId: evaluation.id,
        userName: user.name,
        userRole: user.role,
      }),
    ])

    return NextResponse.json(
      {
        success: true,
        message: 'Avaliação aprovada. Veículo cadastrado no estoque com sucesso.',
        data: { vehicleId: vehicle.id, evaluationId: evaluation.id },
      },
      { status: 201 },
    )
  } catch (err) {
    return handlePrismaError(err)
  }
}
