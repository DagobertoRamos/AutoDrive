// =============================================================================
// finance/bonus-periodo-config.ts — Bônus de PERÍODO (mensais, agregados) por
// tenant. Três blocos, todos editáveis:
//   • producaoLoja — por colaborador: R$ por CARRO da UNIDADE (venda/troca).
//       Ex.: Anderson R$50/carro, Cesar R$10/carro (sobre o total da unidade).
//   • metaLoja     — quando a unidade atinge o alvo de vendas no mês, paga um
//       fixo por cargo (vendedor / gerente).
//   • dezenaCombo  — bônus extra quando o vendedor fecha as 3 dezenas do mês.
// Recalculado de forma idempotente pelo recalc do período. JSON em SystemSetting.
// =============================================================================

import { prisma } from '@/lib/prisma'

const KEY = (tenantId: string) => `t:${tenantId}:bonus_periodo_config`

export interface ProducaoRate {
  key: string   // "s:<sellerId>" | "m:<managerId>"
  nome: string
  rate: number  // R$ por carro da unidade
}
export interface BonusPeriodoConfig {
  producaoLoja: { active: boolean; rates: ProducaoRate[] }
  metaLoja: { active: boolean; targetUnitSales: number; vendedor: number; gerente: number }
  dezenaCombo: { active: boolean; value: number }
}

export const DEFAULT_BONUS_PERIODO_CONFIG: BonusPeriodoConfig = {
  producaoLoja: { active: false, rates: [] },
  metaLoja: { active: false, targetUnitSales: 0, vendedor: 250, gerente: 500 },
  dezenaCombo: { active: false, value: 1000 },
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function coerceRate(raw: unknown): ProducaoRate | null {
  const o = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {}
  const key = String(o.key ?? '').trim()
  if (!/^[sm]:.+/.test(key)) return null
  return { key, nome: String(o.nome ?? '').trim().slice(0, 120), rate: Math.max(0, num(o.rate)) }
}

export function coerceBonusPeriodoConfig(raw: unknown): BonusPeriodoConfig {
  const o = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {}
  const pl = (o.producaoLoja && typeof o.producaoLoja === 'object') ? o.producaoLoja as Record<string, unknown> : {}
  const ml = (o.metaLoja && typeof o.metaLoja === 'object') ? o.metaLoja as Record<string, unknown> : {}
  const dc = (o.dezenaCombo && typeof o.dezenaCombo === 'object') ? o.dezenaCombo as Record<string, unknown> : {}
  return {
    producaoLoja: {
      active: pl.active === true,
      rates: Array.isArray(pl.rates) ? pl.rates.map(coerceRate).filter((r): r is ProducaoRate => r != null) : [],
    },
    metaLoja: {
      active: ml.active === true,
      targetUnitSales: Math.max(0, Math.round(num(ml.targetUnitSales))),
      vendedor: Math.max(0, num(ml.vendedor, 250)),
      gerente: Math.max(0, num(ml.gerente, 500)),
    },
    dezenaCombo: {
      active: dc.active === true,
      value: Math.max(0, num(dc.value, 1000)),
    },
  }
}

export async function getBonusPeriodoConfig(tenantId: string): Promise<BonusPeriodoConfig> {
  const row = await prisma.systemSetting.findFirst({ where: { key: KEY(tenantId) }, select: { value: true } }).catch(() => null)
  if (!row?.value) return structuredCloneCfg(DEFAULT_BONUS_PERIODO_CONFIG)
  try { return coerceBonusPeriodoConfig(JSON.parse(row.value)) } catch { return structuredCloneCfg(DEFAULT_BONUS_PERIODO_CONFIG) }
}

function structuredCloneCfg(c: BonusPeriodoConfig): BonusPeriodoConfig {
  return { producaoLoja: { active: c.producaoLoja.active, rates: [...c.producaoLoja.rates] }, metaLoja: { ...c.metaLoja }, dezenaCombo: { ...c.dezenaCombo } }
}

export async function setBonusPeriodoConfig(tenantId: string, patch: Partial<BonusPeriodoConfig>): Promise<BonusPeriodoConfig> {
  const current = await getBonusPeriodoConfig(tenantId)
  const next = coerceBonusPeriodoConfig({ ...current, ...patch })
  const value = JSON.stringify(next)
  const existing = await prisma.systemSetting.findFirst({ where: { key: KEY(tenantId) }, select: { id: true } })
  if (existing) await prisma.systemSetting.update({ where: { id: existing.id }, data: { value } })
  else await prisma.systemSetting.create({ data: { key: KEY(tenantId), value, group: 'finance' } })
  return next
}
