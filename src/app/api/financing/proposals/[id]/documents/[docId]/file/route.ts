// =============================================================================
// /api/financing/proposals/[id]/documents/[docId]/file — arquivo do documento.
//   POST   : financing.manage — anexa/substitui o arquivo (multipart/form-data).
//   DELETE : financing.manage — remove o arquivo (mantém a linha do checklist).
// Tenant-scoped, auditado. Whitelist de MIME + limite de tamanho.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { ownsTenant } from '@/lib/finance/finance-service'
import { validateDocUpload, saveFinanceDoc, deleteFinanceDoc } from '@/lib/finance/doc-storage'

export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string; docId: string }> }
const notFound = () => NextResponse.json({ success: false, error: 'Documento não encontrado.' }, { status: 404 })

async function guard(docId: string, proposalId: string, userTenantId: string | null | undefined, role: string) {
  const doc = await prisma.financeProposalDocument.findUnique({ where: { id: docId } })
  if (!doc || doc.proposalId !== proposalId) return { error: notFound(), doc: null }
  if (!ownsTenant(role, userTenantId, doc.tenantId)) return { error: forbiddenResponse('Documento de outro tenant.'), doc: null }
  return { error: null, doc }
}

export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing.manage')) return forbiddenResponse('Sem permissão.')
  const { id, docId } = await params
  try {
    const g = await guard(docId, id, user.tenantId, user.role)
    if (g.error) return g.error

    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return NextResponse.json({ success: false, error: 'Arquivo ausente.' }, { status: 400 })
    const v = validateDocUpload(file.type, file.size)
    if (!v.ok) return NextResponse.json({ success: false, error: v.error }, { status: 400 })

    const bytes = Buffer.from(await file.arrayBuffer())
    const saved = await saveFinanceDoc(id, file.name, file.type, bytes)
    // Substitui arquivo anterior, se houver.
    if (g.doc.fileUrl) await deleteFinanceDoc(g.doc.fileUrl)

    await prisma.financeProposalDocument.update({ where: { id: docId }, data: { fileUrl: saved.publicUrl, fileName: saved.fileName } })
    await createSafeAuditLog({ userId: user.id, tenantId: g.doc.tenantId, action: 'UPLOAD', entity: 'FinanceProposalDocument', entityId: docId, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: { fileUrl: saved.publicUrl, fileName: saved.fileName } })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing.manage')) return forbiddenResponse('Sem permissão.')
  const { id, docId } = await params
  try {
    const g = await guard(docId, id, user.tenantId, user.role)
    if (g.error) return g.error
    if (g.doc.fileUrl) await deleteFinanceDoc(g.doc.fileUrl)
    await prisma.financeProposalDocument.update({ where: { id: docId }, data: { fileUrl: null, fileName: null } })
    await createSafeAuditLog({ userId: user.id, tenantId: g.doc.tenantId, action: 'UPLOAD_REMOVE', entity: 'FinanceProposalDocument', entityId: docId, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
