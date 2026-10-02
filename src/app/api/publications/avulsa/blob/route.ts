// /api/publications/avulsa/blob — vídeo do Post avulso direto do navegador para o
// armazenamento de arquivos (Vercel Blob), sem passar pelo banco nem pelo limite
// de 4,5 MB por requisição da Vercel.
//   GET  → { enabled, folder, mode }  (armazenamento ligado? pasta da loja)
//   POST → protocolo do @vercel/blob/client:
//     • armazenamento novo (BLOB_STORE_ID + autenticação automática da Vercel):
//       URL pré-assinada só para aquele arquivo, só vídeo, até 300 MB;
//     • armazenamento antigo (chave BLOB_READ_WRITE_TOKEN): token de envio.
// O vídeo é apagado depois de publicado (ou cancelado) e, se o envio for
// abandonado, pela limpeza da rotina após 3 dias.
import { NextResponse } from 'next/server'
import { issueSignedToken } from '@vercel/blob'
import { handleUpload, handleUploadPresigned, type HandleUploadBody, type HandleUploadPresignedBody } from '@vercel/blob/client'
import { bad, pubAuth } from '@/lib/publications/api'
import { blobFolder, MAX_BLOB_VIDEO_BYTES } from '@/lib/publications/social/avulsa-core'
import { blobMode, blobToken } from '@/lib/publications/social/blob-token'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const a = await pubAuth(req, 'marketing.publications.prepare')
  if (a instanceof NextResponse) return a
  const mode = blobMode()
  return NextResponse.json({ success: true, enabled: !!mode, mode, folder: blobFolder(a.tenantId), ...(mode ? {} : { reason: 'O armazenamento de vídeos (Vercel Blob) não está ligado ao ambiente de Produção. Em Storage › Blob › Connect, marque Production e faça um novo deploy.' }) })
}

export async function POST(req: Request) {
  const a = await pubAuth(req, 'marketing.publications.prepare')
  if (a instanceof NextResponse) return a
  const mode = blobMode()
  if (!mode) return bad('Armazenamento de vídeos não configurado.', 503)
  const body = (await req.json().catch(() => null)) as (HandleUploadBody | HandleUploadPresignedBody) | null
  if (!body) return bad('Pedido inválido.')
  const folder = blobFolder(a.tenantId)
  const check = (pathname: string) => { if (!pathname.startsWith(folder) || pathname.includes('..')) throw new Error('Pasta inválida.') }
  const validUntil = Date.now() + 2 * 3600_000
  try {
    if (mode === 'presigned') {
      const r = await handleUploadPresigned({
        body: body as HandleUploadPresignedBody, request: req,
        getSignedToken: async (pathname) => {
          check(pathname)
          const token = await issueSignedToken({ pathname, operations: ['put'], allowedContentTypes: ['video/*'], maximumSizeInBytes: MAX_BLOB_VIDEO_BYTES, validUntil })
          return { token, urlOptions: { allowedContentTypes: ['video/*'], maximumSizeInBytes: MAX_BLOB_VIDEO_BYTES, validUntil } }
        },
      })
      return NextResponse.json(r)
    }
    const r = await handleUpload({
      body: body as HandleUploadBody, request: req, token: blobToken(),
      onBeforeGenerateToken: async (pathname) => {
        check(pathname)
        return { allowedContentTypes: ['video/*'], maximumSizeInBytes: MAX_BLOB_VIDEO_BYTES, validUntil }
      },
    })
    return NextResponse.json(r)
  } catch (e) {
    console.error('[avulsa/blob]', e)
    return bad(`Não foi possível autorizar o envio do vídeo: ${(e as Error).message}`.slice(0, 300), 400)
  }
}
