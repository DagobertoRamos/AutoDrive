// =============================================================================
// /api/settings/store — Configuração da Loja (dados do PRÓPRIO tenant do ADM)
//   GET : retorna os dados cadastrais da loja do usuário logado.
//   PUT : atualiza APENAS campos cadastrais seguros do tenant.
// O ADM edita só a própria loja. Campos de CONTRATO (plano, status, trial,
// limites, slug) são exclusivos do MASTER (painel Master › Tenants).
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError, z } from 'zod'
import { prisma } from '@/lib/prisma'
import {
  getSessionUser,
  unauthorizedResponse,
  forbiddenResponse,
  createSafeAuditLog,
} from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'

// Campos cadastrais que o ADM pode editar na própria loja.
const storeSchema = z.object({
  nomeFantasia:           z.string().max(160).nullish(),
  razaoSocial:            z.string().max(160).nullish(),
  cnpj:                   z.string().max(20).nullish(),
  inscricaoEstadual:      z.string().max(30).nullish(),
  isentoInscricaoEstadual:z.boolean().optional(),
  logradouro:             z.string().max(160).nullish(),
  numero:                 z.string().max(20).nullish(),
  complemento:            z.string().max(80).nullish(),
  bairro:                 z.string().max(80).nullish(),
  city:                   z.string().max(80).nullish(),
  state:                  z.string().max(40).nullish(),
  zipCode:                z.string().max(12).nullish(),
  phone:                  z.string().max(20).nullish(),
  email:                  z.string().email('E-mail inválido.').max(160).nullish().or(z.literal('')),
  responsavel:            z.string().max(120).nullish(),
  responsavelEmail:       z.string().max(160).nullish(),
  responsavelPhone:       z.string().max(20).nullish(),
  slogan:                 z.string().max(160).nullish(),
})

const SELECT = {
  id: true, publicId: true, slug: true, name: true, razaoSocial: true, nomeFantasia: true,
  cnpj: true, inscricaoEstadual: true, isentoInscricaoEstadual: true, logradouro: true,
  numero: true, complemento: true, bairro: true, city: true, state: true, zipCode: true,
  phone: true, email: true, responsavel: true, responsavelEmail: true, responsavelPhone: true,
  slogan: true, plan: true, status: true,
} as const

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'settings')) return forbiddenResponse('Sem acesso à configuração da loja.')

  try {
    const tenantId = await resolveActingTenant(user, req)
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: actingTenantError(user) },
        { status: 400 },
      )
    }
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: SELECT })
    if (!tenant) return NextResponse.json({ success: false, error: 'Loja não encontrada.' }, { status: 404 })
    return NextResponse.json({ success: true, data: tenant })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function PUT(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'settings')) return forbiddenResponse('Sem permissão para editar a loja.')

  try {
    const tenantId = await resolveActingTenant(user, req)
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: actingTenantError(user) },
        { status: 400 },
      )
    }

    const data = storeSchema.parse(await req.json())

    // name comercial = nomeFantasia || razaoSocial (mantém compatibilidade).
    const name =
      (data.nomeFantasia && data.nomeFantasia.trim()) ||
      (data.razaoSocial && data.razaoSocial.trim()) ||
      undefined

    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...data,
        email: data.email === '' ? null : data.email,
        ...(name ? { name } : {}),
      },
      select: SELECT,
    })

    await createSafeAuditLog({
      userId:   user.id,
      tenantId,
      action:   'UPDATE',
      entity:   'Tenant',
      entityId: tenantId,
      userName: user.name,
      userRole: user.role,
    })

    return NextResponse.json({ success: true, data: tenant })
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { success: false, error: err.errors[0]?.message ?? 'Dados inválidos.', issues: err.errors },
        { status: 400 },
      )
    }
    return handlePrismaError(err)
  }
}
