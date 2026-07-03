// =============================================================================
// finance/documento-config.ts — Cadastro GLOBAL da comissão de DOCUMENTAÇÃO
// (despachante) por tenant. Modelo TIERED + quem paga:
//   • LOJA paga → cortesia → SEM comissão.
//   • CLIENTE paga → faixa por valor cobrado:
//       fee < menor faixa           → 0
//       faixa [min, max]            → { gerente, vendedor }
// Tudo configurável (faixas e valores) para mudanças futuras de produtos/comissões.
// Guardado como JSON em SystemSetting (sem coluna nova por config).
// =============================================================================

import { prisma } from '@/lib/prisma'

const KEY = (tenantId: string) => `t:${tenantId}:documento_config`

export interface DocumentoTier {
  minFee: number
  maxFee: number | null // null = sem teto
  gerente: number
  vendedor: number
}
export interface DocumentoConfig {
  active: boolean
  lojaPagaSemComissao: boolean
  // Conservador: só paga comissão quando o pagador é CONFIRMADAMENTE o cliente.
  // Enquanto a venda não foi reimportada (payer = null), não paga — evita
  // comissão indevida. Desligue para tratar "desconhecido" como cliente.
  exigirPagadorCliente: boolean
  tiers: DocumentoTier[]
}

export type DocumentoPayer = 'LOJA' | 'CLIENTE' | null

export function normalizePayer(v: unknown): DocumentoPayer {
  const s = String(v ?? '').trim().toUpperCase()
  return s === 'LOJA' || s === 'CLIENTE' ? s : null
}

export const DEFAULT_DOCUMENTO_CONFIG: DocumentoConfig = {
  active: true,
  lojaPagaSemComissao: true,
  exigirPagadorCliente: true,
  tiers: [
    { minFee: 990, maxFee: 1489.99, gerente: 50, vendedor: 100 },
    { minFee: 1490, maxFee: null, gerente: 100, vendedor: 200 },
  ],
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function coerceTier(raw: unknown): DocumentoTier {
  const o = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {}
  return {
    minFee: Math.max(0, num(o.minFee)),
    maxFee: o.maxFee == null || o.maxFee === '' ? null : Math.max(0, num(o.maxFee)),
    gerente: Math.max(0, num(o.gerente)),
    vendedor: Math.max(0, num(o.vendedor)),
  }
}

export function coerceDocumentoConfig(raw: unknown): DocumentoConfig {
  const o = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {}
  const tiers = Array.isArray(o.tiers) ? o.tiers.map(coerceTier).sort((a, b) => a.minFee - b.minFee) : DEFAULT_DOCUMENTO_CONFIG.tiers
  return {
    active: o.active !== false,
    lojaPagaSemComissao: o.lojaPagaSemComissao !== false,
    exigirPagadorCliente: o.exigirPagadorCliente !== false,
    tiers,
  }
}

export async function getDocumentoConfig(tenantId: string): Promise<DocumentoConfig> {
  const row = await prisma.systemSetting.findFirst({ where: { key: KEY(tenantId) }, select: { value: true } }).catch(() => null)
  if (!row?.value) return { ...DEFAULT_DOCUMENTO_CONFIG }
  try { return coerceDocumentoConfig(JSON.parse(row.value)) } catch { return { ...DEFAULT_DOCUMENTO_CONFIG } }
}

export async function setDocumentoConfig(tenantId: string, patch: Partial<DocumentoConfig>): Promise<DocumentoConfig> {
  const current = await getDocumentoConfig(tenantId)
  const next = coerceDocumentoConfig({ ...current, ...patch })
  const value = JSON.stringify(next)
  const existing = await prisma.systemSetting.findFirst({ where: { key: KEY(tenantId) }, select: { id: true } })
  if (existing) await prisma.systemSetting.update({ where: { id: existing.id }, data: { value } })
  else await prisma.systemSetting.create({ data: { key: KEY(tenantId), value, group: 'finance' } })
  return next
}

/**
 * Comissão de documentação para UM colaborador. Retorna null quando a config
 * está inativa (aí o motor cai no modelo por regra). 0 = sem comissão:
 *   • loja paga cortesia (lojaPagaSemComissao);
 *   • pagador não confirmado como cliente (exigirPagadorCliente — conservador);
 *   • valor abaixo da menor faixa.
 * `payer`: 'LOJA' | 'CLIENTE' | null (null = ainda não reimportado / desconhecido).
 */
export function computeDocumentoCommission(input: {
  config: DocumentoConfig
  fee: number
  payer: DocumentoPayer | string | null | undefined
  isManager: boolean
}): number | null {
  const { config } = input
  if (!config.active) return null
  const payer = normalizePayer(input.payer)
  if (payer === 'LOJA' && config.lojaPagaSemComissao) return 0
  // Conservador: só paga com pagador CONFIRMADAMENTE cliente. Sem confirmação
  // (null) ou loja sem cortesia desligada, não paga a menos que o toggle libere.
  if (config.exigirPagadorCliente && payer !== 'CLIENTE') return 0
  const fee = Math.max(0, num(input.fee))
  const tier = config.tiers.find((t) => fee >= t.minFee && (t.maxFee == null || fee <= t.maxFee))
  if (!tier) return 0
  return input.isManager ? tier.gerente : tier.vendedor
}
