// =============================================================================
// /api/financing/proposals/[id]/documents/[docId]/file — arquivo do documento.
//   GET    : abre o arquivo (rota autenticada; nunca URL pública)
//   POST   : anexa/substitui (multipart, campo "file") — armazenamento privado
//   DELETE : remove o arquivo (mantém o item na lista)
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { attachDocumentFile, DocError, openDocumentFile, removeDocumentFile } from '@/lib/finance/fi/documents'
import { fiAuth, fiErrorResponse, findScopedProposal } from '@/lib/finance/fi/route'

export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string; docId: string }> }
const notFound = () => NextResponse.json({ success: false, error: 'Documento não encontrado.' }, { status: 404 })

async function load(req: Request, id: string, docId: string, write: boolean) {
  const auth = await fiAuth(req, { module: write ? 'financing.manage' : 'financing', cap: 'acessarDocumentos' })
  if (!auth.ok) return { res: auth.res }
  if (!(await findScopedProposal(auth, id))) return { res: notFound() }
  const doc = await prisma.financeProposalDocument.findFirst({ where: { id: docId, proposalId: id, tenantId: auth.tenantId } })
  if (!doc) return { res: notFound() }
  return { auth, doc }
}

export async function GET(req: Request, { params }: Ctx) {
  const { id, docId } = await params
  try {
    const l = await load(req, id, docId, false)
    if (!l.doc) return l.res
    const f = await openDocumentFile(l.doc)
    if (!f) return NextResponse.json({ success: false, error: 'Arquivo não encontrado.' }, { status: 404 })
    await createSafeAuditLog({ userId: l.auth.user.id, tenantId: l.auth.tenantId, action: 'VIEW', entity: 'FinanceProposalDocument', entityId: docId, userName: l.auth.user.name, userRole: l.auth.user.role })
    return new NextResponse(f.body as BodyInit, {
      headers: { 'Content-Type': f.contentType, 'Content-Disposition': `inline; filename="${encodeURIComponent(f.fileName)}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
    })
  } catch (err) { return fiErrorResponse(err) }
}

export async function POST(req: Request, { params }: Ctx) {
  const { id, docId } = await params
  try {
    const l = await load(req, id, docId, true)
    if (!l.doc) return l.res
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return NextResponse.json({ success: false, error: 'Escolha o arquivo.' }, { status: 400 })
    const r = await attachDocumentFile(docId, file, 'INTERNO', l.auth.user.id)
    await createSafeAuditLog({ userId: l.auth.user.id, tenantId: l.auth.tenantId, action: 'UPLOAD', entity: 'FinanceProposalDocument', entityId: docId, userName: l.auth.user.name, userRole: l.auth.user.role })
    return NextResponse.json({ success: true, data: r })
  } catch (err) {
    if (err instanceof DocError) return NextResponse.json({ success: false, error: err.message }, { status: err.status })
    return fiErrorResponse(err)
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id, docId } = await params
  try {
    const l = await load(req, id, docId, true)
    if (!l.doc) return l.res
    if (l.doc.status === 'APROVADO') return NextResponse.json({ success: false, error: 'Documento aprovado: recuse antes de trocar o arquivo.' }, { status: 409 })
    await removeDocumentFile(docId)
    await createSafeAuditLog({ userId: l.auth.user.id, tenantId: l.auth.tenantId, action: 'UPLOAD_REMOVE', entity: 'FinanceProposalDocument', entityId: docId, userName: l.auth.user.name, userRole: l.auth.user.role })
    return NextResponse.json({ success: true })
  } catch (err) { return fiErrorResponse(err) }
}
