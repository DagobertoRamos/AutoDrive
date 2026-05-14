// =============================================================================
// GET /api/master/tenants/check-cnpj?cnpj=12345678000190
// Verifica duplicidade de CNPJ antes de criar tenant (MASTER only)
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { normalizeCNPJ, isValidCNPJ } from '@/lib/br-docs/cnpj'

export async function GET(req: NextRequest) {
  const session = await getServerAuthSession()
  if (!session || session.user.role !== 'MASTER') {
    return NextResponse.json({ success: false, error: 'Acesso negado.' }, { status: 403 })
  }

  const cnpj = normalizeCNPJ(req.nextUrl.searchParams.get('cnpj') ?? '')

  if (!isValidCNPJ(cnpj)) {
    return NextResponse.json({ success: false, error: 'CNPJ inválido.' }, { status: 400 })
  }

  try {
    const existing = await prisma.tenant.findFirst({
      where: { cnpj },
      select: { id: true, name: true, publicId: true, status: true },
    })

    if (existing) {
      return NextResponse.json({
        success:    false,
        duplicated: true,
        error:      'Já existe um tenant cadastrado com este CNPJ.',
        tenant:     existing,
      }, { status: 409 })
    }

    return NextResponse.json({ success: true, duplicated: false, message: 'CNPJ disponível.' })
  } catch {
    return NextResponse.json({ success: false, error: 'Erro ao verificar CNPJ.' }, { status: 500 })
  }
}
