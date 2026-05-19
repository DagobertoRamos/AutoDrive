// =============================================================================
// POST /api/master/sheets/repair-orphans
// Repara pendências órfãs (source=SHEETS, dealId=null) linkando-as às
// negociações existentes ou criando a negociação quando ainda não existe.
//
// Executar UMA VEZ após a correção do fluxo de importação.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireMaster }     from '@/lib/master-guards'
import { prisma }            from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'
import { runDealProcessor }  from '@/lib/sheets-deal-processor'

export async function POST(req: NextRequest) {
  const { session, error } = await requireMaster()
  if (error) return error

  try {
    const body    = await req.json().catch(() => ({}))
    const dryRun  = body.dryRun === true
    const limit   = typeof body.limit === 'number' ? body.limit : 500

    // ── 1. Busca pendências órfãs (source=SHEETS, dealId nulo) ───────────────
    const orphans = await (prisma.pendency as any).findMany({
      where: {
        source:  'SHEETS',
        dealId:  null,
        status:  { notIn: ['FINALIZADA', 'CANCELADA'] },
      },
      select: {
        id:           true,
        tenantId:     true,
        unitId:       true,
        negotiation:  true,
        originRecordId: true,
        customerName: true,
        plate:        true,
        responsibleId:true,
      },
      take: limit,
    })

    if (orphans.length === 0) {
      return NextResponse.json({ success: true, message: 'Nenhuma pendência órfã encontrada.', fixed: 0, stillOrphan: 0 })
    }

    let fixed       = 0
    let stillOrphan = 0
    const details: string[] = []

    for (const pendency of orphans) {
      try {
        const negotiation = pendency.negotiation as string | null

        // ── 2. Tenta localizar Deal existente pela negociação ──────────────────
        let dealId: string | null = null

        if (negotiation) {
          const deal = await (prisma.deal as any).findFirst({
            where: {
              tenantId: pendency.tenantId,
              OR: [
                { externalId: negotiation },
                { notes: { contains: `ID externo: ${negotiation}` } },
              ],
            },
            select: { id: true },
          }).catch(() => null)

          if (deal) dealId = deal.id
        }

        // ── 3. Se não achou Deal, tenta via SheetImportRow ────────────────────
        // (sheetImportRow não tem tenantId — filtra por externalId)
        if (!dealId && negotiation) {
          const stagingRow = await (prisma.sheetImportRow as any).findFirst({
            where: {
              externalId: negotiation,
              status:     { in: ['NEGOCIACAO_CRIADA', 'NEGOCIACAO_ATUALIZADA', 'PENDENTE', 'PROCESSANDO'] },
            },
            select: { dealId: true, id: true, configId: true },
          }).catch(() => null)

          if (stagingRow?.dealId) {
            dealId = stagingRow.dealId
          } else if (stagingRow?.configId && !dryRun) {
            // Staging existe mas ainda não tem deal — roda o processor para essa linha
            await runDealProcessor({
              configId:      stagingRow.configId,
              dryRun:        false,
              triggeredById: session.id,
              limitRows:     1,
            }).catch(() => {})

            // Busca dealId após processamento
            const refreshed = await (prisma.sheetImportRow as any).findUnique({
              where:  { id: stagingRow.id },
              select: { dealId: true },
            }).catch(() => null)
            if (refreshed?.dealId) dealId = refreshed.dealId
          }
        }

        // ── 4. Vincula pendência ao deal ──────────────────────────────────────
        if (dealId) {
          if (!dryRun) {
            await (prisma.pendency as any).update({
              where: { id: pendency.id },
              data:  { dealId },
            })

            await prisma.auditLog.create({
              data: {
                tenantId: pendency.tenantId,
                userId:   session.id,
                action:   'UPDATE',
                entity:   'Pendency',
                entityId: pendency.id,
                status:   'SUCCESS',
                afterData: { dealId, fix: 'orphan-repair' } as never,
              },
            }).catch(() => {})
          }
          fixed++
          details.push(`✓ Pendência ${pendency.id} (neg: ${negotiation}) → Deal ${dealId}`)
        } else {
          stillOrphan++
          details.push(`✗ Pendência ${pendency.id} (neg: ${negotiation}) — nenhuma negociação localizada`)
        }
      } catch (err) {
        stillOrphan++
        details.push(`✗ Pendência ${pendency.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    return NextResponse.json({
      success: true,
      dryRun,
      totalOrphans:    orphans.length,
      fixed,
      stillOrphan,
      details:         details.slice(0, 50),
      message: dryRun
        ? `[Simulação] ${fixed} pendências poderiam ser vinculadas, ${stillOrphan} sem match.`
        : `${fixed} pendências vinculadas a negociações. ${stillOrphan} ainda sem correspondência.`,
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}

// ── GET — estatísticas de pendências órfãs ────────────────────────────────────

export async function GET(_req: NextRequest) {
  const { error } = await requireMaster()
  if (error) return error

  try {
    const total = await (prisma.pendency as any).count({
      where: { source: 'SHEETS', dealId: null, status: { notIn: ['FINALIZADA', 'CANCELADA'] } },
    })

    const byTenant = await (prisma.pendency as any).groupBy({
      by:    ['tenantId'],
      where: { source: 'SHEETS', dealId: null, status: { notIn: ['FINALIZADA', 'CANCELADA'] } },
      _count:{ _all: true },
    }).catch(() => [])

    return NextResponse.json({ success: true, totalOrphans: total, byTenant })
  } catch (err) {
    return handlePrismaError(err)
  }
}
