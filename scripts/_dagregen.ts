import { prisma } from '../src/lib/prisma'
import { generateCommissionsForDeal } from '../src/lib/commission-generator'
async function main() {
  const t = 'cmqmlyvya0004jv04j1rlpoot'
  const rule = await prisma.commissionRule.findFirst({ where: { tenantId: t, ruleType: 'DOCUMENTO', role: 'GERENTE' }, select: { name: true, fixedValue: true } })
  console.log('regra gerente doc:', JSON.stringify(rule))
  const u = await prisma.user.findFirst({ where: { tenantId: t, name: { contains: 'Dagoberto', mode: 'insensitive' } }, select: { id: true } })
  const mgr = await prisma.manager.findFirst({ where: { userId: u!.id }, select: { id: true } })
  // deals onde Dagoberto é o gerente (via lançamentos UNIT_MANAGER dele)
  const lan = await prisma.commissionCalculation.findMany({ where: { tenantId: t, managerId: mgr!.id, ruleDetails: { path: ['commissionScope'], equals: 'UNIT_MANAGER_COMMISSION' } }, select: { ruleDetails: true } })
  const dealIds = [...new Set(lan.map(l=>(l.ruleDetails as any)?.dealId).filter(Boolean))] as string[]
  console.log('deals do Dagoberto (gerente):', dealIds.length)
  const realUser = await prisma.user.findFirst({ where: { tenantId: t, role: { in: ['ADM','MASTER'] } }, select: { id: true } })
  let created = 0
  for (const id of dealIds) { try { const r = await generateCommissionsForDeal({ dealId: id, tenantId: t, triggeredBy: realUser?.id ?? 'x', dryRun: false }); created += r.created } catch {} }
  console.log('novos lançamentos:', created)
  const doc = await prisma.commissionCalculation.aggregate({ where: { tenantId: t, period: '2026-06', managerId: mgr!.id, ruleType: 'DOCUMENTO', status: { not: 'CANCELADO' } }, _count: true, _sum: { commissionValue: true } })
  console.log('DOCUMENTO Dagoberto jun/26:', doc._count, '× R$', String(doc._sum.commissionValue))
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)})
