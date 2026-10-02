// =============================================================================
// Pré-avaliação do site → avaliação cadastrada no módulo de Avaliação.
// Chamado pelo POST /api/site/[site]/leads (kind=sell_car) logo depois de o
// lead entrar no CRM. A avaliação nasce LIBERADA pelo sistema (sem gerente) e
// vinculada ao lead; as fotos chegam depois, uma por requisição, pela rota
// pública /leads/evaluation-photos com o token devolvido ao navegador.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { recordHistory } from './history'
import { ITEMS, type SectionKey } from './catalog'
import {
  buildPreEvalItems, intentionFromGoal, parseBrl, parseKm, parseYears,
  SITE_PRE_EVAL_SOURCE, TIRE_CONDITIONS, type PreEvalInspection,
} from './site-pre-evaluation'
import type { SiteLeadInput } from '@/lib/site/leads-core'
import { notifyByRole } from '@/services/notification.service'

const PENDENCY_FLAGS = ['Financiado', 'Possui débitos', 'Possui sinistro', 'Possui leilão']

export async function createSitePreEvaluation(p: {
  tenantId: string
  leadId: string
  protocol: string | null
  input: SiteLeadInput
  inspection: PreEvalInspection
}): Promise<{ id: string }> {
  const d = p.input.details
  const now = new Date()
  const situation = (d.vehicleStatus ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const pendencies = situation.filter((s) => PENDENCY_FLAGS.includes(s))
  const notes = [
    `[Origem] Pré-avaliação enviada pelo cliente no site${p.protocol ? ` (lead ${p.protocol})` : ''}. Liberada automaticamente pelo sistema — conferência da gerência obrigatória antes de negociar.`,
    p.inspection.sunroof ? '[Opcionais] Teto Solar' : '',
    d.goal ? `Objetivo do cliente: ${d.goal}` : '',
    situation.length ? `Situação informada: ${situation.join(', ')}` : '',
    `Pneus (informado pelo cliente): direitos ${TIRE_CONDITIONS[p.inspection.tires.RIGHT ?? 'BOM']}, esquerdos ${TIRE_CONDITIONS[p.inspection.tires.LEFT ?? 'BOM']}`,
    d.city ? `Cidade: ${d.city}` : '',
    p.input.message ? `Observações do cliente: ${p.input.message}` : '',
  ].filter(Boolean).join('\n')

  // Unidade principal da loja (a mais antiga ativa): sem unidade a avaliação
  // não acha vendedores nem entra nos filtros por unidade.
  const mainUnit = await prisma.unit.findFirst({ where: { tenantId: p.tenantId, active: true }, orderBy: { createdAt: 'asc' }, select: { id: true } }).catch(() => null)
  const evaluation = await prisma.vehicleEvaluation.create({
    data: {
      tenantId: p.tenantId,
      unitId: mainUnit?.id ?? null,
      plate: d.plate || null,
      brand: d.brand || null,
      model: d.model || null,
      version: d.version || null,
      ...parseYears(d.year),
      km: parseKm(d.mileage),
      color: d.color || null,
      fuel: d.fuel || null,
      transmission: d.transmission || null,
      desiredValue: parseBrl(d.targetPrice),
      evaluationNotes: notes,
      pendencyNotes: pendencies.length ? `Informado pelo cliente: ${pendencies.join(', ')}.` : null,
      intention: intentionFromGoal(d.goal),
      lookupSource: SITE_PRE_EVAL_SOURCE,
      ownerName: p.input.name,
      ownerPhone: p.input.phone,
      ownerEmail: p.input.email || null,
      evaluatedAt: now,
      status: 'LIBERADA',
      releasedAt: now,
      releasedByUserId: null,
      customerDecision: 'PENDENTE',
    },
    select: { id: true },
  })

  // Checklist completo (o que o cliente não respondeu fica Pendente para o avaliador).
  const answered = new Map(buildPreEvalItems(p.inspection).map((i) => [i.catalogKey, i]))
  const sections: SectionKey[] = ['INTERIOR', 'FRENTE', 'DIREITA', 'TRASEIRA', 'ESQUERDA', 'TEST_DRIVE']
  await prisma.evaluationItem.createMany({
    data: sections.flatMap((section) => ITEMS[section].map((c) => {
      const a = answered.get(c.key)
      return { tenantId: p.tenantId, evaluationId: evaluation.id, section, catalogKey: c.key, name: c.name, status: a?.status ?? 'PENDING', notes: a?.notes ?? null, totalExpenses: 0 }
    })),
  })
  await prisma.crmLeadEvaluation.create({ data: { tenantId: p.tenantId, leadId: p.leadId, evaluationId: evaluation.id, linkedByUserId: null } }).catch(() => {})

  const title = [d.brand, d.model, d.year].filter(Boolean).join(' ')
  await recordHistory({
    tenantId: p.tenantId, evaluationId: evaluation.id, userName: 'Site da loja', action: 'RELEASE',
    newValue: { status: 'LIBERADA', origin: SITE_PRE_EVAL_SOURCE, damages: Object.keys(p.inspection.damages) },
    notes: 'Pré-avaliação do site cadastrada e liberada automaticamente pelo sistema. Conferência da gerência obrigatória antes de negociar.',
  })
  await prisma.crmLeadInteraction.create({
    data: { tenantId: p.tenantId, leadId: p.leadId, type: 'NOTE', channel: 'SITE', summary: `Pré-avaliação do site cadastrada em Avaliações (${title || 'veículo do cliente'}). Liberada pelo sistema — a gerência precisa conferir antes de negociar.`, authorId: 'site', authorName: 'Site da loja', occurredAt: now },
  }).catch(() => {})
  await notifyByRole({
    tenantId: p.tenantId, roles: ['ADM', 'GERENTE_GERAL', 'GERENTE'], type: 'AVALIACAO_SITE',
    title: 'Pré-avaliação do site para conferir',
    message: `${p.input.name} enviou ${title || 'o carro'} com fotos pelo site. Confira antes de negociar.`,
    actionUrl: `/estoque/avaliacao/${evaluation.id}/inspecao`,
    metadata: { evaluationId: evaluation.id, leadId: p.leadId },
    channels: ['APP_WEB', 'APP_MOBILE', 'PUSH'],
  }).catch((e) => console.error('[site/pre-avaliacao] aviso aos gestores', e))

  return evaluation
}
