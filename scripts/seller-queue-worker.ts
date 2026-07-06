import { prisma } from '../src/lib/prisma'
import { autoCheckoutStalePauses } from '../src/lib/seller-queue/automation'
import { sweepExpiredCalls } from '../src/lib/seller-queue/call'

const INTERVAL_MS = 30_000
const WORKER_ID = 'seller-queue-worker'

async function tick() {
  const queues = await prisma.sellerQueue.findMany({
    where: { status: 'OPEN' },
    select: { id: true, tenantId: true, unitId: true },
  })

  for (const queue of queues) {
    try {
      await autoCheckoutStalePauses({
        tenantId: queue.tenantId,
        unitId: queue.unitId,
        queueId: queue.id,
        maxPauseMinutes: 30,
      })
      await sweepExpiredCalls({
        tenantId: queue.tenantId,
        unitId: queue.unitId,
        queueId: queue.id,
        actorId: WORKER_ID,
      })
      console.log(`[${new Date().toISOString()}] worker ok queue=${queue.id}`)
    } catch (error) {
      console.error(`[${new Date().toISOString()}] worker error queue=${queue.id}`, error)
    }
  }
}

async function main() {
  console.log(`[${new Date().toISOString()}] ${WORKER_ID} started`)
  await tick()
  setInterval(() => {
    void tick()
  }, INTERVAL_MS)
}

void main()
