// =============================================================================
// CredereAdapter — PREPARADO, porém SEM integração real.
// A Credere é um integrador de crédito que expõe API oficial. Este adapter é só
// o esqueleto: enquanto não houver documentação + credenciais oficiais e o
// mapeamento homologado, TODAS as operações lançam AdapterNotConfiguredError.
// NÃO implementar via raspagem de tela/RPA — apenas API oficial homologada.
// =============================================================================

import { BaseAdapter } from './base'
import type {
  AdapterCapabilities, AdapterContext, SimulationInput, SimulationResult,
  SubmissionInput, SubmissionResult, StatusResult, WebhookParseResult,
} from './types'
import { AdapterNotConfiguredError } from './types'
import type { FinanceProviderKind } from '@prisma/client'

export class CredereAdapter extends BaseAdapter {
  readonly kind: FinanceProviderKind = 'CREDERE'
  // Capacidades-alvo da API oficial (declaradas, ainda não implementadas).
  readonly capabilities: AdapterCapabilities = { simulate: true, submit: true, status: true, webhook: true }

  // Só estaria pronto com baseUrl + credenciais oficiais E o mapeamento homologado.
  // O mapeamento oficial ainda não existe nesta fase, então nunca está pronto.
  isReady(_ctx: AdapterContext): boolean {
    return false
  }

  // TODO(F5+): implementar contra a API OFICIAL da Credere após doc/credenciais.
  async simulate(_input: SimulationInput, _ctx: AdapterContext): Promise<SimulationResult> {
    throw new AdapterNotConfiguredError('Credere: simulação requer integração oficial homologada (doc + credenciais).')
  }
  async submit(_input: SubmissionInput, _ctx: AdapterContext): Promise<SubmissionResult> {
    throw new AdapterNotConfiguredError('Credere: envio de ficha requer integração oficial homologada.')
  }
  async getStatus(_externalId: string, _ctx: AdapterContext): Promise<StatusResult> {
    throw new AdapterNotConfiguredError('Credere: consulta de status requer integração oficial homologada.')
  }
  async parseWebhook(_payload: unknown, _headers: Record<string, string>, _ctx: AdapterContext): Promise<WebhookParseResult> {
    throw new AdapterNotConfiguredError('Credere: webhook requer assinatura/segredo oficiais configurados.')
  }
}
