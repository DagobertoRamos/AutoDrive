// =============================================================================
// finance/retorno-config.ts — Cadastro GLOBAL de retorno por tenant (Parte A).
//
// Uma única configuração vale para todos os financiamentos da loja:
//   • faixa de retorno permitida (min%–max%) — validação/guarda
//   • ILA% e IOF% — deduções sobre o retorno BRUTO
//
// A comissão do retorno em si (o % do colaborador) NÃO fica aqui — vem de uma
// CommissionRule(RETORNO), que já resolve por cargo/vendedor no matcher.
//
// Guardado como JSON em SystemSetting (sem coluna nova / sem migration), no
// mesmo padrão do token/de-para do AutoConf.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { calculateReturn, RETURN_RATE_MIN, RETURN_RATE_MAX } from '@/lib/finance/return-calc'

const KEY = (tenantId: string) => `t:${tenantId}:retorno_config`

export interface RetornoConfig {
  active: boolean
  ilaPercent: number
  iofPercent: number
  minReturnPercent: number
  maxReturnPercent: number
  /** % padrão para calcular o bruto quando o AutoConf não trouxe o valor do retorno. */
  defaultReturnPercent: number | null
}

export const DEFAULT_RETORNO_CONFIG: RetornoConfig = {
  active: false,
  ilaPercent: 0,
  iofPercent: 0,
  minReturnPercent: RETURN_RATE_MIN,
  maxReturnPercent: RETURN_RATE_MAX,
  defaultReturnPercent: null,
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function coerce(raw: unknown): RetornoConfig {
  const o = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {}
  return {
    active: o.active === true,
    ilaPercent: Math.max(0, num(o.ilaPercent)),
    iofPercent: Math.max(0, num(o.iofPercent)),
    minReturnPercent: num(o.minReturnPercent, RETURN_RATE_MIN),
    maxReturnPercent: num(o.maxReturnPercent, RETURN_RATE_MAX),
    defaultReturnPercent: o.defaultReturnPercent == null ? null : Math.max(0, num(o.defaultReturnPercent)),
  }
}

export async function getRetornoConfig(tenantId: string): Promise<RetornoConfig> {
  const row = await prisma.systemSetting.findFirst({ where: { key: KEY(tenantId) }, select: { value: true } }).catch(() => null)
  if (!row?.value) return { ...DEFAULT_RETORNO_CONFIG }
  try { return coerce(JSON.parse(row.value)) } catch { return { ...DEFAULT_RETORNO_CONFIG } }
}

export async function setRetornoConfig(tenantId: string, patch: Partial<RetornoConfig>): Promise<RetornoConfig> {
  const current = await getRetornoConfig(tenantId)
  const next = coerce({ ...current, ...patch })
  const value = JSON.stringify(next)
  const existing = await prisma.systemSetting.findFirst({ where: { key: KEY(tenantId) }, select: { id: true } })
  if (existing) await prisma.systemSetting.update({ where: { id: existing.id }, data: { value } })
  else await prisma.systemSetting.create({ data: { key: KEY(tenantId), value, group: 'finance' } })
  return next
}

export interface ComputedReturn {
  returnGrossValue: number
  ilaValue: number
  iofValue: number
  returnNetValue: number
}

/**
 * Calcula bruto/ILA/IOF/líquido do retorno de UMA negociação a partir do que o
 * AutoConf trouxe, aplicando o cadastro global. Regra de bruto:
 *   1) se o AutoConf trouxe o VALOR do retorno → usa direto como bruto (mais fiel);
 *   2) senão, se há financiado e % (do deal ou o padrão do cadastro) → financiado × %.
 * Retorna null quando não há retorno a lançar (config inativa ou bruto = 0).
 */
export function computeReturnFromAutoconf(input: {
  config: RetornoConfig
  financedAmount?: number | null
  retornoValue?: number | null      // valor do retorno vindo do AutoConf (bruto)
  returnPercent?: number | null     // % do retorno da própria negociação, se houver
}): ComputedReturn | null {
  const { config } = input
  if (!config.active) return null

  const retornoValue = Math.max(0, num(input.retornoValue))
  const financed = Math.max(0, num(input.financedAmount))
  const rate = input.returnPercent != null ? Math.max(0, num(input.returnPercent)) : (config.defaultReturnPercent ?? 0)

  let gross: number
  if (retornoValue > 0) {
    gross = retornoValue
  } else if (financed > 0 && rate > 0) {
    // reaproveita a matemática canônica (bruto = financiado × rate; deduções sobre o bruto)
    const r = calculateReturn({
      financedAmount: financed,
      returnRatePercent: rate,
      ilaPercent: config.ilaPercent,
      iofPercent: config.iofPercent,
      minReturnPercent: config.minReturnPercent,
      maxReturnPercent: config.maxReturnPercent,
    })
    return { returnGrossValue: r.returnGrossValue, ilaValue: r.ilaValue, iofValue: r.iofValue, returnNetValue: r.returnNetValue }
  } else {
    return null
  }

  // Caminho (1): bruto veio pronto do AutoConf → aplica ILA/IOF sobre o bruto.
  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
  const ilaValue = round2((gross * config.ilaPercent) / 100)
  const iofValue = round2((gross * config.iofPercent) / 100)
  const returnNetValue = Math.max(0, round2(gross - ilaValue - iofValue))
  return { returnGrossValue: round2(gross), ilaValue, iofValue, returnNetValue }
}
