// =============================================================================
// Correção de dados antigos (out/2026). Simula por padrão; grava com --apply.
// Guarda backup (JSON) de tudo que muda em _backups/.
//
//   1. Datas "só dia" gravadas à meia-noite UTC (apareciam 1 dia antes no
//      Brasil) → meio-dia UTC, mesmo dia do calendário.
//   2. Bloqueios automáticos da fila (COOLDOWN/DAILY_BLOCK) ativos → desativados
//      (penalidade agora só avisa).
//   3. Fotos "em breve"/sem foto gravadas como foto do carro → removidas; capa
//      passa para a próxima foto real (ou fica sem capa).
//   4. Carros que a importação do feed tirou do site antes da marcação
//      `removed` → marcados, para voltarem sozinhos se reaparecerem no feed.
//
// Uso: node scripts/fix-legacy-data-2026-10.cjs [--apply] [--db=<url>]
// =============================================================================

const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
const { PrismaClient } = require('@prisma/client')

const APPLY = process.argv.includes('--apply')
const dbArg = process.argv.find((a) => a.startsWith('--db='))
const prisma = new PrismaClient(dbArg ? { datasources: { db: { url: dbArg.slice(5) } } } : undefined)

const DATE_ONLY = [
  ['deals', 'deliveryDate'], ['deals', 'consignDeadline'],
  ['deal_payments', 'dueDate'], ['deal_payments', 'firstDueDate'], ['deal_payments', 'paidAt'],
  ['deal_debts', 'dueDate'],
  ['financial_entries', 'dueDate'], ['financial_entries', 'competenceDate'],
  ['pendencies', 'dueDate'], ['pendency_events', 'newDueDate'],
  ['persons', 'dataNascimento'], ['finance_proponents', 'dataNascimento'],
  ['tenant_partners', 'dataNascimento'], ['tenants', 'dataAbertura'],
]

// Mesma regra de src/lib/vehicle-placeholder.ts (isPlaceholderPhoto).
function isPlaceholderPhoto(url) {
  const file = String(url).split(/[?#]/)[0].split('/').pop() || ''
  let name = file
  try { name = decodeURIComponent(file) } catch { /* mantém */ }
  return /(em[-_ ]?breve|coming[-_ ]?soon|sem[-_ ]?fotos?|no[-_ ]?(image|photo)|aguardando[-_ ]?fotos?)/i.test(name)
}

async function main() {
  const backup = { at: new Date().toISOString(), apply: APPLY, dates: {}, penalties: [], photos: [], feedRemoved: {} }

  // 1) Datas
  for (const [t, c] of DATE_ONLY) {
    const rows = await prisma.$queryRawUnsafe(`select id, "${c}" as v from "${t}" where "${c}" is not null and "${c}" = date_trunc('day', "${c}")`)
    backup.dates[`${t}.${c}`] = rows.map((r) => [r.id, r.v])
    console.log(`datas  ${t}.${c}: ${rows.length}`)
    if (APPLY && rows.length) {
      await prisma.$executeRawUnsafe(`update "${t}" set "${c}" = "${c}" + interval '12 hours' where "${c}" is not null and "${c}" = date_trunc('day', "${c}")`)
    }
  }

  // 2) Bloqueios automáticos da fila
  const pens = await prisma.sellerQueuePenalty.findMany({ where: { active: true, type: { in: ['COOLDOWN', 'DAILY_BLOCK'] } }, select: { id: true, sellerId: true, type: true, endsAt: true } })
  backup.penalties = pens
  console.log(`fila   bloqueios automáticos ativos: ${pens.length}`)
  if (APPLY && pens.length) await prisma.sellerQueuePenalty.updateMany({ where: { id: { in: pens.map((p) => p.id) } }, data: { active: false } })

  // 3) Fotos placeholder
  const photos = await prisma.vehiclePhoto.findMany({ select: { id: true, vehicleId: true, url: true, isMain: true, order: true } })
  const bad = photos.filter((p) => isPlaceholderPhoto(p.url))
  backup.photos = bad
  console.log(`fotos  "em breve" gravadas como foto: ${bad.length}`)
  for (const vehicleId of new Set(bad.map((p) => p.vehicleId))) {
    const rest = photos.filter((p) => p.vehicleId === vehicleId && !isPlaceholderPhoto(p.url)).sort((a, b) => a.order - b.order)
    const v = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { plate: true, mainPhotoUrl: true } })
    console.log(`       ${v?.plate ?? vehicleId}: remove ${bad.filter((p) => p.vehicleId === vehicleId).length}, ficam ${rest.length}`)
    if (!APPLY) continue
    await prisma.$transaction([
      prisma.vehiclePhoto.deleteMany({ where: { id: { in: bad.filter((p) => p.vehicleId === vehicleId).map((p) => p.id) } } }),
      ...rest.map((p, i) => prisma.vehiclePhoto.update({ where: { id: p.id }, data: { order: i, isMain: i === 0 } })),
      prisma.vehicle.update({ where: { id: vehicleId }, data: { mainPhotoUrl: rest[0]?.url ?? null } }),
    ])
  }
  // Capa apontando para placeholder sem VehiclePhoto correspondente.
  const covers = await prisma.vehicle.findMany({ where: { mainPhotoUrl: { not: null } }, select: { id: true, mainPhotoUrl: true } })
  const badCovers = covers.filter((v) => isPlaceholderPhoto(v.mainPhotoUrl))
  backup.badCovers = badCovers
  console.log(`fotos  capas "em breve" restantes: ${badCovers.length}`)
  if (APPLY) for (const v of badCovers) {
    const first = await prisma.vehiclePhoto.findFirst({ where: { vehicleId: v.id }, orderBy: [{ isMain: 'desc' }, { order: 'asc' }], select: { url: true } })
    await prisma.vehicle.update({ where: { id: v.id }, data: { mainPhotoUrl: first && !isPlaceholderPhoto(first.url) ? first.url : null } })
  }

  // 4) Marcação dos carros tirados do site pela importação do feed
  const states = await prisma.systemSetting.findMany({ where: { key: { endsWith: ':site:feedimport:v1' } }, select: { id: true, key: true, value: true, tenantId: true } })
  for (const st of states) {
    let s
    try { s = JSON.parse(st.value || '{}') } catch { continue }
    const ids = Object.values(s.map || {})
    if (!ids.length) continue
    const deletedByUser = new Set((await prisma.auditLog.findMany({ where: { entity: 'Vehicle', action: 'DELETE', entityId: { in: ids } }, select: { entityId: true } })).map((a) => a.entityId))
    const cands = await prisma.vehicle.findMany({
      where: { id: { in: ids }, active: false, exitDate: { not: null }, stockStatus: { notIn: ['VENDIDO', 'EM_NEGOCIACAO', 'RESERVADO'] } },
      select: { id: true, plate: true },
    })
    const mark = cands.filter((v) => !deletedByUser.has(v.id) && !(s.removed || {})[v.id])
    backup.feedRemoved[st.key] = mark.map((v) => v.id)
    console.log(`feed   ${st.key}: ${mark.length} carro(s) marcados para voltar se reaparecerem no feed`)
    if (APPLY && mark.length) {
      s.removed = s.removed || {}
      for (const v of mark) s.removed[v.id] = true
      await prisma.systemSetting.update({ where: { id: st.id }, data: { value: JSON.stringify(s) } })
    }
  }

  const dir = path.join(__dirname, '..', '_backups')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `fix-legacy-data-${APPLY ? 'apply' : 'dry'}-${Date.now()}.json`)
  fs.writeFileSync(file, JSON.stringify(backup, null, 1))
  console.log(`\n${APPLY ? 'APLICADO' : 'SIMULAÇÃO (use --apply para gravar)'} — backup: ${file}`)
}

main().catch((e) => { console.error(e); process.exitCode = 1 }).finally(() => prisma.$disconnect())
