// =============================================================================
// finance/garantia-config.ts — Cadastro GLOBAL da comissão de GARANTIA por
// tenant. Modelo POR PRODUTO com CHEIA × DESCONTO + quem paga:
//   • LOJA paga  → cortesia → SEM comissão.
//   • CLIENTE paga → comissão por produto, tier CHEIA ou DESCONTO.
//
// O valor COBRADO do cliente vem REAL do AutoConf (resumo → Itens da Negociação,
// ex.: "Gestauto - +150EX 2anos · Cliente paga · R$ 3.350,00"). O tier é
// detectado pelo valor: cobrado >= `valorCheia` → CHEIA; abaixo → DESCONTO.
// (Um override manual por lançamento pode forçar o tier.) `gerente` é fixo por
// garantia (independe de cheia/desconto). Tudo editável. JSON em SystemSetting.
// =============================================================================

import { prisma } from '@/lib/prisma'

const KEY = (tenantId: string) => `t:${tenantId}:garantia_config`

export interface GarantiaProduto {
  match: string               // trecho do nome do produto (ex.: "150ex 2anos")
  valorCheia: number | null   // preço cheio: cobrado >= este → CHEIA; abaixo → DESCONTO
  vendedorCheia: number
  vendedorDesconto: number
  gerente: number             // fixo por garantia (cheia/desconto igual)
}
export interface GarantiaConfig {
  active: boolean
  lojaPagaSemComissao: boolean
  produtos: GarantiaProduto[]
  defaultGerente: number
  defaultVendedorCheia: number
  defaultVendedorDesconto: number
}

export type GarantiaPayer = 'LOJA' | 'CLIENTE' | null
export type GarantiaTier = 'CHEIA' | 'DESCONTO'

export function normalizePayer(v: unknown): GarantiaPayer {
  const s = String(v ?? '').trim().toUpperCase()
  return s === 'LOJA' || s === 'CLIENTE' ? s : null
}

/** Normaliza texto p/ casar produto: minúsculo, sem acento, alfanumérico. */
export function normProduct(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export const DEFAULT_GARANTIA_CONFIG: GarantiaConfig = {
  active: true,
  lojaPagaSemComissao: true,
  produtos: [],
  defaultGerente: 0,
  defaultVendedorCheia: 0,
  defaultVendedorDesconto: 0,
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function coerceProduto(raw: unknown): GarantiaProduto {
  const o = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {}
  return {
    match: String(o.match ?? '').trim().slice(0, 80),
    valorCheia: o.valorCheia == null || o.valorCheia === '' ? null : Math.max(0, num(o.valorCheia)),
    vendedorCheia: Math.max(0, num(o.vendedorCheia)),
    vendedorDesconto: Math.max(0, num(o.vendedorDesconto)),
    gerente: Math.max(0, num(o.gerente)),
  }
}

export function coerceGarantiaConfig(raw: unknown): GarantiaConfig {
  const o = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {}
  const produtos = Array.isArray(o.produtos)
    ? o.produtos.map(coerceProduto).filter((p) => p.match.length > 0)
    : DEFAULT_GARANTIA_CONFIG.produtos
  return {
    active: o.active !== false,
    lojaPagaSemComissao: o.lojaPagaSemComissao !== false,
    produtos,
    defaultGerente: Math.max(0, num(o.defaultGerente)),
    defaultVendedorCheia: Math.max(0, num(o.defaultVendedorCheia)),
    defaultVendedorDesconto: Math.max(0, num(o.defaultVendedorDesconto)),
  }
}

export async function getGarantiaConfig(tenantId: string): Promise<GarantiaConfig> {
  const row = await prisma.systemSetting.findFirst({ where: { key: KEY(tenantId) }, select: { value: true } }).catch(() => null)
  if (!row?.value) return { ...DEFAULT_GARANTIA_CONFIG }
  try { return coerceGarantiaConfig(JSON.parse(row.value)) } catch { return { ...DEFAULT_GARANTIA_CONFIG } }
}

export async function setGarantiaConfig(tenantId: string, patch: Partial<GarantiaConfig>): Promise<GarantiaConfig> {
  const current = await getGarantiaConfig(tenantId)
  const next = coerceGarantiaConfig({ ...current, ...patch })
  const value = JSON.stringify(next)
  const existing = await prisma.systemSetting.findFirst({ where: { key: KEY(tenantId) }, select: { id: true } })
  if (existing) await prisma.systemSetting.update({ where: { id: existing.id }, data: { value } })
  else await prisma.systemSetting.create({ data: { key: KEY(tenantId), value, group: 'finance' } })
  return next
}

/**
 * Casa o produto do lançamento contra os cadastrados. Cada `match` é um conjunto
 * de TOKENS (separados por espaço): todos precisam aparecer no nome do produto
 * (case/acento-insensível). Ex.: match "100 2anos" casa "+100PR 2anos" mas não
 * "+150EX 2anos". Mais tokens/mais longo = mais específico (desempata).
 */
export function matchGarantiaProduto(config: GarantiaConfig, produto: unknown): GarantiaProduto | null {
  const p = normProduct(produto)
  if (!p) return null
  const candidates = config.produtos
    .map((prod) => {
      const key = normProduct(prod.match)
      const tokens = key.split(' ').filter(Boolean)
      const ok = tokens.length > 0 && tokens.every((t) => p.includes(t))
      return { prod, ok, spec: key.replace(/\s+/g, '').length }
    })
    .filter((c) => c.ok)
    .sort((a, b) => b.spec - a.spec)
  return candidates[0]?.prod ?? null
}

/** Decide o tier pelo valor cobrado vs preço cheio do produto. */
export function resolveGarantiaTier(input: {
  produto: GarantiaProduto | null
  valorCobrado: number | null | undefined
  forceTier?: GarantiaTier | null
}): GarantiaTier {
  if (input.forceTier) return input.forceTier
  const full = input.produto?.valorCheia
  if (full != null && full > 0 && input.valorCobrado != null && Number.isFinite(input.valorCobrado)) {
    return input.valorCobrado >= full - 0.01 ? 'CHEIA' : 'DESCONTO'
  }
  return 'CHEIA' // sem preço cheio de referência → padrão cheia
}

/**
 * Comissão de garantia para UM colaborador. Retorna null quando a config está
 * inativa (aí o motor cai no modelo por regra). 0 = sem comissão:
 *   • loja paga cortesia (lojaPagaSemComissao);
 *   • produto/tier sem valor cadastrado (0).
 * `valorCobrado`: valor real cobrado do cliente (resumo AutoConf).
 * `payer`: 'LOJA' | 'CLIENTE' | null. `forceTier`: override manual do tier.
 */
export function computeGarantiaCommission(input: {
  config: GarantiaConfig
  produto: unknown
  valorCobrado?: number | null
  payer: GarantiaPayer | string | null | undefined
  isManager: boolean
  forceTier?: GarantiaTier | null
}): number | null {
  const { config } = input
  if (!config.active) return null
  const payer = normalizePayer(input.payer)
  if (payer === 'LOJA' && config.lojaPagaSemComissao) return 0
  const matched = matchGarantiaProduto(config, input.produto)
  const tier = resolveGarantiaTier({ produto: matched, valorCobrado: input.valorCobrado, forceTier: input.forceTier })
  if (input.isManager) return matched ? matched.gerente : config.defaultGerente
  if (tier === 'CHEIA') return matched ? matched.vendedorCheia : config.defaultVendedorCheia
  return matched ? matched.vendedorDesconto : config.defaultVendedorDesconto
}
