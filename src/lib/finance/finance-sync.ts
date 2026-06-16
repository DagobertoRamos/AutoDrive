// =============================================================================
// Financeiro — integração com vendas e comissões.
// Gera FinancialEntry de forma IDEMPOTENTE a partir do que já existe:
//   - Deal FINALIZADA (com saleAmount) → RECEITA  (source=VENDA, 1 por deal)
//   - CommissionCalculation            → DESPESA  (source por ruleType, 1 por comissão)
// Idempotência garantida pelos @@unique [dealId, source] e [commissionCalculationId]
// e por skipDuplicates. Cada entry herda o tenant do registro de origem e recebe
// uma CATEGORIA padrão (criada sob demanda por tenant), para alimentar DRE/relatórios.
// =============================================================================

import type { UserRole } from '@/lib/permissions'
import { tenantWhere } from '@/lib/auth-guards'
import { prisma } from '@/lib/prisma'

const COMMISSION_SOURCE: Record<string, string> = { RETORNO: 'RETORNO', GARANTIA: 'GARANTIA' }

// Categoria padrão por origem do lançamento.
const CATEGORY_BY_SOURCE: Record<string, { name: string; kind: 'RECEITA' | 'DESPESA' }> = {
  VENDA: { name: 'Vendas', kind: 'RECEITA' },
  COMISSAO: { name: 'Comissões', kind: 'DESPESA' },
  RETORNO: { name: 'Comissões — Retornos', kind: 'DESPESA' },
  GARANTIA: { name: 'Comissões — Garantias', kind: 'DESPESA' },
}

/** Garante a categoria padrão da origem para o tenant; cacheia o id por execução. */
async function ensureCategoryId(tenantId: string | null, source: string, cache: Map<string, string>): Promise<string> {
  const def = CATEGORY_BY_SOURCE[source] ?? CATEGORY_BY_SOURCE.COMISSAO
  const key = `${tenantId ?? 'null'}:${def.name}`
  const cached = cache.get(key)
  if (cached) return cached
  let cat = await prisma.financialCategory.findFirst({ where: { tenantId: tenantId ?? null, name: def.name, kind: def.kind } })
  if (!cat) cat = await prisma.financialCategory.create({ data: { tenantId: tenantId ?? null, name: def.name, kind: def.kind } })
  cache.set(key, cat.id)
  return cat.id
}

/** Núcleo: sincroniza usando os `where` informados para deal e comissão. */
async function runSync(dealWhere: Record<string, unknown>, commWhere: Record<string, unknown>): Promise<{ vendas: number; comissoes: number }> {
  const catCache = new Map<string, string>()

  // ── Vendas finalizadas → RECEITA ──────────────────────────────────────
  const deals = await prisma.deal.findMany({
    where: { ...dealWhere, type: 'VENDA', status: 'FINALIZADA', saleAmount: { gt: 0 } } as never,
    select: { id: true, tenantId: true, unitId: true, sellerId: true, dealNumber: true, saleAmount: true, finalizedAt: true, saleDate: true, createdAt: true },
  })
  const dealIds = deals.map((d) => d.id)
  const existingDeal = dealIds.length
    ? await prisma.financialEntry.findMany({ where: { source: 'VENDA', dealId: { in: dealIds } }, select: { dealId: true } })
    : []
  const haveDeal = new Set(existingDeal.map((e) => e.dealId))
  const dealEntries: Record<string, unknown>[] = []
  for (const d of deals.filter((x) => !haveDeal.has(x.id))) {
    const when = d.finalizedAt ?? d.saleDate ?? d.createdAt
    dealEntries.push({
      tenantId: d.tenantId, unitId: d.unitId, sellerId: d.sellerId, dealId: d.id, source: 'VENDA',
      type: 'RECEITA', status: 'RECEBIDO', description: `Venda ${d.dealNumber ?? d.id.slice(0, 8)}`,
      amount: d.saleAmount ?? 0, competenceDate: when, dueDate: when, paidDate: when,
      categoryId: await ensureCategoryId(d.tenantId, 'VENDA', catCache),
    })
  }

  // ── Comissões → DESPESA ───────────────────────────────────────────────
  const comissoes = await prisma.commissionCalculation.findMany({
    where: commWhere as never,
    select: { id: true, tenantId: true, sellerId: true, ruleType: true, description: true, commissionValue: true, status: true, createdAt: true },
  })
  const comIds = comissoes.map((c) => c.id)

  // Reconciliação: comissões PREVISTO são deletadas/recriadas no recálculo
  // (garantia/retorno). Remove as DESPESA PREVISTO de comissão que ficaram
  // órfãs (commissionCalculationId não existe mais). PAGO é preservado.
  await prisma.financialEntry.deleteMany({
    where: {
      ...commWhere,
      source: { in: ['COMISSAO', 'RETORNO', 'GARANTIA'] },
      status: 'PREVISTO',
      commissionCalculationId: comIds.length ? { notIn: comIds } : { not: null },
    } as never,
  }).catch(() => { /* não bloqueia o sync */ })

  const existingCom = comIds.length
    ? await prisma.financialEntry.findMany({ where: { commissionCalculationId: { in: comIds } }, select: { commissionCalculationId: true } })
    : []
  const haveCom = new Set(existingCom.map((e) => e.commissionCalculationId))
  const comEntries: Record<string, unknown>[] = []
  for (const c of comissoes.filter((x) => !haveCom.has(x.id))) {
    const source = COMMISSION_SOURCE[c.ruleType] ?? 'COMISSAO'
    comEntries.push({
      tenantId: c.tenantId, sellerId: c.sellerId, commissionCalculationId: c.id, source,
      type: 'DESPESA', status: c.status === 'PAGO' ? 'PAGO' : 'PREVISTO',
      description: c.description || `Comissão ${c.ruleType}`, amount: c.commissionValue,
      competenceDate: c.createdAt, dueDate: c.createdAt, paidDate: c.status === 'PAGO' ? c.createdAt : null,
      categoryId: await ensureCategoryId(c.tenantId, source, catCache),
    })
  }

  let vendas = 0
  let comissoesCount = 0
  if (dealEntries.length) vendas = (await prisma.financialEntry.createMany({ data: dealEntries as never, skipDuplicates: true })).count
  if (comEntries.length) comissoesCount = (await prisma.financialEntry.createMany({ data: comEntries as never, skipDuplicates: true })).count

  // Backfill: lançamentos com origem conhecida mas sem categoria (criados antes
  // desta lógica) recebem a categoria padrão da origem.
  const semCategoria = await prisma.financialEntry.groupBy({
    by: ['tenantId', 'source'],
    where: { ...commWhere, categoryId: null, source: { in: ['VENDA', 'COMISSAO', 'RETORNO', 'GARANTIA'] } } as never,
  })
  for (const g of semCategoria as { tenantId: string | null; source: string | null }[]) {
    const catId = await ensureCategoryId(g.tenantId, g.source ?? 'COMISSAO', catCache)
    await prisma.financialEntry.updateMany({
      where: { tenantId: g.tenantId, source: g.source, categoryId: null } as never,
      data: { categoryId: catId },
    }).catch(() => {})
  }

  return { vendas, comissoes: comissoesCount }
}

/** Sync manual (endpoint /api/finance/sync): respeita o papel via tenantWhere. */
export async function syncFinanceFromBusiness(role: UserRole, tenantId: string | null): Promise<{ vendas: number; comissoes: number }> {
  const w = tenantWhere(role, tenantId, {})
  return runSync(w, w)
}

/** Sync automático pós-finalização: sempre estrito ao tenant informado (inclui null=legado). */
export async function syncTenantFinance(tenantId: string | null): Promise<{ vendas: number; comissoes: number }> {
  const w = { tenantId }
  return runSync(w, w)
}
