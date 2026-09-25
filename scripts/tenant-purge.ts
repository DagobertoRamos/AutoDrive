// =============================================================================
// scripts/tenant-purge.ts — simula (padrão) ou executa a exclusão total de uma
// loja. É o mesmo motor do cron de guarda de 5 anos.
//   npx tsx scripts/tenant-purge.ts <tenantId>            → só simula (nada muda)
//   npx tsx scripts/tenant-purge.ts <tenantId> --execute  → APAGA DE VERDADE
// Usa o DATABASE_URL do ambiente — confira se é o banco que você quer.
// =============================================================================

import { purgeTenantData } from '../src/lib/tenant-lifecycle/purge'

async function main() {
  const tenantId = process.argv[2]
  if (!tenantId) throw new Error('uso: tenant-purge.ts <tenantId> [--execute]')
  const execute = process.argv.includes('--execute')
  const r = await purgeTenantData(tenantId, { dryRun: !execute })
  console.log(JSON.stringify(r, null, 2))
  if (!r.ok) process.exit(1)
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1) })
