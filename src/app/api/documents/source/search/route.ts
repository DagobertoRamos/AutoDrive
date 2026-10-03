// =============================================================================
// GET /api/documents/source/search?type=deal|customer|vehicle|supplier&q=
// Busca da origem de dados do gerador de documentos (10 resultados).
// Negociação sem q → as mais recentes.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { buildNegotiationAccessWhere } from '@/lib/negotiation-access'
import { guardDocuments } from '@/lib/documents/source-guard'

export const dynamic = 'force-dynamic'

type Hit = { id: string; label: string; sub: string }
const ci = (q: string) => ({ contains: q, mode: 'insensitive' as const })
const plateOf = (s?: string | null) => (s ?? '').toUpperCase()
const vehText = (v: { brand?: string | null; model?: string | null; plate?: string | null; year?: number | null }) =>
  [[v.brand, v.model].filter(Boolean).join(' '), v.year, plateOf(v.plate)].filter(Boolean).join(' · ')

export async function GET(req: NextRequest) {
  const g = await guardDocuments()
  if ('error' in g) return g.error
  const sp = req.nextUrl.searchParams
  const type = sp.get('type') ?? 'deal'
  const q = (sp.get('q') ?? '').trim().slice(0, 80)
  const digits = q.replace(/\D/g, '')
  const plate = q.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  const plateOr = plate.length >= 3 ? [{ plate: ci(plate) }, ...(plate.length > 3 ? [{ plate: ci(`${plate.slice(0, 3)}-${plate.slice(3)}`) }] : [])] : []
  if (type !== 'deal' && q.length < 2) return NextResponse.json({ success: true, data: [] })

  try {
    let data: Hit[] = []
    if (type === 'deal') {
      const or: Prisma.DealWhereInput[] = q ? [
        { dealNumber: ci(q) },
        { customer: { name: ci(q) } },
        { person: { nomeCompleto: ci(q) } },
        ...(digits.length >= 3 ? [{ customer: { cpf: { contains: digits } } }, { person: { cpf: { contains: digits } } }] : []),
        ...(plateOr.length ? [{ vehicles: { some: { OR: plateOr } } }] : []),
      ] : []
      const where = await buildNegotiationAccessWhere(g.user, { ...g.scope, ...(or.length ? { OR: or } : {}) })
      const rows = await prisma.deal.findMany({
        where, orderBy: { updatedAt: 'desc' }, take: 10,
        select: { id: true, dealNumber: true, status: true, customer: { select: { name: true } }, person: { select: { nomeCompleto: true } }, vehicles: { select: { role: true, brand: true, model: true, plate: true, year: true } } },
      })
      data = rows.map((d) => {
        const sold = d.vehicles.find((v) => v.role === 'VENDIDO' || v.role === 'CONSIGNADO') ?? d.vehicles[0]
        return { id: d.id, label: [d.dealNumber ?? d.id.slice(-8).toUpperCase(), d.person?.nomeCompleto || d.customer?.name].filter(Boolean).join(' · '), sub: [sold ? vehText(sold) : '', String(d.status)].filter(Boolean).join(' · ') }
      })
    } else if (type === 'customer') {
      const rows = await prisma.customer.findMany({
        where: { ...g.scope, OR: [{ name: ci(q) }, { email: ci(q) }, ...(digits.length >= 3 ? [{ cpf: { contains: digits } }, { phone: { contains: digits } }] : [])] },
        orderBy: { name: 'asc' }, take: 10, select: { id: true, name: true, cpf: true, phone: true, city: true },
      })
      data = rows.map((c) => ({ id: c.id, label: c.name, sub: [c.cpf, c.phone, c.city].filter(Boolean).join(' · ') }))
    } else if (type === 'vehicle') {
      const rows = await prisma.vehicle.findMany({
        where: { ...g.scope, OR: [...plateOr, { model: ci(q) }, { brand: ci(q) }, ...(plate.length >= 5 ? [{ chassi: ci(plate) }] : [])] },
        orderBy: { updatedAt: 'desc' }, take: 10, select: { id: true, brand: true, model: true, plate: true, year: true, stockStatus: true },
      })
      data = rows.map((v) => ({ id: v.id, label: vehText(v), sub: v.stockStatus ? String(v.stockStatus) : '' }))
    } else if (type === 'supplier') {
      const rows = await prisma.supplier.findMany({
        where: { ...g.scope, OR: [{ name: ci(q) }, { legalName: ci(q) }, ...(digits.length >= 3 ? [{ document: { contains: digits } }] : [])] },
        orderBy: [{ active: 'desc' }, { name: 'asc' }], take: 10, select: { id: true, name: true, legalName: true, document: true, city: true },
      })
      data = rows.map((s) => ({ id: s.id, label: s.name, sub: [s.legalName !== s.name ? s.legalName : null, s.document, s.city].filter(Boolean).join(' · ') }))
    }
    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error('[GET /api/documents/source/search]', err)
    return NextResponse.json({ success: false, error: 'Erro na busca.' }, { status: 500 })
  }
}
