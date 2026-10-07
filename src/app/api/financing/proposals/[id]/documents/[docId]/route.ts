// =============================================================================
// /api/financing/proposals/[id]/documents/[docId] — conferir / excluir documento.
//   PATCH  : status (APROVADO / REPROVADO / PENDENTE) e observação
//   DELETE : remove o item e o arquivo (só se ainda não aprovado)
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { updateDocumentSchema } from '@/lib/validators/financing'
import { DOC_STATUS_META, removeDocumentFile } from '@/lib/finance/fi/documents'
import { addTimeline } from '@/lib/finance/fi/events'
import { fiAuth, fiErrorResponse, findScopedProposal } from '@/lib/finance/fi/route'

type Ctx = { params: Promise<{ id: string; docId: string }> }
const notFound = () => NextResponse.json({ success: false, error: 'Documento não encontrado.' }, { status: 404 })

export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await fiAuth(req, { module: 'financing.manage', cap: 'acessarDocumentos' })
  if (!auth.ok) return auth.res
  const { id, docId } = await params
  try {
    if (!(await findScopedProposal(auth, id))) return notFound()
    const doc = await prisma.financeProposalDocument.findFirst({ where: { id: docId, proposalId: id, tenantId: auth.tenantId } })
    if (!doc) return notFound()
    const d = updateDocumentSchema.parse(await req.json())
    if (d.status === 'APROVADO' && !(doc.storageKey || doc.fileUrl)) return NextResponse.json({ success: false, error: 'Anexe o arquivo antes de aprovar o documento.' }, { status: 422 })
    const data: Record<string, unknown> = {}
    if (d.status !== undefined) data.status = d.status
    if (d.required !== undefined) data.required = d.required
    if (d.notes !== undefined) data.notes = d.notes ?? null
    await prisma.financeProposalDocument.update({ where: { id: docId }, data })
    if (d.status && d.status !== doc.status) {
      await addTimeline(prisma, { tenantId: auth.tenantId, proposalId: id, type: 'DOCUMENT', source: 'MANUAL', actorId: auth.user.id, message: `${doc.type}: ${DOC_STATUS_META[d.status]?.label ?? d.status}.` })
    }
    await createSafeAuditLog({ userId: auth.user.id, tenantId: auth.tenantId, action: 'UPDATE', entity: 'FinanceProposalDocument', entityId: docId, userName: auth.user.name, userRole: auth.user.role, afterData: data })
    return NextResponse.json({ success: true })
  } catch (err) { return fiErrorResponse(err) }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const auth = await fiAuth(req, { module: 'financing.manage', cap: 'acessarDocumentos' })
  if (!auth.ok) return auth.res
  const { id, docId } = await params
  try {
    if (!(await findScopedProposal(auth, id))) return notFound()
    const doc = await prisma.financeProposalDocument.findFirst({ where: { id: docId, proposalId: id, tenantId: auth.tenantId } })
    if (!doc) return notFound()
    if (doc.status === 'APROVADO') return NextResponse.json({ success: false, error: 'Documento aprovado não pode ser excluído.' }, { status: 409 })
    if (doc.storageKey || doc.fileUrl) await removeDocumentFile(docId)
    await prisma.financeProposalDocument.delete({ where: { id: docId } })
    await addTimeline(prisma, { tenantId: auth.tenantId, proposalId: id, type: 'DOCUMENT', source: 'MANUAL', actorId: auth.user.id, message: `${doc.type}: removido da lista.` })
    await createSafeAuditLog({ userId: auth.user.id, tenantId: auth.tenantId, action: 'DELETE', entity: 'FinanceProposalDocument', entityId: docId, userName: auth.user.name, userRole: auth.user.role })
    return NextResponse.json({ success: true })
  } catch (err) { return fiErrorResponse(err) }
}
