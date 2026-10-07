// =============================================================================
// Resgate pela Mesa SDR — lead PERDIDO volta para a pré-venda tentar de novo.
//
// Quando a loja tem a Mesa SDR (módulo habilitado + ao menos um SDR ativo) e a
// chave "Configurações do CRM → Distribuição → resgate" está ligada, o lead
// marcado como perdido (kanban, tela do lead, lista ou fila de atendimento):
//   • sai do vendedor e fica sem dono, com status RECICLADO — é o que a Caixa
//     de Leads do SDR mostra (e o que o motor de distribuição entrega);
//   • guarda o motivo da perda e quem perdeu em metadata.sdrRescue + histórico.
// Sem SDR, nada muda: o lead fica em "Perdido".
// =============================================================================

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getDisabledModules } from '@/lib/tenant-modules'
import { loadCrmSettings } from '@/lib/crm/settings'
import { closeOpenLeadSlas, distributeLeadById } from '@/lib/marketing/distribution'

/** A loja tem Mesa SDR operando (contratada e com gente para receber)? */
export async function hasActiveSdrDesk(tenantId: string): Promise<boolean> {
  const disabled = new Set(await getDisabledModules(tenantId))
  if (disabled.has('marketing') || disabled.has('marketing.sdr')) return false
  const members = await prisma.marketingSdrMember.count({ where: { tenantId, active: true } }).catch(() => 0)
  return members > 0
}

/** O resgate vale para esta loja (SDR ativo + chave ligada)? */
export async function sdrRescueEnabled(tenantId: string): Promise<boolean> {
  const settings = await loadCrmSettings(tenantId).catch(() => null)
  if (settings && !settings.distribution.rescueLostToSdr) return false
  return hasActiveSdrDesk(tenantId)
}

/**
 * Chamar DEPOIS de gravar o lead como LOST. Devolve true se foi para o resgate.
 * Best-effort: qualquer falha deixa o lead em "Perdido" (comportamento antigo).
 */
export async function rescueLostLeadToSdr(opts: {
  tenantId: string
  leadId: string
  reason?: string | null
  actor?: { id: string; name?: string | null } | null
}): Promise<boolean> {
  try {
    if (!await sdrRescueEnabled(opts.tenantId)) return false
    const lead = await prisma.marketingLead.findFirst({
      where: { id: opts.leadId, tenantId: opts.tenantId, deletedAt: null, status: 'LOST' },
      select: { id: true, assignedToUserId: true, lostReason: true, metadata: true },
    })
    if (!lead) return false

    const now = new Date()
    const reason = (opts.reason ?? lead.lostReason ?? '').trim() || null
    const meta = lead.metadata && typeof lead.metadata === 'object' && !Array.isArray(lead.metadata)
      ? { ...(lead.metadata as Record<string, unknown>) } : {}
    const prev = meta.sdrRescue && typeof meta.sdrRescue === 'object' ? meta.sdrRescue as Record<string, unknown> : {}
    meta.sdrRescue = {
      at: now.toISOString(),
      count: (Number(prev.count) || 0) + 1,
      lostByUserId: lead.assignedToUserId,
      lostReason: reason,
    }

    await prisma.$transaction(async (tx) => {
      await closeOpenLeadSlas(tx, lead.id)
      await tx.marketingLead.update({
        where: { id: lead.id },
        data: { status: 'RECYCLED', assignedToUserId: null, claimedByUserId: null, claimedAt: null, metadata: meta as Prisma.InputJsonValue },
      })
      const authorId = opts.actor?.id ?? lead.assignedToUserId
      if (authorId) {
        await tx.crmLeadInteraction.create({
          data: {
            tenantId: opts.tenantId, leadId: lead.id, type: 'NOTE', result: 'RECYCLED',
            summary: `Lead perdido enviado para resgate na Mesa SDR${reason ? ` (motivo: ${reason})` : ''}.`,
            authorId, authorName: opts.actor?.name ?? null, occurredAt: now,
          },
        })
      }
    })
    // Se a loja tem política automática, já entrega para um SDR.
    await distributeLeadById(opts.tenantId, lead.id).catch(() => false)
    return true
  } catch (err) {
    console.error('[crm/sdr-rescue] falhou:', err)
    return false
  }
}
