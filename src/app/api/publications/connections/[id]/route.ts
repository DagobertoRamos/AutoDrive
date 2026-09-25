// =============================================================================
// /api/publications/connections/[id]
//   PATCH  opções não secretas (nome, ambiente, modalidade, tipo de anúncio, cidade…)
//   POST   { action: 'testar' } → testa a conta e lê limites/cota do portal
//   DELETE desconecta: apaga a autorização, cancela envios pendentes e informa
//          quantos anúncios CONTINUAM no portal (não são retirados sozinhos).
// Gate: .connections
// =============================================================================

import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'
import { channelSpec } from '@/lib/publications/channels'
import { isConnectorError } from '@/lib/publications/errors'
import { getConnector } from '@/lib/publications/connectors'
import { disconnectConnection, logEvent, releaseBlockedJobs } from '@/lib/publications/service'
import { connectorContext } from '@/lib/publications/worker'
import { audit, bad, kickWorker, pubAuth } from '@/lib/publications/api'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }

const CONFIG_KEYS = ['modalidade', 'motivoVendido', 'motivoRetirado', 'flags', 'listingTypeId', 'cityId', 'addressLine', 'baseUrl']

export async function PATCH(req: Request, ctx: Ctx) {
  const a = await pubAuth(req, 'marketing.publications.connections')
  if (a instanceof NextResponse) return a
  const { id } = await ctx.params
  const conn = await prisma.publicationConnection.findFirst({ where: { id, tenantId: a.tenantId } })
  if (!conn) return bad('Conta não encontrada.', 404)
  const b = (await req.json().catch(() => ({}))) as { label?: string; environment?: string; config?: Record<string, unknown> }
  const current = (conn.config && typeof conn.config === 'object' && !Array.isArray(conn.config) ? conn.config : {}) as Record<string, unknown>
  const next = { ...current }
  for (const k of CONFIG_KEYS) if (b.config && k in b.config) next[k] = b.config[k]
  try {
    await prisma.publicationConnection.update({ where: { id }, data: { label: typeof b.label === 'string' && b.label.trim() ? b.label.trim().slice(0, 80) : undefined, environment: b.environment === 'HOMOLOGACAO' || b.environment === 'PRODUCAO' ? b.environment : undefined, config: next as Prisma.InputJsonValue } })
    await audit(a, 'UPDATE', 'PublicationConnection', id, next, current)
    return NextResponse.json({ success: true })
  } catch (e) {
    return handlePrismaError(e)
  }
}

export async function POST(req: Request, ctx: Ctx) {
  const a = await pubAuth(req, 'marketing.publications.connections')
  if (a instanceof NextResponse) return a
  const { id } = await ctx.params
  const conn = await prisma.publicationConnection.findFirst({ where: { id, tenantId: a.tenantId } })
  if (!conn) return bad('Conta não encontrada.', 404)
  const spec = channelSpec(conn.channel)
  const connector = getConnector(conn.channel)
  if (!connector?.testConnection) return bad('Este canal não tem teste de conexão.')
  let result: { ok: boolean; message: string; account?: string; quota?: Record<string, unknown> }
  try { result = await connector.testConnection(await connectorContext(conn, {})) } catch (e) {
    result = { ok: false, message: isConnectorError(e) ? `${e.message}${e.hint ? ` ${e.hint}` : ''}` : (e as Error).message }
    if (isConnectorError(e) && e.kind === 'AUTH') await prisma.publicationConnection.update({ where: { id }, data: { status: 'RECONECTAR' } })
  }
  const wasBlocked = conn.status !== 'CONECTADO'
  await prisma.publicationConnection.update({ where: { id }, data: { lastCheckedAt: new Date(), lastError: result.ok ? null : result.message.slice(0, 500), ...(result.ok ? { status: 'CONECTADO' } : conn.status === 'CONECTADO' ? { status: 'PENDENCIA' } : {}), quota: (result.quota ?? undefined) as Prisma.InputJsonValue | undefined } })
  if (result.ok && wasBlocked) { await releaseBlockedJobs(a.tenantId, id); kickWorker() }
  await logEvent(prisma, { tenantId: a.tenantId, channel: conn.channel, type: 'TESTE_CONEXAO', message: `${spec?.name ?? conn.channel} (${conn.label}): ${result.message}`, actor: a.actor })
  return NextResponse.json({ success: true, ...result })
}

export async function DELETE(req: Request, ctx: Ctx) {
  const a = await pubAuth(req, 'marketing.publications.connections')
  if (a instanceof NextResponse) return a
  const { id } = await ctx.params
  try {
    const r = await disconnectConnection(a.tenantId, id, a.actor)
    if (!r.ok) return bad(r.message)
    await audit(a, 'DISCONNECT', 'PublicationConnection', id, r)
    return NextResponse.json({ success: true, ...r })
  } catch (e) {
    return handlePrismaError(e)
  }
}
