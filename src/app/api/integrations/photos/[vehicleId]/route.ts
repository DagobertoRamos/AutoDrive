// =============================================================================
// /api/integrations/photos/[vehicleId] — ciclo do tratamento de um veículo.
// Auth: header `x-autoconf-token`.
//   POST { acao: 'iniciar' }   → EM_TRATAMENTO + trava (galeria não muda)
//   POST { acao: 'restaurar' } → volta as fotos de antes, destrava, ORIGEM
//   PUT  { fotos: [url…] }     → publica as tratadas (já enviadas por /upload),
//                                na ordem, 1ª = principal; TRATADA + trava
// =============================================================================

import { NextResponse } from 'next/server'
import { studioFinish, studioRestore, studioStart } from '@/lib/integrations/photo-studio'
import { studioErrorResponse, tenantFromToken } from '@/lib/integrations/photo-studio-http'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ vehicleId: string }> }

export async function POST(req: Request, ctx: Ctx) {
  const tenant = await tenantFromToken(req)
  if (tenant instanceof NextResponse) return tenant
  const { vehicleId } = await ctx.params
  const body = (await req.json().catch(() => ({}))) as { acao?: unknown }
  try {
    if (body.acao === 'iniciar') return NextResponse.json({ success: true, ...(await studioStart(tenant, vehicleId)) })
    if (body.acao === 'restaurar') return NextResponse.json({ success: true, ...(await studioRestore(tenant, vehicleId)) })
    return NextResponse.json({ success: false, error: "acao deve ser 'iniciar' ou 'restaurar'." }, { status: 400 })
  } catch (err) {
    return studioErrorResponse(err)
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  const tenant = await tenantFromToken(req)
  if (tenant instanceof NextResponse) return tenant
  const { vehicleId } = await ctx.params
  const body = (await req.json().catch(() => ({}))) as { fotos?: unknown }
  try {
    return NextResponse.json({ success: true, ...(await studioFinish(tenant, vehicleId, body.fotos)) })
  } catch (err) {
    return studioErrorResponse(err)
  }
}
