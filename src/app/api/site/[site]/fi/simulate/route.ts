// =============================================================================
// POST /api/site/[site]/fi/simulate — simulação de financiamento do site (F&I).
// PÚBLICO. Formulário progressivo:
//   { step: 'valores', vehicleValue, downPayment, installments, vehicleId? }
//       → estimativa (só se a loja configurou a taxa de referência). Sem dado pessoal.
//   { step: 'identificacao', ...valores, name, cpf, birthDate, phone, email?, consent: true,
//     pageUrl?, utmSource?, utmMedium?, utmCampaign? }
//       → lead no CRM (origem SITE — SIMULAÇÃO DE FINANCIAMENTO) + ficha + link
//         seguro para o cliente acompanhar e completar os dados.
// A estimativa NÃO é aprovação: quem aprova é o banco.
// =============================================================================

import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { resolveSite } from '@/lib/site/config'
import { serviceOn } from '@/lib/site/config-core'
import { siteVehicleRef } from '@/lib/site/vehicles'
import { createInboundLead } from '@/lib/crm/inbound-lead'
import { siteSimulationSchema, lgpdSchema } from '@/lib/finance/settings'
import { estimate, parseIdentity, parseValues, SITE_ORIGIN_LABEL, type SiteSimConfig } from '@/lib/finance/fi/site-core'
import { issuePortalLink, nextFiCode } from '@/lib/finance/fi/orchestrator'
import { addTimeline, reflectOnCrm } from '@/lib/finance/fi/events'

export const dynamic = 'force-dynamic'

const SITE_ACTOR = { id: 'site', name: 'Site da loja', role: 'SISTEMA' }
const MAX_PER_IP_10MIN = 5

async function setting<T>(tenantId: string, key: string, schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }, fallback: T): Promise<T> {
  const row = await prisma.financeTenantSetting.findUnique({ where: { tenantId_key: { tenantId, key } } })
  const r = schema.safeParse(row?.value ?? {})
  return r.success && r.data ? r.data : fallback
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export async function POST(req: Request, { params }: { params: Promise<{ site: string }> }) {
  const { site } = await params
  const resolved = await resolveSite(site)
  if (!resolved || !serviceOn(resolved.config, 'financiamento')) return NextResponse.json({ success: false, error: 'Simulação indisponível.' }, { status: 404 })
  const { tenantId } = resolved
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  if (typeof body.website === 'string' && body.website.trim()) return NextResponse.json({ success: false, error: 'Não foi possível enviar.' }, { status: 400 })

  const cfg = await setting<SiteSimConfig>(tenantId, 'site_simulation', siteSimulationSchema, { enabled: false, referenceRate: null, installmentsList: [24, 36, 48, 60], minDownPaymentPct: 0 })
  const values = parseValues(body, cfg)
  if (!values.ok) return NextResponse.json({ success: false, error: values.error }, { status: 422 })
  const est = estimate(values.value, cfg)
  const vehicleId = typeof body.vehicleId === 'string' && body.vehicleId ? body.vehicleId.slice(0, 60) : null
  const vehicle = vehicleId ? await siteVehicleRef(tenantId, vehicleId) : null
  if (vehicleId && !vehicle) return NextResponse.json({ success: false, error: 'Este veículo não está mais disponível.' }, { status: 409 })

  if (body.step !== 'identificacao') {
    return NextResponse.json({ success: true, data: { financed: values.value.vehicleValue - values.value.downPayment, estimate: est, estimateNote: est ? 'Valores estimados. A aprovação e as condições finais são do banco.' : null } })
  }

  const id = parseIdentity(body)
  if (!id.ok) return NextResponse.json({ success: false, error: id.error }, { status: 422 })
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'local'
  const ipHash = createHash('sha256').update(`${tenantId}:${ip}`).digest('hex').slice(0, 32)
  const recent = await prisma.financeProposal.count({ where: { tenantId, origin: 'SITE', createdAt: { gte: new Date(Date.now() - 600_000) }, originMeta: { path: ['ipHash'], equals: ipHash } } })
  if (recent >= MAX_PER_IP_10MIN) return NextResponse.json({ success: false, error: 'Muitas solicitações em pouco tempo. Tente de novo em alguns minutos.' }, { status: 429 })

  const tracking: Record<string, string> = {}
  for (const k of ['pageUrl', 'utmSource', 'utmMedium', 'utmCampaign', 'referrer']) { const v = body[k]; if (typeof v === 'string' && v.trim()) tracking[k] = v.trim().slice(0, 400) }
  const v = values.value
  const financed = v.vehicleValue - v.downPayment

  try {
    const lead = await createInboundLead({
      tenantId, source: 'SITE', name: id.value.name, phone: id.value.phone, email: id.value.email,
      notes: `${SITE_ORIGIN_LABEL}: ${vehicle?.title ?? 'veículo'} de ${brl(v.vehicleValue)}, entrada ${brl(v.downPayment)}, ${v.installments}x.`,
      vehicleId: vehicle?.id ?? null, vehicleTitle: vehicle?.title ?? null,
      metadata: { origin: 'SITE', originLabel: SITE_ORIGIN_LABEL, siteKind: 'financing', intent: 'simulacao', details: { vehicleValue: v.vehicleValue, downPayment: v.downPayment, installments: v.installments }, tracking },
      authorName: 'Site da loja', authorId: 'site', interactionChannel: 'SITE', repeatPrefix: 'Nova simulação de financiamento pelo site:',
      notifyTitle: 'Simulação de financiamento no site', notifyMessage: `${id.value.name} simulou ${v.installments}x${vehicle ? ` — ${vehicle.title}` : ''}.`,
    })
    const lgpd = await setting(tenantId, 'lgpd', lgpdSchema, { legalBasis: 'PROCEDIMENTOS_PRELIMINARES_CONTRATO' as const, privacyVersion: '1', documentRetentionDays: 180 })

    const proposal = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`fi:site:${tenantId}:${id.value.cpf}`}))`
      // Mesmo CPF: completa só o que estiver vazio (nunca sobrescreve em silêncio).
      let person = await tx.financeProponent.findFirst({ where: { tenantId, cpf: id.value.cpf }, orderBy: { updatedAt: 'desc' } })
      if (person) {
        const fill: Prisma.FinanceProponentUpdateInput = {}
        if (!person.dataNascimento) fill.dataNascimento = id.value.birthDate
        if (!person.celular) fill.celular = id.value.phone
        if (!person.email && id.value.email) fill.email = id.value.email
        if (Object.keys(fill).length) person = await tx.financeProponent.update({ where: { id: person.id }, data: fill })
      } else {
        person = await tx.financeProponent.create({ data: { tenantId, personType: 'PF', nomeCompleto: id.value.name, cpf: id.value.cpf, dataNascimento: id.value.birthDate, celular: id.value.phone, email: id.value.email } })
      }
      const originMeta = { label: SITE_ORIGIN_LABEL, ipHash, ...tracking } as Prisma.InputJsonValue
      // Mesma simulação nos últimos 7 dias (mesmo cliente e veículo) é atualizada, não duplicada.
      const reuse = await tx.financeProposal.findFirst({
        where: { tenantId, proponentId: person.id, origin: 'SITE', status: 'SIMULACAO', vehicleId: vehicle?.id ?? null, createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } },
        orderBy: { createdAt: 'desc' },
      })
      const terms = { vehicleValue: v.vehicleValue, downPayment: v.downPayment, amountRequested: financed, installments: v.installments }
      const p = reuse
        ? await tx.financeProposal.update({ where: { id: reuse.id }, data: { ...terms, leadId: lead.leadId, originMeta, revision: { increment: 1 } } })
        : await tx.financeProposal.create({
            data: {
              tenantId, code: await nextFiCode(tx, tenantId), proponentId: person.id, leadId: lead.leadId, vehicleId: vehicle?.id ?? null, vehicle: vehicle?.title ?? null,
              ...terms, status: 'SIMULACAO', origin: 'SITE', originMeta,
            },
          })
      await tx.financeConsent.create({
        data: {
          tenantId, proponentId: person.id, proposalId: p.id, type: 'TRATAMENTO_DADOS', granted: true, grantedAt: new Date(), ip: ip === 'local' ? null : ip,
          userAgent: req.headers.get('user-agent')?.slice(0, 300) ?? null, origin: 'SITE', purpose: 'Simulação e pré-análise de financiamento de veículo.',
          legalBasis: lgpd.legalBasis, privacyVersion: lgpd.privacyVersion,
        },
      })
      await addTimeline(tx, { tenantId, proposalId: p.id, type: 'SYSTEM', source: 'SITE', message: reuse ? 'Cliente refez a simulação pelo site.' : 'Simulação recebida pelo site.', data: { installments: v.installments } })
      return { ...p, reused: !!reuse }
    }, { timeout: 15_000 })

    if (!proposal.reused) await reflectOnCrm(proposal.id, 'SIMULACAO_INICIADA')
    await reflectOnCrm(proposal.id, 'SIMULACAO_CONCLUIDA', `${v.installments}x, entrada ${brl(v.downPayment)}`)
    const { token } = await issuePortalLink(proposal.id, SITE_ACTOR, 14)
    const origin = process.env.NEXTAUTH_URL?.replace(/\/+$/, '') || new URL(req.url).origin
    return NextResponse.json({
      success: true,
      data: {
        protocol: lead.leadNumber ? `#${lead.leadNumber}` : null, code: proposal.code, estimate: est,
        estimateNote: est ? 'Valores estimados. A aprovação e as condições finais são do banco.' : null,
        portalUrl: `${origin}/minha-ficha/${token}`,
      },
    }, { status: 201 })
  } catch (err) {
    console.error('[site/fi] simulação falhou:', err instanceof Error ? err.message : err)
    return NextResponse.json({ success: false, error: 'Não foi possível enviar agora. Tente novamente ou fale pelo WhatsApp.' }, { status: 500 })
  }
}
