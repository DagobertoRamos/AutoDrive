// =============================================================================
// finance/documento-config.ts — Cadastro GLOBAL da comissão de DOCUMENTAÇÃO
// (despachante) por tenant. Modelo TIERED + quem paga:
//   • LOJA paga → cortesia → SEM comissão.
//   • CLIENTE paga → faixa por valor cobrado:
//       fee < menor faixa           → 0
//       faixa [min, max]            → { gerente, vendedor, setor, setorGerente }
//   setor        = cada colaborador do cargo "Documentação" (por documento)
//   setorGerente = cada colaborador do cargo "Gerente de Documentação" (por documento)
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
  setor: number // por colaborador do cargo Documentação
  setorGerente: number // por colaborador do cargo Gerente de Documentação
}
export type DocumentoBeneficiary = 'VENDEDOR' | 'GERENTE' | 'SETOR' | 'SETOR_GERENTE'
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
    { minFee: 990, maxFee: 1489.99, gerente: 50, vendedor: 100, setor: 0, setorGerente: 0 },
    { minFee: 1490, maxFee: null, gerente: 100, vendedor: 200, setor: 0, setorGerente: 0 },
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
    setor: Math.max(0, num(o.setor)),
    setorGerente: Math.max(0, num(o.setorGerente)),
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
  /** Legado: true = gerente, false = vendedor. Use `beneficiary` para o setor. */
  isManager?: boolean
  beneficiary?: DocumentoBeneficiary
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
  const who: DocumentoBeneficiary = input.beneficiary ?? (input.isManager ? 'GERENTE' : 'VENDEDOR')
  return who === 'GERENTE' ? tier.gerente : who === 'SETOR' ? tier.setor : who === 'SETOR_GERENTE' ? tier.setorGerente : tier.vendedor
}

/**
 * Taxa de documentação da negociação: o campo próprio (documentationFee) ou, se
 * vazio, os débitos de Documentação/Despachante. Pagador: o informado; senão, o
 * responsável pelo débito (comprador → CLIENTE; loja → LOJA).
 */
export function resolveDocumentationFee(d: {
  documentationFee: unknown
  documentationPaidBy: string | null
  debts?: Array<{ type: string; value: unknown; responsavel: string | null }>
}): { fee: number; payer: DocumentoPayer } {
  const own = num(d.documentationFee)
  if (own > 0) return { fee: own, payer: normalizePayer(d.documentationPaidBy) }
  const docs = (d.debts ?? []).filter((x) => x.type === 'DOCUMENTACAO' || x.type === 'DESPACHANTE')
  const fee = Math.round(docs.reduce((s, x) => s + Math.max(0, num(x.value)), 0) * 100) / 100
  if (fee <= 0) return { fee: 0, payer: null }
  const resp = new Set(docs.map((x) => String(x.responsavel ?? '').toUpperCase()))
  const payer: DocumentoPayer = resp.has('LOJA') && resp.size === 1 ? 'LOJA'
    : [...resp].every((r) => r === 'COMPRADOR' || r === 'CLIENTE') ? 'CLIENTE'
    : normalizePayer(d.documentationPaidBy)
  return { fee, payer }
}
