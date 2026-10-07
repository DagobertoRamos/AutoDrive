// =============================================================================
// POST /api/site/[site]/leads — formulário do site público da loja.
// Rota PÚBLICA (sem sessão): o `site` é o slug ou o domínio da loja.
// O lead entra no CRM da loja com origem SITE:
//   • telefone/e-mail já com lead aberto → vira interação nesse lead (sem duplicar);
//   • senão cria o lead, numera, tenta distribuir (Mesa SDR) e dispara as
//     automações "Lead criado"; sem ninguém para receber, avisa os gestores.
// Venda seu carro: com o passo a passo de fotos (`inspection`), a pré-avaliação
// também vira avaliação no módulo de Avaliação (liberada pelo sistema, com
// conferência obrigatória da gerência antes de negociar) e a resposta traz o
// token para as fotos irem direto para ela.
// Proteções: campo-isca (spam) e limite por IP. O pedido é gravado no Gateway
// de Entrada antes de virar lead: se o banco falhar no meio, o job refaz.
// =============================================================================

import { after, NextResponse } from 'next/server'
import { resolveSite } from '@/lib/site/config'
import { siteVehicleRef } from '@/lib/site/vehicles'
import { sendSiteLeadEmails } from '@/lib/site/lead-email'
import { createEvalPhotoToken, createLeadPhotoToken } from '@/lib/site/lead-photo-token'
import { parseInspection, type PreEvalInspection } from '@/lib/evaluation/site-pre-evaluation'
import { createSitePreEvaluation } from '@/lib/evaluation/site-pre-evaluation-server'
import { parseSiteLead } from '@/lib/site/leads-core'
import { processInboxEvent, receiveEvent } from '@/lib/integrations/inbox'
import { handleSiteLeadEvent, SITE_PROVIDER } from '@/lib/site/site-lead-intake'

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

  const body = await req.json().catch(() => ({}))
  const parsed = parseSiteLead(body)
  if (!parsed.ok) {
    if (parsed.spam) return NextResponse.json({ success: true })
    return NextResponse.json({ success: false, error: parsed.error }, { status: parsed.status })
  }
  const input = parsed.value
  let inspection: PreEvalInspection | null = null
  if (input.kind === 'sell_car' && body && typeof body === 'object' && 'inspection' in body) {
    const insp = parseInspection((body as Record<string, unknown>).inspection)
    if (!insp.ok) return NextResponse.json({ success: false, error: insp.error }, { status: 400 })
    inspection = insp.value
  }
  const origin = new URL(req.url).origin

  // Carro que já saiu do site: avisa o visitante na hora (nada é gravado).
  // (Erro de banco aqui não bloqueia: o pedido segue e o processamento confere de novo.)
  if (input.vehicleId && (await siteVehicleRef(tenantId, input.vehicleId).catch(() => undefined)) === null) {
    return NextResponse.json({ success: false, error: 'Este veículo não está mais disponível.' }, { status: 409 })
  }

  // Gateway de Entrada: grava o pedido ANTES de processar (o lead não se perde).
  let ev
  try {
    ev = await receiveEvent({ provider: SITE_PROVIDER, kind: 'LEAD', tenantId, channelRef: 'site', scope: tenantId, payload: body })
  } catch (err) {
    console.error('[site/leads] não gravou o pedido:', err)
    return NextResponse.json({ success: false, error: 'Não foi possível enviar agora. Tente novamente ou fale pelo WhatsApp.' }, { status: 500 })
  }
  if (ev.duplicate) return NextResponse.json({ success: true, protocol: null })

  const r = await processInboxEvent(ev.id, handleSiteLeadEvent)
  if (r.status !== 'PROCESSED' || !r.resultRef) {
    // Já gravado: o CRM reprocessa sozinho. Para o visitante, o pedido foi recebido.
    return NextResponse.json({ success: true, protocol: null }, { status: 202 })
  }
  const leadId = r.resultRef
  const x = (r.extra ?? {}) as { created?: boolean; leadNumber?: number | null; vehicle?: Awaited<ReturnType<typeof siteVehicleRef>> }
  const protocol = x.leadNumber ? `#${x.leadNumber}` : null
  // Falha aqui não perde o lead: o navegador cai no envio antigo de fotos.
  const evaluation = inspection
    ? await createSitePreEvaluation({ tenantId, leadId, protocol, input, inspection }).catch((e) => { console.error('[site/leads] pré-avaliação:', e); return null })
    : null
  // E-mails depois da resposta: o visitante não espera o SMTP.
  after(() => sendSiteLeadEmails({ tenantId, config: resolved.config, input, vehicle: x.vehicle ?? null, protocol, leadId, repeat: !x.created, origin }))
  return NextResponse.json({
    success: true, protocol,
    ...(input.kind === 'sell_car' ? { uploadToken: createLeadPhotoToken(leadId, tenantId) } : {}),
    ...(evaluation ? { evaluationToken: createEvalPhotoToken(evaluation.id, tenantId) } : {}),
  }, { status: x.created ? 201 : 200 })
}
