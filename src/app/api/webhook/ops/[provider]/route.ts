// =============================================================================
// POST /api/webhook/ops/[provider] — retorno de provedores (RENAVE, fiscal,
// transferência). Segurança:
//   • assinatura HMAC-SHA256 do corpo cru (header x-signature, hex), segredo
//     OPS_WEBHOOK_SECRET_<PROVIDER> (ou OPS_WEBHOOK_SECRET);
//   • idempotência por event ID (webhook_inbox: provider+eventId únicos) —
//     evento repetido responde 200 e não é processado de novo;
//   • nunca confia no estado recebido para concluir: CONFIRMA consultando o
//     provedor (job/poll) quando ele oferece consulta.
// Corpo esperado (normalizado pelo adapter): { eventId, externalId, state,
//   protocol?, code?, message? }
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createHash, createHmac, timingSafeEqual } from 'crypto'
import { prisma } from '@/lib/prisma'
import { applyToOperation, SYSTEM_ACTOR } from '@/lib/automotive/operations'
import { translateProviderError } from '@/lib/automotive/errors-core'

export const dynamic = 'force-dynamic'

const STATES = new Set(['PROCESSING', 'CONFIRMED', 'REJECTED', 'CANCELLED'])

function secretFor(provider: string): string | null {
  return process.env[`OPS_WEBHOOK_SECRET_${provider.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`] ?? process.env.OPS_WEBHOOK_SECRET ?? null
}

function validSignature(raw: string, header: string | null, secret: string): boolean {
  if (!header) return false
  const expected = createHmac('sha256', secret).update(raw).digest('hex')
  const got = header.replace(/^sha256=/i, '').trim()
  if (got.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected))
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params
  const secret = secretFor(provider)
  if (!secret) return NextResponse.json({ error: 'Provedor não configurado' }, { status: 404 })
  const raw = await req.text()
  if (!validSignature(raw, req.headers.get('x-signature'), secret)) return NextResponse.json({ error: 'Assinatura inválida' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = JSON.parse(raw) } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const eventId = String(body.eventId ?? req.headers.get('x-event-id') ?? '').slice(0, 200)
  if (!eventId) return NextResponse.json({ error: 'eventId ausente' }, { status: 400 })

  const providerId = provider.toUpperCase()
  const inserted = await prisma.webhookInbox.createMany({ data: [{ provider: providerId, eventId, payloadHash: createHash('sha256').update(raw).digest('hex') }], skipDuplicates: true })
  if (!inserted.count) {
    // Repetido: só reprocessa se a tentativa anterior falhou (e só um reenvio ganha a vez).
    const retry = await prisma.webhookInbox.updateMany({ where: { provider: providerId, eventId, status: 'FAILED' }, data: { status: 'RECEIVED', error: null } })
    if (!retry.count) return NextResponse.json({ ok: true, duplicate: true })
  }

  const finish = (status: string, error?: string) => prisma.webhookInbox.update({ where: { provider_eventId: { provider: providerId, eventId } }, data: { status, error: error ?? null, processedAt: new Date() } })
  try {
    const externalId = String(body.externalId ?? '')
    const state = String(body.state ?? '').toUpperCase()
    const ext = externalId ? await prisma.externalOperation.findFirst({ where: { providerId, externalId }, orderBy: { createdAt: 'desc' } }) : null
    if (!ext || !STATES.has(state)) { await finish('IGNORED'); return NextResponse.json({ ok: true, ignored: true }) }
    await prisma.webhookInbox.update({ where: { provider_eventId: { provider: providerId, eventId } }, data: { tenantId: ext.tenantId } })
    // Estado final não volta atrás por evento atrasado.
    if (ext.state === 'CONFIRMED' || ext.state === 'CANCELLED') { await finish('IGNORED'); return NextResponse.json({ ok: true }) }
    const friendly = state === 'REJECTED' ? translateProviderError(ext.domain, String(body.code ?? '') || null, String(body.message ?? '')).message : null
    await prisma.externalOperation.update({
      where: { id: ext.id },
      data: { state, protocol: typeof body.protocol === 'string' ? body.protocol.slice(0, 80) : undefined, errorCode: body.code ? String(body.code).slice(0, 40) : null, errorDetail: body.message ? String(body.message).slice(0, 2000) : null, userMessage: friendly, lastCheckedAt: new Date(), nextCheckAt: state === 'PROCESSING' ? new Date(Date.now() + 5 * 60_000) : null, confirmedAt: state === 'CONFIRMED' ? new Date() : undefined },
    })
    if (ext.operationId && ext.domain === 'RENAVE' && state !== 'PROCESSING') {
      const op = await prisma.vehicleOperation.findUnique({ where: { id: ext.operationId }, select: { id: true, kind: true } })
      if (op) {
        const sale = op.kind === 'SALE'
        const renaveStatus = state === 'CONFIRMED' ? (sale ? 'EXIT_CONFIRMED' : 'ENTRY_CONFIRMED') : state === 'REJECTED' ? 'REJECTED' : 'CANCELLED'
        await applyToOperation(op.id, { renaveStatus }, { actor: SYSTEM_ACTOR, origin: 'WEBHOOK', providerId, externalOperationId: ext.id, title: state === 'REJECTED' ? `O RENAVE recusou: ${friendly}` : undefined })
      }
    }
    await finish('PROCESSED')
    return NextResponse.json({ ok: true })
  } catch (err) {
    await finish('FAILED', err instanceof Error ? err.message.slice(0, 500) : 'erro').catch(() => {})
    // 500 → o provedor reenvia; a inbox FAILED deixa o reenvio processar.
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
