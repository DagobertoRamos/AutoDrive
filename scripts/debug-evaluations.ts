import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all: any[] = await (prisma as any).vehicleEvaluation.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true, plate: true, brand: true, model: true,
      status: true, result: true,
      evaluatedValue: true, suggestedSalePrice: true,
      vehicleId: true, tenantId: true, releasedAt: true,
    },
  })
  console.log(`\n[DEBUG] ${all.length} avaliações mais recentes:\n`)
  for (const e of all) {
    console.log(`  ${e.id}  plate=${e.plate}  ${e.brand}/${e.model}`)
    console.log(`    status='${e.status}'  result='${e.result}'  evaluatedValue=${e.evaluatedValue}  suggestedSalePrice=${e.suggestedSalePrice}`)
    console.log(`    vehicleId=${e.vehicleId}  tenantId=${e.tenantId}  releasedAt=${e.releasedAt}`)
  }
  await prisma.$disconnect()
}
main().catch(console.error)
