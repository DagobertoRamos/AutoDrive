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
import { resolveSite } from '@/lib/site/config'
import { siteVehicleRef } from '@/lib/site/vehicles'
import { sendSiteLeadEmails } from '@/lib/site/lead-email'
import { createLeadPhotoToken } from '@/lib/site/lead-photo-token'
import { buildLeadMessage, KIND_LABEL, parseSiteLead } from '@/lib/site/leads-core'
import { createInboundLead } from '@/lib/crm/inbound-lead'

export const dynamic = 'force-dynamic'

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
    const r = await createInboundLead({
      tenantId, source: 'SITE',
      name: input.name, phone: input.phone, email: input.email || null,
      notes: message,
      vehicleId: vehicle?.id ?? null, vehicleTitle: vehicle?.title ?? null,
      metadata: { origin: 'SITE', siteKind: input.kind, ...(input.intent ? { intent: input.intent } : {}), details: input.details, tracking: input.tracking },
      authorName: 'Site da loja', authorId: 'site', interactionChannel: 'SITE', repeatPrefix: 'Nova solicitação pelo site:',
      notifyTitle: 'Novo lead do site',
      notifyMessage: `${input.name} — ${KIND_LABEL[input.kind]}${vehicle ? `: ${vehicle.title}` : ''}. Aguardando responsável.`,
    })
    const protocol = r.leadNumber ? `#${r.leadNumber}` : null
    // E-mails depois da resposta: o visitante não espera o SMTP.
    after(() => sendSiteLeadEmails({ tenantId, config: resolved.config, input, vehicle, protocol, leadId: r.leadId, repeat: !r.created, origin }))
    return NextResponse.json({ success: true, protocol, ...(input.kind === 'sell_car' ? { uploadToken: createLeadPhotoToken(r.leadId, tenantId) } : {}) }, { status: r.created ? 201 : 200 })
  } catch (err) {
    console.error('[site/leads] falhou:', err)
    return NextResponse.json({ success: false, error: 'Não foi possível enviar agora. Tente novamente ou fale pelo WhatsApp.' }, { status: 500 })
  }
}
