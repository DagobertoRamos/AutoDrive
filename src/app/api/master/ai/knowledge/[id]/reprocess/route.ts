// =============================================================================
// /api/master/ai/knowledge/[id]/reprocess — re-chunk da base de conhecimento.
// Quebra o conteúdo em chunks (AiKnowledgeChunk) para uso futuro pela IA.
// Chunking simples por parágrafos/tamanho — sem embedding nesta fase.
// MASTER-only, auditado.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'

type Ctx = { params: Promise<{ id: string }> }
const MAX_CHARS = 1200

function chunkText(text: string): string[] {
  const clean = (text || '').replace(/\r\n/g, '\n').trim()
  if (!clean) return []
  const paras = clean.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  const out: string[] = []
  let buf = ''
  for (const p of paras) {
    if ((buf + '\n\n' + p).length > MAX_CHARS && buf) { out.push(buf); buf = p }
    else buf = buf ? `${buf}\n\n${p}` : p
    while (buf.length > MAX_CHARS) { out.push(buf.slice(0, MAX_CHARS)); buf = buf.slice(MAX_CHARS) }
  }
  if (buf) out.push(buf)
  return out.slice(0, 500)
}

export async function POST(_req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'master.ai')) return forbiddenResponse('Área exclusiva do MASTER.')
  const { id } = await params
  try {
    const kb = await prisma.aiKnowledgeBase.findUnique({ where: { id } })
    if (!kb || kb.tenantId !== null) return NextResponse.json({ success: false, error: 'Base não encontrada.' }, { status: 404 })
    const chunks = chunkText(kb.content ?? '')

    await prisma.$transaction([
      prisma.aiKnowledgeChunk.deleteMany({ where: { knowledgeBaseId: id } }),
      ...chunks.map((chunkText, i) => prisma.aiKnowledgeChunk.create({ data: { knowledgeBaseId: id, tenantId: null, chunkText, chunkIndex: i } })),
    ])
    await createSafeAuditLog({ userId: user.id, action: 'REPROCESS', entity: 'AiKnowledgeBase', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, chunks: chunks.length })
  } catch (err) {
    return handlePrismaError(err)
  }
}
