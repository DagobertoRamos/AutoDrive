// =============================================================================
// Quality System — Aplicar / estornar eventos de qualidade.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { QualityEventType, QUALITY_EVENT_CATEGORIES, QUALITY_EVENT_TYPE_LABELS } from './types'
import { readQualityConfig, getPointCost } from './config'

export interface ApplyEventInput {
  tenantId:       string
  sellerId:       string
  unitId?:        string | null
  type:           QualityEventType
  reason:         string
  points?:        number        // override do custo padrão
  referenceId?:   string | null
  referenceType?: string | null
  appliedById?:   string | null // null = sistema automático
  appliedAt?:     Date          // permite retroativo
  metadata?:      Record<string, unknown>
  cfgJson?:       unknown       // config da unidade para ler custo por tipo
}

export async function applyQualityEvent(input: ApplyEventInput): Promise<string | null> {
  const cfg = readQualityConfig(input.cfgJson ?? null)
  const finalPoints = input.points ?? getPointCost(cfg, input.type)
  if (finalPoints === 0) return null

  try {
    const event = await prisma.qualityEvent.create({
      data: {
        tenantId:      input.tenantId,
        sellerId:      input.sellerId,
        unitId:        input.unitId ?? null,
        category:      QUALITY_EVENT_CATEGORIES[input.type],
        type:          input.type,
        points:        finalPoints,
        reason:        input.reason,
        referenceId:   input.referenceId ?? null,
        referenceType: input.referenceType ?? null,
        appliedById:   input.appliedById ?? null,
        appliedAt:     input.appliedAt ?? new Date(),
        metadata:      (input.metadata as never) ?? null,
      },
    })

    // Notifica o vendedor se for penalidade (pontos negativos).
    if (finalPoints < 0) {
      const label = QUALITY_EVENT_TYPE_LABELS[input.type] ?? input.type
      await prisma.notification.create({
        data: {
          userId:    input.sellerId,
          tenantId:  input.tenantId,
          type:      'PENDENCIA_CRITICA' as never,
          title:     `⚠️ Ponto(s) descontado(s) — ${label}`,
          message:   `${Math.abs(finalPoints)} ponto(s) descontado(s). Motivo: ${input.reason}`,
          actionUrl: '/vendedor-da-vez/qualidade',
        },
      }).catch(() => {})
    } else {
      // Estorno/correção: notifica como positivo.
      await prisma.notification.create({
        data: {
          userId:    input.sellerId,
          tenantId:  input.tenantId,
          type:      'SISTEMA' as never,
          title:     `✅ +${finalPoints} ponto(s) — Estorno`,
          message:   `${finalPoints} ponto(s) adicionado(s). Motivo: ${input.reason}`,
          actionUrl: '/vendedor-da-vez/qualidade',
        },
      }).catch(() => {})
    }

    if (input.appliedById) {
      await createSafeAuditLog({
        userId:   input.appliedById,
        tenantId: input.tenantId,
        action:   'QUALITY_EVENT_APPLIED',
        entity:   'QualityEvent',
        entityId: event.id,
        afterData: { sellerId: input.sellerId, type: input.type, points: finalPoints, reason: input.reason, appliedAt: input.appliedAt },
      })
    }

    return event.id
  } catch { return null }
}

export async function reverseQualityEvent(eventId: string, tenantId: string, reversedById: string, reversedReason: string): Promise<boolean> {
  try {
    const event = await prisma.qualityEvent.findFirst({ where: { id: eventId, tenantId, active: true } })
    if (!event) return false

    await prisma.qualityEvent.update({
      where: { id: eventId },
      data: { active: false, reversedById, reversedAt: new Date(), reversedReason },
    })

    // Cria evento de estorno espelhado (pontos invertidos).
    await prisma.qualityEvent.create({
      data: {
        tenantId:      event.tenantId,
        sellerId:      event.sellerId,
        unitId:        event.unitId,
        category:      event.category,
        type:          'MANUAL_REVERSAL',
        points:        -(event.points), // inverte o sinal
        reason:        `[ESTORNO] ${reversedReason}`,
        referenceId:   event.id,
        referenceType: 'QualityEvent',
        appliedById:   reversedById,
      },
    })

    // Notifica o vendedor.
    const label = QUALITY_EVENT_TYPE_LABELS[event.type as QualityEventType] ?? event.type
    await prisma.notification.create({
      data: {
        userId:    event.sellerId,
        tenantId:  event.tenantId,
        type:      'SISTEMA' as never,
        title:     `✅ Penalidade estornada — ${label}`,
        message:   `+${Math.abs(event.points)} ponto(s) devolvido(s). Motivo: ${reversedReason}`,
        actionUrl: '/vendedor-da-vez/qualidade',
      },
    }).catch(() => {})

    await createSafeAuditLog({
      userId:   reversedById,
      tenantId: event.tenantId,
      action:   'QUALITY_EVENT_REVERSED',
      entity:   'QualityEvent',
      entityId: eventId,
      afterData: { sellerId: event.sellerId, type: event.type, originalPoints: event.points, reversedReason },
    })

    return true
  } catch { return false }
}

/** Verifica se já há um evento ativo do mesmo tipo+referência (anti-duplicata para o sweep). */
export async function hasActiveEventForRef(tenantId: string, sellerId: string, type: QualityEventType, referenceId: string): Promise<boolean> {
  const count = await prisma.qualityEvent.count({
    where: { tenantId, sellerId, type, referenceId, active: true },
  }).catch(() => 0)
  return count > 0
}
