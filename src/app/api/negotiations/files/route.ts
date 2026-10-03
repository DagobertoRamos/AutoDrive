// GET /api/negotiations/files?key=<storageKey> — abre um anexo da negociação
// guardado no armazenamento privado (comprovantes, contratos assinados…).
// Confere o acesso: anexo vinculado → precisa enxergar a negociação; comprovante
// ainda não vinculado (enviado no modal de pagamento) → só a própria loja.
import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireModule } from '@/lib/permissions'
import { buildNegotiationAccessWhere } from '@/lib/negotiation-access'
import { BLOB_PREFIX, pendingFolder, readDealFile } from '@/lib/negotiation/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getServerAuthSession()
  if (!session) return new NextResponse('Não autenticado', { status: 401 })
  try { requireModule(session.user.role, 'negotiations') } catch {
    try { requireModule(session.user.role, 'finance') } catch { return new NextResponse('Sem permissão', { status: 403 }) }
  }
  const key = req.nextUrl.searchParams.get('key') ?? ''
  if (!key.startsWith(BLOB_PREFIX) || key.includes('..')) return new NextResponse('Arquivo inválido', { status: 400 })

  const pending = session.user.tenantId ? `${BLOB_PREFIX}${pendingFolder(session.user.tenantId)}` : null
  let fileName = 'arquivo'
  if (!(pending && key.startsWith(pending))) {
    const att = await prisma.dealAttachment.findFirst({ where: { storageKey: key }, select: { dealId: true, fileName: true } })
    if (!att) return new NextResponse('Arquivo não encontrado', { status: 404 })
    const ok = await prisma.deal.findFirst({ where: await buildNegotiationAccessWhere(session.user, { id: att.dealId }), select: { id: true } })
    if (!ok) return new NextResponse('Sem acesso a este arquivo', { status: 403 })
    fileName = att.fileName
  }
  const file = await readDealFile(key).catch(() => null)
  if (!file) return new NextResponse('Arquivo não encontrado no armazenamento', { status: 404 })
  return new NextResponse(file.stream as unknown as BodyInit, {
    headers: { 'Content-Type': file.contentType, 'Content-Disposition': `inline; filename="${fileName.replace(/"/g, '')}"`, 'Cache-Control': 'private, max-age=300' },
  })
}
