// =============================================================================
// POST /api/site/fi-portal/[token]/documents/[docId] — cliente envia documento
// pelo link seguro (multipart, campo "file"). Só documentos pendentes/recusados
// DESTA ficha. Limite por ficha (no banco, vale em serverless).
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { findByPortalToken } from '@/lib/finance/fi/orchestrator'
import { attachDocumentFile, DocError } from '@/lib/finance/fi/documents'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_UPLOADS_PER_HOUR = 30

export async function POST(req: Request, { params }: { params: Promise<{ token: string; docId: string }> }) {
  const { token, docId } = await params
  const p = await findByPortalToken(token)
  if (!p) return NextResponse.json({ success: false, error: 'Link inválido ou vencido. Peça um novo link à loja.' }, { status: 404 })
  const recent = await prisma.financeProposalEvent.count({ where: { proposalId: p.id, source: 'PORTAL', type: 'DOCUMENT', createdAt: { gte: new Date(Date.now() - 3_600_000) } } })
  if (recent >= MAX_UPLOADS_PER_HOUR) return NextResponse.json({ success: false, error: 'Muitos envios em pouco tempo. Tente de novo mais tarde.' }, { status: 429 })
  const doc = await prisma.financeProposalDocument.findFirst({ where: { id: docId, proposalId: p.id }, select: { id: true, status: true } })
  if (!doc) return NextResponse.json({ success: false, error: 'Documento não encontrado.' }, { status: 404 })
  if (doc.status !== 'PENDENTE' && doc.status !== 'REPROVADO') return NextResponse.json({ success: false, error: 'Este documento já foi recebido.' }, { status: 409 })
  try {
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return NextResponse.json({ success: false, error: 'Escolha o arquivo.' }, { status: 400 })
    await attachDocumentFile(docId, file, 'PORTAL', null)
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof DocError) return NextResponse.json({ success: false, error: err.message }, { status: err.status })
    console.error('[fi/portal] upload', err instanceof Error ? err.message : err)
    return NextResponse.json({ success: false, error: 'Não foi possível enviar agora. Tente de novo.' }, { status: 500 })
  }
}
