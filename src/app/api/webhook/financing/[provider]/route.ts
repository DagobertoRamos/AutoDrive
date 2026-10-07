// =============================================================================
// /api/webhook/financing/[provider] — retorno assíncrono dos bancos (F&I Core).
// PÚBLICO (sem sessão), protegido por:
//   • assinatura HMAC-SHA256 do corpo bruto (header x-signature) com a chave da
//     plataforma FINANCE_WEBHOOK_SECRET — ou o header legado x-webhook-secret.
//     Segredo na URL (?secret=) NÃO é mais aceito (vaza em logs).
//   • deduplicação: (provider, eventId) único — evento repetido responde 200 e
//     não muda nada. Sem eventId, usa o hash do corpo.
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
import { getBankProvider } from '@/lib/finance/fi/gateway/registry'
import type { WebhookEvent } from '@/lib/finance/fi/gateway/types'
import { advancePostApproval, applyDecision, FiError } from '@/lib/finance/fi/orchestrator'

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

export async function POST(req: Request, { params }: Ctx) {
  const secret = process.env.FINANCE_WEBHOOK_SECRET
  if (!secret || secret.trim().length < 16) {
    return NextResponse.json({ success: false, error: 'Receptor desativado.' }, { status: 503 })
  }
  const { provider: key } = await params
  const provider = getBankProvider(key)
  if (!provider) return NextResponse.json({ success: false, error: 'Canal desconhecido.' }, { status: 404 })

  const raw = await req.text()
  if (raw.length > 512_000) return NextResponse.json({ success: false, error: 'Payload grande demais.' }, { status: 413 })
  const headers: Record<string, string> = {}
  req.headers.forEach((v, k) => { headers[k.toLowerCase()] = v })
  const signed = provider.verifyWebhook(raw, headers, secret)
  const legacy = secretsMatch(req.headers.get('x-webhook-secret'), secret)
  if (!signed && !legacy) return NextResponse.json({ success: false, error: 'Não autorizado.' }, { status: 401 })

  let payload: unknown
  try { payload = JSON.parse(raw) } catch { return NextResponse.json({ success: false, error: 'Payload inválido.' }, { status: 400 }) }

  const parsed = provider.parseWebhook(payload)
  const events = parsed.length ? parsed : genericEvents(payload, raw, req.headers)
  const results: { eventId: string | null; processed: boolean; duplicate?: boolean; error?: string | null }[] = []

  for (const ev of events.slice(0, 50)) {
    const eventId = ev.eventId ?? `sha256:${createHash('sha256').update(JSON.stringify(ev.raw ?? null)).digest('hex')}`
    // Proposta só entre os bancos que usam ESTE canal.
    const matches = ev.externalId
      ? await prisma.financeProposalSubmission.findMany({
          where: { externalId: ev.externalId, bankId: { in: (await prisma.financeBank.findMany({ where: { adapterKey: provider.key }, select: { id: true } })).map((b) => b.id) } },
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
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') { results.push({ eventId, processed: false, duplicate: true }); continue }
      throw e
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
  return NextResponse.json({ success: true, results })
}
