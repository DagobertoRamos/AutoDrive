// =============================================================================
// GenericBankAdapter — molde para banco direto / integrador via API OFICIAL.
// Usado por kinds BANCO_DIRETO / INTEGRADOR / OUTRO quando houver endpoint
// oficial + credenciais + mapeamento. Enquanto isso, recusa operar.
// REGRA: jamais simular humano em tela de banco / RPA oculto. Só API oficial
// (REST/SOAP homologado) ou webhook assinado. Sem config → erro claro.
// =============================================================================

import { BaseAdapter } from './base'
import type {
  AdapterCapabilities, AdapterContext, SimulationInput, SimulationResult,
  SubmissionInput, SubmissionResult, StatusResult, WebhookParseResult,
} from './types'
import { AdapterNotConfiguredError } from './types'
import type { FinanceProviderKind } from '@prisma/client'

export class GenericBankAdapter extends BaseAdapter {
  readonly kind: FinanceProviderKind
  readonly capabilities: AdapterCapabilities = { simulate: true, submit: true, status: true, webhook: true }

  constructor(kind: FinanceProviderKind = 'BANCO_DIRETO') {
    super()
    this.kind = kind
  }

  // Pronto exige endpoint oficial + credenciais. Mesmo assim, sem o mapeamento
  // de payload específico do banco não operamos — mantido false nesta fase.
  isReady(_ctx: AdapterContext): boolean {
    return false
  }

  /** Garante que jamais executamos sem configuração oficial explícita. */
  private requireConfig(ctx: AdapterContext, op: string): never {
    const faltando: string[] = []
    if (!ctx.baseUrl?.trim()) faltando.push('endpoint oficial (baseUrl)')
    if (!ctx.credentials || !Object.keys(ctx.credentials).length) faltando.push('credenciais')
    faltando.push('mapeamento de payload homologado')
    throw new AdapterNotConfiguredError(`Banco (${this.kind}) — ${op} indisponível: faltam ${faltando.join(', ')}.`)
  }

  async simulate(_input: SimulationInput, ctx: AdapterContext): Promise<SimulationResult> { this.requireConfig(ctx, 'simulação') }
  async submit(_input: SubmissionInput, ctx: AdapterContext): Promise<SubmissionResult> { this.requireConfig(ctx, 'envio de ficha') }
  async getStatus(_externalId: string, ctx: AdapterContext): Promise<StatusResult> { this.requireConfig(ctx, 'consulta de status') }
  async parseWebhook(_payload: unknown, _headers: Record<string, string>, ctx: AdapterContext): Promise<WebhookParseResult> { this.requireConfig(ctx, 'webhook') }
}
