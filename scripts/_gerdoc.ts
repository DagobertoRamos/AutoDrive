import { prisma } from '../src/lib/prisma'
import { generateCommissionsForDeal } from '../src/lib/commission-generator'
import { COMMISSION_ELIGIBLE_DEAL_STATUSES } from '../src/lib/commission/status'
async function main() {
  const t = 'cmqmlyvya0004jv04j1rlpoot'
  const GERENTE_POS = 'cmpio4v7c000310zv0fsikpqw'
  // Cria a regra de DOCUMENTO do gerente se não existir (R$100, igual ao PDF).
  const exists = await prisma.commissionRule.findFirst({ where: { tenantId: t, ruleType: 'DOCUMENTO', positionId: GERENTE_POS } })
  if (!exists) {
    await prisma.commissionRule.create({ data: { tenantId: t, name: 'documentação gerente', ruleType: 'DOCUMENTO', commissionType: 'FIXO', fixedValue: 100, positionId: GERENTE_POS, role: 'GERENTE', active: true, priority: 0 } })
    console.log('Regra "documentação gerente" (FIXO R$100) criada.')
  } else console.log('Regra de documento do gerente já existe.')
  // Regenera (idempotente: adiciona o documento do gerente onde faltava).
  const deals = await prisma.deal.findMany({ where: { tenantId: t, status: { in: COMMISSION_ELIGIBLE_DEAL_STATUSES } }, select: { id: true } })
  let created = 0, done = 0
  const realUser = await prisma.user.findFirst({ where: { tenantId: t, role: { in: ['ADM','MASTER'] } }, select: { id: true } })
  for (const d of deals) { try { const r = await generateCommissionsForDeal({ dealId: d.id, tenantId: t, triggeredBy: realUser?.id ?? 'regen', dryRun: false }); created += r.created } catch {} ; if(++done%200===0) console.log(`  ${done}/${deals.length} · +${created}`) }
  console.log(`FIM: ${done} deals · ${created} novos lançamentos`)
  const calc = await prisma.commissionCalculation.groupBy({ by: ['ruleType'], where: { tenantId: t }, _count: true, _sum: { commissionValue: true } })
  console.log('TOTAIS:', JSON.stringify(calc.map(c=>({t:c.ruleType,n:c._count,sum:String(c._sum.commissionValue)}))))
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)})
