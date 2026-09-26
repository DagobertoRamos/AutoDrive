// =============================================================================
// scripts/backfill-vehicle-origin.ts — grava originType/loja parceira nos
// veículos já importados, a partir do estado da importação do feed (sem acessar
// o site antigo). O cron do feed faz o mesmo a cada execução; isto só adianta.
//   DATABASE_URL=... npx tsx scripts/backfill-vehicle-origin.ts <tenantId>
// Não sobrescreve origem já definida no SaaS.
// =============================================================================

import { applyFeedOrigin, feedOrigins } from '../src/lib/site/feed-import'

async function main() {
  const tenantId = process.argv[2]
  if (!tenantId) throw new Error('Informe o tenantId')
  const origins = await feedOrigins(tenantId)
  const ids = Object.keys(origins)
  for (const vehicleId of ids) await applyFeedOrigin(tenantId, vehicleId, origins[vehicleId], false)
  console.log(`Origens processadas: ${ids.length}`)
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1) })
