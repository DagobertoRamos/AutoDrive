// =============================================================================
// Exemplo de uso em src/app/api/sellers/route.ts
// Ajuste os imports de prisma/auth conforme o seu projeto.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { withRouteDebug, logPayloadDiff } from '@/lib/debug/route-debugger'
import { buildSellerData } from '@/lib/builders/seller.builder'

export const POST = withRouteDebug('sellers/POST', async (req: NextRequest) => {
  const session = await getServerSession(authOptions)

  if (!session) {
    return NextResponse.json(
      { success: false, error: 'Não autorizado' },
      { status: 401 },
    )
  }

  const body = await req.json()

  const {
    fullName,
    whatsapp,
    unitId,
    shortName,
    cpf,
    email,
    cargo,
    active,
    receivesCharge,
  } = body

  logPayloadDiff(body, {
    fullName,
    whatsapp,
    unitId,
    shortName,
    cpf,
    email,
    cargo,
    active,
    receivesCharge,
  })

  const seller = await prisma.seller.create({
    data: buildSellerData(body, session),
  })

  return NextResponse.json(
    {
      success: true,
      data: seller,
    },
    { status: 201 },
  )
})
