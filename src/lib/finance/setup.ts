// =============================================================================
// Preparação do Centro Financeiro da loja (idempotente, roda sob demanda):
//   • plano de contas padrão de revenda (DEFAULT_CHART): cria o que faltar por
//     código — lojas antigas ganham as contas novas sem duplicar;
//   • encaixa as categorias antigas (criadas pelas integrações) no ramo e na
//     linha da DRE correspondentes;
//   • centros de resultado/custo padrão (RESULT_CENTERS): reaproveita os
//     centros antigos de mesmo nome e cria os que faltam.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { DEFAULT_CHART, guessDreGroup } from './dre-core'
import { RESULT_CENTERS, legacyCenterKey } from './result-centers-core'

const done = new Set<string>()

export async function ensureFinanceSetup(tenantId: string): Promise<void> {
  if (done.has(tenantId)) return

  // ── Plano de contas (cria o que faltar, por código) ────────────────────────
  const cats = await prisma.financialCategory.findMany({ where: { tenantId }, select: { id: true, name: true, kind: true, code: true, parentId: true } })
  const byCode = new Map(cats.filter((c) => c.code).map((c) => [c.code as string, c.id]))
  const firstRun = byCode.size === 0
  // Na primeira vez, categorias antigas de mesmo nome viram a subcategoria do plano.
  const byName = new Map(cats.filter((c) => !c.code).map((c) => [`${c.kind}:${c.name.trim().toLowerCase()}`, c.id]))
  let order = 0
  for (const top of DEFAULT_CHART) {
    let parentId = byCode.get(top.code)
    if (!parentId) {
      parentId = (await prisma.financialCategory.create({
        data: { tenantId, name: top.name, kind: top.kind, code: top.code, dreGroup: top.dreGroup, sortOrder: order },
        select: { id: true },
      })).id
      byCode.set(top.code, parentId)
    }
    order++
    for (const [i, ch] of (top.children ?? []).entries()) {
      if (byCode.has(ch.code)) continue
      const reuse = firstRun ? byName.get(`${top.kind}:${ch.name.toLowerCase()}`) : undefined
      if (reuse) {
        await prisma.financialCategory.update({ where: { id: reuse }, data: { parentId, code: ch.code, sortOrder: i } })
        byName.delete(`${top.kind}:${ch.name.toLowerCase()}`)
        byCode.set(ch.code, reuse)
      } else {
        const c = await prisma.financialCategory.create({ data: { tenantId, name: ch.name, kind: top.kind, code: ch.code, parentId, sortOrder: i }, select: { id: true } })
        byCode.set(ch.code, c.id)
      }
    }
  }

  // Categorias soltas (sem pai e sem código): ganham grupo da DRE e entram no
  // ramo do plano com o mesmo grupo.
  const loose = await prisma.financialCategory.findMany({ where: { tenantId, parentId: null, code: null }, select: { id: true, name: true, kind: true, dreGroup: true } })
  if (loose.length) {
    const tops = await prisma.financialCategory.findMany({ where: { tenantId, parentId: null, code: { not: null } }, select: { id: true, dreGroup: true, kind: true } })
    for (const c of loose) {
      const group = c.dreGroup ?? guessDreGroup(c.name, c.kind)
      const home = tops.find((t) => t.dreGroup === group && t.kind === c.kind)
      await prisma.financialCategory.update({ where: { id: c.id }, data: { dreGroup: home ? null : group, parentId: home?.id ?? null } })
    }
  }

  // ── Centros de resultado / custo ───────────────────────────────────────────
  const centers = await prisma.financialCostCenter.findMany({ where: { tenantId }, select: { id: true, name: true, systemKey: true } })
  const haveKey = new Set(centers.map((c) => c.systemKey).filter(Boolean))
  for (const c of centers) {
    if (c.systemKey) continue
    const key = legacyCenterKey(c.name)
    if (key && !haveKey.has(key)) {
      await prisma.financialCostCenter.update({ where: { id: c.id }, data: { systemKey: key, kind: RESULT_CENTERS.find((d) => d.key === key)?.kind ?? 'CUSTO' } })
      haveKey.add(key)
    }
  }
  const missing = RESULT_CENTERS.filter((d) => !haveKey.has(d.key))
  if (missing.length) {
    await prisma.financialCostCenter.createMany({ data: missing.map((d) => ({ tenantId, name: d.name, kind: d.kind, systemKey: d.key, code: d.key.slice(0, 3) })) })
  }
  done.add(tenantId)
}

/** Ids dos centros padrão da loja por chave (VENDAS, DOCUMENTACAO…). */
export async function resultCenterIds(tenantId: string): Promise<Record<string, string>> {
  await ensureFinanceSetup(tenantId)
  const rows = await prisma.financialCostCenter.findMany({ where: { tenantId, systemKey: { not: null } }, select: { id: true, systemKey: true } })
  return Object.fromEntries(rows.map((r) => [r.systemKey as string, r.id]))
}

/** Id da categoria do plano pelo código (ex.: '4.2'). */
export async function categoryIdByCode(tenantId: string, code: string): Promise<string | null> {
  await ensureFinanceSetup(tenantId)
  return (await prisma.financialCategory.findFirst({ where: { tenantId, code }, select: { id: true } }))?.id ?? null
}
