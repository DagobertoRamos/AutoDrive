// =============================================================================
// POST /api/integrations/autoconf/deals — recebe negociações do AutoConf (da
// extensão do Chrome) e cria/atualiza Deals no AutoDrive.
// Auth: header `x-autoconf-token` (token de integração por tenant).
// Body: { rows: AutoconfRow[], dryRun?: boolean }
// dryRun (padrão TRUE): não grava; só devolve o que FARIA (unidade/vendedor
// resolvidos). Passe dryRun:false para gravar de verdade.
// Dedup: Deal.dealNumber = "AC-<externalId>" dentro do tenant.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  resolveTenantByToken, resolveUnitId, resolveSellerId, mapType, mapStatus,
  type AutoconfRow, type AutoconfVehicle, type ProcessRowResult,
} from '@/lib/integrations/autoconf'
import { recalculateNegotiationCommissions } from '@/lib/commission-generator'
import { isCommissionEligibleStatus } from '@/lib/commission/status'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function vFrom(v: AutoconfVehicle) {
  const plate = v.placa && !/zero\s*km/i.test(v.placa) ? v.placa : null
  return { plate, model: v.modelo ?? null, agreedValue: typeof v.valor === 'number' ? v.valor : null }
}

function vehiclesFor(row: AutoconfRow): Array<{ role: string; plate: string | null; model: string | null; agreedValue: number | null }> {
  const t = mapType(row.tipo)
  const saida = (row.veiculosSaida ?? [])[0]
  const entrada = (row.veiculosEntrada ?? [])[0]
  const out: Array<{ role: string; plate: string | null; model: string | null; agreedValue: number | null }> = []
  if (t === 'VENDA' && saida) out.push({ role: 'VENDIDO', ...vFrom(saida) })
  else if (t === 'COMPRA' && entrada) out.push({ role: 'COMPRADO', ...vFrom(entrada) })
  else if (t === 'TROCA') { if (saida) out.push({ role: 'VENDIDO', ...vFrom(saida) }); if (entrada) out.push({ role: 'TROCA', ...vFrom(entrada) }) }
  else if (t === 'CONSIGNACAO' && (saida ?? entrada)) out.push({ role: 'CONSIGNADO', ...vFrom((saida ?? entrada)!) })
  else { const v = saida ?? entrada; if (v) out.push({ role: t === 'COMPRA' ? 'COMPRADO' : 'VENDIDO', ...vFrom(v) }) }
  return out
}

export async function POST(req: Request) {
  try {
    const token = req.headers.get('x-autoconf-token') ?? ''
    const tenantId = await resolveTenantByToken(token)
    if (!tenantId) return NextResponse.json({ success: false, error: 'Token inválido.' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const rows: AutoconfRow[] = Array.isArray(body?.rows) ? body.rows : []
    const dryRun = body?.dryRun !== false // padrão TRUE
    if (!rows.length) return NextResponse.json({ success: false, error: 'Nenhuma linha recebida.' }, { status: 400 })

    // Caches por unidade (nome + gerente).
    const unitCache = new Map<string, string | null>()
    const unitName = new Map<string, string>()
    const unitManager = new Map<string, string | null>()
    async function unitInfo(loja: string | null | undefined) {
      const k = loja ?? ''
      if (!unitCache.has(k)) unitCache.set(k, await resolveUnitId(tenantId!, loja))
      const uid = unitCache.get(k) ?? null
      if (uid && !unitName.has(uid)) {
        const u = await prisma.unit.findUnique({ where: { id: uid }, select: { name: true } })
        unitName.set(uid, u?.name ?? uid)
        const mgr = await prisma.manager.findFirst({ where: { unitId: uid, active: true }, select: { userId: true } })
        unitManager.set(uid, mgr?.userId ?? null)
      }
      return uid
    }

    const results: ProcessRowResult[] = []
    let created = 0, updated = 0, skipped = 0
    let commissionGenerated = 0, commissionErrors = 0

    for (const row of rows) {
      const ext = String(row.externalId)
      const unitId = await unitInfo(row.loja)
      if (!unitId) { skipped++; results.push({ externalId: ext, action: 'skipped', reason: `Loja não mapeada: "${row.loja ?? ''}"` }); continue }
      const sellerId = await resolveSellerId(unitId, row.vendedor)
      const dealNumber = `AC-${ext}`
      const type = mapType(row.tipo)
      const status = mapStatus(row.status)
      const managerId = unitManager.get(unitId) ?? null
      const finalizedAt = status === 'FINALIZADA' ? new Date() : null

      const dealData = {
        tenantId, unitId, sellerId, managerId,
        type: type as never, status: status as never,
        saleAmount: typeof row.saleAmount === 'number' ? row.saleAmount : null,
        purchaseAmount: typeof row.purchaseAmount === 'number' ? row.purchaseAmount : null,
        source: 'AUTOCONF',
        dealNumber,
      }
      const vehicles = vehiclesFor(row)
      const existing = await prisma.deal.findFirst({ where: { tenantId, dealNumber }, select: { id: true } })

      if (dryRun) {
        results.push({ externalId: ext, action: existing ? 'updated' : 'created', unit: unitName.get(unitId), seller: sellerId ? row.vendedor : `(NÃO ACHADO: ${row.vendedor ?? '—'})`, dealNumber })
        existing ? updated++ : created++
        continue
      }

      if (existing) {
        const savedDealId = existing.id
        await prisma.$transaction(async (tx) => {
          await tx.deal.update({ where: { id: savedDealId }, data: { ...dealData, ...(finalizedAt ? { finalizedAt } : {}) } })
          await tx.dealVehicle.deleteMany({ where: { dealId: savedDealId } })
          if (vehicles.length) await tx.dealVehicle.createMany({ data: vehicles.map((v) => ({ dealId: savedDealId, ...v })) })
        })
        if (isCommissionEligibleStatus(status)) {
          try {
            const commission = await recalculateNegotiationCommissions({
              dealId: savedDealId,
              tenantId,
              triggeredBy: 'autoconf',
            })
            commissionGenerated += commission.created
          } catch (err) {
            commissionErrors++
            console.error('[autoconf deals] commission generation failed', {
              tenantId, dealId: savedDealId, dealNumber, status, unitId, sellerId,
              message: err instanceof Error ? err.message : 'Erro desconhecido',
            })
          }
        }
        updated++
        results.push({ externalId: ext, action: 'updated', unit: unitName.get(unitId), seller: row.vendedor ?? null, dealNumber })
      } else {
        const savedDealId = await prisma.$transaction(async (tx) => {
          const deal = await tx.deal.create({ data: { ...dealData, ...(finalizedAt ? { finalizedAt } : {}) } })
          if (vehicles.length) await tx.dealVehicle.createMany({ data: vehicles.map((v) => ({ dealId: deal.id, ...v })) })
          return deal.id
        })
        if (isCommissionEligibleStatus(status)) {
          try {
            const commission = await recalculateNegotiationCommissions({
              dealId: savedDealId,
              tenantId,
              triggeredBy: 'autoconf',
            })
            commissionGenerated += commission.created
          } catch (err) {
            commissionErrors++
            console.error('[autoconf deals] commission generation failed', {
              tenantId, dealId: savedDealId, dealNumber, status, unitId, sellerId,
              message: err instanceof Error ? err.message : 'Erro desconhecido',
            })
          }
        }
        created++
        results.push({ externalId: ext, action: 'created', unit: unitName.get(unitId), seller: row.vendedor ?? null, dealNumber })
      }
    }

    return NextResponse.json({
      success: true, dryRun, total: rows.length,
      created, updated, skipped,
      commissionGenerated,
      commissionErrors,
      unmatchedSeller: results.filter((r) => typeof r.seller === 'string' && r.seller.startsWith('(NÃO')).length,
      results,
    })
  } catch (err) {
    console.error('[POST /api/integrations/autoconf/deals]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
