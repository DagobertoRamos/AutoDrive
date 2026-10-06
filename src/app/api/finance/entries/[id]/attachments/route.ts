// =============================================================================
// /api/finance/entries/[id]/attachments — anexos do lançamento (boleto, NF, comprovante).
//   GET  : finance        → { data: [{ id, name, mimeType, size, createdAt, openUrl }] }
//   POST : finance.manage → multipart `file` (PDF/imagem/XML até 4 MB) + `docType` opcional → { data: attachment }
// Arquivo abre por GET /api/finance/entries/[id]/attachments/[attId] (autenticado).
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { financeGuard } from '@/lib/finance/access'
import { bad, entryAccessError } from '@/app/api/finance/center/entries/_lib/shared'
import { saveAttachmentFile, validateAttachment } from './_storage'
import { effectiveMime } from '@/lib/storage/private-files'
import { isDocType } from '@/lib/documents/attachment-types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

const view = (entryId: string, a: { id: string; name: string; docType: string | null; mimeType: string | null; size: number | null; createdAt: Date }) => ({
  id: a.id, name: a.name, docType: a.docType, mimeType: a.mimeType, size: a.size, createdAt: a.createdAt,
  openUrl: `/api/finance/entries/${entryId}/attachments/${a.id}`,
})

export async function GET(req: Request, { params }: Ctx) {
  const g = await financeGuard('finance', req)
  if (g.error) return g.error
  const { id } = await params
  try {
    const e = await prisma.financialEntry.findUnique({ where: { id }, select: { tenantId: true, employeeUserId: true } })
    const denied = await entryAccessError(e, g)
    if (denied) return denied
    const rows = await prisma.financialEntryAttachment.findMany({ where: { entryId: id }, orderBy: { createdAt: 'asc' } })
    return NextResponse.json({ success: true, data: rows.map((a) => view(id, a)) })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const g = await financeGuard('finance.manage', req)
  if (g.error) return g.error
  const { id } = await params
  try {
    const e = await prisma.financialEntry.findUnique({ where: { id }, select: { tenantId: true, employeeUserId: true } })
    const denied = await entryAccessError(e, g)
    if (denied) return denied
    const form = await req.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) return bad('Envie o arquivo.')
    const mime = effectiveMime(file.type, file.name)
    const invalid = validateAttachment(mime, file.size)
    if (invalid) return bad(invalid)
    const rawDocType = form?.get('docType')
    const docType = isDocType(rawDocType) ? rawDocType : null
    if ((await prisma.financialEntryAttachment.count({ where: { entryId: id } })) >= 20) return bad('Limite de 20 anexos por lançamento.')
    const saved = await saveAttachmentFile(g.tenantId, id, file.name, mime, Buffer.from(await file.arrayBuffer()))
    const att = await prisma.financialEntryAttachment.create({
      data: { entryId: id, tenantId: g.tenantId, name: saved.name, url: saved.key, docType, mimeType: mime, size: file.size, createdById: g.user.id },
    })
    await createSafeAuditLog({ userId: g.user.id, tenantId: g.tenantId, action: 'ATTACH', entity: 'FinancialEntry', entityId: id, userName: g.user.name, userRole: g.user.role })
    return NextResponse.json({ success: true, data: view(id, att) }, { status: 201 })
  } catch (err) {
    console.error('[finance/attachments]', err)
    return handlePrismaError(err)
  }
}
