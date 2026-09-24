// =============================================================================
// POST /api/site/[site]/leads — formulário do site público da loja.
// Rota PÚBLICA (sem sessão): o `site` é o slug ou o domínio da loja.
// O lead entra no CRM da loja com origem SITE:
//   • telefone/e-mail já com lead aberto → vira interação nesse lead (sem duplicar);
//   • senão cria o lead, numera, tenta distribuir (Mesa SDR) e dispara as
//     automações "Lead criado"; sem ninguém para receber, avisa os gestores.
// Proteções: campo-isca (spam) e limite por IP.
// =============================================================================

import { after, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveSite } from '@/lib/site/config'
import { siteVehicleRef } from '@/lib/site/vehicles'
import { sendSiteLeadEmails } from '@/lib/site/lead-email'
import { createLeadPhotoToken } from '@/lib/site/lead-photo-token'
import { buildLeadMessage, KIND_LABEL, parseSiteLead } from '@/lib/site/leads-core'
import { resolveIdentity } from '@/lib/crm/dedup'
import { assignLeadNumber } from '@/lib/crm/lead-number'
import { fireAutomations } from '@/lib/crm/automations'
import { distributeLeadById } from '@/lib/marketing/distribution'
import { notifyByRole } from '@/services/notification.service'

export const dynamic = 'force-dynamic'

const MANAGER_ROLES = ['ADM', 'GERENTE_GERAL', 'GERENTE']
const WINDOW_MS = 10 * 60_000
const MAX_PER_WINDOW = 8
const hits = new Map<string, number[]>()

function rateLimited(key: string): boolean {
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS)
  recent.push(now)
  hits.set(key, recent)
  if (hits.size > 5000) hits.clear()
  return recent.length > MAX_PER_WINDOW
}

export async function POST(req: Request, { params }: { params: Promise<{ site: string }> }) {
  const { site } = await params
  const resolved = await resolveSite(site)
  if (!resolved) return NextResponse.json({ success: false, error: 'Site não encontrado.' }, { status: 404 })
  const { tenantId } = resolved

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'local'
  if (rateLimited(`${tenantId}:${ip}`)) {
    return NextResponse.json({ success: false, error: 'Muitas solicitações em pouco tempo. Tente de novo em alguns minutos ou fale pelo WhatsApp.' }, { status: 429 })
  }

  const parsed = parseSiteLead(await req.json().catch(() => ({})))
  if (!parsed.ok) {
    if (parsed.spam) return NextResponse.json({ success: true })
    return NextResponse.json({ success: false, error: parsed.error }, { status: parsed.status })
  }
  const input = parsed.value
  const origin = new URL(req.url).origin

  try {
    const vehicle = input.vehicleId ? await siteVehicleRef(tenantId, input.vehicleId) : null
    if (input.vehicleId && !vehicle) return NextResponse.json({ success: false, error: 'Este veículo não está mais disponível.' }, { status: 409 })
    const message = buildLeadMessage(input, vehicle?.title ?? null)
    const now = new Date()
    const phoneDigits = input.phone.replace(/\D/g, '')

    // Mesmo cliente com lead aberto → registra no lead existente. O telefone é
    // gravado formatado ("(11) 97777-1234"): pré-filtra pelos 4 últimos dígitos
    // e compara os números normalizados (8 últimos dígitos, ignora DDI/9º dígito).
    const candidates = await prisma.marketingLead.findMany({
      where: {
        tenantId, deletedAt: null, status: { notIn: ['CONVERTED', 'LOST', 'DISCARDED'] },
        OR: [{ phone: { contains: phoneDigits.slice(-4) } }, ...(input.email ? [{ email: { equals: input.email, mode: 'insensitive' as const } }] : [])],
      },
      select: { id: true, leadNumber: true, vehicleId: true, phone: true, email: true },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    })
    const tail = phoneDigits.slice(-8)
    const existing = candidates.find((c) => (c.phone ?? '').replace(/\D/g, '').slice(-8) === tail)
      ?? (input.email ? candidates.find((c) => c.email?.toLowerCase() === input.email.toLowerCase()) : undefined)
    if (existing) {
      await prisma.crmLeadInteraction.create({
        data: { tenantId, leadId: existing.id, type: 'NOTE', channel: 'SITE', summary: `Nova solicitação pelo site:\n${message}`, discussedVehicle: vehicle?.title ?? null, authorId: 'site', authorName: 'Site da loja', occurredAt: now },
      }).catch(() => {})
      await prisma.marketingLead.update({
        where: { id: existing.id },
        data: { lastContactAt: now, ...(vehicle && !existing.vehicleId ? { vehicleId: vehicle.id } : {}) },
      })
      const protocol = existing.leadNumber ? `#${existing.leadNumber}` : null
      // E-mails depois da resposta: o visitante não espera o SMTP.
      after(() => sendSiteLeadEmails({ tenantId, config: resolved.config, input, vehicle, protocol, leadId: existing.id, repeat: true, origin }))
      return NextResponse.json({ success: true, protocol, ...(input.kind === 'sell_car' ? { uploadToken: createLeadPhotoToken(existing.id, tenantId) } : {}) })
    }

    const identity = await resolveIdentity(tenantId, { phone: input.phone, email: input.email || null, name: input.name, source: 'SITE', cpf: null, externalLeadId: null }).catch(() => null)
    const lead = await prisma.marketingLead.create({
      data: {
        tenantId, status: 'NEW', source: 'SITE',
        name: input.name, phone: input.phone, email: input.email || null,
        notes: message,
        ...(vehicle ? { vehicleId: vehicle.id } : {}),
        ...(identity?.customerId ? { customerId: identity.customerId } : {}),
        metadata: { origin: 'SITE', siteKind: input.kind, ...(input.intent ? { intent: input.intent } : {}), details: input.details, tracking: input.tracking },
      },
      select: { id: true },
    })
    const leadNumber = await assignLeadNumber(lead.id, tenantId)

    const distributed = await distributeLeadById(tenantId, lead.id).catch(() => false)
    if (!distributed) {
      await notifyByRole({
        tenantId, roles: MANAGER_ROLES, type: 'SISTEMA', actionUrl: `/crm/leads/${lead.id}`,
        title: 'Novo lead do site',
        message: `${input.name} — ${KIND_LABEL[input.kind]}${vehicle ? `: ${vehicle.title}` : ''}. Aguardando responsável.`,
        metadata: { kind: 'site_lead', leadId: lead.id }, channels: ['APP_WEB', 'APP_MOBILE', 'PUSH'],
      }).catch(() => {})
    }
    await fireAutomations(tenantId, 'LEAD_CREATED', lead.id)

    const protocol = leadNumber ? `#${leadNumber}` : null
    after(() => sendSiteLeadEmails({ tenantId, config: resolved.config, input, vehicle, protocol, leadId: lead.id, repeat: false, origin }))
    return NextResponse.json({ success: true, protocol, ...(input.kind === 'sell_car' ? { uploadToken: createLeadPhotoToken(lead.id, tenantId) } : {}) }, { status: 201 })
  } catch (err) {
    console.error('[site/leads] falhou:', err)
    return NextResponse.json({ success: false, error: 'Não foi possível enviar agora. Tente novamente ou fale pelo WhatsApp.' }, { status: 500 })
  }
}
