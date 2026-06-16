// =============================================================================
// BaseAdapter — implementação padrão que NEGA operações por segurança.
// Cada adapter concreto sobrescreve apenas o que de fato suporta. O default
// de qualquer operação não declarada é lançar AdapterNotSupportedError; quando
// declarada mas sem credencial/doc oficial, lançar AdapterNotConfiguredError.
// =============================================================================

import type {
  AdapterCapabilities, AdapterContext, FinancingProviderAdapter,
  SimulationInput, SimulationResult, SubmissionInput, SubmissionResult,
  StatusResult, WebhookParseResult,
} from './types'
import { AdapterNotSupportedError } from './types'
import type { FinanceProviderKind } from '@prisma/client'

export abstract class BaseAdapter implements FinancingProviderAdapter {
  abstract readonly kind: FinanceProviderKind
  abstract readonly capabilities: AdapterCapabilities

  // Por padrão um adapter não está pronto; concretos decidem.
  isReady(_ctx: AdapterContext): boolean { return false }

  async simulate(_input: SimulationInput, _ctx: AdapterContext): Promise<SimulationResult> {
    throw new AdapterNotSupportedError('simulate')
  }
  async submit(_input: SubmissionInput, _ctx: AdapterContext): Promise<SubmissionResult> {
    throw new AdapterNotSupportedError('submit')
  }
  async getStatus(_externalId: string, _ctx: AdapterContext): Promise<StatusResult> {
    throw new AdapterNotSupportedError('status')
  }
  async parseWebhook(_payload: unknown, _headers: Record<string, string>, _ctx: AdapterContext): Promise<WebhookParseResult> {
    throw new AdapterNotSupportedError('webhook')
  }
}
