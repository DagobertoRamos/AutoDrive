// =============================================================================
// /api/finance/entries/[id]/attachments/[attId]
//   GET    : finance        → abre o arquivo (inline)
//   DELETE : finance.manage → remove o anexo e o arquivo
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { financeGuard } from '@/lib/finance/access'
import { bad, entryAccessError } from '@/app/api/finance/center/entries/_lib/shared'
import { deleteAttachmentFile, readAttachmentFile } from '../_storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string; attId: string }> }

async function load(req: Request, perm: 'finance' | 'finance.manage', id: string, attId: string) {
  const g = await financeGuard(perm, req)
  if (g.error) return { error: g.error }
  const e = await prisma.financialEntry.findUnique({ where: { id }, select: { tenantId: true, employeeUserId: true } })
  const denied = await entryAccessError(e, g)
  if (denied) return { error: denied }
  const att = await prisma.financialEntryAttachment.findFirst({ where: { id: attId, entryId: id } })
  if (!att) return { error: bad('Anexo não encontrado.', 404) }
  return { g, att }
}

export async function GET(req: Request, { params }: Ctx) {
  const { id, attId } = await params
  const l = await load(req, 'finance', id, attId)
  if (l.error) return l.error
  const file = await readAttachmentFile(l.att.url).catch(() => null)
  if (!file) return bad('Arquivo não encontrado no armazenamento.', 404)
  const stored = l.att.mimeType || file.contentType
  const type = /xml/i.test(stored) ? 'text/plain; charset=utf-8' : stored // XML abre como texto
  return new NextResponse(file.body as unknown as BodyInit, {
    headers: { 'Content-Type': type, 'Content-Disposition': `inline; filename="${l.att.name.replace(/"/g, '')}"`, 'Cache-Control': 'private, max-age=300' },
  })
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id, attId } = await params
  const l = await load(req, 'finance.manage', id, attId)
  if (l.error) return l.error
  try {
    await prisma.financialEntryAttachment.delete({ where: { id: attId } })
    await deleteAttachmentFile(l.att.url)
    await createSafeAuditLog({ userId: l.g.user.id, tenantId: l.g.tenantId, action: 'DETACH', entity: 'FinancialEntry', entityId: id, userName: l.g.user.name, userRole: l.g.user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
