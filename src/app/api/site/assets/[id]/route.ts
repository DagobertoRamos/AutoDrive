// GET /api/site/assets/[id] — arquivo público do site da loja (logo, favicon…).
// Imutável (trocar a logo gera outro id) → cache longo. Cabeçalhos impedem que
// o navegador interprete o arquivo como outra coisa que não imagem.
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[a-z0-9]{10,40}$/i.test(id)) return new NextResponse('Não encontrado', { status: 404 })
  const asset = await prisma.siteAsset.findUnique({ where: { id }, select: { data: true, mimeType: true, sha256: true } }).catch(() => null)
  if (!asset) return new NextResponse('Não encontrado', { status: 404 })
  const body = new Uint8Array(asset.data)
  return new NextResponse(body, {
    headers: {
      'Content-Type': asset.mimeType,
      'Content-Length': String(body.length),
      'Cache-Control': 'public, max-age=31536000, immutable',
      ETag: `"${asset.sha256}"`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  })
}
