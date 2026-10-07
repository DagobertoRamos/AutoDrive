// =============================================================================
// Conector AutoDrive (integradoras sob contrato). Contrato REST único — em
// docs/integracoes/conector-autodrive.md — que a integradora da loja expõe
// (ou já expõe com estes nomes) para o AutoDrive operar RENAVE e transferência
// com a conta DA LOJA:
//   Authorization: Bearer <chave>   ·   Idempotency-Key: <chave da operação>
//   resposta: { id, status: PROCESSING|CONFIRMED|REJECTED|CANCELLED, protocol?, code?, message?, data? }
// =============================================================================

import { ProviderError } from '../external-core'
import { http, requireCred } from './http'
import type { ProviderContext, ProviderResult, RenaveProvider, TestResult, TransferProvider } from './types'

interface PartnerResponse { id?: string; status?: string; protocol?: string; code?: string; message?: string; data?: Record<string, unknown> }

function base(ctx: ProviderContext): string {
  return requireCred(ctx.credentials, 'baseUrl', 'endereço da API').replace(/\/+$/, '')
}
function auth(ctx: ProviderContext, idem?: string): Record<string, string> {
  return { Authorization: `Bearer ${requireCred(ctx.credentials, 'apiKey', 'chave de acesso')}`, ...(idem ? { 'Idempotency-Key': idem } : {}), 'X-Environment': ctx.environment ?? 'PRODUCAO' }
}

function toResult(r: PartnerResponse | null): ProviderResult {
  const s = String(r?.status ?? '').toUpperCase()
  const state = s === 'CONFIRMED' ? 'CONFIRMED' : s === 'REJECTED' ? 'REJECTED' : s === 'CANCELLED' ? 'CANCELLED' : 'PROCESSING'
  return { state, externalId: r?.id ?? null, protocol: r?.protocol ?? null, errorCode: r?.code ?? null, errorMessage: r?.message ?? null, data: r?.data }
}

async function call(ctx: ProviderContext, method: string, path: string, body?: unknown, idem?: string): Promise<ProviderResult> {
  const r = await http<PartnerResponse>(`${base(ctx)}${path}`, { method, body, headers: auth(ctx, idem) })
  return toResult(r.json)
}

async function test(ctx: ProviderContext): Promise<TestResult> {
  try {
    await http(`${base(ctx)}/health`, { headers: auth(ctx), timeoutMs: 10_000 })
    return { ok: true, message: 'Conexão estabelecida.' }
  } catch (e) {
    return { ok: false, message: e instanceof ProviderError && e.rejected ? 'A integradora recusou a chave de acesso.' : 'Não foi possível alcançar a API da integradora.' }
  }
}

function idemOf(input: { reference?: string | null; vehicle?: { vehicleId: string } }, op: string) {
  return input.reference ?? `${op}:${input.vehicle?.vehicleId ?? ''}`
}

export function partnerRenave(id: string, label: string): RenaveProvider {
  return {
    info: { id, label, mode: 'API', webhooks: true },
    test,
    async checkEligibility(ctx, v) {
      const r = await http<{ eligible?: boolean; reasons?: string[] }>(`${base(ctx)}/renave/elegibilidade`, { method: 'POST', body: { plate: v.plate, chassi: v.chassi, renavam: v.renavam }, headers: auth(ctx) }).catch(() => null)
      return r?.json ? { state: 'CONFIRMED', data: { eligible: !!r.json.eligible, reasons: r.json.reasons ?? [] } } : null
    },
    enterStock: (ctx, input) => call(ctx, 'POST', '/renave/entradas', { vehicle: input.vehicle, seller: input.seller, amount: input.amount, nfeKey: input.fiscalKey }, idemOf(input, 'entrada')),
    confirmEntry: (ctx, externalId) => call(ctx, 'POST', `/renave/entradas/${encodeURIComponent(externalId)}/confirmacao`),
    exitStock: (ctx, input) => call(ctx, 'POST', '/renave/saidas', { vehicle: input.vehicle, buyer: input.buyer, amount: input.amount, nfeKey: input.fiscalKey }, idemOf(input, 'saida')),
    cancelEntry: (ctx, externalId, manual) => call(ctx, 'POST', `/renave/entradas/${encodeURIComponent(externalId ?? '')}/cancelamento`, { reason: manual?.notes ?? null }),
    cancelExit: (ctx, externalId, manual) => call(ctx, 'POST', `/renave/saidas/${encodeURIComponent(externalId ?? '')}/cancelamento`, { reason: manual?.notes ?? null }),
    async getStock(ctx) {
      const r = await http<{ items?: { chassi: string; plate?: string }[] }>(`${base(ctx)}/renave/estoque`, { headers: auth(ctx) }).catch(() => null)
      return r?.json?.items ?? null
    },
    async getStatus(ctx, externalId) {
      const r = await http<PartnerResponse>(`${base(ctx)}/renave/operacoes/${encodeURIComponent(externalId)}`, { headers: auth(ctx) })
      return toResult(r.json)
    },
    async getDocuments(ctx, externalId) {
      const r = await http<{ items?: { name: string; url: string }[] }>(`${base(ctx)}/renave/operacoes/${encodeURIComponent(externalId)}/documentos`, { headers: auth(ctx) }).catch(() => null)
      return r?.json?.items ?? null
    },
    async getATPV(ctx, externalId) {
      const r = await http<{ url?: string }>(`${base(ctx)}/renave/operacoes/${encodeURIComponent(externalId)}/atpv`, { headers: auth(ctx) }).catch(() => null)
      return r?.json?.url ? { url: r.json.url } : null
    },
    consign: (ctx, input) => call(ctx, 'POST', '/renave/consignacoes', { vehicle: input.vehicle, owner: input.seller, amount: input.amount, nfeKey: input.fiscalKey }, idemOf(input, 'consignacao')),
    transferBetweenStores: (ctx, input) => call(ctx, 'POST', '/renave/transferencias', { vehicle: input.vehicle, fromDoc: input.fromDoc, toDoc: input.toDoc }, idemOf(input, 'transferencia')),
  }
}

export function partnerTransfer(id: string, label: string): TransferProvider {
  return {
    info: { id, label, mode: 'API', webhooks: true },
    test,
    startTransfer: (ctx, input) => call(ctx, 'POST', '/transferencias', { vehicle: input.vehicle, buyer: input.buyer, amount: input.amount }, input.reference ?? `transferencia:${input.vehicle.vehicleId}`),
    recordStage: (ctx, externalId, stage) => call(ctx, 'POST', `/transferencias/${encodeURIComponent(externalId ?? '')}/etapas`, { stage }, `etapa:${externalId}:${stage}`),
    async getStatus(ctx, externalId) {
      const r = await http<PartnerResponse & { stage?: string }>(`${base(ctx)}/transferencias/${encodeURIComponent(externalId)}`, { headers: auth(ctx) })
      return { ...toResult(r.json), data: { stage: r.json?.stage ?? (r.json?.data as { stage?: string } | undefined)?.stage } }
    },
    async getATPV(ctx, externalId) { const r = await http<{ url?: string }>(`${base(ctx)}/transferencias/${encodeURIComponent(externalId)}/atpv`, { headers: auth(ctx) }).catch(() => null); return r?.json?.url ? { url: r.json.url } : null },
    async getSignatureStatus(ctx, externalId) { const r = await http<{ seller?: boolean; buyer?: boolean }>(`${base(ctx)}/transferencias/${encodeURIComponent(externalId)}/assinaturas`, { headers: auth(ctx) }).catch(() => null); return r?.json ? { seller: !!r.json.seller, buyer: !!r.json.buyer } : null },
    async getInspectionStatus(ctx, externalId) { const r = await http<{ status?: string }>(`${base(ctx)}/transferencias/${encodeURIComponent(externalId)}/vistoria`, { headers: auth(ctx) }).catch(() => null); return r?.json?.status ? { status: r.json.status } : null },
    async getDebts(ctx, v) { const r = await http<{ items?: { description: string; amount: number }[] }>(`${base(ctx)}/veiculos/debitos`, { method: 'POST', body: v, headers: auth(ctx) }).catch(() => null); return r?.json?.items ?? null },
    async getFees(ctx, v) { const r = await http<{ items?: { description: string; amount: number }[] }>(`${base(ctx)}/veiculos/taxas`, { method: 'POST', body: v, headers: auth(ctx) }).catch(() => null); return r?.json?.items ?? null },
    async getCRLV(ctx, externalId) { const r = await http<{ url?: string }>(`${base(ctx)}/transferencias/${encodeURIComponent(externalId)}/crlv`, { headers: auth(ctx) }).catch(() => null); return r?.json?.url ? { url: r.json.url } : null },
    cancel: (ctx, externalId, reason) => call(ctx, 'POST', `/transferencias/${encodeURIComponent(externalId ?? '')}/cancelamento`, { reason }),
  }
}
