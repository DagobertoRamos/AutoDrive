// =============================================================================
// /api/master/tenants/[id]/partners/[partnerId]
// PATCH: editar sócio — cria usuário ADM se necessário ao promover
// DELETE: inativar sócio (soft delete)
//
// Regras de criação/atualização de usuário no PATCH:
//   • Se sócio ainda não tem User e passa a ser principal OU SOCIO_ADMINISTRADOR
//     → cria User com senha = CPF, mustChangePassword = true
//   • Se sócio já tem User e o nome ou e-mail muda → sincroniza o User
//   • Rebaixar sócio (remover principal / trocar role) NÃO apaga o User
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { normalizeCPF } from '@/lib/br-docs/cpf'
import { normalizePhone } from '@/lib/br-docs/phone'
import { normalizeCEP } from '@/lib/br-docs/cep'
import bcrypt from 'bcryptjs'

// ── PATCH — Editar sócio ─────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; partnerId: string } },
) {
  const session = await getServerAuthSession()
  if (!session || session.user.role !== 'MASTER') {
    return NextResponse.json({ success: false, error: 'Acesso negado.' }, { status: 403 })
  }

  try {
    const partner = await prisma.tenantPartner.findFirst({
      where:   { id: params.partnerId, tenantId: params.id },
      include: { user: { select: { id: true, email: true, name: true, mustChangePassword: true } } },
    })
    if (!partner) {
      return NextResponse.json({ success: false, error: 'Sócio não encontrado.' }, { status: 404 })
    }

    const body = await req.json()
    const {
      nomeCompleto, rg, celular, email, dataNascimento,
      role, participacao, principal, address,
    } = body

    // ── Determina estado resultante ────────────────────────────────────────

    const resultRole      = role      != null ? String(role)      : partner.role
    const resultPrincipal = principal != null ? Boolean(principal) : partner.principal
    const resultEmail     = email     != null ? String(email).trim().toLowerCase() || null : partner.email
    const resultName      = nomeCompleto != null ? String(nomeCompleto).trim() : partner.nomeCompleto

    const willNeedUser = resultPrincipal || resultRole === 'SOCIO_ADMINISTRADOR'
    const hasUser      = Boolean(partner.userId)

    // ── Validação: e-mail obrigatório se vai precisar de usuário ───────────

    if (willNeedUser && !hasUser && !resultEmail) {
      return NextResponse.json(
        {
          success: false,
          error: 'E-mail é obrigatório para criar acesso ao sistema para este sócio (sócio-administrador ou sócio principal).',
        },
        { status: 400 },
      )
    }

    // ── Variáveis de controle de criação de usuário ────────────────────────

    let newUserId:    string | null = null
    let userCreated:  boolean       = false
    let userUpdated:  boolean       = false

    // ── Cria usuário se ainda não tem e agora precisa ─────────────────────

    if (willNeedUser && !hasUser && resultEmail) {
      // Verifica duplicidade
      const existingEmail = await prisma.user.findUnique({ where: { email: resultEmail } })
      if (existingEmail) {
        return NextResponse.json(
          { success: false, error: `Já existe um usuário com o e-mail "${resultEmail}". Informe outro e-mail.` },
          { status: 409 },
        )
      }

      const cpf = normalizeCPF(partner.cpf)
      const existingCpf = await prisma.user.findUnique({ where: { cpf } })
      if (existingCpf) {
        return NextResponse.json(
          { success: false, error: 'Já existe um usuário cadastrado com este CPF.' },
          { status: 409 },
        )
      }

      const mainUnit = await prisma.unit.findFirst({
        where:   { tenantId: params.id },
        orderBy: { createdAt: 'asc' },
        select:  { id: true },
      })

      const adminPasswordHash = await bcrypt.hash(cpf, 12)
      const newUser = await prisma.user.create({
        data: {
          tenantId:          params.id,
          unitId:            mainUnit?.id ?? null,
          name:              resultName,
          email:             resultEmail,
          cpf,
          phone:             normalizePhone(celular ?? partner.celular) || null,
          passwordHash:      adminPasswordHash,
          role:              'ADM',
          status:            'ATIVO',
          mustChangePassword: true,
        },
      })

      newUserId   = newUser.id
      userCreated = true
    }

    // ── Sincroniza nome/e-mail no User existente ──────────────────────────

    if (hasUser && partner.userId) {
      const nameChanged  = nomeCompleto != null && resultName  !== partner.user?.name
      const emailChanged = email        != null && resultEmail !== partner.user?.email

      if (nameChanged || emailChanged) {
        if (emailChanged && resultEmail) {
          const conflict = await prisma.user.findFirst({
            where: { email: resultEmail, id: { not: partner.userId } },
          })
          if (conflict) {
            return NextResponse.json(
              { success: false, error: `Já existe um usuário com o e-mail "${resultEmail}".` },
              { status: 409 },
            )
          }
        }

        await prisma.user.update({
          where: { id: partner.userId },
          data: {
            ...(nameChanged  && { name:  resultName }),
            ...(emailChanged && resultEmail && { email: resultEmail }),
          },
        })
        userUpdated = true
      }
    }

    // ── Atualiza TenantPartner ─────────────────────────────────────────────

    const updated = await prisma.tenantPartner.update({
      where: { id: params.partnerId },
      data: {
        ...(nomeCompleto    != null && { nomeCompleto:  String(nomeCompleto).trim() }),
        ...(rg              != null && { rg:            String(rg).trim() || null }),
        ...(celular         != null && { celular:       normalizePhone(celular) || null }),
        ...(email           != null && { email:         resultEmail }),
        ...(dataNascimento  != null && { dataNascimento: dataNascimento ? new Date(dataNascimento) : null }),
        ...(role            != null && { role:          String(role) as never }),
        ...(participacao    != null && { participacao:  participacao }),
        ...(principal       != null && { principal:     Boolean(principal) }),
        ...(address?.cep        != null && { cep:        normalizeCEP(address.cep) || null }),
        ...(address?.logradouro != null && { logradouro: String(address.logradouro).trim() || null }),
        ...(address?.numero     != null && { numero:     String(address.numero).trim() || null }),
        ...(address?.complemento!= null && { complemento: String(address.complemento).trim() || null }),
        ...(address?.bairro     != null && { bairro:     String(address.bairro).trim() || null }),
        ...(address?.cidade     != null && { cidade:     String(address.cidade).trim() || null }),
        ...(address?.estado     != null && { estado:     String(address.estado).toUpperCase().trim() || null }),
        // Vincula o novo usuário se criado neste PATCH
        ...(newUserId && { userId: newUserId }),
      },
    })

    await createSafeAuditLog({
      userId:   session.user.id,
      tenantId: params.id,
      action:   'UPDATE',
      entity:   'TenantPartner',
      entityId: params.partnerId,
      userName: session.user.name,
      userRole: session.user.role,
    })

    const message = userCreated
      ? `Sócio atualizado e usuário ADM criado. Login: ${resultEmail} | Senha inicial: CPF sem pontuação.`
      : userUpdated
      ? 'Sócio e usuário sincronizados com sucesso.'
      : 'Sócio atualizado com sucesso.'

    return NextResponse.json({
      success: true,
      data:    updated,
      message,
      ...(userCreated && {
        userCreated:         true,
        initialPasswordHint: 'CPF sem pontuação',
        mustChangePassword:  true,
      }),
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}

// ── DELETE — Inativar sócio (soft delete) ─────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; partnerId: string } },
) {
  const session = await getServerAuthSession()
  if (!session || session.user.role !== 'MASTER') {
    return NextResponse.json({ success: false, error: 'Acesso negado.' }, { status: 403 })
  }

  try {
    const partner = await prisma.tenantPartner.findFirst({
      where: { id: params.partnerId, tenantId: params.id, active: true },
    })
    if (!partner) {
      return NextResponse.json({ success: false, error: 'Sócio não encontrado.' }, { status: 404 })
    }

    if (partner.principal) {
      // Conta outros sócios ativos
      const otherCount = await prisma.tenantPartner.count({
        where: { tenantId: params.id, active: true, id: { not: params.partnerId } },
      })
      if (otherCount === 0) {
        return NextResponse.json(
          { success: false, error: 'Não é possível remover o único sócio do tenant.' },
          { status: 409 },
        )
      }
    }

    await prisma.tenantPartner.update({
      where: { id: params.partnerId },
      data:  { active: false },
    })

    await createSafeAuditLog({
      userId:   session.user.id,
      tenantId: params.id,
      action:   'DELETE',
      entity:   'TenantPartner',
      entityId: params.partnerId,
      userName: session.user.name,
      userRole: session.user.role,
    })

    return NextResponse.json({ success: true, message: 'Sócio removido com sucesso.' })
  } catch (err) {
    return handlePrismaError(err)
  }
}
