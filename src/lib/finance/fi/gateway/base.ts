// =============================================================================
// Conector base: tudo recusado com "Banco ainda não integrado".
// Cada banco estende e implementa SÓ o que a API oficial contratada oferecer.
// =============================================================================

import { createHmac, timingSafeEqual } from 'node:crypto'
import {
  NO_CAPABILITIES, notIntegrated,
  type ApplicantPayload, type BankCapabilities, type BankChannel, type BankContext, type BankDecision, type BankProvider,
  type ContractInfo, type FundingInfo, type PendingItem, type ProposalTerms, type SimulationQuote, type WebhookEvent,
} from './types'

export abstract class NotIntegratedBank implements BankProvider {
  abstract readonly key: string
  abstract readonly name: string
  readonly channel: BankChannel = 'DIRETO'
  readonly capabilities: BankCapabilities = NO_CAPABILITIES
  /** Campos que a credencial da loja precisa ter quando a integração existir. */
  protected readonly credentialFields: string[] = []
  /** Existe implementação oficial (homologada)? Sem ela, nunca integrado. */
  readonly official: boolean = false

  isIntegrated(ctx: BankContext): boolean {
    if (!this.official) return false
    return this.credentialFields.every((f) => typeof ctx.credentials[f] === 'string' && ctx.credentials[f].length > 0)
  }
  getRequiredFields(): string[] | null { return null }

  async simulate(_t: ProposalTerms, _c: BankContext): Promise<SimulationQuote[]> { throw notIntegrated() }
  async preAnalyze(_a: ApplicantPayload, _t: ProposalTerms, _c: BankContext): Promise<BankDecision> { throw notIntegrated() }
  async submitProposal(_a: ApplicantPayload, _t: ProposalTerms, _c: BankContext): Promise<BankDecision> { throw notIntegrated() }
  async updateProposal(_e: string, _t: ProposalTerms, _c: BankContext): Promise<BankDecision> { throw notIntegrated() }
  async getStatus(_e: string, _c: BankContext): Promise<BankDecision> { throw notIntegrated() }
  async findByIdempotencyKey(_k: string, _c: BankContext): Promise<BankDecision | null> { throw notIntegrated() }
  async getPendingDocuments(_e: string, _c: BankContext): Promise<PendingItem[]> { throw notIntegrated() }
  async sendDocument(_e: string, _d: { type: string; fileName: string; mimeType: string; content: Uint8Array }, _c: BankContext): Promise<void> { throw notIntegrated() }
  async formalize(_e: string, _c: BankContext): Promise<ContractInfo> { throw notIntegrated() }
  async getContract(_e: string, _c: BankContext): Promise<ContractInfo> { throw notIntegrated() }
  async getFundingStatus(_e: string, _c: BankContext): Promise<FundingInfo> { throw notIntegrated() }
  async cancel(_e: string, _r: string, _c: BankContext): Promise<void> { throw notIntegrated() }
  async testConnection(_c: BankContext): Promise<void> { throw notIntegrated() }

  /** Padrão: HMAC-SHA256 do corpo bruto em `x-signature` (hex). Conectores reais sobrescrevem conforme o banco. */
  verifyWebhook(rawBody: string, headers: Record<string, string>, secret: string): boolean {
    const sig = headers['x-signature'] ?? headers['x-hub-signature-256']?.replace(/^sha256=/, '')
    if (!sig || !secret) return false
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
    const a = Buffer.from(sig, 'utf8'); const b = Buffer.from(expected, 'utf8')
    return a.length === b.length && timingSafeEqual(a, b)
  }
  parseWebhook(_payload: unknown): WebhookEvent[] { return [] }
}
