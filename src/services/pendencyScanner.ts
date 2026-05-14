// =============================================================================
// PendencyScanner — AutoDrive  Central de Avisos
//
// Varredura automática de todos os módulos para detectar situações que
// requerem atenção e criar/atualizar Pendency records automaticamente.
//
// Módulos escaneados:
//   1. DEALS        — negociações há muito tempo sem movimentação, aguardando liberação
//   2. COMMISSIONS  — comissões aprovadas não pagas, cálculos bloqueados
//   3. STOCK        — veículos com pendências de estoque não resolvidas
//   4. WHATSAPP     — mensagens recebidas não respondidas
//
// Chamado por:
//   • POST /api/pendency-scan/run (manual, MASTER/ADM)
//   • Cron job (configurado via CRON ou Vercel Cron, não implementado aqui)
// =============================================================================

import { prisma } from '@/lib/prisma'
import { notifyPendency } from './notification.service'

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface ScanResult {
  module:   string
  tenantId: string
  created:  number
  updated:  number
  skipped:  number
  errors:   string[]
}

export interface ScanReport {
  startedAt:  Date
  finishedAt: Date
  results:    ScanResult[]
  totalCreated: number
  totalUpdated: number
  totalErrors:  number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Busca o primeiro vendedor de uma unidade para usar como responsável padrão
 * quando a pendência não tem responsável natural.
 */
async function getDefaultSeller(unitId: string) {
  return prisma.seller.findFirst({
    where: { unitId, active: true },
    select: { id: true },
  })
}

/**
 * Verifica se já existe uma pendência aberta para esse registro de origem.
 */
async function pendencyExists(originModule: string, originRecordId: string, tenantId: string) {
  return prisma.pendency.findFirst({
    where: {
      originModule,
      originRecordId,
      tenantId,
      status: { in: ['ABERTA', 'EM_ANDAMENTO', 'AGUARDANDO_RESPOSTA', 'PAUSADA', 'REATIVADA'] },
    },
    select: { id: true },
  })
}

// ── Scanner 1: DEALS ──────────────────────────────────────────────────────────

async function scanDeals(tenantId: string): Promise<ScanResult> {
  const result: ScanResult = { module: 'DEALS', tenantId, created: 0, updated: 0, skipped: 0, errors: [] }

  try {
    // Negociações aguardando liberação há mais de 24h
    const threshold = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const stuckDeals = await prisma.deal.findMany({
      where: {
        tenantId,
        status: 'AGUARDANDO_LIBERACAO',
        updatedAt: { lt: threshold },
      },
      include: {
        seller: { select: { id: true, fullName: true, unitId: true } },
        customer: { select: { name: true } },
      },
      take: 100,
    })

    for (const deal of stuckDeals) {
      try {
        if (!deal.seller) { result.skipped++; continue }

        const exists = await pendencyExists('DEALS', deal.id, tenantId)
        if (exists) { result.skipped++; continue }

        const slaDeadline = new Date(Date.now() + 4 * 60 * 60 * 1000) // +4h SLA

        await prisma.pendency.create({
          data: {
            tenantId,
            responsibleId:  deal.seller.id,
            unitId:         deal.seller.unitId,
            customerName:   deal.customer?.name ?? 'Cliente não informado',
            description:    `Negociação aguardando liberação há mais de 24h sem movimento.`,
            priority:       'ALTA',
            severity:       'HIGH',
            status:         'ABERTA',
            type:           'NEGOCIACAO',
            originModule:   'DEALS',
            originRecordId: deal.id,
            slaMinutes:     240,
            slaDeadline,
            automaticSend:  false,
            allowedDays:    [],
            source:         'SCANNER',
          },
        })

        await notifyPendency({
          pendencyId: deal.id,
          tenantId,
          unitId:     deal.seller.unitId,
          type:       'NOVA_PENDENCIA',
          title:      'Negociação parada',
          message:    `Negociação de ${deal.customer?.name ?? 'cliente'} aguarda liberação há +24h.`,
          notifyRoles: ['GERENTE', 'GERENTE_GERAL', 'ADM'],
        })

        result.created++
      } catch (err) {
        result.errors.push(`Deal ${deal.id}: ${String(err)}`)
      }
    }
  } catch (err) {
    result.errors.push(`Scan deals failed: ${String(err)}`)
  }

  return result
}

// ── Scanner 2: COMMISSIONS ────────────────────────────────────────────────────

async function scanCommissions(tenantId: string): Promise<ScanResult> {
  const result: ScanResult = { module: 'COMMISSIONS', tenantId, created: 0, updated: 0, skipped: 0, errors: [] }

  try {
    // Comissões aprovadas há mais de 30 dias ainda não pagas
    const threshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    const overdueCalcs = await prisma.commissionCalculation.findMany({
      where: {
        tenantId,
        status:     'APROVADO',
        approvedAt: { lt: threshold },
      },
      select: {
        id: true, sellerId: true, managerId: true, description: true, commissionValue: true,
      },
      take: 50,
    })

    for (const calc of overdueCalcs) {
      try {
        const exists = await pendencyExists('COMMISSIONS', calc.id, tenantId)
        if (exists) { result.skipped++; continue }

        // Buscar unidade do vendedor
        const seller = calc.sellerId
          ? await prisma.seller.findUnique({ where: { id: calc.sellerId }, select: { id: true, unitId: true } })
          : null

        if (!seller) { result.skipped++; continue }

        const slaDeadline = new Date(Date.now() + 72 * 60 * 60 * 1000) // +72h SLA

        await prisma.pendency.create({
          data: {
            tenantId,
            responsibleId:  seller.id,
            unitId:         seller.unitId,
            customerName:   'Financeiro',
            description:    `Comissão aprovada há mais de 30 dias sem pagamento: ${calc.description}`,
            priority:       'ALTA',
            severity:       'HIGH',
            status:         'ABERTA',
            type:           'COMISSAO',
            originModule:   'COMMISSIONS',
            originRecordId: calc.id,
            slaMinutes:     72 * 60,
            slaDeadline,
            automaticSend:  false,
            allowedDays:    [],
            source:         'SCANNER',
          },
        })

        result.created++
      } catch (err) {
        result.errors.push(`Commission ${calc.id}: ${String(err)}`)
      }
    }
  } catch (err) {
    result.errors.push(`Scan commissions failed: ${String(err)}`)
  }

  return result
}

// ── Scanner 3: STOCK ──────────────────────────────────────────────────────────

async function scanStock(tenantId: string): Promise<ScanResult> {
  const result: ScanResult = { module: 'STOCK', tenantId, created: 0, updated: 0, skipped: 0, errors: [] }

  try {
    // Veículos com pendências de estoque abertas há mais de 7 dias
    const threshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    const oldPendencies = await prisma.vehicleStockPendency.findMany({
      where: {
        resolved:  false,
        createdAt: { lt: threshold },
        vehicle:   { tenantId },
      },
      include: {
        vehicle: { select: { id: true, plate: true, brand: true, model: true, unitId: true } },
        option:  { select: { label: true } },
      },
      take: 50,
    })

    for (const sp of oldPendencies) {
      try {
        const exists = await pendencyExists('STOCK', sp.id, tenantId)
        if (exists) { result.skipped++; continue }

        const unitId = sp.vehicle.unitId
        if (!unitId) { result.skipped++; continue }

        const seller = await getDefaultSeller(unitId)
        if (!seller) { result.skipped++; continue }

        const vehicleLabel = [sp.vehicle.plate, sp.vehicle.brand, sp.vehicle.model]
          .filter(Boolean).join(' — ')

        const slaDeadline = new Date(Date.now() + 48 * 60 * 60 * 1000) // +48h SLA

        await prisma.pendency.create({
          data: {
            tenantId,
            responsibleId:  seller.id,
            unitId,
            customerName:   vehicleLabel || 'Veículo',
            plate:          sp.vehicle.plate ?? undefined,
            description:    `Pendência de estoque não resolvida há mais de 7 dias: ${sp.option.label}`,
            priority:       'MEDIA',
            severity:       'MEDIUM',
            status:         'ABERTA',
            type:           'ESTOQUE',
            originModule:   'STOCK',
            originRecordId: sp.id,
            slaMinutes:     48 * 60,
            slaDeadline,
            automaticSend:  false,
            allowedDays:    [],
            source:         'SCANNER',
          },
        })

        result.created++
      } catch (err) {
        result.errors.push(`StockPendency ${sp.id}: ${String(err)}`)
      }
    }
  } catch (err) {
    result.errors.push(`Scan stock failed: ${String(err)}`)
  }

  return result
}

// ── Scanner 4: WHATSAPP ───────────────────────────────────────────────────────

async function scanWhatsapp(tenantId: string): Promise<ScanResult> {
  const result: ScanResult = { module: 'WHATSAPP', tenantId, created: 0, updated: 0, skipped: 0, errors: [] }

  try {
    // Mensagens de retorno (inbound) sem resposta há mais de 4h sem vínculo com pendência ativa
    const threshold = new Date(Date.now() - 4 * 60 * 60 * 1000)

    const unanswered = await prisma.messageReturn.findMany({
      where: {
        createdAt:  { lt: threshold },
        pendencyId: null,
        sellerId:   { not: null },
      },
      include: {
        seller: { select: { id: true, unitId: true, fullName: true } },
      },
      take: 30,
    })

    for (const msg of unanswered) {
      try {
        if (!msg.seller) { result.skipped++; continue }

        // Verifica tenant via seller→unit
        const unit = await prisma.unit.findUnique({
          where: { id: msg.seller.unitId },
          select: { tenantId: true },
        })
        if (unit?.tenantId !== tenantId) { result.skipped++; continue }

        const exists = await pendencyExists('WHATSAPP', msg.id, tenantId)
        if (exists) { result.skipped++; continue }

        const slaDeadline = new Date(Date.now() + 2 * 60 * 60 * 1000) // +2h SLA

        await prisma.pendency.create({
          data: {
            tenantId,
            responsibleId:  msg.seller.id,
            unitId:         msg.seller.unitId,
            customerName:   msg.customerName ?? msg.profileName ?? msg.whatsappFrom,
            description:    `Mensagem recebida via WhatsApp sem resposta há mais de 4h.`,
            priority:       'ALTA',
            severity:       'HIGH',
            status:         'ABERTA',
            type:           'WHATSAPP',
            originModule:   'WHATSAPP',
            originRecordId: msg.id,
            slaMinutes:     120,
            slaDeadline,
            automaticSend:  false,
            allowedDays:    [],
            source:         'SCANNER',
          },
        })

        result.created++
      } catch (err) {
        result.errors.push(`MessageReturn ${msg.id}: ${String(err)}`)
      }
    }
  } catch (err) {
    result.errors.push(`Scan whatsapp failed: ${String(err)}`)
  }

  return result
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Executa a varredura completa de todos os módulos para um tenant específico.
 */
export async function scanTenant(tenantId: string): Promise<ScanResult[]> {
  return Promise.all([
    scanDeals(tenantId),
    scanCommissions(tenantId),
    scanStock(tenantId),
    scanWhatsapp(tenantId),
  ])
}

/**
 * Executa a varredura para todos os tenants ativos.
 */
export async function scanAllTenants(): Promise<ScanReport> {
  const startedAt = new Date()

  const tenants = await prisma.tenant.findMany({
    where:  { status: { in: ['ATIVO', 'TESTE'] } },
    select: { id: true },
  })

  const allResults: ScanResult[] = []

  for (const tenant of tenants) {
    const results = await scanTenant(tenant.id)
    allResults.push(...results)
  }

  const finishedAt = new Date()

  const report: ScanReport = {
    startedAt,
    finishedAt,
    results:      allResults,
    totalCreated: allResults.reduce((s, r) => s + r.created, 0),
    totalUpdated: allResults.reduce((s, r) => s + r.updated, 0),
    totalErrors:  allResults.reduce((s, r) => s + r.errors.length, 0),
  }

  console.info(
    `[PendencyScanner] Concluído: ${report.totalCreated} criadas, ${report.totalUpdated} atualizadas, ${report.totalErrors} erros`,
  )

  return report
}

export const PendencyScanner = { scanTenant, scanAllTenants }
export default PendencyScanner
