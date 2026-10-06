// =============================================================================
// Preparação do Centro Financeiro da loja (idempotente, roda sob demanda):
//   • cria o plano de contas padrão de revenda (DEFAULT_CHART) se a loja ainda
//     não tem plano em árvore;
//   • encaixa as categorias antigas (criadas pelas integrações) no grupo do
//     plano e na linha da DRE correspondentes;
//   • cria os centros de custo padrão se não houver nenhum.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { DEFAULT_CHART, DEFAULT_COST_CENTERS, guessDreGroup } from './dre-core'

const done = new Set<string>()

export async function ensureFinanceSetup(tenantId: string): Promise<void> {
  if (done.has(tenantId)) return
  const hasChart = await prisma.financialCategory.count({ where: { tenantId, code: { not: null } } })
  if (!hasChart) {
    const existing = await prisma.financialCategory.findMany({ where: { tenantId }, select: { id: true, name: true, kind: true } })
    const byName = new Map(existing.map((c) => [`${c.kind}:${c.name.trim().toLowerCase()}`, c.id]))
    let order = 0
    for (const top of DEFAULT_CHART) {
      const parent = await prisma.financialCategory.create({
        data: { tenantId, name: top.name, kind: top.kind, code: top.code, dreGroup: top.dreGroup, sortOrder: order++ },
        select: { id: true },
      })
      for (const [i, ch] of (top.children ?? []).entries()) {
        const reuse = byName.get(`${top.kind}:${ch.name.toLowerCase()}`)
        if (reuse) {
          await prisma.financialCategory.update({ where: { id: reuse }, data: { parentId: parent.id, code: ch.code, sortOrder: i } })
          byName.delete(`${top.kind}:${ch.name.toLowerCase()}`)
        } else {
          await prisma.financialCategory.create({ data: { tenantId, name: ch.name, kind: top.kind, code: ch.code, parentId: parent.id, sortOrder: i } })
        }
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

  if (!(await prisma.financialCostCenter.count({ where: { tenantId } }))) {
    await prisma.financialCostCenter.createMany({ data: DEFAULT_COST_CENTERS.map((name, i) => ({ tenantId, name, code: String(i + 1) })) })
  }
  done.add(tenantId)
}
