// =============================================================================
// GET /api/people/check-cpf?cpf=12345678909
//
// Verifica se já existe pessoa/usuário cadastrado com o CPF informado.
// Retorna dados para pré-preenchimento do sócio se já existir.
// MASTER only — usado no cadastro de sócios do tenant.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { normalizeCPF, isValidCPF } from '@/lib/br-docs/cpf'

export async function GET(req: NextRequest) {
  const session = await getServerAuthSession()
  if (!session || session.user.role !== 'MASTER') {
    return NextResponse.json({ success: false, error: 'Acesso negado.' }, { status: 403 })
  }

  const raw = req.nextUrl.searchParams.get('cpf') ?? ''
  const cpf = normalizeCPF(raw)

  if (!isValidCPF(cpf)) {
    return NextResponse.json({ success: false, error: 'CPF inválido.' }, { status: 400 })
  }

  try {
    // 1. Busca em TenantPartner (sócios já cadastrados)
    const partner = await prisma.tenantPartner.findFirst({
      where: { cpf, active: true },
      select: {
        id:           true,
        cpf:          true,
        nomeCompleto: true,
        rg:           true,
        celular:      true,
        email:        true,
        cep:          true,
        logradouro:   true,
        numero:       true,
        complemento:  true,
        bairro:       true,
        cidade:       true,
        estado:       true,
        tenantId:     true,
        userId:       true,
        tenant:       { select: { id: true, name: true, publicId: true } },
      },
    })

    if (partner) {
      return NextResponse.json({
        success:  true,
        found:    true,
        source:   'partner',
        existsInOtherTenant: true,
        data: {
          cpf:          partner.cpf,
          nomeCompleto: partner.nomeCompleto,
          rg:           partner.rg,
          celular:      partner.celular,
          email:        partner.email,
          cep:          partner.cep,
          logradouro:   partner.logradouro,
          numero:       partner.numero,
          complemento:  partner.complemento,
          bairro:       partner.bairro,
          cidade:       partner.cidade,
          estado:       partner.estado,
        },
        tenant: partner.tenant,
        message: `CPF já vinculado ao tenant "${partner.tenant?.name}". O MASTER pode prosseguir consciente desta vinculação.`,
      })
    }

    // 2. Busca em User (pode ser que já exista como usuário)
    const user = await prisma.user.findUnique({
      where: { cpf },
      select: {
        id:      true,
        name:    true,
        email:   true,
        phone:   true,
        role:    true,
        tenantId: true,
      },
    })

    if (user) {
      return NextResponse.json({
        success:  true,
        found:    true,
        source:   'user',
        existsInOtherTenant: !!user.tenantId,
        data: {
          cpf,
          nomeCompleto: user.name,
          celular:      user.phone ?? '',
          email:        user.email,
        },
        message: user.tenantId
          ? `CPF já cadastrado como usuário "${user.role}" em outro tenant.`
          : `CPF já cadastrado como usuário da plataforma (${user.role}).`,
      })
    }

    // 3. CPF não encontrado — cadastro manual
    return NextResponse.json({
      success: true,
      found:   false,
      message: 'CPF não encontrado. Preencha os dados manualmente.',
    })

  } catch {
    return NextResponse.json({ success: false, error: 'Erro ao verificar CPF.' }, { status: 500 })
  }
}
