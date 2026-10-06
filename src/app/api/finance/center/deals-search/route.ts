// =============================================================================
// GET /api/finance/center/deals-search — busca de negociações para vincular a
// um lançamento (Centro Financeiro). Guarda: finance, loja efetiva.
//   ?q=<número | cliente | CPF/CNPJ | placa>  → até 15 negociações
//   ?id=<dealId>                              → só essa (para exibir o vínculo)
// Cada item: { id, dealNumber, type, status, customer, document, plate, vehicleId, vehicleTitle }
//   customer = Person.nomeCompleto ?? Customer.name (vira o "Cliente / pagador")
//   vehicleId = carro vendido (VENDIDO/COMPRADO/CONSIGNADO; senão o 1º)
// =============================================================================

import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { financeGuard } from '@/lib/finance/access'
import { handlePrismaError } from '@/lib/prisma-errors'

export const dynamic = 'force-dynamic'

const MAIN_ROLES = ['VENDIDO', 'COMPRADO', 'CONSIGNADO']

export interface DealSearchItem {
  id: string; dealNumber: string | null; type: string; status: string
  customer: string | null; document: string | null
  plate: string | null; vehicleId: string | null; vehicleTitle: string | null
}

export async function GET(req: Request) {
  const g = await financeGuard('finance', req)
  if (g.error) return g.error
  try {
    const sp = new URL(req.url).searchParams
    const id = sp.get('id')?.trim()
    const q = sp.get('q')?.trim() ?? ''
    if (!id && q.length < 2) return NextResponse.json({ success: true, data: [] })

    let where: Prisma.DealWhereInput
    if (id) {
      where = { id, tenantId: g.tenantId }
    } else {
      const digits = q.replace(/\D/g, '')
      const plate = q.replace(/[^a-z0-9]/gi, '').toUpperCase()
      const or: Prisma.DealWhereInput[] = [
        { dealNumber: { contains: q, mode: 'insensitive' } },
        { person: { nomeCompleto: { contains: q, mode: 'insensitive' } } },
        { customer: { name: { contains: q, mode: 'insensitive' } } },
      ]
      if (digits.length >= 3) {
        or.push({ person: { cpf: { contains: digits } } }, { person: { cnpj: { contains: digits } } }, { customer: { cpf: { contains: digits } } })
      }
      if (plate.length >= 3) or.push({ vehicles: { some: { plate: { contains: plate, mode: 'insensitive' } } } })
      where = { tenantId: g.tenantId, OR: or }
    }

    const rows = await prisma.deal.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: id ? 1 : 15,
      select: {
        id: true, dealNumber: true, type: true, status: true,
        person: { select: { nomeCompleto: true, cpf: true, cnpj: true } },
        customer: { select: { name: true, cpf: true } },
        vehicles: { orderBy: { createdAt: 'asc' }, select: { role: true, plate: true, brand: true, model: true, vehicleId: true } },
      },
    })
    const data: DealSearchItem[] = rows.map((d) => {
      const main = d.vehicles.find((v) => MAIN_ROLES.includes(v.role)) ?? d.vehicles[0] ?? null
      return {
        id: d.id, dealNumber: d.dealNumber, type: d.type, status: d.status,
        customer: d.person?.nomeCompleto ?? d.customer?.name ?? null,
        document: d.person?.cpf ?? d.person?.cnpj ?? d.customer?.cpf ?? null,
        plate: main?.plate ?? null, vehicleId: main?.vehicleId ?? null,
        vehicleTitle: main ? [main.brand, main.model].filter(Boolean).join(' ') || null : null,
      }
    })
    return NextResponse.json({ success: true, data })
  } catch (err) {
    return handlePrismaError(err)
  }
}
