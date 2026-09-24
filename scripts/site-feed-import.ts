// =============================================================================
// scripts/site-feed-import.ts — roda a importação de estoque por feed na mão
// (a mesma do cron /api/internal/site/feed-import/run).
//   SITE_FEED_IMPORT="<tenantId>|<url>" npx tsx scripts/site-feed-import.ts
// Usa o DATABASE_URL do ambiente — confira se é o banco que você quer.
// =============================================================================

import { feedImportSources, runFeedImport } from '../src/lib/site/feed-import'

async function main() {
  const sources = feedImportSources()
  if (!sources.length) throw new Error('SITE_FEED_IMPORT vazio')
  for (const src of sources) console.log(JSON.stringify(await runFeedImport(src)))
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1) })
