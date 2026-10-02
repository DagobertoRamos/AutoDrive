// GET /api/negotiations/[id]/documents/[documentId]/print — o documento numa
// página própria (A4), com botão "Imprimir / salvar PDF" — imprime só o
// documento, não a tela do sistema.
import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireModule } from '@/lib/permissions'
import { buildNegotiationAccessWhere } from '@/lib/negotiation-access'
import { printablePage } from '@/lib/negotiation/contracts/documents-core'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, ctx: { params: { id: string; documentId: string } | Promise<{ id: string; documentId: string }> }) {
  const { id, documentId } = await Promise.resolve(ctx.params)
  const session = await getServerAuthSession()
  if (!session) return new NextResponse('Não autenticado', { status: 401 })
  try { requireModule(session.user.role, 'negotiations') } catch { return new NextResponse('Sem permissão', { status: 403 }) }
  const deal = await prisma.deal.findFirst({ where: await buildNegotiationAccessWhere(session.user, { id }), select: { id: true } })
  if (!deal) return new NextResponse('Negociação não encontrada', { status: 404 })
  const doc = await prisma.dealDocument.findFirst({ where: { id: documentId, dealId: id }, select: { name: true, bodyHtml: true } })
  if (!doc?.bodyHtml) return new NextResponse('Documento não encontrado', { status: 404 })
  return new NextResponse(printablePage(doc.name, doc.bodyHtml), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' } })
}
