// =============================================================================
// /api/financing/proponents/[id] — ver / editar / excluir proponente.
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { updateProponentSchema } from '@/lib/validators/financing'
import { zodErrorResponse, ownsTenant, num } from '@/lib/finance/finance-service'

type Ctx = { params: Promise<{ id: string }> }
const notFound = () => NextResponse.json({ success: false, error: 'Proponente não encontrado.' }, { status: 404 })

export async function GET(_req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing')) return forbiddenResponse('Sem acesso ao financiamento.')
  const { id } = await params

  try {
    const p = await prisma.financeProponent.findUnique({ where: { id } })
    if (!p) return notFound()
    if (!ownsTenant(user.role, user.tenantId, p.tenantId)) return forbiddenResponse('Proponente de outro tenant.')
    return NextResponse.json({ success: true, data: { ...p, renda: p.renda == null ? null : num(p.renda) } })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing.manage')) return forbiddenResponse('Sem permissão.')
  const { id } = await params

  try {
    const existing = await prisma.financeProponent.findUnique({ where: { id } })
    if (!existing) return notFound()
    if (!ownsTenant(user.role, user.tenantId, existing.tenantId)) return forbiddenResponse('Proponente de outro tenant.')

    const d = updateProponentSchema.parse(await req.json())
    const proponent = await prisma.financeProponent.update({
      where: { id },
      data: {
        nomeCompleto: d.nomeCompleto, dataNascimento: d.dataNascimento, cpf: d.cpf, rg: d.rg,
        nomeMae: d.nomeMae, nomePai: d.nomePai, email: d.email, celular: d.celular, telefoneFixo: d.telefoneFixo ?? null,
        cep: d.cep, logradouro: d.logradouro, bairro: d.bairro, cidade: d.cidade, estado: d.estado,
        numero: d.numero, complemento: d.complemento ?? null,
        occupation: d.occupation, cargo: d.cargo ?? null, renda: d.renda ?? null,
        outrasRendas: d.outrasRendas as never, numeroBeneficio: d.numeroBeneficio ?? null,
        empresaNome: d.empresaNome ?? null, empresaCnpj: d.empresaCnpj ?? null, empresaTelefone: d.empresaTelefone ?? null,
        empresaCep: d.empresaCep ?? null, empresaLogradouro: d.empresaLogradouro ?? null, empresaBairro: d.empresaBairro ?? null,
        empresaCidade: d.empresaCidade ?? null, empresaEstado: d.empresaEstado ?? null, empresaNumero: d.empresaNumero ?? null,
        empresaComplemento: d.empresaComplemento ?? null, notes: d.notes ?? null,
      },
    })
    await createSafeAuditLog({ userId: user.id, tenantId: existing.tenantId, action: 'UPDATE', entity: 'FinanceProponent', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: proponent })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing.manage')) return forbiddenResponse('Sem permissão.')
  const { id } = await params

  try {
    const existing = await prisma.financeProponent.findUnique({ where: { id } })
    if (!existing) return notFound()
    if (!ownsTenant(user.role, user.tenantId, existing.tenantId)) return forbiddenResponse('Proponente de outro tenant.')
    await prisma.financeProponent.delete({ where: { id } })
    await createSafeAuditLog({ userId: user.id, tenantId: existing.tenantId, action: 'DELETE', entity: 'FinanceProponent', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
