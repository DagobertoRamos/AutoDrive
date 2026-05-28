// =============================================================================
// scripts/cleanup-orphan-vehicles.ts
//
// Localiza avaliações com vehicleId apontando pra vehicles SEM deal (ou seja,
// vehicles criados pelo /release antigo) e:
//   1. Desvincula a avaliação (set vehicleId = null)
//   2. Deleta o vehicle órfão
//
// Idempotente. Roda quantas vezes quiser.
// =============================================================================

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('[cleanup] Buscando avaliações LIBERADAS com vehicleId...')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linked = await (prisma as any).vehicleEvaluation.findMany({
    where:  { status: 'LIBERADA', vehicleId: { not: null } },
    select: { id: true, plate: true, brand: true, model: true, vehicleId: true },
  })

  console.log(`[cleanup] Encontradas ${linked.length} avaliações com vehicleId setado.`)

  let unlinked = 0
  let deleted  = 0
  for (const ev of linked) {
    if (!ev.vehicleId) continue
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const v = await (prisma as any).vehicle.findUnique({
        where:   { id: ev.vehicleId },
        include: { dealVehicles: { select: { id: true } } },
      })
      if (!v) {
        // Vehicle não existe — só limpa o vínculo
        await prisma.vehicleEvaluation.update({ where: { id: ev.id }, data: { vehicleId: null } })
        unlinked++
        console.log(`  ✓ avaliação ${ev.id} desvinculada (vehicle não existia)`)
        continue
      }

      // Vehicle existe — só deleta se não tem deal nenhum
      if (v.dealVehicles && v.dealVehicles.length > 0) {
        console.log(`  · vehicle ${v.id} tem deal vinculado — mantido`)
        continue
      }

      await prisma.vehicleEvaluation.update({ where: { id: ev.id }, data: { vehicleId: null } })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma as any).vehicle.delete({ where: { id: v.id } })
      unlinked++
      deleted++
      console.log(`  ✓ avaliação ${ev.id} desvinculada + vehicle ${v.id} (${[v.plate, v.brand, v.model].filter(Boolean).join(' · ')}) deletado`)
    } catch (e) {
      console.error(`  ✗ falhou na avaliação ${ev.id}:`, e instanceof Error ? e.message : e)
    }
  }

  console.log(`\n[cleanup] OK — ${unlinked} avaliações desvinculadas, ${deleted} vehicles deletados.`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error('[cleanup] erro fatal:', e)
  process.exit(1)
})
