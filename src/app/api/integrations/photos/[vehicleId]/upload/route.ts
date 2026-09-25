// =============================================================================
// POST /api/integrations/photos/[vehicleId]/upload — guarda UMA foto tratada.
// Auth: header `x-autoconf-token`. Corpo: multipart `file` (JPG, PNG ou WebP,
// até 4 MB — a extensão converte para WebP antes). A foto ainda NÃO entra na
// galeria: só vai ao ar no PUT de /api/integrations/photos/[vehicleId].
// =============================================================================

import { NextResponse } from 'next/server'
import { ImageRejected } from '@/lib/site/assets'
import { studioUpload } from '@/lib/integrations/photo-studio'
import { studioErrorResponse, tenantFromToken } from '@/lib/integrations/photo-studio-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BYTES = 4 * 1024 * 1024
type Ctx = { params: Promise<{ vehicleId: string }> }

export async function POST(req: Request, ctx: Ctx) {
  const tenant = await tenantFromToken(req)
  if (tenant instanceof NextResponse) return tenant
  const { vehicleId } = await ctx.params
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof Blob) || file.size === 0) return NextResponse.json({ success: false, error: 'Nenhuma foto enviada (campo file).' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ success: false, error: `Foto de ${(file.size / 1024 / 1024).toFixed(1)} MB; o limite é 4 MB.` }, { status: 413 })
  try {
    return NextResponse.json({ success: true, ...(await studioUpload(tenant, vehicleId, new Uint8Array(await file.arrayBuffer()))) }, { status: 201 })
  } catch (err) {
    if (err instanceof ImageRejected) return NextResponse.json({ success: false, error: 'Formato não aceito: envie JPG, PNG ou WebP.' }, { status: 415 })
    return studioErrorResponse(err)
  }
}
