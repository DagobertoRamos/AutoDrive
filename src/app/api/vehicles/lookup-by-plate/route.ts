// =============================================================================
// GET /api/vehicles/lookup-by-plate?plate=ABC1D23[&refresh=true]
// Consulta segura de dados veiculares por placa — NUNCA expõe API keys
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModule } from '@/lib/permissions'
import { normalizePlate, isValidPlate } from '@/lib/vehicles/plate'
import { lookupVehicleByPlate } from '@/lib/vehicle-lookup'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { consultPlate, isPlacasConfigured } from '@/lib/integrations/placas/client'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'stock.evaluate')) return forbiddenResponse('Sem permissão para consultar veículos.')

  try {
    const { searchParams } = new URL(req.url)
    const rawPlate    = searchParams.get('plate') ?? ''
    const forceRefresh = searchParams.get('refresh') === 'true'

    if (!rawPlate.trim()) {
      return NextResponse.json(
        { success: false, error: 'Placa é obrigatória.' },
        { status: 400 },
      )
    }

    const plate = normalizePlate(rawPlate)

    if (!isValidPlate(plate)) {
      return NextResponse.json(
        { success: false, error: 'Placa inválida. Formatos aceitos: ABC-1234 (antiga) ou ABC1D23 (Mercosul).' },
        { status: 400 },
      )
    }

    // Audit log assíncrono — não bloqueia a resposta
    const tenantId = user.tenantId ?? 'MASTER'
    createSafeAuditLog({
      userId:   user.id,
      tenantId,
      action:   'READ',
      entity:   'VehicleLookup',
      entityId: plate,
      userName: user.name,
      userRole: user.role,
    }).catch(() => {})

    // ── Caminho preferencial: API Placas (wdapi2) ─────────────────────────
    // Quando a credencial PLATE_LOOKUP estiver configurada apontando para
    // wdapi2/apiplacas, usamos o cliente especializado que devolve fipeOptions
    // + bestFipe já selecionado por score.
    if (await isPlacasConfigured()) {
      const r = await consultPlate(plate)
      if (r.success) {
        return NextResponse.json({
          success: true,
          found:   true,
          source:  'wdapi2',
          data: {
            plate:           r.plate,
            brand:           r.brand,
            model:           r.model,
            version:         r.version,
            manufactureYear: r.manufactureYear,
            modelYear:       r.modelYear,
            color:           r.color,
            fuel:            r.fuel,
            transmission:    r.transmission,
            bodyType:        r.bodyType,
            doors:           r.doors,
            displacement:    r.displacement,
            power:           r.power,
            chassi:          r.chassi,
            city:            r.city,
            state:           r.state,
            origin:          r.origin,
            situation:       r.situation,
            logoUrl:         r.logoUrl,
            fipeCode:           r.bestFipe?.codigoFipe,
            fipeValue:          r.bestFipe?.valor,
            fipeReferenceMonth: r.bestFipe?.mesReferencia,
            fipeOptions:        r.fipeOptions,
            bestFipe:           r.bestFipe,
          },
        })
      }
      // Em erro do wdapi2, propaga a mensagem (placa inválida / sem saldo /
      // não encontrada / rate limit) em vez de cair silenciosamente no
      // provider legado — o usuário vê o motivo real.
      // Para 406 (placa não encontrada) retornamos HTTP 200 com `found: false`
      // e `message` (lido pelo PlateInput como override da mensagem amigável).
      if (r.httpStatus === 406) {
        return NextResponse.json({
          success: true,
          found:   false,
          source:  'wdapi2',
          message: 'Placa não encontrada na base da API Placas. Preencha manualmente.',
        })
      }
      return NextResponse.json(
        {
          success:   false,
          found:     false,
          source:    'wdapi2',
          error:     r.errorMessage,
          message:   r.errorMessage,
          httpStatus: r.httpStatus,
        },
        { status: r.httpStatus || 502 },
      )
    }

    // ── Fallback: provider legado (BrasilAPI/PlateLookup/etc.) ──────────────
    const result = await lookupVehicleByPlate(plate, forceRefresh)

    // Remove payload raw da resposta (já removido pelo orquestrador, mas garantia dupla)
    if (result.data?.raw) {
      const { raw: _, ...safeData } = result.data
      result.data = safeData
    }

    return NextResponse.json(result)
  } catch (err) {
    return handlePrismaError(err)
  }
}
