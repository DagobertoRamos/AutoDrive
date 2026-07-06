const Module = require('module')
const path = require('path')
const originalResolveFilename = Module._resolveFilename
Module._resolveFilename = function (request, parent, isMain, options) {
  if (typeof request !== 'string') return originalResolveFilename.call(this, request, parent, isMain, options)

  const baseDir = process.cwd()
  const aliases = [
    ['@/', `${baseDir}/src/`],
    ['@/lib/', `${baseDir}/src/lib/`],
    ['@/services/', `${baseDir}/src/services/`],
    ['@/components/', `${baseDir}/src/components/`],
    ['@/hooks/', `${baseDir}/src/hooks/`],
    ['@/store/', `${baseDir}/src/store/`],
    ['@/types/', `${baseDir}/src/types/`],
    ['@/utils/', `${baseDir}/src/lib/utils/`],
    ['@/config/', `${baseDir}/src/config/`],
    ['@/styles/', `${baseDir}/src/styles/`],
  ]

  for (const [prefix, target] of aliases) {
    if (request.startsWith(prefix)) {
      return originalResolveFilename.call(this, request.replace(prefix, target), parent, isMain, options)
    }
  }

  return originalResolveFilename.call(this, request, parent, isMain, options)
}

const { PrismaClient } = require('@prisma/client')
process.env.TS_NODE_PROJECT = path.resolve(process.cwd(), 'tsconfig.worker.json')
process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'CommonJS', moduleResolution: 'node' })
require('ts-node/register/transpile-only')
require('tsconfig-paths/register')
const { autoCheckoutStalePauses } = require('../src/lib/seller-queue/automation.ts')
const { sweepExpiredCalls } = require('../src/lib/seller-queue/call.ts')

const prisma = new PrismaClient()
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
