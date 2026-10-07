// =============================================================================
// Consulta veicular: débitos (IPVA, licenciamento, multas, DPVAT/SPVAT) e
// restrições (judicial, RENAJUD, roubo/furto, gravame, leilão). Conta DA LOJA.
//   Zapay   https://docs-b2b.usezapay.com.br        — assíncrono por webhook (Basic)
//   Celcoin https://developers.celcoin.com.br       — assíncrono, consultável (OAuth2)
//   Parceiro (Conector AutoDrive)                   — Infosimples, Consulta de Placa, Checktudo…
// Tudo volta normalizado; o serviço grava, deduplica e transforma restrição
// em VehicleRestriction (source PROVIDER).
// =============================================================================

import { ProviderError } from '../external-core'
import { basic, cachedToken, http, requireCred } from './http'
import type { ProviderContext, ProviderInfo, TestResult } from './types'

export type DebtType = 'IPVA' | 'LICENCIAMENTO' | 'MULTA' | 'DPVAT' | 'TAXA' | 'OUTRO'
export interface NormalizedDebt { id?: string | null; type: DebtType; description: string; year?: number | null; amount: number; dueDate?: string | null; expired?: boolean; required?: boolean; dependsOn?: string[] }
export interface NormalizedRestriction { kind: string; blocking: boolean; description: string; institution?: string | null; reference?: string | null }
export interface VehicleDataResult {
  state: 'DONE' | 'PROCESSING' | 'NOT_FOUND' | 'UNAVAILABLE' | 'ERROR'
  externalId?: string | null
  debts: NormalizedDebt[]
  restrictions: NormalizedRestriction[]
  message?: string | null
}
export interface VehicleQueryInput { plate: string; renavam?: string | null; chassi?: string | null; uf?: string | null; ownerDoc?: string | null; reference: string }

export interface VehicleDataProvider {
  info: ProviderInfo
  test(ctx: ProviderContext): Promise<TestResult>
  consult(ctx: ProviderContext, input: VehicleQueryInput): Promise<VehicleDataResult>
  /** Consulta o andamento (null = provedor só responde por webhook). */
  status(ctx: ProviderContext, externalId: string): Promise<VehicleDataResult | null>
  /** Interpreta o aviso recebido do provedor. */
  parseWebhook?(body: any): { externalId: string; result: VehicleDataResult } | null
  /** Cadastra o webhook da loja no provedor (quando a API permite). */
  registerWebhook?(ctx: ProviderContext, url: string): Promise<boolean>
}

const EMPTY = { debts: [] as NormalizedDebt[], restrictions: [] as NormalizedRestriction[] }
const money = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100

function debtType(raw: string): DebtType {
  const t = raw.toLowerCase()
  if (t.includes('ipva')) return 'IPVA'
  if (t.includes('licens') || t.includes('licenc')) return 'LICENCIAMENTO'
  if (t.includes('ticket') || t.includes('fine') || t.includes('multa') || t.includes('infra')) return 'MULTA'
  if (t.includes('dpvat') || t.includes('spvat') || t.includes('seguro')) return 'DPVAT'
  if (t.includes('taxa') || t.includes('fee')) return 'TAXA'
  return 'OUTRO'
}

// ── Zapay B2B ───────────────────────────────────────────────────────────────

function zapayBase(ctx: ProviderContext) { return ctx.environment === 'HOMOLOGACAO' ? 'https://api.b2b.sandbox.usezapay.com.br/v2' : 'https://api.b2b.usezapay.com.br/v2' }
function zapayAuth(ctx: ProviderContext) { return { Authorization: basic(requireCred(ctx.credentials, 'username', 'usuário'), requireCred(ctx.credentials, 'password', 'senha')) } }

function zapayDebts(list: any[]): NormalizedDebt[] {
  return (Array.isArray(list) ? list : []).map((d) => ({
    id: d?.id != null ? String(d.id) : null, type: debtType(String(d?.type ?? d?.title ?? '')),
    description: String(d?.title ?? d?.description ?? d?.type ?? 'Débito').slice(0, 200), year: d?.year ? Number(d.year) : null,
    amount: money(d?.amount), dueDate: d?.due_date ?? d?.expiration_date ?? null, expired: !!d?.is_expired, required: !!d?.required,
    dependsOn: Array.isArray(d?.depends_on) ? d.depends_on.map(String) : [],
  }))
}

export const zapay: VehicleDataProvider = {
  info: { id: 'ZAPAY', label: 'Zapay', mode: 'API', webhooks: true },
  async test(ctx) {
    try {
      await http(`${zapayBase(ctx)}/webhook/`, { headers: zapayAuth(ctx), timeoutMs: 10_000 })
      return { ok: true, message: 'Conexão estabelecida.' }
    } catch (e) {
      if (e instanceof ProviderError && (e.code === '401' || e.code === '403')) return { ok: false, message: 'Usuário ou senha recusados pela Zapay.' }
      if (e instanceof ProviderError && e.rejected) return { ok: true, message: 'Conexão estabelecida.' }
      return { ok: false, message: 'Não foi possível alcançar a Zapay.' }
    }
  },
  async consult(ctx, input) {
    const r = await http(`${zapayBase(ctx)}/vehicle/debts`, {
      method: 'POST', headers: zapayAuth(ctx),
      body: { license_plate: input.plate, ...(input.renavam ? { renavam: input.renavam } : {}), ...(input.ownerDoc ? { document: input.ownerDoc } : {}), ...(input.uf ? { state: input.uf } : {}), request_id: input.reference },
    })
    return { state: 'PROCESSING', externalId: String(r.json?.request_id ?? input.reference), ...EMPTY }
  },
  async status() { return null },
  parseWebhook(body) {
    const ev = String(body?.event ?? '')
    const data = body?.data ?? {}
    const id = String(data?.request_id ?? '')
    if (!id) return null
    if (ev === 'vehicle_debt_found' || ev === 'vehicle_enriched_partially') return { externalId: id, result: { state: 'DONE', externalId: id, debts: zapayDebts(data?.debts), restrictions: [] } }
    if (ev === 'vehicle_debt_not_found') return { externalId: id, result: { state: 'DONE', externalId: id, ...EMPTY } }
    if (ev === 'vehicle_not_found') return { externalId: id, result: { state: 'NOT_FOUND', externalId: id, ...EMPTY, message: 'Veículo não encontrado no Detran.' } }
    if (ev === 'vehicle_debt_unavailable') return { externalId: id, result: { state: 'UNAVAILABLE', externalId: id, ...EMPTY, message: 'Detran indisponível. A Zapay tenta de novo em até 24 h.' } }
    if (ev === 'vehicle_debt_search_error') return { externalId: id, result: { state: 'ERROR', externalId: id, ...EMPTY, message: 'O provedor não conseguiu consultar este veículo.' } }
    return null
  },
  async registerWebhook(ctx, url) {
    try {
      await http(`${zapayBase(ctx)}/webhook/`, { method: 'POST', headers: zapayAuth(ctx), body: { url, resource: 'vehicle_debt', version: 'v2' } })
      return true
    } catch { return false }
  },
}

// ── Celcoin ─────────────────────────────────────────────────────────────────

function celcoinHost(ctx: ProviderContext) {
  const custom = ctx.credentials?.baseUrl?.replace(/\/+$/, '')
  return ctx.environment === 'HOMOLOGACAO' || !custom ? 'https://sandbox.openfinance.celcoin.dev' : custom
}
async function celcoinAuth(ctx: ProviderContext) {
  const tok = await cachedToken(`CELCOIN:${ctx.connectionId ?? ctx.tenantId}`, async () => {
    const r = await http(`${celcoinHost(ctx)}/v5/token`, { form: { client_id: requireCred(ctx.credentials, 'clientId', 'Client ID'), client_secret: requireCred(ctx.credentials, 'clientSecret', 'Client Secret'), grant_type: 'client_credentials' } })
    return { token: String(r.json?.access_token ?? ''), expiresIn: Number(r.json?.expires_in ?? 2400) }
  })
  return { Authorization: `Bearer ${tok}` }
}
function celcoinResult(j: any): VehicleDataResult {
  const s = String(j?.status ?? '').toUpperCase()
  const id = j?.idConsult != null ? String(j.idConsult) : null
  if (s === 'SUCCESS') {
    const debts = (Array.isArray(j?.debts) ? j.debts : []).map((d: any) => ({ id: d?.id != null ? String(d.id) : null, type: debtType(String(d?.type ?? d?.description ?? '')), description: String(d?.description ?? d?.type ?? 'Débito').slice(0, 200), amount: money(d?.amount), dueDate: d?.dueDate ?? null, expired: !!d?.isExpired }))
    return { state: 'DONE', externalId: id, debts, restrictions: [] }
  }
  if (s === 'ERROR' || s === 'FAILED') return { state: 'ERROR', externalId: id, ...EMPTY, message: j?.message ?? 'Consulta não concluída.' }
  return { state: 'PROCESSING', externalId: id, ...EMPTY }
}

export const celcoin: VehicleDataProvider = {
  info: { id: 'CELCOIN', label: 'Celcoin', mode: 'API', webhooks: true },
  async test(ctx) {
    try { await celcoinAuth(ctx); return { ok: true, message: 'Conexão estabelecida.' } }
    catch (e) { return { ok: false, message: e instanceof ProviderError && e.rejected ? 'Client ID ou Client Secret recusados pela Celcoin.' : 'Não foi possível alcançar a Celcoin.' } }
  },
  async consult(ctx, input) {
    const r = await http(`${celcoinHost(ctx)}/baas/v2/vehicledebts/consult`, {
      method: 'POST', headers: await celcoinAuth(ctx),
      body: { licensePlate: input.plate, renavam: input.renavam ?? undefined, state: input.uf ?? undefined, documentNumber: input.ownerDoc ?? undefined, clientRequestId: input.reference },
    })
    return celcoinResult(r.json)
  },
  async status(ctx, externalId) {
    const r = await http(`${celcoinHost(ctx)}/baas/v2/vehicledebts/consult?IdConsult=${encodeURIComponent(externalId)}`, { headers: await celcoinAuth(ctx) })
    return celcoinResult(Array.isArray(r.json?.body) ? r.json.body[0] : r.json?.body ?? r.json)
  },
  parseWebhook(body) {
    if (String(body?.entity ?? '') !== 'vehicledebts-consult') return null
    const res = celcoinResult(body?.body ?? body)
    return res.externalId ? { externalId: res.externalId, result: res } : null
  },
}

// ── Conector AutoDrive (provedores parceiros) ──────────────────────────────

const RESTR_KINDS = new Set(['JUDICIAL', 'ROUBO_FURTO', 'ADMINISTRATIVA', 'TRIBUTARIA', 'RENAJUD', 'GRAVAME', 'OUTRA'])

export function partnerVehicleData(id: string, label: string): VehicleDataProvider {
  const base = (ctx: ProviderContext) => requireCred(ctx.credentials, 'baseUrl', 'endereço da API').replace(/\/+$/, '')
  const auth = (ctx: ProviderContext) => ({ Authorization: `Bearer ${requireCred(ctx.credentials, 'apiKey', 'chave de acesso')}` })
  const norm = (j: any): VehicleDataResult => {
    const s = String(j?.status ?? '').toUpperCase()
    const state = s === 'DONE' || s === 'CONFIRMED' ? 'DONE' : s === 'NOT_FOUND' ? 'NOT_FOUND' : s === 'ERROR' || s === 'REJECTED' ? 'ERROR' : s === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'PROCESSING'
    return {
      state, externalId: j?.id ? String(j.id) : null, message: j?.message ?? null,
      debts: (Array.isArray(j?.debts) ? j.debts : []).map((d: any) => ({ id: d?.id ?? null, type: debtType(String(d?.type ?? '')), description: String(d?.description ?? d?.type ?? 'Débito').slice(0, 200), year: d?.year ?? null, amount: money(d?.amount), dueDate: d?.dueDate ?? null, expired: !!d?.expired })),
      restrictions: (Array.isArray(j?.restrictions) ? j.restrictions : []).map((r: any) => {
        const kind = String(r?.kind ?? 'OUTRA').toUpperCase()
        return { kind: RESTR_KINDS.has(kind) ? kind : 'OUTRA', blocking: r?.blocking !== false, description: String(r?.description ?? '').slice(0, 300), institution: r?.institution ?? null, reference: r?.reference ?? null }
      }),
    }
  }
  return {
    info: { id, label, mode: 'API', webhooks: true },
    async test(ctx) {
      try { await http(`${base(ctx)}/health`, { headers: auth(ctx), timeoutMs: 10_000 }); return { ok: true, message: 'Conexão estabelecida.' } }
      catch (e) { return { ok: false, message: e instanceof ProviderError && e.rejected ? 'O provedor recusou a chave de acesso.' : 'Não foi possível alcançar a API do provedor.' } }
    },
    async consult(ctx, input) {
      const r = await http(`${base(ctx)}/veiculos/consultas`, { method: 'POST', headers: { ...auth(ctx), 'Idempotency-Key': input.reference }, body: { plate: input.plate, renavam: input.renavam, chassi: input.chassi, uf: input.uf, document: input.ownerDoc, reference: input.reference } })
      return norm(r.json)
    },
    async status(ctx, externalId) {
      const r = await http(`${base(ctx)}/veiculos/consultas/${encodeURIComponent(externalId)}`, { headers: auth(ctx) })
      return norm(r.json)
    },
    parseWebhook(body) { const res = norm(body); return res.externalId ? { externalId: res.externalId, result: res } : null },
  }
}

const VEHICLE_DATA: Record<string, VehicleDataProvider> = {
  ZAPAY: zapay,
  CELCOIN: celcoin,
  INFOSIMPLES: partnerVehicleData('INFOSIMPLES', 'Infosimples'),
  CONSULTA_DE_PLACA: partnerVehicleData('CONSULTA_DE_PLACA', 'Consulta de Placa'),
  CHECKTUDO: partnerVehicleData('CHECKTUDO', 'Checktudo'),
}

export function vehicleDataProvider(id: string): VehicleDataProvider | null {
  return VEHICLE_DATA[id] ?? null
}
