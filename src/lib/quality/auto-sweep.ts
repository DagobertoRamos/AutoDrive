// =============================================================================
// Quality System — Sweep automático de penalidades.
// Roda no tick global (a cada 1 min). Cada job é idempotente.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { readQualityConfig } from './config'
import { applyQualityEvent, hasActiveEventForRef } from './events'

export async function runQualityAutoSweep(): Promise<{
  scanned: number; applied: number; skipped: number
}> {
  const configs = await prisma.sellerQueueUnitConfig.findMany({
    select: { tenantId: true, unitId: true, config: true },
  }).catch(() => [])

  const enabled = configs.map(row => ({ tenantId: row.tenantId, unitId: row.unitId, cfg: readQualityConfig(row.config) })).filter(r => r.cfg.enabled && r.cfg.autoSweepEnabled)
  if (!enabled.length) return { scanned: 0, applied: 0, skipped: 0 }

  let scanned = 0, applied = 0, skipped = 0

  for (const { tenantId, unitId, cfg } of enabled) {
    // ── 1. Pendências com SLA vencido (PENDENCY_SLA_BREACH) ──────────────────
    const overduePendencies = await prisma.pendency.findMany({
      where: {
        tenantId, unitId,
        status: { in: ['ABERTA','EM_ANDAMENTO','AGUARDANDO_RESPOSTA','PAUSADA','REATIVADA'] },
        slaDeadline: { lt: new Date() },
      },
      select: { id: true, responsibleId: true, description: true, slaDeadline: true },
      take: 200,
    }).catch(() => [])

    for (const p of overduePendencies) {
      scanned++
      const seller = await prisma.seller.findUnique({ where: { id: p.responsibleId ?? '' }, select: { userId: true } }).catch(() => null)
      if (!seller?.userId) { skipped++; continue }
      const already = await hasActiveEventForRef(tenantId, seller.userId, 'PENDENCY_SLA_BREACH', p.id)
      if (already) { skipped++; continue }
      const desc = p.description?.slice(0, 60) ?? 'pendência sem descrição'
      const eventId = await applyQualityEvent({ tenantId, sellerId: seller.userId, unitId, type: 'PENDENCY_SLA_BREACH', reason: `SLA vencido: ${desc}`, referenceId: p.id, referenceType: 'Pendency', cfgJson: cfg })
      if (eventId) applied++; else skipped++
    }

    // ── 2. Pendências em atraso diário (PENDENCY_OVERDUE_DAILY) — conta dias após SLA ──
    const overdue1Day = await prisma.pendency.findMany({
      where: {
        tenantId, unitId,
        status: { in: ['ABERTA','EM_ANDAMENTO','AGUARDANDO_RESPOSTA','PAUSADA','REATIVADA'] },
        slaDeadline: { lt: new Date(Date.now() - 86400000) }, // mais de 24h de atraso
      },
      select: { id: true, responsibleId: true, description: true },
      take: 200,
    }).catch(() => [])

    for (const p of overdue1Day) {
      scanned++
      const seller = await prisma.seller.findUnique({ where: { id: p.responsibleId ?? '' }, select: { userId: true } }).catch(() => null)
      if (!seller?.userId) { skipped++; continue }
      // Anti-duplicata por dia: verifica se já há evento de hoje.
      const todayStart = new Date(); todayStart.setHours(0,0,0,0)
      const alreadyToday = await prisma.qualityEvent.count({
        where: { tenantId, sellerId: seller.userId, type: 'PENDENCY_OVERDUE_DAILY', referenceId: p.id, active: true, appliedAt: { gte: todayStart } },
      }).catch(() => 0)
      if (alreadyToday > 0) { skipped++; continue }
      const desc = p.description?.slice(0, 60) ?? 'pendência sem descrição'
      const eventId = await applyQualityEvent({ tenantId, sellerId: seller.userId, unitId, type: 'PENDENCY_OVERDUE_DAILY', reason: `+1 dia em atraso: ${desc}`, referenceId: p.id, referenceType: 'Pendency', cfgJson: cfg })
      if (eventId) applied++; else skipped++
    }

    // ── 3. Leads sem resposta há 24h (LEAD_NO_RESPONSE_24H) ──────────────────
    const leadsNoResponse24h = await prisma.marketingLead.findMany({
      where: {
        tenantId,
        status: { notIn: ['CONVERTED','LOST','DISCARDED'] },
        assignedToUserId: { not: null },
        lastContactAt: { lt: new Date(Date.now() - 24 * 3600000) },
      },
      select: { id: true, assignedToUserId: true, name: true, phone: true },
      take: 200,
    }).catch(() => [])

    for (const lead of leadsNoResponse24h) {
      scanned++
      if (!lead.assignedToUserId) { skipped++; continue }
      const todayStart = new Date(); todayStart.setHours(0,0,0,0)
      const alreadyToday = await prisma.qualityEvent.count({
        where: { tenantId, sellerId: lead.assignedToUserId, type: 'LEAD_NO_RESPONSE_24H', referenceId: lead.id, active: true, appliedAt: { gte: todayStart } },
      }).catch(() => 0)
      if (alreadyToday > 0) { skipped++; continue }
      const name = lead.name ?? lead.phone ?? 'lead sem identificação'
      const eventId = await applyQualityEvent({ tenantId, sellerId: lead.assignedToUserId, unitId, type: 'LEAD_NO_RESPONSE_24H', reason: `Lead sem contato há 24h: ${name}`, referenceId: lead.id, referenceType: 'MarketingLead', cfgJson: cfg })
      if (eventId) applied++; else skipped++
    }

    // ── 4. Leads sem resposta há 48h (LEAD_NO_RESPONSE_48H) — incremento ─────
    const leadsNoResponse48h = await prisma.marketingLead.findMany({
      where: {
        tenantId,
        status: { notIn: ['CONVERTED','LOST','DISCARDED'] },
        assignedToUserId: { not: null },
        lastContactAt: { lt: new Date(Date.now() - 48 * 3600000) },
      },
      select: { id: true, assignedToUserId: true, name: true, phone: true },
      take: 200,
    }).catch(() => [])

    for (const lead of leadsNoResponse48h) {
      scanned++
      if (!lead.assignedToUserId) { skipped++; continue }
      const todayStart = new Date(); todayStart.setHours(0,0,0,0)
      const alreadyToday = await prisma.qualityEvent.count({
        where: { tenantId, sellerId: lead.assignedToUserId, type: 'LEAD_NO_RESPONSE_48H', referenceId: lead.id, active: true, appliedAt: { gte: todayStart } },
      }).catch(() => 0)
      if (alreadyToday > 0) { skipped++; continue }
      const name = lead.name ?? lead.phone ?? 'lead sem identificação'
      const eventId = await applyQualityEvent({ tenantId, sellerId: lead.assignedToUserId, unitId, type: 'LEAD_NO_RESPONSE_48H', reason: `Lead sem contato há 48h: ${name}`, referenceId: lead.id, referenceType: 'MarketingLead', cfgJson: cfg })
      if (eventId) applied++; else skipped++
    }
  }

  return { scanned, applied, skipped }
}
