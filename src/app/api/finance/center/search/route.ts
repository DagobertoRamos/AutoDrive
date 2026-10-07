// =============================================================================
// GET /api/finance/center/search?q= — busca global do financeiro.
// CPF/CNPJ, placa, RENAVAM, cliente, fornecedor, nº da negociação, contrato de
// financiamento, nº do documento/NF ou valor → lançamentos, negociações,
// veículos e contratos relacionados (até 10 de cada).
// =============================================================================

import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { financeGuard } from '@/lib/finance/access'
import { entryTextSearch } from '@/lib/finance/finance-service'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const g = await financeGuard('finance', req)
  if (g.error) return g.error
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ success: true, data: { entries: [], deals: [], vehicles: [], contracts: [] } })
  const tenantId = g.tenantId
  const digits = q.replace(/\D/g, '')
  const plate = q.replace(/[^a-z0-9]/gi, '').toUpperCase()

  const dealOr: Prisma.DealWhereInput[] = [
    { dealNumber: { contains: q, mode: 'insensitive' } },
    { person: { nomeCompleto: { contains: q, mode: 'insensitive' } } },
    { customer: { name: { contains: q, mode: 'insensitive' } } },
  ]
  if (digits.length >= 4) dealOr.push({ person: { cpf: { contains: digits } } }, { person: { cnpj: { contains: digits } } }, { customer: { cpf: { contains: digits } } })
  if (plate.length >= 3) dealOr.push({ vehicles: { some: { plate: { contains: plate, mode: 'insensitive' } } } })
  const vehOr: Prisma.VehicleWhereInput[] = []
  if (plate.length >= 3) vehOr.push({ plate: { contains: plate, mode: 'insensitive' } })
  if (digits.length >= 6) vehOr.push({ renavam: { contains: digits } })
  if (!/^\d+$/.test(q)) vehOr.push({ model: { contains: q, mode: 'insensitive' } })

  const [entries, deals, vehicles, contracts] = await Promise.all([
    prisma.financialEntry.findMany({
      where: { tenantId, parentEntryId: null, OR: [...(entryTextSearch(q) ?? []), ...(plate.length >= 6 ? [{ description: { contains: plate, mode: 'insensitive' } }] : [])] as Prisma.FinancialEntryWhereInput[] },
      orderBy: [{ dueDate: 'desc' }], take: 10,
      select: { id: true, type: true, status: true, description: true, amount: true, dueDate: true, paidDate: true, counterparty: true },
    }),
    prisma.deal.findMany({
      where: { tenantId, OR: dealOr }, orderBy: { createdAt: 'desc' }, take: 10,
      select: { id: true, dealNumber: true, type: true, status: true, person: { select: { nomeCompleto: true } }, customer: { select: { name: true } }, vehicles: { select: { plate: true }, take: 1 } },
    }),
    vehOr.length ? prisma.vehicle.findMany({ where: { tenantId, OR: vehOr }, take: 10, select: { id: true, plate: true, brand: true, model: true, modelYear: true, stockStatus: true } }) : [],
    prisma.dealPayment.findMany({
      where: { deal: { tenantId }, type: 'FINANCIAMENTO', OR: [{ contractNumber: { contains: q, mode: 'insensitive' } }, { bank: { contains: q, mode: 'insensitive' } }] },
      take: 10, select: { id: true, bank: true, contractNumber: true, value: true, status: true, deal: { select: { id: true, dealNumber: true } } },
    }),
  ])
  return NextResponse.json({
    success: true,
    data: {
      entries: entries.map((e) => ({ ...e, amount: Number(e.amount) })),
      deals: deals.map((d) => ({ id: d.id, dealNumber: d.dealNumber, type: d.type, status: d.status, customer: d.person?.nomeCompleto ?? d.customer?.name ?? null, plate: d.vehicles[0]?.plate ?? null })),
      vehicles,
      contracts: contracts.map((c) => ({ id: c.id, bank: c.bank, contractNumber: c.contractNumber, value: Number(c.value), status: c.status, dealId: c.deal.id, dealNumber: c.deal.dealNumber })),
    },
  })
}
