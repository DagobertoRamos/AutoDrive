// /api/publications/avulsa/blob — vídeo do Post avulso direto do navegador para o
// armazenamento de arquivos (Vercel Blob), sem passar pelo banco nem pelo limite
// de 4,5 MB por requisição da Vercel.
//   GET  → { enabled, folder }  (armazenamento ligado? pasta da loja)
//   POST → protocolo do @vercel/blob/client (gera a autorização de envio só para
//          a pasta avulsa/<loja>/, só vídeo, até 300 MB).
// O vídeo é apagado depois de publicado (ou cancelado) e, se o envio for
// abandonado, pela limpeza da rotina após 3 dias.
import { NextResponse } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { bad, pubAuth } from '@/lib/publications/api'
import { blobFolder, MAX_BLOB_VIDEO_BYTES } from '@/lib/publications/social/avulsa-core'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const a = await pubAuth(req, 'marketing.publications.prepare')
  if (a instanceof NextResponse) return a
  return NextResponse.json({ success: true, enabled: !!process.env.BLOB_READ_WRITE_TOKEN, folder: blobFolder(a.tenantId) })
}

export async function POST(req: Request) {
  const a = await pubAuth(req, 'marketing.publications.prepare')
  if (a instanceof NextResponse) return a
  if (!process.env.BLOB_READ_WRITE_TOKEN) return bad('Armazenamento de vídeos não configurado.', 503)
  const body = (await req.json().catch(() => null)) as HandleUploadBody | null
  if (!body) return bad('Pedido inválido.')
  try {
    const r = await handleUpload({
      body, request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(blobFolder(a.tenantId)) || pathname.includes('..')) throw new Error('Pasta inválida.')
        return { allowedContentTypes: ['video/*'], maximumSizeInBytes: MAX_BLOB_VIDEO_BYTES, addRandomSuffix: true, validUntil: Date.now() + 2 * 3600_000 }
      },
    })
    return NextResponse.json(r)
  } catch (e) {
    return bad(`Não foi possível autorizar o envio do vídeo: ${(e as Error).message}`.slice(0, 300), 400)
  }
}
