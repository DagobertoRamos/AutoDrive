// =============================================================================
// Quality System — Configuração por tenant/unidade.
// Armazenada em SellerQueueUnitConfig.config.quality (JSON, sem nova coluna).
// =============================================================================

import { DEFAULT_POINT_COSTS, QualityEventType } from './types'

export interface QualityThresholds {
  popupAt:               number  // score abaixo → exibe pop-up de aviso
  warnAt:                number  // score abaixo → destaque vermelho no painel
  blockPendencyCreateAt: number  // score abaixo → não pode criar novas pendências
  blockLeadsAt:          number  // score abaixo → não pode acessar/criar leads
  blockNewSalesAt:       number  // score abaixo → não pode criar negociações
  blockQueueAt:          number  // score abaixo → retirado da fila de atendimento
  maxUnresolvedPendencies: number // mais de N pendências abertas → bloqueia nova criação
}

export interface QualityConfig {
  enabled:          boolean
  scorePeriodDays:  number           // janela de análise (padrão 30 dias)
  thresholds:       QualityThresholds
  pointCosts:       Partial<Record<QualityEventType, number>>
  autoSweepEnabled: boolean
}

export const DEFAULT_QUALITY_THRESHOLDS: QualityThresholds = {
  popupAt:                 -5,
  warnAt:                  -10,
  blockPendencyCreateAt:   -20,
  blockLeadsAt:            -30,
  blockNewSalesAt:         -35,
  blockQueueAt:            -50,
  maxUnresolvedPendencies: 8,
}

export const DEFAULT_QUALITY_CONFIG: QualityConfig = {
  enabled:          false, // gestão precisa ativar
  scorePeriodDays:  30,
  thresholds:       DEFAULT_QUALITY_THRESHOLDS,
  pointCosts:       {},    // usa DEFAULT_POINT_COSTS como fallback
  autoSweepEnabled: true,
}

export function readQualityConfig(cfgJson: unknown): QualityConfig {
  const raw = (cfgJson as { quality?: Partial<QualityConfig> } | null | undefined)?.quality
  if (!raw) return DEFAULT_QUALITY_CONFIG
  return {
    enabled:          raw.enabled          ?? DEFAULT_QUALITY_CONFIG.enabled,
    scorePeriodDays:  raw.scorePeriodDays  ?? DEFAULT_QUALITY_CONFIG.scorePeriodDays,
    autoSweepEnabled: raw.autoSweepEnabled ?? DEFAULT_QUALITY_CONFIG.autoSweepEnabled,
    thresholds: {
      ...DEFAULT_QUALITY_THRESHOLDS,
      ...(raw.thresholds ?? {}),
    },
    pointCosts: raw.pointCosts ?? {},
  }
}

export function getPointCost(cfg: QualityConfig, type: QualityEventType): number {
  return cfg.pointCosts[type] ?? DEFAULT_POINT_COSTS[type] ?? 0
}
