// =============================================================================
// Contratos dos gateways externos. Telas e serviços falam SÓ com estas
// interfaces; cada integradora/provedor é um adapter registrado em registry.ts.
// Nenhuma tela chama "empresaX.enterVehicle()".
// =============================================================================

import type { ExternalState } from '../external-core'

export interface ProviderContext {
  tenantId: string
  unitId?: string | null
  /** Credenciais DA LOJA, decifradas só no momento da chamada (BYOC). */
  credentials?: Record<string, string> | null
}

export interface ProviderResult<T = Record<string, unknown>> {
  state: ExternalState
  externalId?: string | null
  protocol?: string | null
  data?: T
  errorCode?: string | null
  errorMessage?: string | null
}

export interface ProviderInfo {
  id: string
  label: string
  /** MANUAL = a loja faz no portal oficial e registra aqui o protocolo. */
  mode: 'MANUAL' | 'API'
  /** Recebe webhooks (senão o job consulta o status). */
  webhooks: boolean
}

export interface VehicleRef { vehicleId: string; plate?: string | null; chassi?: string | null; renavam?: string | null }
export interface PartyRef { name?: string | null; doc?: string | null }

/** Registro manual: protocolo/data informados por quem fez no portal oficial. */
export interface ManualInput { protocol?: string | null; date?: string | null; notes?: string | null }

// ── RENAVE ───────────────────────────────────────────────────────────────────

export interface RenaveEntryInput { vehicle: VehicleRef; seller?: PartyRef; amount?: number | null; fiscalKey?: string | null; manual?: ManualInput }
export interface RenaveExitInput { vehicle: VehicleRef; buyer?: PartyRef; amount?: number | null; fiscalKey?: string | null; manual?: ManualInput }

export interface RenaveProvider {
  info: ProviderInfo
  checkEligibility(ctx: ProviderContext, v: VehicleRef): Promise<ProviderResult<{ eligible: boolean; reasons: string[] }> | null>
  enterStock(ctx: ProviderContext, input: RenaveEntryInput): Promise<ProviderResult>
  confirmEntry(ctx: ProviderContext, externalId: string, manual?: ManualInput): Promise<ProviderResult>
  exitStock(ctx: ProviderContext, input: RenaveExitInput): Promise<ProviderResult>
  cancelEntry(ctx: ProviderContext, externalId: string | null, manual?: ManualInput): Promise<ProviderResult>
  cancelExit(ctx: ProviderContext, externalId: string | null, manual?: ManualInput): Promise<ProviderResult>
  /** Estoque segundo o RENAVE (null = provedor não informa). */
  getStock(ctx: ProviderContext): Promise<{ chassi: string; plate?: string | null }[] | null>
  /** Consulta de uma solicitação (null = sem consulta; status vem só manualmente). */
  getStatus(ctx: ProviderContext, externalId: string): Promise<ProviderResult | null>
  getDocuments(ctx: ProviderContext, externalId: string): Promise<{ name: string; url: string }[] | null>
  getATPV(ctx: ProviderContext, externalId: string): Promise<{ url: string } | null>
  consign(ctx: ProviderContext, input: RenaveEntryInput): Promise<ProviderResult>
  transferBetweenStores(ctx: ProviderContext, input: { vehicle: VehicleRef; fromDoc: string; toDoc: string; manual?: ManualInput }): Promise<ProviderResult>
}

// ── Fiscal ───────────────────────────────────────────────────────────────────

export interface FiscalEmitInput {
  model: 'NFE' | 'NFCE' | 'NFSE'
  /** Referência única = chave de idempotência no provedor. */
  reference: string
  /** Manual: XML autorizado da nota emitida no emissor da loja. */
  xml?: string | null
  /** API: dados da nota já montados pelas regras fiscais da loja. */
  payload?: Record<string, unknown> | null
}

export interface FiscalProvider {
  info: ProviderInfo
  emit(ctx: ProviderContext, input: FiscalEmitInput): Promise<ProviderResult<{ xml?: string; accessKey?: string; number?: string; series?: string }>>
  status(ctx: ProviderContext, reference: string): Promise<ProviderResult | null>
  cancel(ctx: ProviderContext, reference: string, reason: string, manual?: { eventXml?: string | null; protocol?: string | null }): Promise<ProviderResult>
  correct(ctx: ProviderContext, reference: string, text: string): Promise<ProviderResult>
  downloadXml(ctx: ProviderContext, reference: string): Promise<string | null>
  downloadPdf(ctx: ProviderContext, reference: string): Promise<{ url: string } | null>
  events(ctx: ProviderContext, reference: string): Promise<{ type: string; at: string; protocol?: string | null }[] | null>
}

// ── Transferência de propriedade ─────────────────────────────────────────────

export interface TransferProvider {
  info: ProviderInfo
  startTransfer(ctx: ProviderContext, input: { vehicle: VehicleRef; buyer: PartyRef; amount?: number | null; manual?: ManualInput }): Promise<ProviderResult>
  /** Manual: a loja informa a etapa concluída. API: o provedor informa via status/webhook. */
  recordStage(ctx: ProviderContext, externalId: string | null, stage: string, manual?: ManualInput): Promise<ProviderResult>
  getStatus(ctx: ProviderContext, externalId: string): Promise<ProviderResult<{ stage?: string }> | null>
  getATPV(ctx: ProviderContext, externalId: string): Promise<{ url: string } | null>
  getSignatureStatus(ctx: ProviderContext, externalId: string): Promise<{ seller: boolean; buyer: boolean } | null>
  getInspectionStatus(ctx: ProviderContext, externalId: string): Promise<{ status: string } | null>
  getDebts(ctx: ProviderContext, v: VehicleRef): Promise<{ description: string; amount: number }[] | null>
  getFees(ctx: ProviderContext, v: VehicleRef): Promise<{ description: string; amount: number }[] | null>
  getCRLV(ctx: ProviderContext, externalId: string): Promise<{ url: string } | null>
  cancel(ctx: ProviderContext, externalId: string | null, reason: string): Promise<ProviderResult>
}
