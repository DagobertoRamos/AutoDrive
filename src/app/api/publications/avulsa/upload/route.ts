// POST /api/publications/avulsa/upload?kind=image                   corpo = a foto (até 4 MB; o navegador reduz antes)
// POST /api/publications/avulsa/upload?kind=video&uploadId=&index=  corpo = um pedaço do vídeo (até 3,5 MB)
import { NextResponse } from 'next/server'
import { bad, pubAuth } from '@/lib/publications/api'
import { ImageRejected, storeTenantImage } from '@/lib/site/assets'
import { PART_BYTES, MAX_VIDEO_BYTES } from '@/lib/publications/social/avulsa-core'
import { storeVideoPart } from '@/lib/publications/social/avulsa'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  const a = await pubAuth(req, 'marketing.publications.prepare')
  if (a instanceof NextResponse) return a
  const sp = new URL(req.url).searchParams
  const bytes = new Uint8Array(await req.arrayBuffer())
  if (!bytes.length) return bad('Arquivo vazio.')
  try {
    if (sp.get('kind') === 'video') {
      const uploadId = sp.get('uploadId') ?? ''; const index = Number(sp.get('index'))
      if (!/^[a-zA-Z0-9-]{8,64}$/.test(uploadId) || !Number.isInteger(index) || index < 0 || index >= Math.ceil(MAX_VIDEO_BYTES / PART_BYTES)) return bad('Pedaço inválido.')
      if (bytes.length > PART_BYTES + 1024) return bad('Pedaço grande demais.')
      await storeVideoPart(a.tenantId, uploadId, index, bytes)
      return NextResponse.json({ success: true })
    }
    if (bytes.length > 4_200_000) return bad('Foto grande demais (até 4 MB).')
    const r = await storeTenantImage(a.tenantId, 'SOCIAL_UPLOAD', bytes)
    return NextResponse.json({ success: true, assetId: r.id, url: r.url, width: r.width, height: r.height })
  } catch (e) {
    if (e instanceof ImageRejected) return bad(e.message)
    console.error('[avulsa/upload]', e)
    // Motivo curto (sem dados da loja) para dar para entender o que houve.
    const why = String((e as { code?: string }).code ?? (e as Error).message ?? '').replace(/\s+/g, ' ').slice(0, 140)
    return bad(`Não foi possível guardar o arquivo${why ? ` (${why})` : ''}.`, 500)
  }
}
