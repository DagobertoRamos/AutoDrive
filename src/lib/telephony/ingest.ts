// =============================================================================
// telephony/ingest.ts — pipeline de ingestão de evento de telefonia.
// A partir de um evento normalizado: registra o webhook bruto, faz upsert da
// chamada (por providerCallId), acrescenta o evento, registra/atualiza a
// gravação e — em chamadas recebidas — VINCULA a um lead existente (por
// telefone) ou CRIA um novo lead (status NEW). Tudo tenant-scoped e auditável.
// NÃO faz chamada externa. Idempotente o suficiente p/ eventos repetidos.
// =============================================================================

import { prisma } from '@/lib/prisma'
import type { NormalizedTelephonyEvent } from './adapters/types'
import type { LeadStatus, Prisma, TelephonyProviderKind } from '@prisma/client'

export interface IngestInput {
  tenantId: string
  connectionId?: string | null
  kind: TelephonyProviderKind
  ev: NormalizedTelephonyEvent
  rawPayload: unknown
  signatureValid: boolean
}

export interface IngestResult {
  webhookEventId: string
  processed: boolean
  callId?: string
  leadId?: string
  ignored?: boolean
}

const OPEN_LEAD_STATUSES: LeadStatus[] = ['NEW', 'ASSIGNED', 'WORKING', 'QUALIFIED', 'RECYCLED']

export async function ingestTelephonyEvent(input: IngestInput): Promise<IngestResult> {
  const { tenantId, connectionId, kind, ev, rawPayload, signatureValid } = input

  return prisma.$transaction(async (tx) => {
    // 1) Sempre registra o evento bruto (auditoria), mesmo se a assinatura falhar.
    const webhook = await tx.telephonyWebhookEvent.create({
      data: {
        tenantId, connectionId: connectionId ?? null, providerKind: kind,
        eventType: ev.eventType ?? null, externalId: ev.externalId ?? null,
        payload: (rawPayload ?? {}) as Prisma.InputJsonValue,
        signatureValid, processed: false,
      },
    })

    // 2) Sem assinatura válida: não processa (fica para inspeção).
    if (!signatureValid) {
      return { webhookEventId: webhook.id, processed: false }
    }

    // 3) Upsert da chamada por providerCallId (quando houver).
    let call = ev.providerCallId
      ? await tx.telephonyCall.findFirst({ where: { tenantId, providerCallId: ev.providerCallId } })
      : null

    // Número rastreável (inbound: o número discado; identifica origem/unidade).
    const matchNumber = ev.toNumber
      ? await tx.telephonyNumber.findFirst({ where: { tenantId, number: ev.toNumber }, select: { id: true, source: true, unitId: true } })
      : null

    const callData = {
      tenantId, connectionId: connectionId ?? null, providerCallId: ev.providerCallId ?? null,
      direction: ev.direction, status: ev.status,
      fromNumber: ev.fromNumber ?? null, toNumber: ev.toNumber ?? null,
      agentExtension: ev.agentExtension ?? null, numberId: matchNumber?.id ?? null,
      source: ev.source ?? matchNumber?.source ?? null,
      startedAt: ev.startedAt ?? null, answeredAt: ev.answeredAt ?? null,
      endedAt: ev.endedAt ?? null, durationSec: ev.durationSec ?? null,
    }

    if (call) {
      call = await tx.telephonyCall.update({
        where: { id: call.id },
        data: {
          status: ev.status,
          ...(ev.answeredAt ? { answeredAt: ev.answeredAt } : {}),
          ...(ev.endedAt ? { endedAt: ev.endedAt } : {}),
          ...(ev.durationSec != null ? { durationSec: ev.durationSec } : {}),
          ...(matchNumber?.id ? { numberId: matchNumber.id } : {}),
        },
      })
    } else {
      call = await tx.telephonyCall.create({ data: callData })
    }

    // 4) Evento da chamada (histórico/timeline).
    await tx.telephonyCallEvent.create({
      data: { tenantId, callId: call.id, type: ev.eventType ?? ev.status, payload: (rawPayload ?? {}) as Prisma.InputJsonValue, occurredAt: ev.endedAt ?? ev.answeredAt ?? ev.startedAt ?? new Date() },
    })

    // 5) Gravação (acesso controlado depois; aqui só registra metadados).
    if (ev.recording) {
      const status = ev.recording.url ? 'AVAILABLE' : 'PENDING'
      const existingRec = await tx.telephonyRecording.findUnique({ where: { callId: call.id } })
      const recData = {
        status: status as 'AVAILABLE' | 'PENDING',
        storageUrl: ev.recording.url ?? null, fileName: ev.recording.fileName ?? null,
        mimeType: ev.recording.mimeType ?? null, durationSec: ev.recording.durationSec ?? null,
        sizeBytes: ev.recording.sizeBytes ?? null,
      }
      if (existingRec) await tx.telephonyRecording.update({ where: { id: existingRec.id }, data: recData })
      else await tx.telephonyRecording.create({ data: { tenantId, callId: call.id, ...recData } })
    }

    // 6) Vínculo de lead (somente chamadas recebidas com telefone de origem).
    let leadId: string | undefined = call.leadId ?? undefined
    if (!leadId && ev.direction === 'INBOUND' && ev.fromNumber) {
      const existingLead = await tx.marketingLead.findFirst({
        where: { tenantId, phone: ev.fromNumber, status: { in: OPEN_LEAD_STATUSES } },
        orderBy: { createdAt: 'desc' },
      })
      if (existingLead) {
        leadId = existingLead.id
        await tx.marketingLead.update({ where: { id: existingLead.id }, data: { lastContactAt: new Date() } })
      } else {
        const newLead = await tx.marketingLead.create({
          data: {
            tenantId, status: 'NEW', phone: ev.fromNumber,
            source: ev.source ?? matchNumber?.source ?? 'telefonia',
            unitId: matchNumber?.unitId ?? null, lastContactAt: new Date(),
          },
        })
        leadId = newLead.id
      }
      await tx.telephonyCall.update({ where: { id: call.id }, data: { leadId } })
    }

    await tx.telephonyWebhookEvent.update({ where: { id: webhook.id }, data: { processed: true, processedAt: new Date(), callId: call.id } })

    return { webhookEventId: webhook.id, processed: true, callId: call.id, leadId }
  })
}
