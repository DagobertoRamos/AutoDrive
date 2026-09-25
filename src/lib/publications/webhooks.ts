// =============================================================================
// Webhooks dos canais. Regras:
//   • autenticidade: Mercado Livre não assina — validamos application_id e
//     NUNCA confiamos no corpo: só disparamos uma consulta com o token da loja;
//   • repetição: dedupKey único por canal (evento repetido é ignorado);
//   • fora de ordem: evento mais antigo que o último aplicado é ignorado;
//     como sempre reconsultamos o estado atual, a ordem não altera o resultado.
// =============================================================================

import { createHash } from 'crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { enqueue, logEvent, SYSTEM_ACTOR } from './service'

export interface MlNotification { resource?: string; user_id?: number | string; topic?: string; application_id?: number | string; attempts?: number; sent?: string; received?: string }

export function mlDedupKey(n: MlNotification): string {
  return createHash('sha256').update(`${n.topic}|${n.resource}|${n.sent ?? ''}`).digest('hex').slice(0, 40)
}

export type WebhookResult = { status: 'PROCESSADO' | 'IGNORADO' | 'ERRO'; reason: string }

export async function handleMercadoLivre(n: MlNotification): Promise<WebhookResult> {
  const appId = process.env.ML_CLIENT_ID
  if (appId && String(n.application_id ?? '') !== appId) return { status: 'IGNORADO', reason: 'application_id de outro app.' }
  if (n.topic !== 'items' || !n.resource) return { status: 'IGNORADO', reason: 'Tópico não usado.' }
  const itemId = /\/items\/(MLB\d+)/.exec(n.resource)?.[1]
  if (!itemId) return { status: 'IGNORADO', reason: 'Recurso inválido.' }
  const dedupKey = mlDedupKey(n)
  const occurredAt = n.sent ? new Date(n.sent) : null

  // Conta da loja pelo usuário do ML (isolamento: evento só afeta a loja dona da conta).
  const conn = await prisma.publicationConnection.findFirst({ where: { channel: 'MERCADO_LIVRE', externalAccountId: String(n.user_id ?? ''), status: { not: 'NAO_CONECTADO' } }, select: { id: true, tenantId: true } })
  try {
    await prisma.publicationWebhookEvent.create({ data: { channel: 'MERCADO_LIVRE', tenantId: conn?.tenantId ?? null, dedupKey, occurredAt, payload: { resource: n.resource, topic: n.topic, user_id: String(n.user_id ?? ''), sent: n.sent ?? null } as Prisma.InputJsonValue } })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { status: 'IGNORADO', reason: 'Evento repetido.' }
    throw e
  }
  const done = (status: WebhookResult['status'], reason: string) => prisma.publicationWebhookEvent.update({ where: { channel_dedupKey: { channel: 'MERCADO_LIVRE', dedupKey } }, data: { status, processedAt: new Date(), error: status === 'ERRO' ? reason : null } }).then(() => ({ status, reason }))
  if (!conn) return done('IGNORADO', 'Conta não conectada no AutoDrive.')

  const pub = await prisma.publication.findFirst({ where: { tenantId: conn.tenantId, channel: 'MERCADO_LIVRE', connectionId: conn.id, remoteId: itemId } })
  if (!pub) return done('IGNORADO', 'Anúncio não criado pelo AutoDrive.')
  if (occurredAt && pub.lastRemoteEventAt && occurredAt <= pub.lastRemoteEventAt) return done('IGNORADO', 'Evento antigo (fora de ordem).')

  await prisma.$transaction(async (tx) => {
    await tx.publication.update({ where: { id: pub.id }, data: { lastRemoteEventAt: occurredAt ?? new Date() } })
    await enqueue(tx, pub, 'VERIFICAR')
    await logEvent(tx, { tenantId: pub.tenantId, publicationId: pub.id, vehicleId: pub.vehicleId, channel: pub.channel, type: 'WEBHOOK', message: 'Mercado Livre avisou mudança no anúncio; conferindo.', actor: SYSTEM_ACTOR })
  })
  return done('PROCESSADO', 'Conferência agendada.')
}
