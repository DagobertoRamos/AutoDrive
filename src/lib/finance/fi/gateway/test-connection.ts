// =============================================================================
// "Testar conexão" de verdade (usado em Bancos e em Credenciais). Sem
// integração oficial, devolve o motivo — nunca um "OK" simulado.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { resolveBank } from './resolve'
import { CONNECTION_META } from './registry'
import { BankGatewayError } from './types'

export interface TestResult { ok: boolean; state: string; message: string; testedAt: string | null }

export async function testBankConnection(tenantId: string, bank: { id: string; name: string; adapterKey: string | null }): Promise<TestResult> {
  const r = await resolveBank(tenantId, bank)
  if (!r.live || !r.provider) {
    return { ok: false, state: r.state, message: `${CONNECTION_META[r.state].label}. ${CONNECTION_META[r.state].hint}`, testedAt: null }
  }
  const t0 = Date.now()
  let ok = false
  let message = 'Conexão funcionando.'
  let code: string | null = null
  try {
    await r.provider.testConnection(r.ctx)
    ok = true
  } catch (e) {
    code = e instanceof BankGatewayError ? e.code : 'DESCONHECIDO'
    message = e instanceof BankGatewayError ? e.message : 'O banco não respondeu ao teste.'
  }
  const at = new Date()
  await prisma.financeIntegrationLog.create({
    data: { tenantId, adapterKey: bank.adapterKey, action: 'TESTAR_CONEXAO', status: ok ? 'OK' : 'ERRO', durationMs: Date.now() - t0, correlationId: r.ctx.correlationId, errorCode: code, message: ok ? null : message.slice(0, 300) },
  })
  if (r.credentialId) {
    const cred = await prisma.financeCredential.findUnique({ where: { id: r.credentialId }, select: { integrationId: true } })
    if (cred?.integrationId) await prisma.financeTenantIntegration.update({ where: { id: cred.integrationId }, data: { lastTestAt: at, lastTestStatus: ok ? 'OK' : 'ERRO' } })
  }
  return { ok, state: r.state, message, testedAt: at.toISOString() }
}
