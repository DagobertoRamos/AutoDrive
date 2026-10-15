// =============================================================================
// /api/financing/proponents/[id] — ver / editar / excluir proponente da loja
// ativa. CPF/CNPJ, RG e renda só inteiros para quem pode acessar documentos (LGPD).
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { updateProponentSchema } from '@/lib/validators/financing'
import { zodErrorResponse, num } from '@/lib/finance/finance-service'
import { identityLockError } from '@/lib/identity-lock'
import { fiAuth } from '@/lib/finance/fi/route'
import { isFiAllowed } from '@/lib/finance/fi-permissions'
import { maskDoc } from '@/lib/finance/fi/read-model'

type Ctx = { params: Promise<{ id: string }> }
const notFound = () => NextResponse.json({ success: false, error: 'Proponente não encontrado.' }, { status: 404 })

export async function GET(req: Request, { params }: Ctx) {
  const auth = await fiAuth(req)
  if (!auth.ok) return auth.res
  const { id } = await params

  try {
    const p = await prisma.financeProponent.findFirst({ where: { id, tenantId: auth.tenantId } })
    if (!p) return notFound()
    const full = await isFiAllowed(auth.tenantId, 'acessarDocumentos', auth.user.role)
    if (!full) return NextResponse.json({ success: true, data: { ...p, cpf: maskDoc(p.cpf), cnpj: maskDoc(p.cnpj), rg: null, renda: null } })
    return NextResponse.json({ success: true, data: { ...p, renda: p.renda == null ? null : num(p.renda) } })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await fiAuth(req, { module: 'financing.manage', cap: 'editarFicha' })
  if (!auth.ok) return auth.res
  const { user } = auth
  const { id } = await params

  try {
    const existing = await prisma.financeProponent.findFirst({ where: { id, tenantId: auth.tenantId } })
    if (!existing) return notFound()

    const d = updateProponentSchema.parse(await req.json())
    { const lockErr = identityLockError(user.role, existing as unknown as Record<string, unknown>, d as Record<string, unknown>); if (lockErr) return NextResponse.json({ success: false, error: lockErr }, { status: 403 }) }
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

export async function DELETE(req: Request, { params }: Ctx) {
  const auth = await fiAuth(req, { module: 'financing.manage', cap: 'editarFicha' })
  if (!auth.ok) return auth.res
  const { user } = auth
  const { id } = await params

  try {
    const existing = await prisma.financeProponent.findFirst({ where: { id, tenantId: auth.tenantId } })
    if (!existing) return notFound()
    // Com fichas (como cliente ou co-comprador) não apaga: o histórico do F&I fica preservado.
    const used = await prisma.financeProposal.count({ where: { OR: [{ proponentId: id }, { coProponentId: id }] } })
    if (used) return NextResponse.json({ success: false, error: 'Este cliente tem fichas de financiamento. Não é possível excluir.' }, { status: 409 })
    await prisma.financeProponent.delete({ where: { id } })
    await createSafeAuditLog({ userId: user.id, tenantId: existing.tenantId, action: 'DELETE', entity: 'FinanceProponent', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
