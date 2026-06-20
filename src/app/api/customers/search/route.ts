// =============================================================================
// GET /api/customers/search?q=...
// Busca rápida de clientes para o fluxo de Avaliação (cliente-first).
// Acessível a qualquer usuário com permissão stock.evaluate.
// Aceita CPF/CNPJ (apenas dígitos), telefone (apenas dígitos), ou nome.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { canAccessModule } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { assertModuleEnabled } from '@/lib/tenant-modules'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!canAccessModule(session.user.role, 'stock.evaluate')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }
  { const gate = await assertModuleEnabled(session.user, 'stock.evaluate'); if (gate) return gate }

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (!q || q.length < 2) return NextResponse.json({ data: [] })

  const digits = q.replace(/\D/g, '')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}
  if (session.user.tenantId) where.tenantId = session.user.tenantId

  const or: Record<string, unknown>[] = []
  if (digits.length >= 3) {
    or.push({ cpf:   { contains: digits } })
    or.push({ phone: { contains: digits } })
  }
  if (q.length >= 2) {
    or.push({ name:  { contains: q, mode: 'insensitive' } })
    or.push({ email: { contains: q, mode: 'insensitive' } })
  }
  where.OR = or

  try {
    const data = await prisma.customer.findMany({
      where,
      orderBy: { name: 'asc' },
      take: 10,
      select: { id: true, name: true, cpf: true, phone: true, email: true, city: true, state: true },
    })
    return NextResponse.json({ data })
  } catch (err) {
    console.error('[GET /api/customers/search]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
