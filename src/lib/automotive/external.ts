// =============================================================================
// Executor de chamadas externas (Saga step). Regras:
//   • cada chamada tem chave de idempotência — clique duplo devolve a mesma;
//   • timeout/erro de rede = UNKNOWN (pode ter sido processado): o job
//     CONSULTA o provedor antes de qualquer nova tentativa;
//   • recusa explícita = REJECTED: nova tentativa só com nova chave;
//   • request/response guardados sem segredos; erro traduzido para a tela.
// Nada de transação SQL abraçando API externa: grava o "enviado", chama,
// grava o resultado.
// =============================================================================

import type { ExternalOperation, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { attemptKey, nextCheckDelayMs, OPEN_STATES, planExternalCall, redact, stateFromError, ProviderError, type CallPlan } from './external-core'
import { translateProviderError } from './errors-core'
import type { ProviderResult } from './gateways/types'
import type { Actor } from './operations'

export interface ExternalCallSpec {
  tenantId: string
  operationId?: string | null
  vehicleId?: string | null
  domain: 'RENAVE' | 'FISCAL' | 'TRANSFER' | 'FINANCING' | 'PAYMENT'
  action: string
  providerId: string
  providerMode: 'MANUAL' | 'API'
  /** Chave base (ex.: RENAVE:EXIT:<opId>). */
  baseKey: string
  actor: Actor
  request?: unknown
}

export interface ExternalCallOutcome {
  ext: ExternalOperation
  plan: CallPlan
  /** Resultado novo do provedor (null quando só devolvemos o existente). */
  result: ProviderResult | null
}

async function latestFor(baseKey: string) {
  return prisma.externalOperation.findFirst({
    where: { OR: [{ idempotencyKey: baseKey }, { idempotencyKey: { startsWith: `${baseKey}#` } }] },
    orderBy: { createdAt: 'desc' },
  })
}

function persistable(r: ProviderResult): Prisma.ExternalOperationUpdateInput {
  const final = r.state === 'CONFIRMED' || r.state === 'CANCELLED'
  return {
    state: r.state,
    externalId: r.externalId ?? undefined,
    protocol: r.protocol ?? undefined,
    responseSummary: redact(r.data ?? null) as Prisma.InputJsonValue,
    errorCode: r.errorCode ?? null,
    errorDetail: r.errorMessage ?? null,
    lastCheckedAt: new Date(),
    nextCheckAt: final || r.state === 'REJECTED' ? null : new Date(Date.now() + nextCheckDelayMs(0)),
    confirmedAt: r.state === 'CONFIRMED' ? new Date() : undefined,
  }
}

export async function runExternal(
  spec: ExternalCallSpec,
  call: () => Promise<ProviderResult>,
  check?: (ext: ExternalOperation) => Promise<ProviderResult | null>,
): Promise<ExternalCallOutcome> {
  const latest = await latestFor(spec.baseKey)
  let plan = planExternalCall(latest)
  // Manual não tem o que consultar: registrar de novo é seguro (é local).
  if (plan === 'CHECK_STATUS' && spec.providerMode === 'MANUAL') plan = 'RESUBMIT'

  if (plan === 'RETURN_EXISTING') return { ext: latest!, plan, result: null }

  if (plan === 'CHECK_STATUS') {
    const r = latest && check ? await check(latest).catch(() => null) : null
    if (!r) return { ext: latest!, plan, result: null }
    const ext = await prisma.externalOperation.update({ where: { id: latest!.id }, data: { ...persistable(r), attempts: { increment: 1 }, userMessage: r.state === 'REJECTED' ? translateProviderError(spec.domain, r.errorCode, r.errorMessage).message : null } })
    return { ext, plan, result: r }
  }

  // SUBMIT / RESUBMIT
  let ext: ExternalOperation
  const reuse = plan === 'RESUBMIT' && latest && spec.providerMode === 'MANUAL' && (OPEN_STATES as string[]).includes(latest.state)
  if (reuse) {
    ext = await prisma.externalOperation.update({ where: { id: latest!.id }, data: { state: 'SUBMITTED', attempts: { increment: 1 }, requestSummary: redact(spec.request ?? null) as Prisma.InputJsonValue } })
  } else {
    const attempt = latest ? (await prisma.externalOperation.count({ where: { OR: [{ idempotencyKey: spec.baseKey }, { idempotencyKey: { startsWith: `${spec.baseKey}#` } }] } })) + 1 : 1
    try {
      ext = await prisma.externalOperation.create({
        data: {
          tenantId: spec.tenantId, operationId: spec.operationId ?? null, vehicleId: spec.vehicleId ?? null,
          domain: spec.domain, action: spec.action, providerId: spec.providerId,
          idempotencyKey: attemptKey(spec.baseKey, attempt), state: 'SUBMITTED', attempts: 1,
          requestSummary: redact(spec.request ?? null) as Prisma.InputJsonValue, createdById: spec.actor.id ?? null,
        },
      })
    } catch (err) {
      // Outro clique criou a mesma chave neste instante: devolve a dele.
      if ((err as { code?: string }).code === 'P2002') {
        const other = await latestFor(spec.baseKey)
        if (other) return { ext: other, plan: 'RETURN_EXISTING', result: null }
      }
      throw err
    }
  }

  try {
    const r = await call()
    const data = persistable(r)
    if (r.state === 'REJECTED') data.userMessage = translateProviderError(spec.domain, r.errorCode, r.errorMessage).message
    ext = await prisma.externalOperation.update({ where: { id: ext.id }, data })
    return { ext, plan, result: r }
  } catch (err) {
    const state = stateFromError(err)
    const code = err instanceof ProviderError ? err.code : null
    const message = err instanceof Error ? err.message : String(err)
    const friendly = err instanceof ProviderError && !err.retryable ? message : translateProviderError(spec.domain, code, message).message
    ext = await prisma.externalOperation.update({
      where: { id: ext.id },
      data: {
        state, errorCode: code, errorDetail: message.slice(0, 2000), userMessage: friendly,
        lastCheckedAt: new Date(), nextCheckAt: state === 'UNKNOWN' ? new Date(Date.now() + nextCheckDelayMs(ext.attempts)) : null,
      },
    })
    return { ext, plan, result: { state, errorCode: code, errorMessage: friendly } }
  }
}
