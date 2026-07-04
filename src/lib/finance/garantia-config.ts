// =============================================================================
// finance/garantia-config.ts — Cadastro GLOBAL da comissão de GARANTIA por
// tenant. Modelo POR PRODUTO + quem paga:
//   • LOJA paga  → cortesia → SEM comissão.
//   • CLIENTE paga → comissão FIXA por produto { gerente, vendedor }.
//   • Produto não cadastrado → usa o default (0 = não paga).
//
// A AutoConf NÃO expõe o valor cobrado do cliente (só o produto, o custo e o
// pagador). Por isso a comissão é ancorada no PRODUTO real capturado da AutoConf
// (ex.: "+150EX 2anos"), casado por trecho do nome (case/acento-insensível).
// `valorCobrado` é opcional/informativo (o preço que a loja cobra pelo produto).
// Guardado como JSON em SystemSetting (sem coluna nova por config).
// =============================================================================

import { prisma } from '@/lib/prisma'

const KEY = (tenantId: string) => `t:${tenantId}:garantia_config`

export interface GarantiaProduto {
  match: string          // trecho do nome do produto p/ casar (ex.: "150ex 2anos")
  valorCobrado: number | null // informativo: preço cobrado do cliente
  gerente: number
  vendedor: number
}
export interface GarantiaConfig {
  active: boolean
  lojaPagaSemComissao: boolean
  produtos: GarantiaProduto[]
  // Produto não cadastrado: usa estes (0 = não paga)
  defaultGerente: number
  defaultVendedor: number
}

export type GarantiaPayer = 'LOJA' | 'CLIENTE' | null

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
  defaultVendedor: 0,
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function coerceProduto(raw: unknown): GarantiaProduto {
  const o = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {}
  return {
    match: String(o.match ?? '').trim().slice(0, 80),
    valorCobrado: o.valorCobrado == null || o.valorCobrado === '' ? null : Math.max(0, num(o.valorCobrado)),
    gerente: Math.max(0, num(o.gerente)),
    vendedor: Math.max(0, num(o.vendedor)),
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
    defaultVendedor: Math.max(0, num(o.defaultVendedor)),
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

/** Casa o produto do lançamento contra os cadastrados (por trecho do nome). */
export function matchGarantiaProduto(config: GarantiaConfig, produto: unknown): GarantiaProduto | null {
  const p = normProduct(produto)
  if (!p) return null
  // Prioriza o match mais específico (trecho mais longo que casar).
  const candidates = config.produtos
    .map((prod) => ({ prod, key: normProduct(prod.match) }))
    .filter(({ key }) => key.length > 0 && p.includes(key))
    .sort((a, b) => b.key.length - a.key.length)
  return candidates[0]?.prod ?? null
}

/**
 * Comissão de garantia para UM colaborador. Retorna null quando a config está
 * inativa (aí o motor cai no modelo por regra). 0 = sem comissão:
 *   • loja paga cortesia (lojaPagaSemComissao);
 *   • produto sem cadastro e default 0.
 * `payer`: 'LOJA' | 'CLIENTE' | null.
 */
export function computeGarantiaCommission(input: {
  config: GarantiaConfig
  produto: unknown
  payer: GarantiaPayer | string | null | undefined
  isManager: boolean
}): number | null {
  const { config } = input
  if (!config.active) return null
  const payer = normalizePayer(input.payer)
  if (payer === 'LOJA' && config.lojaPagaSemComissao) return 0
  const matched = matchGarantiaProduto(config, input.produto)
  if (matched) return input.isManager ? matched.gerente : matched.vendedor
  return input.isManager ? config.defaultGerente : config.defaultVendedor
}
