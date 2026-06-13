// =============================================================================
// scripts/validate-goals-ranking.ts
// Harness de validação (somente leitura, exceto cria/apaga 1 meta de teste).
// Roda as MESMAS queries dos agregadores/ranking contra o banco real.
//   npx ts-node --compiler-options "{\"module\":\"CommonJS\"}" scripts/validate-goals-ranking.ts
// =============================================================================

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function monthWindow(now: Date) {
  const y = now.getFullYear()
  const m = now.getMonth()
  return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0, 23, 59, 59, 999) }
}

const completed = (w: { start: Date; end: Date }) => ({
  status: 'FINALIZADA' as const,
  OR: [
    { finalizedAt: { gte: w.start, lte: w.end } },
    { finalizedAt: null, saleDate: { gte: w.start, lte: w.end } },
  ],
})

async function main() {
  const now = new Date()
  const w = monthWindow(now)
  console.log(`\n=== Validação Metas/Ranking — janela ${w.start.toISOString().slice(0, 10)}..${w.end.toISOString().slice(0, 10)} ===\n`)

  // 1) As novas tabelas existem e respondem? (contagens)
  const counts = {
    tenants:        await prisma.tenant.count(),
    units:          await prisma.unit.count(),
    sellers:        await prisma.seller.count(),
    deals:          await prisma.deal.count(),
    dealsFinalized: await prisma.deal.count({ where: { status: 'FINALIZADA' } }),
    dealServices:   await prisma.dealService.count(),
    dealDocuments:  await prisma.dealDocument.count(),
    pendencies:     await prisma.pendency.count(),
    goals:          await prisma.goal.count(),
    goalLevels:     await prisma.goalLevel.count(),
    goalProgress:   await prisma.goalProgress.count(),
    rankingRules:   await prisma.rankingRule.count(),
    rankingScores:  await prisma.rankingScore.count(),
  }
  console.log('Contagens:', counts)

  const tenant = await prisma.tenant.findFirst({ select: { id: true, name: true } })
  if (!tenant) {
    console.log('\n(Sem tenant no banco — schema validado, mas sem dados para agregação.)')
    return
  }
  console.log(`\nTenant de teste: ${tenant.name} (${tenant.id})`)

  // 2) Agregadores no escopo do tenant (mês corrente)
  const agg = {
    salesExchange: await prisma.deal.count({ where: { tenantId: tenant.id, type: { in: ['VENDA', 'TROCA'] }, ...completed(w) } }),
    purchase:      await prisma.deal.count({ where: { tenantId: tenant.id, type: 'COMPRA', ...completed(w) } }),
    services:      await prisma.dealService.count({ where: { deal: { tenantId: tenant.id, ...completed(w) } } }),
    documentation: await prisma.dealDocument.count({
      where: { deal: { tenantId: tenant.id }, status: { in: ['ASSINADO', 'ARQUIVADO'] },
        OR: [{ signedAt: { gte: w.start, lte: w.end } }, { signedAt: null, createdAt: { gte: w.start, lte: w.end } }] },
    }),
  }
  console.log('Agregadores (tenant, mês):', agg)

  // 3) Ranking simplificado por vendedor (pesos default)
  const W = { sale: 100, purchase: 40, doc: 20, service: 20, cancel: -50, overdue: -15 }
  const sellers = await prisma.seller.findMany({
    where: { active: true, unit: { tenantId: tenant.id } },
    select: { id: true, fullName: true, shortName: true },
  })
  const rows = []
  for (const s of sellers) {
    const sales = await prisma.deal.count({ where: { tenantId: tenant.id, sellerId: s.id, type: { in: ['VENDA', 'TROCA'] }, ...completed(w) } })
    const purchases = await prisma.deal.count({ where: { tenantId: tenant.id, sellerId: s.id, type: 'COMPRA', ...completed(w) } })
    const services = await prisma.dealService.count({ where: { deal: { tenantId: tenant.id, sellerId: s.id, ...completed(w) } } })
    const canceled = await prisma.deal.count({ where: { tenantId: tenant.id, sellerId: s.id, type: { in: ['VENDA', 'TROCA'] }, status: 'CANCELADA', cancelledAt: { gte: w.start, lte: w.end } } })
    const overdue = await prisma.pendency.count({ where: { tenantId: tenant.id, responsibleId: s.id, status: 'VENCIDA' } })
    const points = sales * W.sale + purchases * W.purchase + services * W.service + canceled * W.cancel + overdue * W.overdue
    rows.push({ name: s.shortName || s.fullName, sales, purchases, services, canceled, overdue, points })
  }
  rows.sort((a, b) => b.points - a.points)
  console.log(`\nRanking (${rows.length} vendedores) — top 5:`)
  rows.slice(0, 5).forEach((r, i) => console.log(`  ${i + 1}. ${r.name} — ${r.points} pts (vendas=${r.sales}, serv=${r.services}, canc=${r.canceled}, venc=${r.overdue})`))

  // 4) Cria meta de teste, lê de volta, calcula progresso e apaga
  const goal = await prisma.goal.create({
    data: {
      tenantId: tenant.id, type: 'SALES_EXCHANGE', scope: 'TENANT', period: 'MONTHLY',
      title: '[TESTE] validação', startDate: w.start, endDate: w.end, targetValue: 10, measureUnit: 'QTD',
    },
  })
  const achieved = agg.salesExchange
  const percent = Math.round((achieved / Number(goal.targetValue)) * 10000) / 100
  console.log(`\nMeta de teste criada (${goal.id}): alvo=${goal.targetValue}, realizado=${achieved}, ${percent}%`)
  await prisma.goal.delete({ where: { id: goal.id } })
  console.log('Meta de teste apagada (cleanup). ✅')

  console.log('\n=== Validação concluída sem erros ===\n')
}

main()
  .catch((e) => { console.error('ERRO:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
