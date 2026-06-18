// =============================================================================
// telephony/webhook-handler.ts — handler único dos webhooks de telefonia.
// Público (sem sessão), mas autenticado pela ASSINATURA do provedor usando o
// segredo da conexão (decifrado). Resolve o tenant pela conexão (?cid=). Sempre
// registra o evento bruto (auditoria); só PROCESSA se a assinatura for válida.
// NÃO faz chamada de saída a provedor externo.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { Prisma, TelephonyProviderKind } from '@prisma/client'
import { getTelephonyAdapter } from './adapters/registry'
import { decryptSecrets } from './crypto'
import { ingestTelephonyEvent } from './ingest'

export async function handleTelephonyWebhook(req: Request, pathKind: TelephonyProviderKind) {
  const url = new URL(req.url)
  const cid = url.searchParams.get('cid') || url.searchParams.get('connectionId')
  if (!cid) return NextResponse.json({ ok: false, error: 'Conexão não informada (?cid=).' }, { status: 400 })

  const rawBody = await req.text()

  const conn = await prisma.telephonyTenantConnection.findUnique({
    where: { id: cid },
    include: {
      provider: { select: { kind: true } },
      credentials: { select: { secretsEncrypted: true }, orderBy: { updatedAt: 'desc' }, take: 1 },
    },
  })
  if (!conn || !conn.active) return NextResponse.json({ ok: false, error: 'Conexão inválida ou inativa.' }, { status: 404 })

  // O kind da conexão é a fonte da verdade; o path serve de fallback/rota.
  const kind = conn.provider.kind ?? pathKind
  const adapter = getTelephonyAdapter(kind)
  const secrets = decryptSecrets(conn.credentials[0]?.secretsEncrypted ?? null)
  const secret = secrets.webhookSecret || secrets.authToken || secrets.token

  const ctx = { headers: req.headers, rawBody, url: url.toString(), secret }

  // Parse do corpo conforme content-type.
  const ct = (req.headers.get('content-type') || '').toLowerCase()
  let payload: unknown
  try {
    if (ct.includes('application/x-www-form-urlencoded')) payload = Object.fromEntries(new URLSearchParams(rawBody))
    else payload = JSON.parse(rawBody || '{}')
  } catch {
    try { payload = Object.fromEntries(new URLSearchParams(rawBody)) } catch { payload = {} }
  }

  const signatureValid = adapter.verifySignature(ctx)
  const ev = adapter.normalize(payload, ctx)

  // Evento não reconhecido: registra para inspeção e responde 202 (ack, sem reprocesso).
  if (!ev) {
    await prisma.telephonyWebhookEvent.create({
      data: { tenantId: conn.tenantId, connectionId: conn.id, providerKind: kind, payload: (payload ?? {}) as Prisma.InputJsonValue, signatureValid, processed: false, errorMessage: 'evento não reconhecido' },
    }).catch(() => {})
    return NextResponse.json({ ok: true, ignored: true }, { status: 202 })
  }

  const result = await ingestTelephonyEvent({ tenantId: conn.tenantId, connectionId: conn.id, kind, ev, rawPayload: payload, signatureValid })

  // Assinatura inválida: já gravamos o bruto (auditoria); avisamos o provedor.
  if (!signatureValid) return NextResponse.json({ ok: false, error: 'Assinatura inválida.' }, { status: 401 })

  return NextResponse.json({ ok: true, processed: result.processed, callId: result.callId })
}
