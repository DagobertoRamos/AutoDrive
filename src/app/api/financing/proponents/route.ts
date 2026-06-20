// =============================================================================
// /api/financing/proponents — proponentes de financiamento. Multi-tenant.
//   GET  : financing (read; busca ?q= por nome/cpf/email/celular)
//   POST : financing.manage
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, assertTenantId, tenantWhere, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { createProponentSchema } from '@/lib/validators/financing'
import { zodErrorResponse, num } from '@/lib/finance/finance-service'
import { assertModuleEnabled } from '@/lib/tenant-modules'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing')) return forbiddenResponse('Sem acesso ao financiamento.')
  { const gate = await assertModuleEnabled(user, 'financing'); if (gate) return gate }

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)
    const { searchParams } = new URL(req.url)
    const extra: Record<string, unknown> = {}
    const q = searchParams.get('q')?.trim()
    if (q) {
      extra.OR = [
        { nomeCompleto: { contains: q, mode: 'insensitive' } },
        { cpf: { contains: q.replace(/\D/g, '') } },
        { email: { contains: q, mode: 'insensitive' } },
        { celular: { contains: q.replace(/\D/g, '') } },
      ]
    }
    const data = await prisma.financeProponent.findMany({
      where: tenantWhere(user.role, tenantId, extra) as never,
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        id: true, nomeCompleto: true, cpf: true, celular: true, email: true,
        occupation: true, cidade: true, estado: true, renda: true, createdAt: true,
        _count: { select: { proposals: true } },
      },
    })
    return NextResponse.json({ success: true, data: data.map((p) => ({ ...p, renda: num(p.renda), proposals: p._count.proposals })) })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing.manage')) return forbiddenResponse('Sem permissão para cadastrar proponentes.')
  { const gate = await assertModuleEnabled(user, 'financing'); if (gate) return gate }

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)
    const d = createProponentSchema.parse(await req.json())
    const proponent = await prisma.financeProponent.create({
      data: {
        tenantId,
        nomeCompleto: d.nomeCompleto, dataNascimento: d.dataNascimento, cpf: d.cpf, rg: d.rg,
        nomeMae: d.nomeMae, nomePai: d.nomePai, email: d.email, celular: d.celular, telefoneFixo: d.telefoneFixo ?? null,
        cep: d.cep, logradouro: d.logradouro, bairro: d.bairro, cidade: d.cidade, estado: d.estado,
        numero: d.numero, complemento: d.complemento ?? null,
        occupation: d.occupation, cargo: d.cargo ?? null, renda: d.renda ?? null,
        outrasRendas: d.outrasRendas as never, numeroBeneficio: d.numeroBeneficio ?? null,
        empresaNome: d.empresaNome ?? null, empresaCnpj: d.empresaCnpj ?? null, empresaTelefone: d.empresaTelefone ?? null,
        empresaCep: d.empresaCep ?? null, empresaLogradouro: d.empresaLogradouro ?? null, empresaBairro: d.empresaBairro ?? null,
        empresaCidade: d.empresaCidade ?? null, empresaEstado: d.empresaEstado ?? null, empresaNumero: d.empresaNumero ?? null,
        empresaComplemento: d.empresaComplemento ?? null, notes: d.notes ?? null, createdById: user.id,
      },
    })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'CREATE', entity: 'FinanceProponent', entityId: proponent.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: proponent }, { status: 201 })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
