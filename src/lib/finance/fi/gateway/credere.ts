// =============================================================================
// Credere — agregador oficial (API pública: docs.meucredere.com.br, OpenAPI 3.1).
// Entra como RESERVA: quando a loja não tem conexão direta ativa com um banco,
// a ficha vai pela Credere da loja para aquele banco (código Febraban em
// ctx.routedBankCode). BYOC: o token OAuth é DA LOJA (login na conta Credere
// dela); só o client_id/secret do aplicativo AutoDrive são da plataforma.
//
// Jornada: lead (cria/atualiza) → modelo do veículo pela FIPE → simulação no
// banco escolhido (assíncrona: consulta até terminar) → cliente (ficha completa)
// → proposta com a condição escolhida → "analyze" (envia ao banco).
// Andamento: consulta da tentativa (GET). O aviso (webhook) só dispara uma nova
// consulta; com a URL cadastrada na Credere ele vem assinado (X-Credere-Signature,
// secret da loja) e aviso sem assinatura válida é recusado. HTTP 429 = limite de
// consultas do contrato: vira "tentar de novo depois", nunca recusa.
//
// Montadores e conversões são puros e exportados (testados em credere.test.ts).
// =============================================================================

import { createHmac, timingSafeEqual } from 'node:crypto'
import { NotIntegratedBank } from './base'
import {
  BankGatewayError, retryAfterMs,
  type ApplicantPayload, type BankCapabilities, type BankChannel, type BankContext, type BankDecision, type BankOffer,
  type FundingInfo, type ProposalTerms, type WebhookEvent,
} from './types'
import type { AttemptStatus } from '../status-core'

export const CREDERE_API = 'https://app.meucredere.com.br/api'

// ── utilitários ──────────────────────────────────────────────────────────────
const digits = (v: unknown) => String(v ?? '').replace(/\D+/g, '')
const str = (v: unknown) => (v == null ? '' : String(v).trim())
const num = (v: unknown): number | null => { const x = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.')); return Number.isFinite(x) ? x : null }
const cents = (v: number | null | undefined) => (v == null ? 0 : Math.round(v * 100))
const fromCents = (v: unknown) => { const n = num(v); return n == null ? null : Math.round(n) / 100 }
export const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
const reject = (msg: string) => new BankGatewayError(msg, 'REJEITADO', 'NAO')

export function formatCpf(v: unknown): string {
  const d = digits(v)
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
  return d
}
const brDate = (iso: unknown) => { const s = str(iso).slice(0, 10); const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[3]}/${m[2]}/${m[1]}` : '' }
function phoneParts(v: unknown): { code: number; number: number } | null {
  let d = digits(v)
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2)
  if (d.length < 10 || d.length > 11) return null
  return { code: Number(d.slice(0, 2)), number: Number(d.slice(2)) }
}

/** Código Febraban dos bancos que o AutoDrive conhece (para rotear pela Credere). */
export const FEBRABAN_BY_ADAPTER: Record<string, string> = {
  bv: '655', pan: '623', santander: '033', itau: '341', bradesco: '394', safra: '422', c6: '336', daycoval: '707',
}
export function febrabanFor(bank: { adapterKey: string | null; code: string | null; name: string }): string | null {
  if (bank.code && /^\d{3}$/.test(bank.code.trim())) return bank.code.trim()
  if (bank.adapterKey && FEBRABAN_BY_ADAPTER[bank.adapterKey]) return FEBRABAN_BY_ADAPTER[bank.adapterKey]
  const n = norm(bank.name)
  const byName: [RegExp, string][] = [[/\bBV\b|VOTORANTIM/, '655'], [/\bPAN\b/, '623'], [/SANTANDER/, '033'], [/ITAU/, '341'], [/BRADESCO/, '394'], [/SAFRA/, '422'], [/\bC6\b/, '336'], [/DAYCOVAL/, '707'], [/OMNI/, '613']]
  return byName.find(([re]) => re.test(n))?.[1] ?? null
}

// ── domínios (listas da Credere) ─────────────────────────────────────────────
export interface DomainItem { id: number | string; label: string; identifier?: string | null }

/** Acha o item do domínio pelo texto da ficha (igual → contém → sinônimos). */
export function matchDomain(list: DomainItem[] | undefined, text: unknown, synonyms: string[] = []): DomainItem | null {
  if (!list?.length) return null
  const wanted = [norm(text), ...synonyms.map(norm)].filter(Boolean)
  for (const w of wanted) { const hit = list.find((d) => norm(d.label) === w); if (hit) return hit }
  for (const w of wanted) { const hit = list.find((d) => norm(d.label).includes(w) || (w.length > 3 && w.includes(norm(d.label)))); if (hit) return hit }
  return null
}

const MARITAL_SYN: Record<string, string[]> = { CASAD: ['Casado'], SOLTEIR: ['Solteiro'], VIUV: ['Viúvo'], DIVORCIAD: ['Divorciado'], SEPARAD: ['Divorciado', 'Separado'], UNIAO: ['Vive Maritalmente', 'União estável'], AMASIAD: ['Vive Maritalmente'] }
export const maritalSynonyms = (v: unknown) => { const s = norm(v); return Object.entries(MARITAL_SYN).find(([k]) => s.startsWith(k) || s.includes(k))?.[1] ?? [] }
const RESIDENCE_SYN: Record<string, string[]> = { FINANC: ['Financiada', 'Própria financiada'], PROPRI: ['Quitada', 'Própria'], ALUGAD: ['Alugada'], FAMILIA: ['Com Parentes', 'Familiar'], CEDID: ['Com Terceiros', 'Cedida'], OUTRA: ['Com Terceiros', 'Outros'] }
export const residenceSynonyms = (v: unknown) => { const s = norm(v); return Object.entries(RESIDENCE_SYN).find(([k]) => s.startsWith(k))?.[1] ?? [] }
export const occupationSynonyms = (occ: unknown): string[] => ({
  CLT: ['Assalariado', 'Empregado de empresa privada'], EMPRESARIO: ['Empresário / Sócio', 'Empresário/Sócio'],
  AUTONOMO: ['Autônomo'], APOSENTADO_PENSIONISTA: ['Aposentado / Pensionista', 'Aposentado, pensionista ou militar da reserva'],
} as Record<string, string[]>)[String(occ)] ?? []

const UF_NAMES: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goias',
  MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco',
  PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina',
  SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
}
export const stateId = (states: DomainItem[] | undefined, uf: unknown) => {
  const u = str(uf).toUpperCase().slice(0, 2)
  return u ? (matchDomain(states, UF_NAMES[u] ?? u, [u])?.id ?? null) : null
}

export interface LeadDomains { gender?: DomainItem[]; occupation?: DomainItem[]; profession?: DomainItem[] }
export interface CustomerDomains {
  marital_status?: DomainItem[]; genre?: DomainItem[]; states?: DomainItem[]; build_type?: DomainItem[]; profession?: DomainItem[]
  professional_ocupation?: DomainItem[]; phone_type?: DomainItem[]; address_type?: DomainItem[]
}

// ── Montadores (puros) ───────────────────────────────────────────────────────
export function leadPayload(a: ApplicantPayload, dom: LeadDomains) {
  const d = a.data
  const doc = digits(a.personType === 'PJ' ? d.cnpj : d.cpf)
  if (!doc) throw reject(a.personType === 'PJ' ? 'Falta o CNPJ do cliente.' : 'Falta o CPF do cliente.')
  const phone = digits(d.celular || d.telefoneFixo)
  if (phone.length < 10) throw reject('Informe um celular válido do cliente (com DDD).')
  const gender = matchDomain(dom.gender, d.sexo === 'M' ? 'Masculino' : d.sexo === 'F' ? 'Feminino' : d.sexo)
  const occupation = matchDomain(dom.occupation, '', occupationSynonyms(d.occupation))
  const profession = matchDomain(dom.profession, d.profissao)
  const renda = num(d.renda)
  return {
    lead: {
      cpf_cnpj: formatCpf(doc),
      name: str(d.nomeCompleto || d.razaoSocial).slice(0, 120),
      ...(str(d.dataNascimento) ? { birthdate: str(d.dataNascimento).slice(0, 10) } : {}),
      ...(str(d.email) ? { email: str(d.email) } : {}),
      has_cnh: !!str(d.cnh),
      ...(gender ? { retrieve_gender: String(gender.identifier ?? gender.id) } : {}),
      phone_number: `+55${phone.startsWith('55') && phone.length >= 12 ? phone.slice(2) : phone}`,
      ...(renda ? { monthly_income: cents(renda) } : {}),
      ...(occupation ? { retrieve_occupation: String(occupation.identifier ?? occupation.id) } : {}),
      ...(profession ? { retrieve_profession: String(profession.identifier ?? profession.id) } : {}),
      ...(str(d.cep) ? {
        address: {
          zip_code: digits(d.cep), city: str(d.cidade), state: str(d.estado).toUpperCase().slice(0, 2), district: str(d.bairro),
          street: str(d.logradouro), number: str(d.numero) || 'SN', ...(str(d.complemento) ? { complement: str(d.complemento) } : {}),
        },
      } : {}),
    },
  }
}

export function vehicleTerms(terms: ProposalTerms) {
  const v = terms.vehicle ?? {}
  if (!terms.vehicleValue || terms.vehicleValue <= 0) throw reject('Informe o valor do veículo na ficha para enviar pela Credere.')
  if (!v.fipeCode) throw reject('Vincule à ficha um veículo do estoque com código FIPE para enviar pela Credere.')
  const modelYear = v.modelYear ?? v.year
  if (!modelYear) throw reject('O veículo vinculado está sem ano modelo.')
  if (!terms.installments) throw reject('Informe o prazo (número de parcelas) na ficha.')
  return { ...v, vehicleValue: terms.vehicleValue, modelYear, manufactureYear: v.year ?? modelYear }
}

/** Escolhe o modelo da Credere que cobre o ano do veículo. */
export function pickVehicleModel(models: { id: number; year_start?: number | null; year_end?: number | null; active?: boolean }[], modelYear: number): number | null {
  const ok = models.filter((m) => m.active !== false)
  const fit = ok.find((m) => (m.year_start ?? 0) <= modelYear && modelYear <= (m.year_end ?? 9999))
  return (fit ?? ok[0])?.id ?? null
}

export function simulationPayload(a: ApplicantPayload, terms: ProposalTerms, creds: Record<string, string>, bankCode: string, vehicleModelId: number, place: { uf: string; city: string }) {
  const v = vehicleTerms(terms)
  if (!creds.sellerCpf) throw new BankGatewayError('Falta o CPF do vendedor na conexão da Credere.', 'CREDENCIAL')
  const down = terms.downPayment ?? 0
  return {
    simulation: {
      seller_cpf: digits(creds.sellerCpf),
      assets_value: cents(v.vehicleValue),
      commercial: false,
      retrieve_lead: { cpf_cnpj: formatCpf(a.personType === 'PJ' ? a.data.cnpj : a.data.cpf) },
      vehicle: {
        credere_vehicle_model_id: vehicleModelId,
        licensing_uf: place.uf, licensing_city: place.city,
        manufacture_year: Number(v.manufactureYear), model_year: Number(v.modelYear),
        asset_value: cents(v.vehicleValue), zero_km: !!v.zeroKm,
      },
      conditions: [{
        installments: terms.installments, down_payment: cents(down),
        financed_amount: cents(Math.max(0, v.vehicleValue - down)), bank_febraban_code: bankCode,
      }],
      bank_febraban_codes: [bankCode],
      process_bank_suggested_conditions: false,
    },
  }
}

export interface CredereCondition {
  id?: number; installments?: number; down_payment?: number; financed_amount?: number; first_installment_value?: number
  interest_monthly?: number | null; cet_monthly?: number | null; cet_annually?: number | null; amount_paid_in_financing?: number | null
  available?: boolean; success?: boolean; error?: boolean; reason?: string | null; reason_identifier?: string | null
  pre_approval_status?: number | null; credit_approved?: boolean; bank_minimum_down_payment?: number | null
  processed_at?: string | null; process_task?: { ended_at?: string | null } | null; bank?: { febraban_code?: string }
}
export interface CredereSimulation { uuid?: string; conditions?: CredereCondition[] }

export const conditionDone = (c: CredereCondition) => !!(c.processed_at || c.process_task?.ended_at || c.error)
export const simulationDone = (s: CredereSimulation) => (s.conditions ?? []).length > 0 && (s.conditions ?? []).every(conditionDone)

export function offerFromCondition(c: CredereCondition): BankOffer {
  const inst = fromCents(c.first_installment_value)
  return {
    approvedAmount: fromCents(c.financed_amount), downPayment: fromCents(c.down_payment), installments: c.installments ?? null,
    installmentValue: inst, rateMonthly: c.interest_monthly ?? null, cetMonthly: c.cet_monthly ?? null, cetYearly: c.cet_annually ?? null,
    totalAmount: fromCents(c.amount_paid_in_financing) ?? (inst && c.installments ? Math.round(inst * c.installments * 100) / 100 : null),
  }
}

/** Resultado da condição do banco: usável, recusada (com motivo) ou indisponível. */
export function evaluateCondition(sim: CredereSimulation, bankCode: string, installments: number | null | undefined): { ok: CredereCondition } | { refuse: string } {
  const list = (sim.conditions ?? []).filter((c) => !c.bank?.febraban_code || c.bank.febraban_code === bankCode)
  const c = list.find((x) => x.installments === installments) ?? list[0]
  if (!c) return { refuse: 'A Credere não devolveu condição para este banco. Confira se a loja tem credencial deste banco na Credere.' }
  if (c.pre_approval_status === 1) return { refuse: 'Pré-análise pela Credere: CPF com restrição neste banco.' }
  if (c.reason_identifier === 'down_payment_less_than_minimum_value' && c.bank_minimum_down_payment) {
    return { refuse: `O banco pede entrada mínima de R$ ${(c.bank_minimum_down_payment / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}. Ajuste a entrada e envie de novo.` }
  }
  if (!c.available || c.error || !c.success || !c.id) return { refuse: c.reason ? `Credere: ${c.reason}` : 'O banco não liberou condição para este prazo pela Credere.' }
  return { ok: c }
}

export function customerPayload(a: ApplicantPayload, dom: CustomerDomains) {
  if (a.personType === 'PJ') throw reject('Ficha de empresa (PJ) ainda vai pelo portal da Credere. A integração envia pessoa física.')
  const d = a.data
  const id = (x: DomainItem | null) => (x ? Number(x.id) || x.id : undefined)
  const cel = phoneParts(d.celular)
  if (!cel) throw reject('Informe um celular válido do cliente (com DDD).')
  const celType = matchDomain(dom.phone_type, 'Celular')
  const resType = matchDomain(dom.build_type, '', residenceSynonyms(d.tipoResidencia))
  const months = num(d.tempoResidenciaMeses)
  const empTel = phoneParts(d.empresaTelefone)
  const refs = Array.isArray(d.referencias) ? (d.referencias as { nome?: unknown; telefone?: unknown; relacao?: unknown }[]) : []
  return {
    customer: {
      cpf: formatCpf(d.cpf), name: str(d.nomeCompleto).slice(0, 120),
      ...(brDate(d.dataNascimento) ? { born_at: brDate(d.dataNascimento) } : {}),
      ...(str(d.nomeMae) ? { mother: str(d.nomeMae) } : {}), ...(str(d.nomePai) ? { father: str(d.nomePai) } : {}),
      ...(digits(d.rg) ? { document_type: 'RG', rg: digits(d.rg) } : {}),
      ...(brDate(d.rgDataEmissao) ? { rg_date: brDate(d.rgDataEmissao) } : {}),
      ...(stateId(dom.states, d.rgUf) ? { rg_state_id: stateId(dom.states, d.rgUf) } : {}),
      ...(str(d.rgOrgao) ? { rg_issuing: str(d.rgOrgao).toUpperCase() } : {}),
      has_cnh: !!str(d.cnh), ...(str(d.cnh) ? { cnh: digits(d.cnh) } : {}),
      ...(id(matchDomain(dom.marital_status, d.estadoCivil, maritalSynonyms(d.estadoCivil))) ? { marital_status_id: id(matchDomain(dom.marital_status, d.estadoCivil, maritalSynonyms(d.estadoCivil))) } : {}),
      ...(str(d.conjugeNome) ? { spouse_name: str(d.conjugeNome) } : {}),
      ...(digits(d.conjugeCpf).length === 11 ? { spouse_cpf: formatCpf(d.conjugeCpf) } : {}),
      ...(brDate(d.conjugeDataNascimento) ? { spouse_born_at: brDate(d.conjugeDataNascimento) } : {}),
      nationality: norm(d.nacionalidade).startsWith('ESTRANG') ? 'Estrangeira' : 'Brasileira',
      ...(str(d.naturalidade) ? { place_of_birth: str(d.naturalidade) } : {}),
      ...(stateId(dom.states, d.naturalidadeUf) ? { state_of_birth_id: stateId(dom.states, d.naturalidadeUf) } : {}),
      ...(id(matchDomain(dom.genre, d.sexo === 'M' ? 'Masculino' : d.sexo === 'F' ? 'Feminino' : d.sexo)) ? { genre_id: id(matchDomain(dom.genre, d.sexo === 'M' ? 'Masculino' : d.sexo === 'F' ? 'Feminino' : d.sexo)) } : {}),
      public_person: d.pep === 'SIM',
      ...(str(d.email) ? { emails: [{ address: str(d.email) }] } : {}),
      phones: [{ ...cel, ...(celType ? { phone_type_id: id(celType) } : {}) }],
      ...(str(d.cep) ? {
        address: {
          ...(id(matchDomain(dom.address_type, 'Principal', ['Residencial'])) ? { address_type_id: id(matchDomain(dom.address_type, 'Principal', ['Residencial'])) } : {}),
          street: str(d.logradouro), number: str(d.numero) || 'SN', ...(str(d.complemento) ? { complement: str(d.complemento) } : {}),
          neighborhood: str(d.bairro), city: str(d.cidade), zip_code: digits(d.cep),
          ...(stateId(dom.states, d.estado) ? { state_id: stateId(dom.states, d.estado) } : {}),
          ...(months != null ? { set_time_year: Math.floor(months / 12), set_time_month: months % 12 } : {}),
          ...(resType ? { build_type_id: id(resType) } : {}),
          ...(num(d.valorAluguel) ? { rent_value_cents: cents(num(d.valorAluguel)) } : {}),
        },
      } : {}),
      job_reference: {
        ...(str(d.empresaNome) ? { name: str(d.empresaNome) } : {}),
        ...(digits(d.empresaCnpj) ? { cnpj: formatCpf(d.empresaCnpj) } : {}),
        ...(brDate(d.dataAdmissao) ? { joined_at: brDate(d.dataAdmissao) } : {}),
        ...(num(d.renda) ? { income_cents: cents(num(d.renda)) } : {}),
        ...(id(matchDomain(dom.professional_ocupation, '', occupationSynonyms(d.occupation))) ? { professional_ocupation_id: id(matchDomain(dom.professional_ocupation, '', occupationSynonyms(d.occupation))) } : {}),
        ...(id(matchDomain(dom.profession, d.profissao)) ? { profession_id: id(matchDomain(dom.profession, d.profissao)) } : {}),
        ...(empTel ? { phone: empTel } : {}),
      },
      ...(refs.length ? {
        personal_references: refs.map((r) => ({ name: str(r?.nome), phone: phoneParts(r?.telefone), relationship: str(r?.relacao) || undefined }))
          .filter((r) => r.name && r.phone).slice(0, 3),
      } : {}),
    },
  }
}

// ── Status da tentativa ──────────────────────────────────────────────────────
const STATE_MAP: Record<string, AttemptStatus> = {
  SIMULACAO: 'ENVIADA', CHECAGEM: 'ENVIADA', ANALISE: 'EM_ANALISE', PENDENTE: 'PENDENTE', 'PRE APROVADA': 'PRE_APROVADA',
  APROVADA: 'APROVADA', FORMALIZADA: 'APROVADA', FATURADA: 'APROVADA', PAGO: 'APROVADA',
  RECUSADA: 'RECUSADA', RESTRICAO: 'RECUSADA', DESISTENCIA: 'CANCELADA', CANCELADA: 'CANCELADA', EXPIRADA: 'EXPIRADA',
}
export const mapCredereState = (state: unknown): AttemptStatus | null => STATE_MAP[norm(String(state ?? '').replace(/_/g, ' '))] ?? null

export interface CredereAttempt {
  id?: number; state?: string; obs?: string | null; integration_error?: string | null; bank_proposal_identifier?: string | null
  term_financing?: number | null; quota_in_cents?: number | null; financed_amount_in_cents?: number | null; input_financing_in_cents?: number | null
  cet_monthly?: number | null; cet_annually?: number | null; formalization_state?: string | null
}

export function decisionFromAttempt(externalId: string, at: CredereAttempt): BankDecision | null {
  const status = mapCredereState(at.state)
  if (!status) return null
  const installments = at.term_financing ?? null
  const installmentValue = fromCents(at.quota_in_cents)
  const reason = str(at.integration_error) || str(at.obs) || null
  return {
    externalId, requestId: at.bank_proposal_identifier ?? null, status,
    reason: reason ? reason.slice(0, 280) : status === 'RECUSADA' ? 'Recusada pelo banco (via Credere).' : null,
    offer: ['APROVADA', 'PRE_APROVADA', 'EM_ANALISE', 'PENDENTE'].includes(status) ? {
      approvedAmount: fromCents(at.financed_amount_in_cents), downPayment: fromCents(at.input_financing_in_cents), installments, installmentValue,
      cetMonthly: at.cet_monthly ?? null, cetYearly: at.cet_annually ?? null,
      totalAmount: installments && installmentValue ? Math.round(installments * installmentValue * 100) / 100 : null,
    } : null,
  }
}

/** externalId = "<proposta>:<tentativa>" (a API da Credere precisa dos dois). */
export const attemptKey = (proposalId: unknown, attemptId: unknown) => `${digits(proposalId)}:${digits(attemptId)}`
export function splitAttemptKey(externalId: string): { proposalId: string; attemptId: string } {
  const [p, t] = externalId.split(':')
  if (!digits(p) || !digits(t)) throw new BankGatewayError('Identificação da proposta na Credere inválida.', 'REJEITADO')
  return { proposalId: digits(p), attemptId: digits(t) }
}

/**
 * Assinatura do webhook da Credere (URL cadastrada no formulário da loja na Credere;
 * cada URL tem um secret próprio). Cabeçalho X-Credere-Signature: "t=<epoch s>,v1=<hex>",
 * v1 = HMAC-SHA256("{t}.{corpo bruto}", secret). Recusa assinatura com mais de 5 min
 * (ou do futuro) para impedir reenvio de um aviso capturado.
 */
export const CREDERE_SIGNATURE_TOLERANCE_S = 300
export function verifyCredereSignature(rawBody: string, header: string | null | undefined, secret: string, nowMs = Date.now()): boolean {
  if (!header || !secret) return false
  const parts = Object.fromEntries(header.split(',').map((p) => { const i = p.indexOf('='); return i > 0 ? [p.slice(0, i).trim(), p.slice(i + 1).trim()] : [p.trim(), ''] }))
  const t = parts.t
  const v1 = (parts.v1 ?? '').toLowerCase()
  if (!/^\d{9,12}$/.test(t ?? '') || !/^[0-9a-f]{64}$/.test(v1)) return false
  if (Math.abs(Math.floor(nowMs / 1000) - Number(t)) > CREDERE_SIGNATURE_TOLERANCE_S) return false
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex')
  return timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(v1, 'utf8'))
}

/** Do aviso (webhook), só a identificação da tentativa — o status vem da consulta. */
export function parseCredereWebhook(payload: unknown): WebhookEvent[] {
  if (!payload || typeof payload !== 'object') return []
  const p = payload as Record<string, unknown>
  const at = (p.proposal_attempt ?? (p.data as Record<string, unknown> | undefined)?.proposal_attempt ?? p) as Record<string, unknown>
  const attemptId = digits(at.id ?? p.proposal_attempt_id)
  const proposalId = digits(at.proposal_id ?? p.proposal_id ?? (p.complete_proposal as Record<string, unknown> | undefined)?.id ?? (at.proposal as Record<string, unknown> | undefined)?.id)
  if (!attemptId || !proposalId) return []
  const externalId = attemptKey(proposalId, attemptId)
  // A Credere manda "event_id" em todo aviso (igual em todas as cópias do mesmo evento): deduplica por ele.
  const eventId = typeof p.event_id === 'string' || typeof p.event_id === 'number' ? `credere:ev:${p.event_id}` : `credere:${externalId}:${str(at.state)}:${str(at.updated_at)}`
  return [{ eventId, externalId, decision: null, raw: { proposalId, attemptId, state: at.state ?? null } }]
}

// ── Transporte (token da loja, renovação automática) ─────────────────────────
interface Req { method: 'GET' | 'POST' | 'PATCH' | 'PUT'; path: string; body?: unknown; store?: boolean; idempotent?: boolean; allow404?: boolean }

export function credereAppCredentials(env: NodeJS.ProcessEnv = process.env) {
  const clientId = env.CREDERE_CLIENT_ID?.trim(); const clientSecret = env.CREDERE_CLIENT_SECRET?.trim()
  return clientId && clientSecret ? { clientId, clientSecret } : null
}

async function refreshToken(ctx: BankContext): Promise<string> {
  const app = credereAppCredentials()
  if (!app || !ctx.credentials.refreshToken) throw new BankGatewayError('A conexão com a Credere venceu. Conecte de novo em Configurações › F&I.', 'CREDENCIAL')
  const res = await fetch(`${CREDERE_API}/v1/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: ctx.credentials.refreshToken, client_id: app.clientId, client_secret: app.clientSecret }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null)
  const b = res ? await res.json().catch(() => ({})) as { access_token?: string; refresh_token?: string; expires_in?: number } : {}
  if (!res?.ok || !b.access_token) throw new BankGatewayError('A conexão com a Credere venceu. Conecte de novo em Configurações › F&I.', 'CREDENCIAL')
  const patch = { accessToken: b.access_token, refreshToken: b.refresh_token ?? ctx.credentials.refreshToken, expiresAt: new Date(Date.now() + (Number(b.expires_in) || 15_552_000) * 1000).toISOString() }
  Object.assign(ctx.credentials, patch)
  // O refresh_token antigo deixa de valer: grava o novo antes de seguir.
  await ctx.persistCredentials?.(patch)
  return b.access_token
}

export function credereErrorMessage(body: unknown): string | null {
  const b = (body ?? {}) as { error?: unknown; message?: unknown; invalidations?: unknown; errors?: unknown }
  const inv = b.invalidations && typeof b.invalidations === 'object' ? Object.entries(b.invalidations as Record<string, unknown>).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`) : []
  const msg = [typeof b.message === 'string' ? b.message : typeof b.error === 'string' ? b.error : null, ...inv].filter(Boolean).join(' · ')
  return msg ? msg.slice(0, 280) : null
}

export async function credereRequest<T>(ctx: BankContext, r: Req): Promise<T | null> {
  let token = ctx.credentials.accessToken
  if (!token) throw new BankGatewayError('A loja ainda não conectou a Credere.', 'CREDENCIAL')
  if (ctx.credentials.expiresAt && new Date(ctx.credentials.expiresAt).getTime() < Date.now() + 86_400_000) token = await refreshToken(ctx)
  if (r.store && !ctx.credentials.storeId) throw new BankGatewayError('Escolha a loja da Credere em Configurações › F&I.', 'CREDENCIAL')
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response
    try {
      res = await fetch(`${CREDERE_API}${r.path}`, {
        method: r.method,
        headers: {
          Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-Correlation-Id': ctx.correlationId,
          ...(r.body != null ? { 'Content-Type': 'application/json' } : {}), ...(r.store ? { 'Store-Id': ctx.credentials.storeId } : {}),
        },
        body: r.body != null ? JSON.stringify(r.body) : undefined,
        signal: AbortSignal.timeout(20_000),
      })
    } catch (e) {
      const timeout = e instanceof Error && e.name === 'TimeoutError'
      throw new BankGatewayError(timeout ? 'A Credere não respondeu a tempo.' : 'Não foi possível falar com a Credere agora.', timeout ? 'TEMPO_ESGOTADO' : 'INDISPONIVEL', r.idempotent || r.method === 'GET' ? 'NAO' : 'TALVEZ')
    }
    if (res.status === 401 && attempt === 0) { token = await refreshToken(ctx); continue }
    // Limite de consultas por hora/dia do contrato: a chamada não foi processada.
    if (res.status === 429) throw new BankGatewayError('A Credere atingiu o limite de consultas da loja. Tentamos de novo automaticamente.', 'INDISPONIVEL', 'NAO', retryAfterMs(res.headers.get('retry-after')))
    const body = await res.json().catch(() => null)
    if (res.status === 404 && r.allow404) return null
    if (res.status === 401 || res.status === 403) throw new BankGatewayError(credereErrorMessage(body) ?? 'A Credere recusou o acesso da loja. Conecte de novo em Configurações › F&I.', 'CREDENCIAL')
    if (res.status >= 500) throw new BankGatewayError(credereErrorMessage(body) ?? 'A Credere está fora do ar no momento.', 'INDISPONIVEL', r.idempotent || r.method === 'GET' ? 'NAO' : 'TALVEZ')
    if (res.status >= 400) throw new BankGatewayError(credereErrorMessage(body) ?? `A Credere recusou os dados enviados (HTTP ${res.status}).`, 'REJEITADO', 'NAO')
    return body as T
  }
  return null
}

// Domínios mudam pouco: cache por processo (6 h), separado por loja.
const domainCache = new Map<string, { at: number; value: unknown }>()
async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = domainCache.get(key)
  if (hit && Date.now() - hit.at < 6 * 3_600_000) return hit.value as T
  const value = await load()
  domainCache.set(key, { at: Date.now(), value })
  return value
}
const toItems = (list: unknown): DomainItem[] => (Array.isArray(list) ? list : []).map((x) => {
  const o = x as Record<string, unknown>
  return { id: (o.id as number | string), label: String(o.label ?? o.name ?? ''), identifier: (o.credere_identifier ?? o.identifier ?? null) as string | null }
})

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ── Conector ─────────────────────────────────────────────────────────────────
export class CredereAdapter extends NotIntegratedBank {
  readonly key = 'credere'
  readonly name = 'Credere'
  readonly channel: BankChannel = 'AGREGADOR'
  readonly official = true
  readonly timeoutMs = 120_000
  readonly webhookRefetch = true
  readonly capabilities: BankCapabilities = {
    simulate: false, preAnalyze: true, submit: true, update: false, status: true, documents: false,
    formalize: false, contract: false, funding: true, cancel: true, webhook: true,
  }
  protected readonly credentialFields = ['accessToken', 'storeId', 'sellerCpf', 'sellerId']

  private bankCode(ctx: BankContext): string {
    if (!ctx.routedBankCode) throw reject('Banco sem código Febraban: informe o código do banco no cadastro (ex.: 655 para o BV).')
    return ctx.routedBankCode
  }

  private async leadDomains(ctx: BankContext): Promise<LeadDomains> {
    return cached(`lead:${ctx.tenantId}`, async () => {
      const r = await credereRequest<{ data?: Record<string, unknown> }>(ctx, { method: 'GET', path: '/v1/banks_api/domains?types=gender,occupation,profession', store: true })
      return { gender: toItems(r?.data?.gender), occupation: toItems(r?.data?.occupation), profession: toItems(r?.data?.profession) }
    })
  }
  private async customerDomains(ctx: BankContext): Promise<CustomerDomains> {
    return cached(`cust:${ctx.tenantId}`, async () => {
      const r = await credereRequest<{ domains?: Record<string, unknown> }>(ctx, { method: 'GET', path: '/v1/domains' })
      const dm = r?.domains ?? {}
      return {
        marital_status: toItems(dm.marital_status), genre: toItems(dm.genre), states: toItems(dm.states), build_type: toItems(dm.build_type),
        profession: toItems(dm.profession), professional_ocupation: toItems(dm.professional_ocupation), phone_type: toItems(dm.phone_type), address_type: toItems(dm.address_type),
      }
    })
  }

  private async upsertLead(a: ApplicantPayload, ctx: BankContext) {
    const body = leadPayload(a, await this.leadDomains(ctx))
    const doc = digits(body.lead.cpf_cnpj)
    const existing = await credereRequest(ctx, { method: 'GET', path: `/v1/banks_api/leads/${doc}`, store: true, allow404: true })
    await credereRequest(ctx, existing ? { method: 'PATCH', path: `/v1/banks_api/leads/${doc}`, body, store: true, idempotent: true } : { method: 'POST', path: '/v1/banks_api/leads', body, store: true, idempotent: true })
  }

  private async vehicleModelId(terms: ProposalTerms, ctx: BankContext): Promise<number> {
    const v = vehicleTerms(terms)
    const r = await credereRequest<{ vehicle_models?: { id: number; year_start?: number; year_end?: number; active?: boolean }[] }>(ctx, { method: 'GET', path: `/v1/vehicle_models?per_page=20&fipe_code=${encodeURIComponent(String(v.fipeCode))}` })
    const id = pickVehicleModel(r?.vehicle_models ?? [], Number(v.modelYear))
    if (!id) throw reject(`A Credere não encontrou o veículo pelo código FIPE ${v.fipeCode}.`)
    return id
  }

  /** Lead + simulação no banco roteado, esperando o processamento terminar. */
  private async simulateFor(a: ApplicantPayload, terms: ProposalTerms, ctx: BankContext): Promise<{ sim: CredereSimulation; bankCode: string }> {
    const bankCode = this.bankCode(ctx)
    vehicleTerms(terms)
    await this.upsertLead(a, ctx)
    const modelId = await this.vehicleModelId(terms, ctx)
    const uf = (str(terms.vehicle?.uf) || str(terms.storeUf) || str(ctx.credentials.storeUf)).toUpperCase().slice(0, 2)
    const city = str(ctx.credentials.storeCity) || str(a.data.cidade)
    if (!uf || !city) throw reject('Falta a cidade/UF de emplacamento (cadastro da loja).')
    const created = await credereRequest<{ data?: CredereSimulation }>(ctx, { method: 'POST', path: '/v1/banks_api/simulations', body: simulationPayload(a, terms, ctx.credentials, bankCode, modelId, { uf, city }), store: true, idempotent: true })
    let sim = created?.data ?? {}
    if (!sim.uuid) throw new BankGatewayError('A Credere não devolveu a simulação.', 'INDISPONIVEL')
    for (let i = 0; i < 25 && !simulationDone(sim); i++) {
      await sleep(i < 5 ? 1500 : 3000)
      sim = (await credereRequest<{ data?: CredereSimulation }>(ctx, { method: 'GET', path: `/v1/banks_api/simulations/${sim.uuid}`, store: true }))?.data ?? sim
    }
    if (!simulationDone(sim)) throw new BankGatewayError('O banco ainda não respondeu à simulação na Credere. Tente de novo em alguns minutos.', 'TEMPO_ESGOTADO', 'NAO')
    return { sim, bankCode }
  }

  async preAnalyze(a: ApplicantPayload, terms: ProposalTerms, ctx: BankContext): Promise<BankDecision> {
    const { sim, bankCode } = await this.simulateFor(a, terms, ctx)
    const ev = evaluateCondition(sim, bankCode, terms.installments)
    if ('refuse' in ev) return { status: 'RECUSADA', reason: ev.refuse }
    const c = ev.ok
    const status: AttemptStatus = c.credit_approved ? 'APROVADA' : c.pre_approval_status === 3 ? 'PRE_APROVADA' : 'EM_ANALISE'
    return { requestId: sim.uuid ?? null, status, reason: 'Simulação pela Credere.', offer: offerFromCondition(c) }
  }

  async submitProposal(a: ApplicantPayload, terms: ProposalTerms, ctx: BankContext): Promise<BankDecision> {
    // Valida antes de qualquer chamada (erro aqui = nada saiu daqui).
    vehicleTerms(terms); this.bankCode(ctx)
    if (a.personType === 'PJ') throw reject('Ficha de empresa (PJ) ainda vai pelo portal da Credere. A integração envia pessoa física.')

    const { sim, bankCode } = await this.simulateFor(a, terms, ctx)
    const ev = evaluateCondition(sim, bankCode, terms.installments)
    if ('refuse' in ev) return { status: 'RECUSADA', reason: ev.refuse }

    // Cliente (ficha completa): atualiza se já existe na conta da Credere.
    const body = customerPayload(a, await this.customerDomains(ctx))
    const found = await credereRequest<{ customer?: { id?: number } }>(ctx, { method: 'GET', path: `/v1/customers/find?cpf=${encodeURIComponent(body.customer.cpf)}`, allow404: true })
    const customer = found?.customer?.id
      ? (await credereRequest<{ customer?: { id?: number } }>(ctx, { method: 'PATCH', path: `/v1/customers/${found.customer.id}`, body, idempotent: true }))?.customer ?? found.customer
      : (await credereRequest<{ customer?: { id?: number } }>(ctx, { method: 'POST', path: '/v1/customers', body, idempotent: true }))?.customer
    if (!customer?.id) throw new BankGatewayError('A Credere não devolveu o cadastro do cliente.', 'INDISPONIVEL')

    // Com a URL cadastrada na Credere (aviso ASSINADO), não pede o aviso sem assinatura pelo corpo da proposta.
    const origin = (process.env.NEXTAUTH_URL || '').replace(/\/+$/, '')
    const webhookUrl = origin.startsWith('https://') && !ctx.credentials.webhookSecret ? `${origin}/api/webhook/financing/credere?l=${encodeURIComponent(ctx.tenantId)}` : undefined
    // Criar a proposta NÃO é idempotente: falha de rede aqui vira "verificar".
    const created = await credereRequest<{ complete_proposal?: { id?: number; proposal_attempt?: CredereAttempt } }>(ctx, {
      method: 'POST', path: '/v1/proposals',
      body: {
        proposal: {
          commercial: false, customer_id: customer.id, seller_id: Number(ctx.credentials.sellerId), store_id: Number(ctx.credentials.storeId),
          proposal_attemps: { external_simulation_uuid: sim.uuid, simulation_condition_id: ev.ok.id, ...(webhookUrl ? { webhook_url: webhookUrl } : {}) },
        },
      },
    })
    const prop = created?.complete_proposal
    if (!prop?.id || !prop.proposal_attempt?.id) throw new BankGatewayError('A Credere não devolveu a proposta criada.', 'INDISPONIVEL', 'TALVEZ')
    const externalId = attemptKey(prop.id, prop.proposal_attempt.id)
    // Envia ao banco ("analyze"). Se falhar, a proposta já existe: vira consulta.
    let limited = false
    const analyzed = await credereRequest<{ proposal_attempt?: CredereAttempt }>(ctx, { method: 'GET', path: `/v1/proposals/${prop.id}/proposal_attempts/${prop.proposal_attempt.id}/analyze`, idempotent: true })
      .catch((e) => {
        if (e instanceof BankGatewayError && e.code === 'REJEITADO') throw reject(`A Credere não enviou ao banco: ${e.message}`)
        if (e instanceof BankGatewayError && e.retryAfterMs != null) limited = true
        return null
      })
    const d = analyzed?.proposal_attempt ? decisionFromAttempt(externalId, analyzed.proposal_attempt) : null
    return {
      externalId, requestId: d?.requestId ?? externalId,
      status: d && d.status !== 'ENVIADA' ? d.status : 'EM_ANALISE',
      reason: d?.reason ?? (limited
        ? `Proposta ${prop.id} criada na Credere, mas o limite de consultas impediu o envio ao banco agora. Confira o envio no painel da Credere.`
        : `Proposta ${prop.id} enviada ao banco pela Credere.`),
      offer: offerFromCondition(ev.ok),
    }
  }

  private async attempt(externalId: string, ctx: BankContext): Promise<CredereAttempt> {
    const { proposalId, attemptId } = splitAttemptKey(externalId)
    const r = await credereRequest<{ proposal_attempt?: CredereAttempt }>(ctx, { method: 'GET', path: `/v1/proposals/${proposalId}/proposal_attempts/${attemptId}` })
    if (!r?.proposal_attempt) throw new BankGatewayError('A Credere não encontrou a proposta.', 'REJEITADO')
    return r.proposal_attempt
  }

  async getStatus(externalId: string, ctx: BankContext): Promise<BankDecision> {
    const at = await this.attempt(externalId, ctx)
    return decisionFromAttempt(externalId, at) ?? { externalId, status: 'EM_ANALISE', reason: `Situação na Credere: ${str(at.state) || 'desconhecida'}.` }
  }

  async findByIdempotencyKey(): Promise<BankDecision | null> {
    throw new BankGatewayError('Confira a proposta no painel da Credere e registre a resposta aqui.', 'NAO_SUPORTADO')
  }

  async getFundingStatus(externalId: string, ctx: BankContext): Promise<FundingInfo> {
    const s = norm((await this.attempt(externalId, ctx)).state)
    return { status: s === 'PAGO' ? 'PAGO' : 'AGUARDANDO' }
  }

  async cancel(externalId: string, _reason: string, ctx: BankContext): Promise<void> {
    const { proposalId, attemptId } = splitAttemptKey(externalId)
    await credereRequest(ctx, { method: 'GET', path: `/v1/proposals/${proposalId}/proposal_attempts/${attemptId}/dismiss`, idempotent: true })
  }

  async testConnection(ctx: BankContext): Promise<void> {
    await credereRequest(ctx, { method: 'GET', path: '/v1/users/current' })
  }

  /**
   * O aviso nunca muda a proposta por si: só dispara uma consulta (webhookRefetch).
   * A assinatura (secret da loja) é conferida na rota do webhook — ver verifyCredereSignature.
   */
  verifyWebhook(): boolean { return false }
  parseWebhook(payload: unknown): WebhookEvent[] { return parseCredereWebhook(payload) }
}

export function __resetCredereCachesForTests() { domainCache.clear() }
