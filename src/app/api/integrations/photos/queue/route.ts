// =============================================================================
// GET /api/integrations/photos/queue — fila de tratamento de fotos (estúdio)
// para a extensão do Chrome. Auth: header `x-autoconf-token`.
// Query: limite (1–300, padrão 5), situacao (ORIGEM | EM_TRATAMENTO | TRATADA —
//        esta última devolve a galeria publicada, para a auditoria),
//        origem (PARCEIRO | PROPRIO | PARTICULAR ou nome da loja parceira).
// Cada veículo vem com placa, ano, km, opcionais, laudo, loja de origem e as
// fotos da origem já sem a arte da loja (logotipo, capa de marketing).
// =============================================================================

import { NextResponse } from 'next/server'
import { studioQueue, PHOTO_STATUS, type PhotoStatusName } from '@/lib/integrations/photo-studio'
import { studioErrorResponse, tenantFromToken } from '@/lib/integrations/photo-studio-http'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const tenant = await tenantFromToken(req)
  if (tenant instanceof NextResponse) return tenant
  const sp = new URL(req.url).searchParams
  const limit = Math.min(Math.max(parseInt(sp.get('limite') ?? '5', 10) || 5, 1), 300)
  const wanted = (sp.get('situacao') ?? 'ORIGEM').toUpperCase()
  if (!(PHOTO_STATUS as readonly string[]).includes(wanted)) {
    return NextResponse.json({ success: false, error: 'situacao deve ser ORIGEM, EM_TRATAMENTO ou TRATADA.' }, { status: 400 })
  }
  try {
    const data = await studioQueue(tenant, { limit, status: wanted as PhotoStatusName, origin: sp.get('origem')?.trim() ?? '' })
    return NextResponse.json({ success: true, ...data })
  } catch (err) {
    return studioErrorResponse(err)
  }
}
