// =============================================================================
// POST /api/webhook/connections/[id]?t=<token> — avisos dos provedores da loja
// (emissor fiscal, integradora RENAVE, transferência, consulta veicular).
// Segurança: token derivado da conexão na URL (HMAC da plataforma) + header
// x-signature HMAC-SHA256 quando a conexão tem "segredo do webhook"; evento
// duplicado não é processado de novo (webhook_inbox). Nunca confia no estado
// recebido: para fiscal/RENAVE/transferência, CONSULTA o provedor.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createHash, createHmac, timingSafeEqual } from 'crypto'
import { prisma } from '@/lib/prisma'
import { connectionById, connectionWebhookToken } from '@/lib/automotive/connections'
import { refreshPendingFiscal } from '@/lib/automotive/fiscal-emission'
import { vehicleDataProvider } from '@/lib/automotive/gateways/vehicle-data'
import { pollExternalOperations } from '@/lib/automotive/jobs'
import { completeVehicleQuery } from '@/lib/automotive/vehicle-data'

export const dynamic = 'force-dynamic'

function same(a: string, b: string) {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const t = req.nextUrl.searchParams.get('t') ?? ''
  if (!t || !same(t, connectionWebhookToken(id))) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const conn = await connectionById(id)
  if (!conn) return NextResponse.json({ error: 'Conexão não encontrada' }, { status: 404 })
  const raw = await req.text()
  const secret = conn.credentials.webhookSecret
  if (secret) {
    const sig = (req.headers.get('x-signature') ?? req.headers.get('x-hub-signature-256') ?? '').replace(/^sha256=/i, '')
    const expected = createHmac('sha256', secret).update(raw).digest('hex')
    // Provedores que não assinam (ex.: emissores com header fixo) mandam o segredo no Authorization.
    const authOk = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '') === secret
    if (!(sig && same(sig, expected)) && !authOk) return NextResponse.json({ error: 'Assinatura inválida' }, { status: 401 })
  }
  let body: any = null
  try { body = raw ? JSON.parse(raw) : {} } catch { body = {} }
  const eventId = String(body?.id ?? body?.event_id ?? req.headers.get('x-event-id') ?? createHash('sha256').update(raw).digest('hex')).slice(0, 200)
  const provider = `CONN:${id}`
  const ins = await prisma.webhookInbox.createMany({ data: [{ provider, eventId, tenantId: conn.tenantId, payloadHash: createHash('sha256').update(raw).digest('hex') }], skipDuplicates: true })
  if (!ins.count) {
    const retry = await prisma.webhookInbox.updateMany({ where: { provider, eventId, status: 'FAILED' }, data: { status: 'RECEIVED', error: null } })
    if (!retry.count) return NextResponse.json({ ok: true, duplicate: true })
  }
  const finish = (status: string, error?: string) => prisma.webhookInbox.update({ where: { provider_eventId: { provider, eventId } }, data: { status, error: error ?? null, processedAt: new Date() } }).catch(() => null)
  try {
    if (conn.domain === 'VEHICLE_DATA') {
      const p = vehicleDataProvider(conn.providerId)
      const parsed = p?.parseWebhook?.(body) ?? null
      if (!parsed) { await finish('IGNORED'); return NextResponse.json({ ok: true }) }
      const q = await prisma.vehicleDataQuery.findFirst({ where: { tenantId: conn.tenantId, providerId: conn.providerId, OR: [{ externalId: parsed.externalId }, { id: parsed.externalId }] } })
      if (q) await completeVehicleQuery(q.id, parsed.result)
    } else if (conn.domain === 'FISCAL') {
      await refreshPendingFiscal(conn.tenantId, 20)
    } else {
      await prisma.externalOperation.updateMany({ where: { tenantId: conn.tenantId, providerId: conn.providerId, state: { in: ['SUBMITTED', 'PROCESSING', 'UNKNOWN'] } }, data: { nextCheckAt: new Date() } })
      await pollExternalOperations(20)
    }
    await finish('PROCESSED')
    return NextResponse.json({ ok: true })
  } catch (err) {
    await finish('FAILED', err instanceof Error ? err.message.slice(0, 500) : 'erro')
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
