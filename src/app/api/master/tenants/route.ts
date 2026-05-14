// =============================================================================
// /api/master/tenants — Listar e criar tenants (MASTER only)
//
// POST: cria Tenant + Unit principal + TenantPartner(s) + User ADM
//       em uma única transação Prisma. Rollback total se qualquer etapa falhar.
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { normalizeCNPJ, isValidCNPJ } from '@/lib/br-docs/cnpj'
import { normalizeCPF, isValidCPF } from '@/lib/br-docs/cpf'
import { normalizeCEP } from '@/lib/br-docs/cep'
import { normalizePhone } from '@/lib/br-docs/phone'
import bcrypt from 'bcryptjs'

// ── Helpers ───────────────────────────────────────────────────────────────────

function generatePublicId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let id = 'AD-'
  for (let i = 0; i < 10; i++) id += chars[Math.floor(Math.random() * chars.length)]
  return id
}

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
}

// ── GET — Listar tenants ─────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getServerAuthSession()
  if (!session || session.user.role !== 'MASTER') {
    return NextResponse.json(
      { success: false, error: 'Acesso negado. Apenas usuários MASTER podem listar tenants.' },
      { status: 403 },
    )
  }

  const { searchParams } = req.nextUrl
  const search = searchParams.get('search')?.trim() ?? ''
  const plan   = searchParams.get('plan')?.trim()   ?? ''
  const status = searchParams.get('status')?.trim() ?? ''
  const page   = Math.max(1, Number(searchParams.get('page') ?? 1))
  const limit  = Math.min(500, Math.max(1, Number(searchParams.get('limit') ?? 20)))

  const where: Record<string, unknown> = {}

  if (search) {
    where.OR = [
      { name:             { contains: search, mode: 'insensitive' } },
      { razaoSocial:      { contains: search, mode: 'insensitive' } },
      { nomeFantasia:     { contains: search, mode: 'insensitive' } },
      { publicId:         { contains: search, mode: 'insensitive' } },
      { cnpj:             { contains: search } },
      { email:            { contains: search, mode: 'insensitive' } },
    ]
  }
  if (plan)   where.plan   = plan
  if (status) where.status = status

  try {
    const [total, tenants] = await Promise.all([
      prisma.tenant.count({ where: where as never }),
      prisma.tenant.findMany({
        where:   where as never,
        orderBy: { createdAt: 'desc' },
        skip:    (page - 1) * limit,
        take:    limit,
        select: {
          id:               true,
          publicId:         true,
          slug:             true,
          name:             true,
          razaoSocial:      true,
          nomeFantasia:     true,
          cnpj:             true,
          plan:             true,
          status:           true,
          statusReason:     true,
          primaryColor:     true,
          phone:            true,
          email:            true,
          city:             true,
          state:            true,
          trialEndsAt:      true,
          maxUsers:         true,
          maxVehicles:      true,
          maxUnits:         true,
          createdAt:        true,
          _count: {
            select: { users: true, units: true, deals: true, partners: true },
          },
        },
      }),
    ])

    return NextResponse.json({
      success:    true,
      data:       tenants,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}

// ── POST — Criar tenant completo ──────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getServerAuthSession()
  if (!session || session.user.role !== 'MASTER') {
    return NextResponse.json(
      { success: false, error: 'Acesso negado. Apenas usuários MASTER podem criar tenants.' },
      { status: 403 },
    )
  }

  try {
    const body = await req.json()

    // ── Desestrutura payload ─────────────────────────────────────────────────
    const { company, partners: rawPartners, plan: planConfig } = body as {
      company: {
        cnpj:                    string
        razaoSocial:             string
        nomeFantasia?:           string
        inscricaoEstadual?:      string
        isentoInscricaoEstadual?: boolean
        situacaoCadastral?:      string
        dataAbertura?:           string
        cnaeCode?:               string
        telefone?:               string
        email?:                  string
        address: {
          cep:          string
          logradouro:   string
          numero:       string
          complemento?: string
          bairro:       string
          cidade:       string
          estado:       string
        }
      }
      partners: Array<{
        cpf:            string
        nomeCompleto:   string
        rg?:            string
        celular?:       string
        email:          string
        dataNascimento?: string
        role?:          string
        participacao?:  number
        principal?:     boolean
        address?: {
          cep?:          string
          logradouro?:   string
          numero?:       string
          complemento?:  string
          bairro?:       string
          cidade?:       string
          estado?:       string
        }
      }>
      plan: {
        tenantPlan:    string
        tenantStatus?: string
        modules?:      string[]
        limits?: {
          maxUsers?:    number
          maxVehicles?: number
          maxUnits?:    number
        }
        trialEndsAt?: string
      }
    }

    // ── Validações básicas ───────────────────────────────────────────────────

    if (!company?.cnpj || !company?.razaoSocial?.trim()) {
      return NextResponse.json(
        { success: false, error: 'CNPJ e razão social são obrigatórios.' },
        { status: 400 },
      )
    }

    const cnpj = normalizeCNPJ(company.cnpj)
    if (!isValidCNPJ(cnpj)) {
      return NextResponse.json({ success: false, error: 'CNPJ inválido.' }, { status: 400 })
    }

    if (!rawPartners?.length) {
      return NextResponse.json(
        { success: false, error: 'Pelo menos um sócio/responsável é obrigatório.' },
        { status: 400 },
      )
    }

    // Valida sócios
    for (let i = 0; i < rawPartners.length; i++) {
      const p = rawPartners[i]
      const cpf = normalizeCPF(p.cpf)
      if (!isValidCPF(cpf)) {
        return NextResponse.json(
          { success: false, error: `CPF inválido no sócio ${i + 1}.` },
          { status: 400 },
        )
      }
      if (!p.nomeCompleto?.trim()) {
        return NextResponse.json(
          { success: false, error: `Nome completo é obrigatório no sócio ${i + 1}.` },
          { status: 400 },
        )
      }
      if (!p.email?.trim()) {
        return NextResponse.json(
          { success: false, error: `E-mail é obrigatório no sócio ${i + 1} (será usado como login do usuário ADM).` },
          { status: 400 },
        )
      }
    }

    // ── Verificações de duplicidade ──────────────────────────────────────────

    const existingCnpj = await prisma.tenant.findUnique({ where: { cnpj } })
    if (existingCnpj) {
      return NextResponse.json(
        { success: false, duplicated: true, error: 'Já existe um tenant cadastrado com este CNPJ.' },
        { status: 409 },
      )
    }

    // Verifica e-mail do sócio principal
    const principalPartner = rawPartners.find(p => p.principal) ?? rawPartners[0]
    const principalEmail   = principalPartner.email?.trim().toLowerCase()
    if (principalEmail) {
      const existingEmail = await prisma.user.findUnique({ where: { email: principalEmail } })
      if (existingEmail) {
        return NextResponse.json(
          { success: false, error: `Já existe um usuário cadastrado com o e-mail "${principalEmail}".` },
          { status: 409 },
        )
      }
    }

    // Verifica CPF do sócio principal para duplicidade de usuário
    const principalCPF = normalizeCPF(principalPartner.cpf)
    const existingCPF  = await prisma.user.findUnique({ where: { cpf: principalCPF } })
    if (existingCPF) {
      return NextResponse.json(
        { success: false, error: `Já existe um usuário cadastrado com o CPF do sócio principal.` },
        { status: 409 },
      )
    }

    // ── Gera slug único ──────────────────────────────────────────────────────

    const baseSlug  = slugify(company.nomeFantasia || company.razaoSocial)
    let   slug      = baseSlug
    let   slugSuffix = 1

    while (await prisma.tenant.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${slugSuffix++}`
    }

    // ── Gera publicId único ──────────────────────────────────────────────────

    let publicId = generatePublicId()
    while (await prisma.tenant.findUnique({ where: { publicId } })) {
      publicId = generatePublicId()
    }

    // ── Hash da senha do ADM (CPF sem pontuação) ─────────────────────────────

    const adminPassword     = principalCPF  // senha = CPF sem pontuação
    const adminPasswordHash = await bcrypt.hash(adminPassword, 12)

    // ── Transação atômica ────────────────────────────────────────────────────

    const result = await prisma.$transaction(async (tx) => {

      // 1. Criar Tenant
      const tenant = await tx.tenant.create({
        data: {
          publicId,
          slug,
          name:                    company.nomeFantasia?.trim()  || company.razaoSocial.trim(),
          razaoSocial:             company.razaoSocial.trim(),
          nomeFantasia:            company.nomeFantasia?.trim()  || null,
          cnpj,
          inscricaoEstadual:       company.inscricaoEstadual?.trim() || null,
          isentoInscricaoEstadual: company.isentoInscricaoEstadual ?? false,
          situacaoCadastral:       company.situacaoCadastral?.trim() || null,
          dataAbertura:            company.dataAbertura ? new Date(company.dataAbertura) : null,
          cnaeCode:                company.cnaeCode?.trim()      || null,
          phone:                   normalizePhone(company.telefone) || null,
          email:                   company.email?.trim().toLowerCase() || null,
          zipCode:                 normalizeCEP(company.address.cep),
          logradouro:              company.address.logradouro?.trim() || null,
          numero:                  company.address.numero?.trim()     || null,
          complemento:             company.address.complemento?.trim() || null,
          bairro:                  company.address.bairro?.trim()     || null,
          city:                    company.address.cidade?.trim()     || null,
          state:                   company.address.estado?.toUpperCase().trim() || null,
          plan:                    (planConfig?.tenantPlan ?? 'BASICO') as never,
          status:                  (planConfig?.tenantStatus ?? 'TESTE') as never,
          maxUsers:                planConfig?.limits?.maxUsers    ?? 10,
          maxVehicles:             planConfig?.limits?.maxVehicles ?? 100,
          maxUnits:                planConfig?.limits?.maxUnits    ?? 1,
          trialEndsAt:             planConfig?.trialEndsAt ? new Date(planConfig.trialEndsAt) : null,
          responsavel:             principalPartner.nomeCompleto?.trim() || null,
          responsavelEmail:        principalEmail                        || null,
          responsavelPhone:        normalizePhone(principalPartner.celular) || null,
        },
      })

      // 2. Criar Unit principal
      const mainUnit = await tx.unit.create({
        data: {
          tenantId:    tenant.id,
          name:        company.nomeFantasia?.trim() || company.razaoSocial.trim(),
          razaoSocial: company.razaoSocial.trim(),
          cnpj:        cnpj + '_unit',  // temporário — evita conflito @unique
          address:     [company.address.logradouro, company.address.numero, company.address.complemento].filter(Boolean).join(', '),
          city:        company.address.cidade?.trim()  || null,
          state:       company.address.estado?.toUpperCase().trim() || null,
          zipCode:     normalizeCEP(company.address.cep),
          phone:       normalizePhone(company.telefone) || null,
          email:       company.email?.trim().toLowerCase() || null,
          responsavel: principalPartner.nomeCompleto?.trim() || null,
          active:      true,
        },
      })

      // Atualiza Unit com CNPJ real após criação (evita conflito da constraint @unique)
      await tx.unit.update({
        where: { id: mainUnit.id },
        data:  { cnpj },
      })

      // 3. Criar User ADM (sócio principal)
      const adminUser = await tx.user.create({
        data: {
          tenantId:          tenant.id,
          unitId:            mainUnit.id,
          name:              principalPartner.nomeCompleto.trim(),
          email:             principalEmail!,
          cpf:               principalCPF,
          phone:             normalizePhone(principalPartner.celular) || null,
          passwordHash:      adminPasswordHash,
          role:              'ADM',
          status:            'ATIVO',
          mustChangePassword: true,
        },
      })

      // 4. Criar TenantPartner para cada sócio informado
      const createdPartners = []
      for (let i = 0; i < rawPartners.length; i++) {
        const p         = rawPartners[i]
        const partnerCPF = normalizeCPF(p.cpf)
        const isPrincipal = p.principal || i === 0

        const partner = await tx.tenantPartner.create({
          data: {
            tenantId:      tenant.id,
            cpf:           partnerCPF,
            nomeCompleto:  p.nomeCompleto.trim(),
            rg:            p.rg?.trim()    || null,
            celular:       normalizePhone(p.celular) || null,
            email:         p.email?.trim().toLowerCase() || null,
            dataNascimento: p.dataNascimento ? new Date(p.dataNascimento) : null,
            role:          (p.role ?? 'SOCIO') as never,
            participacao:  p.participacao ?? null,
            principal:     isPrincipal,
            cep:           normalizeCEP(p.address?.cep)        || null,
            logradouro:    p.address?.logradouro?.trim()       || null,
            numero:        p.address?.numero?.trim()           || null,
            complemento:   p.address?.complemento?.trim()      || null,
            bairro:        p.address?.bairro?.trim()           || null,
            cidade:        p.address?.cidade?.trim()           || null,
            estado:        p.address?.estado?.toUpperCase().trim() || null,
            userId:        isPrincipal ? adminUser.id : null,
            active:        true,
          },
        })
        createdPartners.push(partner)
      }

      // 5. Criar módulos ativos conforme configuração do plano
      const modulesToActivate = planConfig?.modules ?? [
        'dashboard', 'estoque', 'negociacoes', 'comissoes', 'clientes',
      ]
      await tx.tenantModule.createMany({
        data: modulesToActivate.map((module: string) => ({
          tenantId:  tenant.id,
          module:    module.toLowerCase(),
          active:    true,
          enabledBy: session.user.id,
          enabledAt: new Date(),
        })),
        skipDuplicates: true,
      })

      // 6. AuditLog dentro da transação
      await tx.auditLog.create({
        data: {
          userId:   session.user.id,
          tenantId: tenant.id,
          action:   'CREATE',
          entity:   'Tenant',
          entityId: tenant.id,
          userName: session.user.name,
          userRole: session.user.role,
          status:   'SUCCESS',
        },
      })

      return { tenant, mainUnit, adminUser, partners: createdPartners }
    })

    // ── Resposta (sem senha em texto claro) ──────────────────────────────────

    return NextResponse.json(
      {
        success: true,
        message: 'Tenant cadastrado com sucesso.',
        data: {
          tenant: {
            id:       result.tenant.id,
            publicId: result.tenant.publicId,
            slug:     result.tenant.slug,
            name:     result.tenant.name,
            cnpj:     result.tenant.cnpj,
            status:   result.tenant.status,
            plan:     result.tenant.plan,
          },
          mainUnit: {
            id:   result.mainUnit.id,
            name: result.mainUnit.name,
          },
          adminUser: {
            id:    result.adminUser.id,
            name:  result.adminUser.name,
            email: result.adminUser.email,
            role:  result.adminUser.role,
          },
          partners:            result.partners.length,
          initialPasswordHint: 'CPF sem pontuação',
        },
      },
      { status: 201 },
    )

  } catch (err) {
    return handlePrismaError(err)
  }
}
