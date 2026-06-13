// =============================================================================
// GET /api/integrations/plate/[plate]
//
// Proxy seguro à integração de placa. Hoje:
//   1) Se houver credencial PLATE_LOOKUP cuja apiUrl aponta para wdapi2 / apiplacas,
//      usa o cliente especializado (retorna fipeOptions + bestFipe).
//   2) Caso contrário, cai no fluxo legado (AuthorizedPlateProvider genérico).
//
// Resposta normalizada inclui:
//   { ok, found, source, data: { ...vehicle, fipeOptions, bestFipe } }
// =============================================================================

import { NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { lookupPlate, isAnyPlateProviderConfigured } from '@/lib/plate-lookup/service'
import { logIntegrationCall } from '@/lib/brasilapi/audit'
import { consultPlate, isPlacasConfigured } from '@/lib/integrations/placas/client'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  ctxArg: { params: { plate: string } | Promise<{ plate: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401 })

  const plate = String(params.plate ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (plate.length < 6) {
    return NextResponse.json({ ok: false, found: false, error: 'Placa inválida.' }, { status: 400 })
  }

  // ── Caminho 1: API Placas (wdapi2) ────────────────────────────────────────
  if (await isPlacasConfigured()) {
    const r = await consultPlate(plate)
    logIntegrationCall({
      tenantId: session.user.tenantId,
      userId:   session.user.id,
      userName: session.user.name,
      userRole: session.user.role,
      endpoint: 'plateLookup:wdapi2',
      argument: plate,
      ok:       r.success,
      message:  r.errorMessage,
    })
    if (!r.success) {
      return NextResponse.json(
        { ok: false, found: false, source: 'wdapi2', error: r.errorMessage, httpStatus: r.httpStatus },
        { status: r.httpStatus || 502 },
      )
    }
    return NextResponse.json({
      ok:     true,
      found:  true,
      source: 'wdapi2',
      data: {
        plate:           r.plate,
        brand:           r.brand,
        model:           r.model,
        version:         r.version,
        manufactureYear: r.manufactureYear,
        modelYear:       r.modelYear,
        color:           r.color,
        fuel:            r.fuel,
        chassi:          r.chassi,
        city:            r.city,
        state:           r.state,
        origin:          r.origin,
        situation:       r.situation,
        logoUrl:         r.logoUrl,
        fipeCode:        r.bestFipe?.codigoFipe,
        fipeValue:       r.bestFipe?.valor,
        fipeReferenceMonth: r.bestFipe?.mesReferencia,
        fipeOptions:     r.fipeOptions,
        bestFipe:        r.bestFipe,
      },
    })
  }

  // ── Caminho 2: provider genérico legado ───────────────────────────────────
  if (!(await isAnyPlateProviderConfigured())) {
    return NextResponse.json(
      {
        ok:         false,
        configured: false,
        error:      'Nenhuma integração de placa configurada. Cadastre uma credencial em /master/integrations.',
      },
      { status: 503 },
    )
  }

  const result = await lookupPlate(plate)
  logIntegrationCall({
    tenantId: session.user.tenantId,
    userId:   session.user.id,
    userName: session.user.name,
    userRole: session.user.role,
    endpoint: 'plateLookup',
    argument: plate,
    ok:       result.ok,
    message:  result.error,
  })

  if (!result.ok) {
    const status = result.error?.includes('inválida') ? 400
                 : result.error?.includes('não encontrada') ? 404
                 : result.error?.includes('Credencial')      ? 502
                 : 502
    return NextResponse.json({ ok: false, found: false, source: result.source, error: result.error }, { status })
  }

  return NextResponse.json({
    ok:        true,
    found:     result.found,
    source:    result.source,
    data:      result.data,
  })
}
