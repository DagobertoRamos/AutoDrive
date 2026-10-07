// =============================================================================
// /api/financing/proposals/[id]/documents — documentos da ficha.
//   GET  : lista + exigidos pela loja + pendências (arquivo só pela rota /file)
//   POST : adiciona um documento pedido, ou semeia os obrigatórios ({ seedRequired: true })
// Acesso a documentos pessoais exige a permissão "Acessar documentos".
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { addDocumentSchema } from '@/lib/validators/financing'
import { requiredDocsForProfile, pendingRequiredDocs, type RequiredDocsConfig } from '@/lib/finance/proposal-service'
import { DOC_STATUS_META } from '@/lib/finance/fi/documents'
import { addTimeline } from '@/lib/finance/fi/events'
import { fiAuth, fiErrorResponse, findScopedProposal, notFoundFicha } from '@/lib/finance/fi/route'

type Ctx = { params: Promise<{ id: string }> }

async function loadConfig(tenantId: string): Promise<RequiredDocsConfig> {
  const row = await prisma.financeTenantSetting.findUnique({ where: { tenantId_key: { tenantId, key: 'required_documents' } } })
  return (row?.value as RequiredDocsConfig) ?? {}
}

export async function GET(req: Request, { params }: Ctx) {
  const auth = await fiAuth(req, { cap: 'acessarDocumentos' })
  if (!auth.ok) return auth.res
  const { id } = await params
  try {
    const proposal = await findScopedProposal(auth, id)
    if (!proposal) return notFoundFicha()
    const occ = await prisma.financeProponent.findUnique({ where: { id: proposal.proponentId }, select: { occupation: true } })
    const documents = await prisma.financeProposalDocument.findMany({ where: { proposalId: id }, orderBy: { createdAt: 'asc' } })
    const requiredNames = requiredDocsForProfile(await loadConfig(auth.tenantId), occ?.occupation ?? null)
    const pending = pendingRequiredDocs(requiredNames, documents.map((d) => ({ type: d.type, status: d.status })))
    return NextResponse.json({
      success: true,
      data: {
        documents: documents.map((d) => ({
          id: d.id, type: d.type, status: d.status, statusLabel: DOC_STATUS_META[d.status]?.label ?? d.status, required: d.required,
          notes: d.notes, fileName: d.fileName, hasFile: !!(d.storageKey || d.fileUrl), source: d.source, uploadedAt: d.uploadedAt, extracted: d.extracted,
        })),
        requiredNames, pending,
      },
    })
  } catch (err) { return fiErrorResponse(err) }
}

export async function POST(req: Request, { params }: Ctx) {
  const auth = await fiAuth(req, { module: 'financing.manage', cap: 'acessarDocumentos' })
  if (!auth.ok) return auth.res
  const { id } = await params
  try {
    const proposal = await findScopedProposal(auth, id)
    if (!proposal) return notFoundFicha()
    const body = await req.json().catch(() => ({}))
    if (body?.seedRequired === true) {
      const occ = await prisma.financeProponent.findUnique({ where: { id: proposal.proponentId }, select: { occupation: true } })
      const existing = await prisma.financeProposalDocument.findMany({ where: { proposalId: id }, select: { type: true } })
      const have = new Set(existing.map((d) => d.type.trim().toLowerCase()))
      const required = requiredDocsForProfile(await loadConfig(auth.tenantId), occ?.occupation ?? null)
      const toCreate = required.filter((name) => !have.has(name.trim().toLowerCase()))
      if (toCreate.length) {
        await prisma.financeProposalDocument.createMany({
          data: toCreate.map((type) => ({ tenantId: auth.tenantId, proposalId: id, proponentId: proposal.proponentId, type, required: true, status: 'PENDENTE', source: 'INTERNO', createdById: auth.user.id })),
        })
        await createSafeAuditLog({ userId: auth.user.id, tenantId: auth.tenantId, action: 'SEED_DOCS', entity: 'FinanceProposal', entityId: id, userName: auth.user.name, userRole: auth.user.role })
      }
      return NextResponse.json({ success: true, created: toCreate.length })
    }
    const d = addDocumentSchema.parse(body)
    const dup = await prisma.financeProposalDocument.findFirst({ where: { proposalId: id, type: { equals: d.type, mode: 'insensitive' }, status: { not: 'REPROVADO' } }, select: { id: true } })
    if (dup) return NextResponse.json({ success: false, error: 'Este documento já está na lista.' }, { status: 409 })
    const doc = await prisma.financeProposalDocument.create({
      data: { tenantId: auth.tenantId, proposalId: id, proponentId: proposal.proponentId, type: d.type, required: d.required, status: 'PENDENTE', notes: d.notes ?? null, source: 'INTERNO', createdById: auth.user.id },
    })
    await addTimeline(prisma, { tenantId: auth.tenantId, proposalId: id, type: 'DOCUMENT', source: 'MANUAL', actorId: auth.user.id, message: `${d.type}: documento solicitado.` })
    await createSafeAuditLog({ userId: auth.user.id, tenantId: auth.tenantId, action: 'CREATE', entity: 'FinanceProposalDocument', entityId: doc.id, userName: auth.user.name, userRole: auth.user.role })
    return NextResponse.json({ success: true, data: { id: doc.id } }, { status: 201 })
  } catch (err) { return fiErrorResponse(err) }
}
