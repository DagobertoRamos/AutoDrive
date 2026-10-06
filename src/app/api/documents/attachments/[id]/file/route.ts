// GET /api/documents/attachments/[id]/file — abre o documento (inline), autenticado.
import { NextResponse } from 'next/server'
import { loadDocument } from '../_load'
import { readPrivateFile } from '@/lib/storage/private-files'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const l = await loadDocument(id, 'read')
  if ('error' in l) return l.error
  const file = await readPrivateFile(l.doc.storageKey).catch(() => null)
  if (!file) return NextResponse.json({ success: false, error: 'Arquivo não encontrado no armazenamento.' }, { status: 404 })
  const stored = l.doc.mimeType || file.contentType
  // XML (NF-e) abre como texto: nunca é interpretado pelo navegador.
  const type = /xml/i.test(stored) ? 'text/plain; charset=utf-8' : stored
  const name = encodeURIComponent(l.doc.name)
  return new NextResponse(file.body as unknown as BodyInit, {
    headers: {
      'Content-Type': type,
      'Content-Disposition': `inline; filename="${l.doc.name.replace(/[^\w.\-]/g, '_')}"; filename*=UTF-8''${name}`,
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
