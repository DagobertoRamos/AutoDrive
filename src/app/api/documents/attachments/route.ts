// =============================================================================
// /api/documents/attachments — documentos de qualquer registro (NF, boleto,
// comprovante, contrato, recibo, outros). Envio novo NUNCA substitui o anterior.
//   GET  ?entityType&entityId → { data: [...], canUpload, canDelete } (mais novo primeiro)
//   POST multipart: file, entityType, entityId, docType → { data }
// Regras de acesso por tipo: src/lib/documents/attachment-access.ts.
// Arquivo: GET /api/documents/attachments/[id]/file · exclusão: DELETE /api/documents/attachments/[id]
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { checkDocumentAccess, canDeleteDocuments } from '@/lib/documents/attachment-access'
import { isDocEntityType, normalizeDocType, documentView, MAX_DOCS_PER_ENTITY } from '@/lib/documents/attachment-types'
import { effectiveMime, savePrivateFile, validatePrivateFile } from '@/lib/storage/private-files'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bad = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status })

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  const url = new URL(req.url)
  const entityType = url.searchParams.get('entityType')
  const entityId = url.searchParams.get('entityId') ?? ''
  if (!isDocEntityType(entityType) || !entityId) return bad('Registro inválido.')
  try {
    const acc = await checkDocumentAccess(user, entityType, entityId, 'read')
    if (!acc.ok) return acc.error
    const rows = await prisma.documentAttachment.findMany({
      where: { entityType, entityId, ...(acc.tenantId ? { tenantId: acc.tenantId } : {}) },
      orderBy: { createdAt: 'desc' },
    })
    const ids = [...new Set(rows.map((r) => r.createdById).filter((x): x is string => !!x))]
    const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : []
    const names = new Map(users.map((u) => [u.id, u.name]))
    return NextResponse.json({
      success: true,
      data: rows.map((r) => documentView(r, r.createdById ? names.get(r.createdById) ?? null : null)),
      canUpload: (await checkDocumentAccess(user, entityType, entityId, 'write')).ok,
      canDelete: await canDeleteDocuments(user, entityType, entityId),
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  try {
    const form = await req.formData().catch(() => null)
    if (!form) return bad('Envie o arquivo.')
    const entityType = form.get('entityType')
    const entityId = String(form.get('entityId') ?? '')
    if (!isDocEntityType(entityType) || !entityId) return bad('Registro inválido.')
    const file = form.get('file')
    if (!(file instanceof File)) return bad('Envie o arquivo.')
    const mime = effectiveMime(file.type, file.name)
    const invalid = validatePrivateFile(mime, file.size)
    if (invalid) return bad(invalid)

    const acc = await checkDocumentAccess(user, entityType, entityId, 'write')
    if (!acc.ok) return acc.error
    const count = await prisma.documentAttachment.count({ where: { entityType, entityId } })
    if (count >= MAX_DOCS_PER_ENTITY) return bad(`Limite de ${MAX_DOCS_PER_ENTITY} documentos por registro.`)

    const docType = normalizeDocType(form.get('docType'))
    const folder = `docs/${acc.tenantId ?? 'global'}/${entityType.toLowerCase()}/${entityId}`
    const saved = await savePrivateFile(folder, file.name, mime, Buffer.from(await file.arrayBuffer()))
    const row = await prisma.documentAttachment.create({
      data: { tenantId: acc.tenantId, entityType, entityId, docType, name: saved.name, storageKey: saved.key, mimeType: mime, size: file.size, createdById: user.id },
    })
    await createSafeAuditLog({
      userId: user.id, tenantId: acc.tenantId, action: 'ATTACH', entity: 'DocumentAttachment', entityId: row.id,
      afterData: { entityType, entityId, docType, name: row.name, size: row.size }, userName: user.name, userRole: user.role,
    })
    return NextResponse.json({ success: true, data: documentView(row, user.name ?? null) }, { status: 201 })
  } catch (err) {
    console.error('[documents/attachments]', err)
    return handlePrismaError(err)
  }
}
