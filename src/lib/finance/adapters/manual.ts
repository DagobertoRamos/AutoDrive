// =============================================================================
// ManualAdapter — registro MANUAL supervisionado (sem nenhuma chamada externa).
// É o adapter 100% funcional e seguro: a loja envia a ficha pelo canal do banco
// por conta própria e registra aqui o protocolo/status. Nada de automação.
// =============================================================================

import { BaseAdapter } from './base'
import type {
  AdapterCapabilities, AdapterContext, SimulationInput, SimulationResult,
  SubmissionInput, SubmissionResult, StatusResult,
} from './types'
import type { FinanceProviderKind } from '@prisma/client'

export class ManualAdapter extends BaseAdapter {
  readonly kind: FinanceProviderKind = 'MANUAL'
  // Simulação/submissão/status são "manuais": registrados pelo operador.
  readonly capabilities: AdapterCapabilities = { simulate: true, submit: true, status: true, webhook: false }

  // Manual está sempre pronto: não depende de credencial/endpoint.
  isReady(_ctx: AdapterContext): boolean { return true }

  // Não calcula nada automaticamente — as opções são preenchidas pelo operador.
  async simulate(_input: SimulationInput, _ctx: AdapterContext): Promise<SimulationResult> {
    return { options: [], manual: true }
  }

  // Não envia a lugar nenhum: apenas materializa o registro manual da ficha.
  async submit(input: SubmissionInput, _ctx: AdapterContext): Promise<SubmissionResult> {
    return {
      externalId: null,
      status: 'ENVIADA',
      source: 'MANUAL',
      requestPayload: { proposalId: input.proposalId, bankId: input.bankId ?? null, manual: true },
      message: 'Registro manual: envie a ficha pelo canal oficial do banco e atualize o status aqui.',
    }
  }

  // O status manual é o último informado pelo operador (a orquestração resolve).
  async getStatus(externalId: string, _ctx: AdapterContext): Promise<StatusResult> {
    return { externalId: externalId || null, status: 'MANUAL', source: 'MANUAL', message: 'Status mantido manualmente.' }
  }
}
