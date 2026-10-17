// =============================================================================
// /api/webhook/financing/[provider] — retorno assíncrono dos bancos (F&I Core).
// PÚBLICO (sem sessão), protegido por:
//   • assinatura HMAC-SHA256 do corpo bruto (header x-signature) com a chave da
//     plataforma FINANCE_WEBHOOK_SECRET — ou o header legado x-webhook-secret.
//     Com ?l=<loja>, a chave é a DA LOJA (derivada; ver gateway/webhook-keys) e
//     só propostas daquela loja são tocadas. Cada conector valida do seu jeito
//     (BV: <assinatura> no header SOAP).
//     Segredo na URL (?secret=) NÃO é mais aceito (vaza em logs).
//   • corpo JSON ou XML (o conector recebe o texto bruto quando não é JSON).
//   • deduplicação: (provider, eventId) único — evento já aplicado responde 200 e
//     não muda nada; evento que falhou é reprocessado no reenvio. Sem eventId,
//     usa o hash do corpo.
//   • escopo: a proposta é procurada só entre bancos ligados a ESTE canal; id
//     externo ambíguo (mais de uma loja) não é aplicado.
//   • máquina de estados: evento atrasado não faz a proposta regredir.
// Sem FINANCE_WEBHOOK_SECRET o receptor fica desligado (503).
// =============================================================================

import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { secretsMatch, extractWebhookFields, mapProviderStatus } from '@/lib/finance/webhook-service'
import { currentFiEnvironment, getBankProvider } from '@/lib/finance/fi/gateway/registry'
import type { WebhookEvent } from '@/lib/finance/fi/gateway/types'
import { advancePostApproval, applyDecision, FiError, verifyAttempt } from '@/lib/finance/fi/orchestrator'
import { tenantWebhookKey } from '@/lib/finance/fi/gateway/webhook-keys'
import { verifyCredereSignature } from '@/lib/finance/fi/gateway/credere'
import { findCredereConnection } from '@/lib/finance/fi/gateway/credere-connection'

type Ctx = { params: Promise<{ provider: string }> }
const SYSTEM_ACTOR = { id: 'sistema', name: 'Banco (webhook)', role: 'MASTER' }

function genericEvents(payload: unknown, raw: string, headers: Headers): WebhookEvent[] {
  const { externalId, statusRaw, message } = extractWebhookFields(payload)
  const p = (payload ?? {}) as Record<string, unknown>
  const eventId = [p.eventId, p.event_id, p.idEvento, headers.get('x-event-id')].find((v) => typeof v === 'string' && v.trim()) as string | undefined
  const status = mapProviderStatus(statusRaw)
  return [{
    eventId: eventId ?? `sha256:${createHash('sha256').update(raw).digest('hex')}`,
    externalId,
    decision: status ? { status, reason: message } : null,
    raw: payload,
  }]
}

const SOAP_ACK = '<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><ok>true</ok></soapenv:Body></soapenv:Envelope>'

export async function POST(req: Request, { params }: Ctx) {
  const platformSecret = process.env.FINANCE_WEBHOOK_SECRET
  if (!platformSecret || platformSecret.trim().length < 16) {
    return NextResponse.json({ success: false, error: 'Receptor desativado.' }, { status: 503 })
  }
  const { provider: key } = await params
  const provider = getBankProvider(key)
  if (!provider) return NextResponse.json({ success: false, error: 'Canal desconhecido.' }, { status: 404 })

  const tenantScope = new URL(req.url).searchParams.get('l')?.trim() || null
  if (tenantScope && !/^[a-z0-9_-]{8,40}$/i.test(tenantScope)) return NextResponse.json({ success: false, error: 'Loja inválida.' }, { status: 400 })
  const secret = tenantScope ? tenantWebhookKey(platformSecret, tenantScope, provider.key) : platformSecret

  const raw = await req.text()
  if (raw.length > 512_000) return NextResponse.json({ success: false, error: 'Payload grande demais.' }, { status: 413 })
  if (provider.webhookRefetch) return refetchWebhook(provider, raw, tenantScope, req.headers)
  const headers: Record<string, string> = {}
  req.headers.forEach((v, k) => { headers[k.toLowerCase()] = v })
  const signed = provider.verifyWebhook(raw, headers, secret)
  const legacy = secretsMatch(req.headers.get('x-webhook-secret'), secret)
  if (!signed && !legacy) return NextResponse.json({ success: false, error: 'Não autorizado.' }, { status: 401 })

  let payload: unknown
  let xml = false
  try { payload = JSON.parse(raw) } catch {
    if (!/^\s*</.test(raw)) return NextResponse.json({ success: false, error: 'Payload inválido.' }, { status: 400 })
    payload = raw; xml = true
  }

  const parsed = provider.parseWebhook(payload)
  const events = parsed.length ? parsed : xml ? [] : genericEvents(payload, raw, req.headers)
  const results: { eventId: string | null; processed: boolean; duplicate?: boolean; error?: string | null }[] = []

  for (const ev of events.slice(0, 50)) {
    const eventId = ev.eventId ?? `sha256:${createHash('sha256').update(JSON.stringify(ev.raw ?? null)).digest('hex')}`
    // Proposta só entre os bancos que usam ESTE canal.
    const matches = ev.externalId
      ? await prisma.financeProposalSubmission.findMany({
          where: { externalId: ev.externalId, ...(tenantScope ? { tenantId: tenantScope } : {}), bankId: { in: (await prisma.financeBank.findMany({ where: { adapterKey: provider.key, ...(tenantScope ? { tenantId: tenantScope } : {}) }, select: { id: true } })).map((b) => b.id) } },
          select: { id: true, tenantId: true, proposalId: true }, take: 2,
        })
      : []
    const sub = matches.length === 1 ? matches[0] : null
    let row: { id: string }
    try {
      row = await prisma.financeWebhookEvent.create({
        data: {
          provider: provider.key, eventId, externalId: ev.externalId, tenantId: sub?.tenantId ?? null, submissionId: sub?.id ?? null,
          signatureValid: signed, payload: (ev.raw ?? payload) as Prisma.InputJsonValue, processed: false,
        },
        select: { id: true },
      })
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e
      // Reenvio do mesmo evento: já aplicado → ignora; falhou antes → tenta de novo (o banco reenvia justamente por isso).
      const prev = await prisma.financeWebhookEvent.findUnique({ where: { provider_eventId: { provider: provider.key, eventId } }, select: { id: true, processed: true } })
      if (!prev || prev.processed) { results.push({ eventId, processed: false, duplicate: true }); continue }
      row = prev
      await prisma.financeWebhookEvent.update({ where: { id: prev.id }, data: { tenantId: sub?.tenantId ?? null, submissionId: sub?.id ?? null, signatureValid: signed } })
    }
    let error: string | null = null
    if (!ev.externalId) error = 'Evento sem identificação da proposta.'
    else if (matches.length > 1) error = 'Identificação ambígua: mais de uma proposta com este id externo.'
    else if (!sub) error = 'Nenhuma proposta deste canal com este id externo.'
    else {
      try {
        if (ev.decision) {
          const r = await applyDecision(sub.id, ev.decision, { source: 'WEBHOOK' })
          if (!r.applied && r.reason && r.reason !== 'Sem mudança.') error = `Ignorado: ${r.reason}`
        }
        if (ev.funding?.status === 'PAGO') {
          await advancePostApproval(sub.proposalId, 'funding', { to: 'PAGO', amount: ev.funding.amount ?? null, date: ev.funding.paidAt ?? null, note: 'Informado pelo banco.' }, SYSTEM_ACTOR)
        }
      } catch (e) {
        error = e instanceof FiError ? e.message : 'Falha ao aplicar o evento.'
        if (!(e instanceof FiError)) console.error('[fi/webhook]', e instanceof Error ? e.message : e)
      }
    }
    await prisma.financeWebhookEvent.update({ where: { id: row.id }, data: { processed: !error, processedAt: new Date(), error } })
    results.push({ eventId, processed: !error, error })
  }
  // 200 sempre que autenticado: o banco não entra em reenvio infinito; erros ficam nos Logs técnicos.
  if (xml) return new NextResponse(SOAP_ACK, { status: 200, headers: { 'Content-Type': 'text/xml; charset=utf-8' } })
  return NextResponse.json({ success: true, results })
}

/**
 * Provedor cujo aviso só dispara consulta (ex.: Credere): o aviso NÃO muda nada
 * por si — só identifica a tentativa, e o status vem de uma consulta ao provedor
 * com a credencial da loja. Credere com secret cadastrado pela loja: só aceita
 * aviso assinado e recente (senão 401), o que evita gastar o limite de consultas.
 */
async function refetchWebhook(provider: NonNullable<ReturnType<typeof getBankProvider>>, raw: string, tenantScope: string | null, headers: Headers) {
  if (!tenantScope) return NextResponse.json({ success: false, error: 'Loja não informada.' }, { status: 400 })
  // Credere: com o secret da URL cadastrado pela loja, só aceita aviso assinado (e recente).
  let signatureValid = false
  if (provider.key === 'credere') {
    const conn = await findCredereConnection(tenantScope, currentFiEnvironment())
    const secret = conn?.readable ? conn.credentials.webhookSecret ?? '' : ''
    if (secret) {
      if (!verifyCredereSignature(raw, headers.get('x-credere-signature'), secret)) return NextResponse.json({ success: false, error: 'Não autorizado.' }, { status: 401 })
      signatureValid = true
    }
  }
  let payload: unknown
  try { payload = JSON.parse(raw) } catch { return NextResponse.json({ success: false, error: 'Payload inválido.' }, { status: 400 }) }
  const results: { eventId: string | null; processed: boolean; duplicate?: boolean; error?: string | null }[] = []
  for (const ev of provider.parseWebhook(payload).slice(0, 20)) {
    const eventId = ev.eventId ?? `sha256:${createHash('sha256').update(raw).digest('hex')}`
    const sub = ev.externalId
      ? await prisma.financeProposalSubmission.findFirst({ where: { tenantId: tenantScope, providerId: provider.key, externalId: ev.externalId }, select: { id: true, tenantId: true } })
      : null
    try {
      await prisma.financeWebhookEvent.create({
        data: { provider: provider.key, eventId, externalId: ev.externalId, tenantId: sub?.tenantId ?? null, submissionId: sub?.id ?? null, signatureValid, payload: (ev.raw ?? null) as Prisma.InputJsonValue, processed: false },
      })
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e
      // Mesmo event_id de novo: já aplicado → ignora; falhou antes (ex.: limite de consultas) → consulta de novo.
      const prev = await prisma.financeWebhookEvent.findUnique({ where: { provider_eventId: { provider: provider.key, eventId } }, select: { id: true, processed: true } })
      if (!prev || prev.processed) { results.push({ eventId, processed: false, duplicate: true }); continue }
      await prisma.financeWebhookEvent.update({ where: { id: prev.id }, data: { tenantId: sub?.tenantId ?? null, submissionId: sub?.id ?? null, signatureValid } })
    }
    let error: string | null = sub ? null : 'Nenhuma proposta desta loja com este id.'
    if (sub) {
      try { await verifyAttempt(sub.id) } catch (e) { error = e instanceof FiError ? e.message : 'Falha ao consultar o provedor.' }
    }
    await prisma.financeWebhookEvent.updateMany({ where: { provider: provider.key, eventId }, data: { processed: !error, processedAt: new Date(), error } })
    results.push({ eventId, processed: !error, error })
  }
  return NextResponse.json({ success: true, results })
}
