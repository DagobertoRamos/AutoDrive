import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog, forbiddenResponse, getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { assertModuleEnabled, canAccessModuleForUser } from '@/lib/tenant-modules'
import { applyCrmScope, normalizePhone, resolveCrmScope } from '@/lib/crm/shared'
import { readTemperature } from '@/lib/crm/config'
import { fieldLabels, loadCrmSettings, missingLeadFields, readLeadType } from '@/lib/crm/settings'
import { distributeLeadById } from '@/lib/marketing/distribution'
import { fireAutomations } from '@/lib/crm/automations'
import { resolveIdentity, type DedupMatch } from '@/lib/crm/dedup'
import { assignLeadNumber } from '@/lib/crm/lead-number'
import { isMaterialized, landingStage, loadPipelines, loadPlacements, pipelineLeadWhere, resolveLeadPipeline, resolveLeadStage, savePlacement } from '@/lib/crm/pipelines'

// F2 alerta: registra candidatos à mesclagem p/ OUTROS leads (não bloqueia).
async function flagMergeCandidates(tenantId: string, leadId: string, matches: DedupMatch[]): Promise<void> {
  for (const m of matches) {
    if (!m.leadId || m.leadId === leadId) continue
    await prisma.crmMergeCandidate.upsert({
      where: { id: `${leadId}_${m.leadId}` },
      create: { id: `${leadId}_${m.leadId}`, tenantId, leadId, matchType: 'SOFT', matchedLeadId: m.leadId, reason: m.reason, status: 'PENDING' },
      update: {},
    }).catch(() => {})
  }
}

function leadPriorityOf(row: {
  source: string | null
  status: string
  lastContactAt: Date | null
  convertedDealId: string | null
  createdAt: Date
}) {
  const now = Date.now()
  const lastTouch = row.lastContactAt?.getTime() ?? row.createdAt.getTime()
  const hoursWithoutTouch = (now - lastTouch) / 3600000
  if (row.status === 'CONVERTED') return 'LOW'
  if (row.status === 'LOST' || row.status === 'DISCARDED') return 'LOW'
  if (row.source === 'AUTOCONF' && !row.convertedDealId && hoursWithoutTouch >= 24) return 'URGENT'
  if (hoursWithoutTouch >= 48) return 'HIGH'
  if (row.status === 'NEW' || row.status === 'ASSIGNED' || row.status === 'QUALIFIED') return 'HIGH'
  return 'NORMAL'
}

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm')) return forbiddenResponse('Sem acesso ao CRM.')
  { const gate = await assertModuleEnabled(user, 'crm'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))

  try {
    const scope = await resolveCrmScope(user)
    if (!scope) return forbiddenResponse('Sem acesso aos leads do CRM.')
    const sp = new URL(req.url).searchParams
    const page = Math.max(1, Number(sp.get('page') ?? 1))
    // Kanban pede o quadro inteiro (até o take de 300 abaixo).
    const perPage = Math.min(300, Math.max(1, Number(sp.get('perPage') ?? 25)))
    const search = sp.get('search')?.trim()
    const status = sp.get('status')?.trim() || undefined
    const onlyDelayed = sp.get('delayed') === 'true'
    const sourceFilter = sp.get('source')?.trim() || ''
    const priority = sp.get('priority')?.trim() || ''
    const temperature = sp.get('temperature')?.trim() || ''
    const leadTypeFilter = sp.get('leadType')?.trim() || ''
    // NOTA: deletedAt ausente da query intencionalmente até a migration
    // crm_card_lead_number_softdelete ser aplicada na Neon. Após aplicar, voltar:
    //   applyCrmScope({ tenantId, deletedAt: null }, scope, user)
    const where = applyCrmScope({ tenantId }, scope, user)

    if (status) where.status = status as never
    // Filtro de origem: 'AUTOCONF' é legado; agora aceita qualquer valor de source.
    if (sourceFilter) where.source = sourceFilter
    // Filtro de responsável: só honrado para scope != 'own' (não fura o escopo).
    const sellerFilter = sp.get('assignedToUserId')?.trim()
    if (sellerFilter && scope !== 'own') where.assignedToUserId = sellerFilter
    // Filtro de unidade: só para scope 'all'.
    const unitFilter = sp.get('unitId')?.trim()
    if (unitFilter && scope === 'all') where.unitId = unitFilter
    if (temperature) {
      // Temperatura vive em metadata.temperature (JSON field — busca aproximada).
      // Filtramos em memória abaixo (não há índice no campo JSON no Neon).
    }
    if (search) {
      const digits = search.replace(/\D/g, '')
      // MarketingLead não tem relação Prisma formal com Vehicle/Customer (FKs soft).
      // Buscamos nos campos diretos do lead. Busca por veículo é feita em memória
      // (enrich com Vehicle após o select).
      where.OR = [
        { name:   { contains: search, mode: 'insensitive' } },
        { phone:  { contains: search } },
        ...(digits.length >= 6 ? [{ phone: { contains: digits } }] : []),
        { email:  { contains: search, mode: 'insensitive' } },
        { notes:  { contains: search, mode: 'insensitive' } },
        { source: { contains: search, mode: 'insensitive' } },
      ]
    }
    // CRM Pipelines — filtro por funil (leads sem placement pertencem ao padrão).
    const pipelines = await loadPipelines(tenantId)
    const materialized = isMaterialized(pipelines)
    const pipelineFilter = sp.get('pipelineId')?.trim()
    if (pipelineFilter) {
      const p = pipelines.find((x) => x.id === pipelineFilter)
      if (!p) return NextResponse.json({ success: false, error: 'Funil não encontrado.' }, { status: 404 })
      const pw = pipelineLeadWhere(p)
      if (Object.keys(pw).length) where.AND = [pw]
    }
    if (onlyDelayed) {
      where.lastContactAt = { lt: new Date(Date.now() - 48 * 60 * 60 * 1000) }
      where.status = { notIn: ['CONVERTED', 'LOST', 'DISCARDED'] }
    }

    const [rows, users, units] = await Promise.all([
      prisma.marketingLead.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }],
        take: 300,
        select: {
          id: true, name: true, phone: true, email: true, source: true, status: true,
          unitId: true, assignedToUserId: true, customerId: true, vehicleId: true,
          convertedDealId: true, lostReason: true, notes: true, lastContactAt: true,
          createdAt: true, updatedAt: true, metadata: true, leadNumber: true,
        },
      }),
      prisma.user.findMany({ where: { tenantId }, select: { id: true, name: true } }),
      prisma.unit.findMany({ where: { tenantId }, select: { id: true, name: true } }),
    ])

    const userNames = new Map(users.map((item) => [item.id, item.name]))
    const unitNames = new Map(units.map((item) => [item.id, item.name]))

    // Enriquecer em LOTE (zero N+1): veículo, deal, próxima tarefa (visita), etiquetas.
    const vehicleIds   = [...new Set(rows.map(r => r.vehicleId).filter((v): v is string => !!v))]
    const dealIds      = [...new Set(rows.map(r => r.convertedDealId).filter((v): v is string => !!v))]
    const leadIds      = rows.map(r => r.id)
    const [vehicles, deals, tasks, tagLinks] = await Promise.all([
      vehicleIds.length ? prisma.vehicle.findMany({ where: { id: { in: vehicleIds } }, select: { id: true, plate: true, brand: true, model: true, version: true, year: true, modelYear: true } }).catch(() => []) : Promise.resolve([]),
      dealIds.length ? prisma.deal.findMany({ where: { id: { in: dealIds } }, select: { id: true, dealNumber: true, status: true } }).catch(() => []) : Promise.resolve([]),
      // Próxima tarefa PENDENTE por lead (apenas visitas/follow-up, mais próxima do agora).
      prisma.marketingLeadTask.findMany({ where: { leadId: { in: leadIds }, status: 'PENDING', dueAt: { not: null } }, select: { leadId: true, id: true, type: true, dueAt: true }, orderBy: { dueAt: 'asc' } }).catch(() => [] as { leadId: string | null; id: string; type: string; dueAt: Date | null }[]),
      prisma.crmLeadTag.findMany({ where: { leadId: { in: leadIds } }, select: { leadId: true, tag: { select: { id: true, name: true, color: true, active: true } } } }).catch(() => []),
    ])
    const placements = materialized ? await loadPlacements(leadIds) : new Map()
    const vehicleMap = new Map(vehicles.map(v => [v.id, v]))
    const dealMap    = new Map(deals.map(d => [d.id, d]))
    // Primeira tarefa pendente por lead.
    const nextTaskByLead = new Map<string, typeof tasks[0]>()
    for (const t of tasks) {
      if (t.leadId && !nextTaskByLead.has(t.leadId)) nextTaskByLead.set(t.leadId, t)
    }
    const tagsByLead = new Map<string, { id: string; name: string; color: string | null }[]>()
    for (const l of tagLinks) {
      if (!l.tag?.active) continue
      const arr = tagsByLead.get(l.leadId) ?? []; arr.push({ id: l.tag.id, name: l.tag.name, color: l.tag.color }); tagsByLead.set(l.leadId, arr)
    }

    const now2 = Date.now()
    const ONE_DAY = 86_400_000

    const enriched = rows.map((row) => {
      const priorityLevel = leadPriorityOf(row)
      const veh = row.vehicleId ? vehicleMap.get(row.vehicleId) : null
      const vehicleLabel = veh ? [veh.brand, veh.model, veh.plate].filter(Boolean).join(' ').trim() : null
      const placement = placements.get(row.id)
      const leadPipeline = resolveLeadPipeline(pipelines, placement?.pipelineId)
      const leadStage = leadPipeline ? resolveLeadStage(leadPipeline, row.status, placement?.stageId) : null
      return {
        ...row,
        pipelineId: leadPipeline?.id ?? null,
        stageId: leadStage?.id ?? null,
        vehicleLabel,
        vehicle: veh ? { brand: veh.brand, model: veh.model, version: veh.version, plate: veh.plate, year: veh.modelYear ?? veh.year } : null,
        priority: priorityLevel,
        assignedToUserName: row.assignedToUserId ? userNames.get(row.assignedToUserId) ?? null : null,
        unitName: row.unitId ? unitNames.get(row.unitId) ?? null : null,
        leadNumber: row.leadNumber ?? null,
        // Negociação vinculada (summary)
        deal: row.convertedDealId ? (dealMap.get(row.convertedDealId) ?? null) : null,
        // Próxima tarefa/visita pendente
        nextTask: (() => {
          const t = nextTaskByLead.get(row.id)
          if (!t?.dueAt) return null
          const due = t.dueAt.getTime()
          const diff = due - now2
          return { id: t.id, type: t.type, dueAt: t.dueAt, isToday: diff >= 0 && diff < ONE_DAY, isOverdue: diff < 0 }
        })(),
        // Etiquetas (já enriquecidas em lote)
        tags: tagsByLead.get(row.id) ?? [],
      }
    })
    // Busca por veículo em memória: o WHERE do banco já retornou leads por campos
    // diretos. Aqui adicionamos leads cujo veículo vinculado bate no search term
    // (placa/marca/modelo) e não foram capturados pelo WHERE do banco.
    let enrichedFiltered = enriched
    if (search) {
      const s = search.toLowerCase()
      const byDb = new Set(enriched.map(r => r.id))
      const extraFromVehicle = enriched.filter(r => r.vehicleLabel?.toLowerCase().includes(s) && !byDb.has(r.id))
      enrichedFiltered = [...enriched, ...extraFromVehicle]
    }
    let filtered = priority ? enrichedFiltered.filter((row) => row.priority === priority) : enrichedFiltered
    // Temperatura: filtra em memória (metadata é JSON — sem índice no campo)
    if (temperature) {
      filtered = filtered.filter((row) => readTemperature(row.metadata) === temperature)
    }
    if (leadTypeFilter) {
      filtered = filtered.filter((row) => readLeadType(row.metadata) === leadTypeFilter)
    }
    const sorted = filtered.sort((a, b) => {
      const order = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 }
      const byPriority = order[a.priority as keyof typeof order] - order[b.priority as keyof typeof order]
      if (byPriority !== 0) return byPriority
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
    const total = sorted.length
    const paged = sorted.slice((page - 1) * perPage, page * perPage)

    // temperatura, etiquetas, vehicle, deal, nextTask já vêm do enrich em lote acima.
    const data = paged.map(({ metadata, ...rest }) => ({
      ...rest,
      temperature: readTemperature(metadata),
      leadType: readLeadType(metadata),
    }))

    return NextResponse.json({
      success: true,
      data,
      meta: { total, page, perPage, totalPages: Math.max(1, Math.ceil(total / perPage)), scope },
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm.lead.create')) return forbiddenResponse('Sem permissão para criar lead.')
  { const gate = await assertModuleEnabled(user, 'crm'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const name = String(body.name ?? '').trim() || null
    const phone = String(body.phone ?? '').trim() || null
    const email = String(body.email ?? '').trim() || null
    const source = String(body.source ?? 'MANUAL').trim() || 'MANUAL'
    const notes = String(body.notes ?? '').trim() || null
    const cpf = body.cpf ? String(body.cpf) : null
    const externalLeadId = body.externalLeadId ? String(body.externalLeadId) : null
    const explicitAssigned = body.assignedToUserId ? String(body.assignedToUserId) : null
    const settings = await loadCrmSettings(tenantId)
    let leadType: string | null = body.leadType ? String(body.leadType) : null
    if (leadType && !settings.leadTypes.some((t) => t.id === leadType && t.active)) leadType = null
    const vehicleId = body.vehicleId ? String(body.vehicleId) : null
    // Campos obrigatórios da loja (Fase B) — só no cadastro manual; integrações
    // (que mandam externalLeadId) não podem ser barradas por regra de tela.
    if (!externalLeadId) {
      const missing = missingLeadFields(settings.requiredFields.onCreate, { name, phone, email, leadType, vehicleId, assignedToUserId: explicitAssigned ?? user.id })
      if (missing.length) {
        return NextResponse.json({ success: false, error: `Preencha: ${fieldLabels(missing)}.`, missingFields: missing }, { status: 400 })
      }
    }
    if (!name && !phone && !email) {
      return NextResponse.json({ success: false, error: 'Informe nome, telefone ou e-mail.' }, { status: 400 })
    }

    // F2 — resolução de identidade (modo alerta). Idempotência por integração,
    // reuso de contato existente e detecção de duplicidade (sem bloquear).
    const identity = await resolveIdentity(tenantId, { cpf, phone, email, name, source, externalLeadId })
    if (identity.idempotentLeadId) {
      return NextResponse.json({ success: true, data: { id: identity.idempotentLeadId, idempotent: true } })
    }

    const canEditUnit = await canAccessModuleForUser(user, 'crm.lead.edit.unit')
    const canTransfer = await canAccessModuleForUser(user, 'crm.lead.transfer')
    // Distribuição automática (Fase B): sem responsável explícito, o lead nasce
    // sem dono e vai para o motor da Mesa SDR; se ninguém puder receber, fica
    // com quem cadastrou (nunca órfão).
    const autoDistribute = settings.distribution.autoAssignNew && !explicitAssigned
    const assignedToUserId = explicitAssigned && (canEditUnit || canTransfer || explicitAssigned === user.id)
      ? explicitAssigned
      : autoDistribute ? null : user.id
    const unitId = body.unitId && canEditUnit ? String(body.unitId) : (user.unitId ?? null)

    const phoneDigits = normalizePhone(phone)
    const existing = await prisma.marketingLead.findFirst({
      where: {
        tenantId,
        status: { notIn: ['CONVERTED', 'LOST', 'DISCARDED'] },
        OR: [
          ...(email ? [{ email: { equals: email, mode: 'insensitive' as const } }] : []),
          ...(phoneDigits ? [{ phone: { contains: phoneDigits } }] : []),
        ],
      },
      select: { id: true, assignedToUserId: true, customerId: true },
      orderBy: { updatedAt: 'desc' },
    })

    if (existing) {
      const updated = await prisma.marketingLead.update({
        where: { id: existing.id },
        data: {
          ...(name ? { name } : {}),
          ...(phone ? { phone } : {}),
          ...(email ? { email } : {}),
          ...(notes ? { notes } : {}),
          // Reusa o contato existente (não cria pessoa nova) quando o lead ainda não tinha.
          ...(identity.customerId && !existing.customerId ? { customerId: identity.customerId } : {}),
          lastContactAt: new Date(),
          ...(canTransfer ? { assignedToUserId } : {}),
        },
      })
      await createSafeAuditLog({ userId: user.id, tenantId, action: 'CRM_LEAD_DEDUP', entity: 'MarketingLead', entityId: updated.id, userName: user.name, userRole: user.role })
      await flagMergeCandidates(tenantId, updated.id, identity.softMatches)
      return NextResponse.json({ success: true, data: { id: updated.id, deduplicated: true, customerReused: !!identity.customerId } })
    }

    const lead = await prisma.marketingLead.create({
      data: {
        tenantId,
        unitId,
        name,
        phone,
        email,
        source,
        notes,
        status: 'NEW',
        assignedToUserId,
        ...(vehicleId ? { vehicleId } : {}),
        createdById: user.id,
        // Reusa contato existente (identidade) se houver — não cria pessoa duplicada.
        ...(identity.customerId ? { customerId: identity.customerId } : {}),
        metadata: { origin: 'CRM_MANUAL', ...(externalLeadId ? { externalLeadId } : {}), ...(cpf ? { cpf } : {}), ...(leadType ? { leadType } : {}) },
      },
    })

    await createSafeAuditLog({ userId: user.id, tenantId, action: 'CREATE', entity: 'MarketingLead', entityId: lead.id, userName: user.name, userRole: user.role })
    // Atribui número público ao lead (tolerante — não bloqueia a criação).
    void assignLeadNumber(lead.id, tenantId)
    if (autoDistribute) {
      const distributed = await distributeLeadById(tenantId, lead.id).catch(() => false)
      if (!distributed) await prisma.marketingLead.update({ where: { id: lead.id }, data: { assignedToUserId: user.id } }).catch(() => {})
    }
    await fireAutomations(tenantId, 'LEAD_CREATED', lead.id, { settings })
    // CRM Pipelines — funil escolhido na criação (sem funil = padrão).
    if (body.pipelineId) {
      const pipelines = await loadPipelines(tenantId)
      const target = pipelines.find((p) => p.id === String(body.pipelineId) && p.active && !p.virtual && !p.isDefault)
      const stage = target ? landingStage(target, 'NEW') : null
      if (target && stage) {
        await savePlacement({ tenantId, leadId: lead.id, pipelineId: target.id, stageId: stage.id, stageChanged: true }).catch(() => {})
        if (stage.statusCode !== 'NEW') await prisma.marketingLead.update({ where: { id: lead.id }, data: { status: stage.statusCode as never } }).catch(() => {})
      }
    }
    // Alerta de duplicidade (não bloqueia): registra candidatos p/ revisão.
    const alertMatches = [...identity.softMatches, ...(identity.hardMatch?.leadId ? [identity.hardMatch] : [])]
    await flagMergeCandidates(tenantId, lead.id, alertMatches)
    return NextResponse.json({ success: true, data: { id: lead.id, deduplicated: false, customerReused: !!identity.customerId, duplicateAlerts: alertMatches.filter((m) => m.leadId).length } }, { status: 201 })
  } catch (err) {
    return handlePrismaError(err)
  }
}
