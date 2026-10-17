// =============================================================================
// scripts/site-feed-import.ts — roda a importação de estoque por feed na mão
// (a mesma do cron /api/internal/site/feed-import/run).
//   npx tsx scripts/site-feed-import.ts                      → todas as fontes (env + lojas)
//   npx tsx scripts/site-feed-import.ts --only <tenantId>    → só essa loja
//   npx tsx scripts/site-feed-import.ts --set <tenantId> <meta-csv|revendas> <url>
//        → grava a fonte da loja (t:<id>:site:feedsource:v1) e já importa
//   npx tsx scripts/site-feed-import.ts --mark <tenantId> <anúncio>=<VENDIDO|RESERVADO> ...
//        → muda o status do carro importado (a importação nunca desfaz esses status)
// Usa o DATABASE_URL do ambiente — confira se é o banco que você quer.
// =============================================================================

import { prisma } from '../src/lib/prisma'
import { allFeedImportSources, feedVehicleId, runFeedImport, setFeedImportSource } from '../src/lib/site/feed-import'
import type { FeedSourceKind } from '../src/lib/site/feed-import-core'

const MARKS = ['VENDIDO', 'RESERVADO', 'DISPONIVEL'] as const

async function main() {
  const [cmd, tenant, ...rest] = process.argv.slice(2)
  if (cmd === '--set') {
    const [kind, url] = rest
    console.log('fonte', JSON.stringify(await setFeedImportSource(tenant, { kind: kind as FeedSourceKind, url })))
  }
  if (cmd === '--mark') {
    for (const arg of rest) {
      const [extId, status] = arg.split('=')
      if (!(MARKS as readonly string[]).includes(status)) throw new Error(`Status inválido: ${arg}`)
      const id = await feedVehicleId(tenant, extId)
      if (!id) throw new Error(`Anúncio ${extId} não importado nessa loja`)
      const v = await prisma.vehicle.update({
        where: { id, tenantId: tenant },
        data: { stockStatus: status as never, isAvailableForSale: status !== 'VENDIDO', ...(status === 'VENDIDO' ? { exitDate: new Date() } : {}) },
        select: { id: true, brand: true, model: true, version: true, color: true, stockStatus: true },
      })
      console.log('marcado', JSON.stringify(v))
    }
    return
  }
  const sources = (await allFeedImportSources()).filter((s) => !tenant || s.tenantId === tenant)
  if (!sources.length) throw new Error('Nenhuma fonte de importação configurada')
  for (const src of sources) console.log(JSON.stringify(await runFeedImport(src)))
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1) })
