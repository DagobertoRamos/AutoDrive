// =============================================================================
// /api/financing/proposals/[id]/documents — checklist de documentos da ficha.
//   GET  : financing (read) — documentos + exigidos por perfil + pendências
//   POST : financing.manage — adiciona um documento, ou semeia os obrigatórios
//          ({ seedRequired: true }) a partir da config da loja + perfil.
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { addDocumentSchema } from '@/lib/validators/financing'
import { zodErrorResponse, ownsTenant } from '@/lib/finance/finance-service'
import { requiredDocsForProfile, pendingRequiredDocs, type RequiredDocsConfig } from '@/lib/finance/proposal-service'
import { assertModuleEnabled } from '@/lib/tenant-modules'

type Ctx = { params: Promise<{ id: string }> }
const notFound = () => NextResponse.json({ success: false, error: 'Ficha não encontrada.' }, { status: 404 })

async function loadConfig(tenantId: string): Promise<RequiredDocsConfig> {
  const row = await prisma.financeTenantSetting.findUnique({ where: { tenantId_key: { tenantId, key: 'required_documents' } } })
  return (row?.value as RequiredDocsConfig) ?? {}
}

export async function GET(_req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing')) return forbiddenResponse('Sem acesso ao financiamento.')
  { const gate = await assertModuleEnabled(user, 'financing'); if (gate) return gate }
  const { id } = await params
  try {
    const proposal = await prisma.financeProposal.findUnique({ where: { id }, include: { proponent: { select: { occupation: true } } } })
    if (!proposal) return notFound()
    if (!ownsTenant(user.role, user.tenantId, proposal.tenantId)) return forbiddenResponse('Ficha de outro tenant.')

    const documents = await prisma.financeProposalDocument.findMany({ where: { proposalId: id }, orderBy: { createdAt: 'asc' } })
    const requiredNames = proposal.tenantId ? requiredDocsForProfile(await loadConfig(proposal.tenantId), proposal.proponent?.occupation ?? null) : []
    const pending = pendingRequiredDocs(requiredNames, documents.map((d) => ({ type: d.type, status: d.status })))
    return NextResponse.json({ success: true, data: { documents, requiredNames, pending } })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing.manage')) return forbiddenResponse('Sem permissão.')
  { const gate = await assertModuleEnabled(user, 'financing'); if (gate) return gate }
  const { id } = await params
  try {
    const proposal = await prisma.financeProposal.findUnique({ where: { id }, include: { proponent: { select: { occupation: true } } } })
    if (!proposal) return notFound()
    if (!ownsTenant(user.role, user.tenantId, proposal.tenantId)) return forbiddenResponse('Ficha de outro tenant.')
    const tenantId = proposal.tenantId ?? user.tenantId
    if (!tenantId) return forbiddenResponse('Ficha sem loja vinculada.')

    const body = await req.json().catch(() => ({}))

    // Semeia os documentos obrigatórios ainda ausentes.
    if (body?.seedRequired === true) {
      const existing = await prisma.financeProposalDocument.findMany({ where: { proposalId: id }, select: { type: true } })
      const have = new Set(existing.map((d) => d.type.trim().toLowerCase()))
      const required = requiredDocsForProfile(await loadConfig(tenantId), proposal.proponent?.occupation ?? null)
      const toCreate = required.filter((name) => !have.has(name.trim().toLowerCase()))
      if (toCreate.length) {
        await prisma.financeProposalDocument.createMany({
          data: toCreate.map((type) => ({ tenantId, proposalId: id, proponentId: proposal.proponentId, type, required: true, status: 'PENDENTE', createdById: user.id })),
        })
        await createSafeAuditLog({ userId: user.id, tenantId, action: 'SEED_DOCS', entity: 'FinanceProposal', entityId: id, userName: user.name, userRole: user.role })
      }
      return NextResponse.json({ success: true, created: toCreate.length })
    }

    // Adiciona um documento avulso.
    const d = addDocumentSchema.parse(body)
    const doc = await prisma.financeProposalDocument.create({
      data: { tenantId, proposalId: id, proponentId: proposal.proponentId, type: d.type, required: d.required, status: d.status, notes: d.notes ?? null, createdById: user.id },
    })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'CREATE', entity: 'FinanceProposalDocument', entityId: doc.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: { id: doc.id } }, { status: 201 })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
