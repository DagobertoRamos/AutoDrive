// =============================================================================
// scripts/site-feed-import.ts — roda a importação de estoque por feed na mão
// (a mesma do cron /api/internal/site/feed-import/run).
//   npx tsx scripts/site-feed-import.ts                      → todas as fontes (env + lojas)
//   npx tsx scripts/site-feed-import.ts --only <tenantId>    → só essa loja
//   npx tsx scripts/site-feed-import.ts --set <tenantId> <meta-csv|revendas> <url>
//        → grava a fonte da loja (t:<id>:site:feedsource:v1) e já importa
//   npx tsx scripts/site-feed-import.ts --mark <tenantId> <anúncio>=<VENDIDO|RESERVADO> ...
//        → muda o status do carro importado (a importação nunca desfaz esses status)
//   npx tsx scripts/site-feed-import.ts --plates <tenantId> <arquivo.csv> [--dry]
//        → grava as placas informadas pela loja (anúncio + placa), conferindo com o site
// Usa o DATABASE_URL do ambiente — confira se é o banco que você quer.
// =============================================================================

import { readFileSync } from 'node:fs'
import { prisma } from '../src/lib/prisma'
import { allFeedImportSources, feedVehicleId, runFeedImport, setFeedImportSource } from '../src/lib/site/feed-import'
import { normalizePlate, type FeedSourceKind } from '../src/lib/site/feed-import-core'
import { parseRevendasDetail, plateMatchesMask, revendasDetailUrl } from '../src/lib/site/revendas-core'

const MARKS = ['VENDIDO', 'RESERVADO', 'DISPONIVEL'] as const

async function main() {
  const [cmd, tenant, ...rest] = process.argv.slice(2)
  if (cmd === '--set') {
    const [kind, url] = rest
    console.log('fonte', JSON.stringify(await setFeedImportSource(tenant, { kind: kind as FeedSourceKind, url })))
  }
  if (cmd === '--plates') return importPlates(tenant, rest[0], rest.includes('--dry'))
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

/**
 * Placas vindas da loja (o site "revendas" só mostra a placa mascarada).
 * Arquivo CSV/; com o número do anúncio e a placa em qualquer coluna, ex.:
 *   anuncio;carro;placa
 *   681712;Nissan Versa preto;ABC1D23
 * Cada placa é conferida com a máscara do anúncio (1ª e última letra) antes de gravar.
 * A importação não apaga placa preenchida no SaaS (o site não manda placa).
 */
async function importPlates(tenantId: string, file: string, dry: boolean) {
  const src = (await allFeedImportSources()).find((s) => s.tenantId === tenantId)
  const lines = readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.split(/[;,\t]/).map((c) => c.trim()))
  let ok = 0
  for (const cols of lines) {
    const extId = cols.find((c) => /^\d{5,8}$/.test(c))
    const plate = cols.map((c) => normalizePlate(c)).find(Boolean)
    if (!extId) continue
    if (!plate) { console.log(`- ${extId}: sem placa válida (${cols.join(' | ')})`); continue }
    const id = await feedVehicleId(tenantId, extId)
    if (!id) { console.log(`- ${extId}: anúncio não importado nessa loja`); continue }
    if (src?.kind === 'revendas') {
      const html = await fetch(revendasDetailUrl(src.url, extId), { headers: { 'user-agent': 'AutoDrive-SiteImport/1.0' } }).then((r) => r.text())
      const mask = parseRevendasDetail(html).fields['Placa do veículo']
      if (!plateMatchesMask(plate, mask)) { console.log(`- ${extId}: placa ${plate} não bate com a do site (${mask}) — não gravada`); continue }
    }
    const dup = await prisma.vehicle.findFirst({ where: { tenantId, plate, id: { not: id } }, select: { id: true, model: true } })
    if (dup) { console.log(`- ${extId}: placa ${plate} já está em outro carro (${dup.model}) — não gravada`); continue }
    if (!dry) await prisma.vehicle.update({ where: { id, tenantId }, data: { plate } })
    console.log(`✓ ${extId}: ${plate}${dry ? ' (simulação)' : ''}`)
    ok++
  }
  console.log(`${ok} placa(s) ${dry ? 'conferidas' : 'gravadas'}`)
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1) })
