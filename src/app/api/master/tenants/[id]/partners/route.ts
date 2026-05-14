// =============================================================================
// /api/master/tenants/[id]/partners — Sócios do tenant (MASTER only)
//
// GET:  listar sócios
// POST: adicionar sócio
//
// Regra de acesso automático:
//   • Sócio-Administrador (role = SOCIO_ADMINISTRADOR) → usuário ADM criado
//   • Sócio principal (principal = true)               → usuário ADM criado
//   • Demais roles sem flag principal                  → apenas TenantPartner
//
// Credenciais do usuário criado:
//   login:  e-mail do sócio
//   senha:  CPF sem pontuação
//   flag:   mustChangePassword = true  (troca obrigatória no 1.º acesso)
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { normalizeCPF, isValidCPF } from '@/lib/br-docs/cpf'
import { normalizePhone } from '@/lib/br-docs/phone'
import { normalizeCEP } from '@/lib/br-docs/cep'
import bcrypt from 'bcryptjs'

// ── GET ──────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerAuthSession()
  if (!session || session.user.role !== 'MASTER') {
    return NextResponse.json({ success: false, error: 'Acesso negado.' }, { status: 403 })
  }

  try {
    const partners = await prisma.tenantPartner.findMany({
      where:   { tenantId: params.id, active: true },
      orderBy: [{ principal: 'desc' }, { createdAt: 'asc' }],
      include: {
        user: { select: { id: true, email: true, role: true, status: true, lastLoginAt: true, mustChangePassword: true } },
      },
    })

    return NextResponse.json({ success: true, data: partners })
  } catch (err) {
    return handlePrismaError(err)
  }
}

// ── POST ─────────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerAuthSession()
  if (!session || session.user.role !== 'MASTER') {
    return NextResponse.json({ success: false, error: 'Acesso negado.' }, { status: 403 })
  }

  try {
    const tenant = await prisma.tenant.findUnique({
      where:  { id: params.id },
      select: { id: true, name: true },
    })
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant não encontrado.' }, { status: 404 })
    }

    const body = await req.json()
    const {
      cpf: rawCPF, nomeCompleto, rg, celular, email,
      dataNascimento, role, participacao, principal, address,
    } = body

    // ── Validações básicas ─────────────────────────────────────────────────

    const cpf = normalizeCPF(rawCPF)
    if (!isValidCPF(cpf)) {
      return NextResponse.json({ success: false, error: 'CPF inválido.' }, { status: 400 })
    }
    if (!nomeCompleto?.trim()) {
      return NextResponse.json({ success: false, error: 'Nome completo é obrigatório.' }, { status: 400 })
    }

    // Determina se este sócio deve receber acesso ao sistema
    const needsUser = Boolean(principal) || role === 'SOCIO_ADMINISTRADOR'

    if (needsUser && !email?.trim()) {
      return NextResponse.json(
        { success: false, error: 'E-mail é obrigatório para sócio-administrador ou sócio principal (será o login de acesso ao sistema).' },
        { status: 400 },
      )
    }

    // ── Duplicidade no tenant ──────────────────────────────────────────────

    const existingInTenant = await prisma.tenantPartner.findFirst({
      where: { tenantId: params.id, cpf, active: true },
    })
    if (existingInTenant) {
      return NextResponse.json(
        { success: false, error: 'Já existe um sócio com este CPF neste tenant.' },
        { status: 409 },
      )
    }

    // ── Verificações extra para criação de usuário ─────────────────────────

    const normalizedEmail = email?.trim().toLowerCase() ?? null

    if (needsUser) {
      const existingEmail = await prisma.user.findUnique({ where: { email: normalizedEmail! } })
      if (existingEmail) {
        return NextResponse.json(
          { success: false, error: `Já existe um usuário com o e-mail "${normalizedEmail}". Informe outro e-mail.` },
          { status: 409 },
        )
      }

      const existingCpf = await prisma.user.findUnique({ where: { cpf } })
      if (existingCpf) {
        return NextResponse.json(
          { success: false, error: 'Já existe um usuário cadastrado com este CPF.' },
          { status: 409 },
        )
      }
    }

    // ── Obtém a unidade principal do tenant ────────────────────────────────

    const mainUnit = await prisma.unit.findFirst({
      where:   { tenantId: params.id },
      orderBy: { createdAt: 'asc' },
      select:  { id: true },
    })

    // ── Criação em transação (com ou sem usuário) ──────────────────────────

    const partnerBase = {
      tenantId:       params.id,
      cpf,
      nomeCompleto:   nomeCompleto.trim(),
      rg:             rg?.trim()    || null,
      celular:        normalizePhone(celular) || null,
      email:          normalizedEmail,
      dataNascimento: dataNascimento ? new Date(dataNascimento) : null,
      role:           (role ?? 'SOCIO') as never,
      participacao:   participacao ?? null,
      principal:      Boolean(principal),
      cep:            normalizeCEP(address?.cep)         || null,
      logradouro:     address?.logradouro?.trim()        || null,
      numero:         address?.numero?.trim()            || null,
      complemento:    address?.complemento?.trim()       || null,
      bairro:         address?.bairro?.trim()            || null,
      cidade:         address?.cidade?.trim()            || null,
      estado:         address?.estado?.toUpperCase().trim() || null,
      active:         true,
    }

    let partner
    let userCreated: { id: string; email: string; role: string } | null = null

    if (needsUser) {
      // Cria usuário + parceiro em transação atômica
      const adminPasswordHash = await bcrypt.hash(cpf, 12)

      const result = await prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            tenantId:          params.id,
            unitId:            mainUnit?.id ?? null,
            name:              nomeCompleto.trim(),
            email:             normalizedEmail!,
            cpf,
            phone:             normalizePhone(celular) || null,
            passwordHash:      adminPasswordHash,
            role:              'ADM',
            status:            'ATIVO',
            mustChangePassword: true,
          },
        })

        const newPartner = await tx.tenantPartner.create({
          data: { ...partnerBase, userId: newUser.id },
        })

        return { partner: newPartner, user: newUser }
      })

      partner     = result.partner
      userCreated = { id: result.user.id, email: result.user.email, role: result.user.role }
    } else {
      // Cria apenas o TenantPartner sem usuário
      partner = await prisma.tenantPartner.create({ data: partnerBase })
    }

    await createSafeAuditLog({
      userId:   session.user.id,
      tenantId: params.id,
      action:   'CREATE',
      entity:   'TenantPartner',
      entityId: partner.id,
      userName: session.user.name,
      userRole: session.user.role,
    })

    return NextResponse.json(
      {
        success: true,
        data:    partner,
        message: needsUser
          ? `Sócio adicionado e usuário ADM criado. Login: ${normalizedEmail} | Senha inicial: CPF sem pontuação.`
          : 'Sócio adicionado com sucesso.',
        ...(userCreated && {
          userCreated,
          initialPasswordHint: 'CPF sem pontuação',
          mustChangePassword:  true,
        }),
      },
      { status: 201 },
    )
  } catch (err) {
    return handlePrismaError(err)
  }
}
