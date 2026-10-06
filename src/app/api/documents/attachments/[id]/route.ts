// =============================================================================
// DELETE /api/documents/attachments/[id] — exclusão DEFINITIVA: apaga o arquivo
// do armazenamento e depois a linha; registra no log de auditoria.
// Permissão de gestão do módulo dono (src/lib/documents/attachment-access.ts).
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { deletePrivateFile } from '@/lib/storage/private-files'
import { loadDocument } from './_load'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  try {
    const l = await loadDocument(id, 'delete')
    if ('error' in l) return l.error
    await deletePrivateFile(l.doc.storageKey)
    await prisma.documentAttachment.delete({ where: { id: l.doc.id } })
    await createSafeAuditLog({
      userId: l.user.id, tenantId: l.doc.tenantId, action: 'DELETE_PERMANENT', entity: 'DocumentAttachment', entityId: l.doc.id,
      beforeData: { entityType: l.doc.entityType, entityId: l.doc.entityId, docType: l.doc.docType, name: l.doc.name, size: l.doc.size, createdById: l.doc.createdById, createdAt: l.doc.createdAt },
      userName: l.user.name, userRole: l.user.role,
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
