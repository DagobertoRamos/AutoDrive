// =============================================================================
// Worker da Central de Publicações — processo independente (VM, servidor ou
// desenvolvimento local). Na Vercel o cron /api/internal/publications/run faz
// o mesmo; os dois podem rodar juntos (a fila usa FOR UPDATE SKIP LOCKED).
//   node scripts/publications-worker.cjs            (laço contínuo)
//   node scripts/publications-worker.cjs --once     (uma rodada; útil em teste)
// Variáveis: DATABASE_URL, MASTER_ENCRYPTION_KEY, NEXTAUTH_URL (links de foto),
// e as dos canais (ML_CLIENT_ID/SECRET, META_APP_ID/SECRET...).
// =============================================================================
const path = require('path')
process.env.TS_NODE_PROJECT = path.resolve(process.cwd(), 'tsconfig.worker.json')
process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'CommonJS', moduleResolution: 'node' })
require('ts-node/register/transpile-only')
require('tsconfig-paths/register')

const { runWorker } = require('../src/lib/publications/worker.ts')
const { reconcile } = require('../src/lib/publications/reconcile.ts')

const INTERVAL_MS = Number(process.env.PUBLICATIONS_WORKER_INTERVAL_MS || 15_000)
const RECONCILE_MS = 15 * 60_000
const once = process.argv.includes('--once')
let lastReconcile = 0
let running = false

async function tick() {
  if (running) return
  running = true
  try {
    if (Date.now() - lastReconcile > RECONCILE_MS) {
      lastReconcile = Date.now()
      const r = await reconcile()
      console.log(`[${new Date().toISOString()}] reconcile`, JSON.stringify(r))
    }
    const w = await runWorker({ maxJobs: 50, deadlineMs: 60_000, workerId: `vm-${process.pid}` })
    if (w.processed.length || w.recovered) console.log(`[${new Date().toISOString()}] processadas=${w.processed.length} recuperadas=${w.recovered}`, JSON.stringify(w.processed.map((p) => `${p.channel}:${p.op}:${p.result}`)))
  } catch (e) {
    console.error(`[${new Date().toISOString()}] erro no worker`, e)
  } finally {
    running = false
  }
}

async function main() {
  console.log(`[${new Date().toISOString()}] publications-worker iniciado (pid ${process.pid})`)
  await tick()
  if (once) process.exit(0)
  setInterval(() => void tick(), INTERVAL_MS)
}

void main()
