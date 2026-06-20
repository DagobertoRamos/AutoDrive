// =============================================================================
// POST /api/customers/quick-create
// Criação mínima de cliente para o fluxo de Avaliação. Aceita name (obrigatório),
// doc (CPF/CNPJ), phone, email. Disponível para quem tem stock.evaluate.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { canAccessModule } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { assertModuleEnabled } from '@/lib/tenant-modules'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!canAccessModule(session.user.role, 'stock.evaluate')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }
  { const gate = await assertModuleEnabled(session.user, 'stock.evaluate'); if (gate) return gate }
  try {
    const body = await req.json()
    const name  = String(body.name ?? '').trim()
    const doc   = String(body.doc ?? body.cpf ?? '').replace(/\D/g, '') || null
    const phone = String(body.phone ?? '').replace(/\D/g, '') || null
    const email = String(body.email ?? '').trim() || null
    if (!name || name.length < 2) {
      return NextResponse.json({ error: 'Nome é obrigatório.' }, { status: 400 })
    }

    // Evita duplicidade por CPF/CNPJ + tenant
    if (doc) {
      const existing = await prisma.customer.findFirst({
        where: { tenantId: session.user.tenantId ?? undefined, cpf: doc },
        select: { id: true, name: true, cpf: true, phone: true, email: true },
      })
      if (existing) return NextResponse.json({ data: existing, reused: true })
    }

    const created = await prisma.customer.create({
      data: {
        tenantId: session.user.tenantId ?? null,
        name,
        cpf:   doc,
        phone,
        email,
      },
      select: { id: true, name: true, cpf: true, phone: true, email: true },
    })
    return NextResponse.json({ data: created }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/customers/quick-create]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
