// =============================================================================
// Adapters fiscais por API (conta DA LOJA). Docs:
//   Focus NFe    https://doc.focusnfe.com.br        (Basic token:"", ?ref= idempotente)
//   PlugNotas    https://docs.plugnotas.com.br      (x-api-key, idIntegracao idempotente)
//   Nuvem Fiscal https://dev.nuvemfiscal.com.br     (OAuth2 client_credentials; ACBr API compatível)
// Emissão é assíncrona: emit() devolve PROCESSING; status() consulta até
// autorizar/rejeitar. Cancelamento exige justificativa ≥ 15 caracteres.
// =============================================================================

import { ProviderError } from '../external-core'
import type { NfeDraft } from '../nfe-draft'
import { basic, cachedToken, http, requireCred } from './http'
import type { FiscalProvider, ProviderContext, ProviderResult, TestResult } from './types'

type Emitted = { xml?: string; accessKey?: string; number?: string; series?: string; pdfUrl?: string; sefazCode?: string; sefazMessage?: string }

function hom(ctx: ProviderContext) { return ctx.environment === 'HOMOLOGACAO' }
function draftOf(input: { payload?: Record<string, unknown> | null }): NfeDraft {
  const d = input.payload as unknown as NfeDraft | null
  if (!d?.item) throw new ProviderError('Rascunho da nota ausente.', 'NO_DRAFT', true, false)
  return d
}
function justify(reason: string) {
  const r = reason.trim()
  if (r.length < 15) throw new ProviderError('Justificativa precisa de pelo menos 15 caracteres.', 'JUSTIFICATIVA', true, false)
  return r.slice(0, 255)
}
const pagDesc = (m: string) => (m === '99' ? 'Financiamento / outros' : undefined)

// ── Focus NFe ────────────────────────────────────────────────────────────────

function focusBase(ctx: ProviderContext) { return hom(ctx) ? 'https://homologacao.focusnfe.com.br' : 'https://api.focusnfe.com.br' }
function focusAuth(ctx: ProviderContext) { return { Authorization: basic(requireCred(ctx.credentials, 'token', 'token'), '') } }

function focusPayload(d: NfeDraft) {
  const c = d.counterpart
  const it = d.item
  const icms = it.icms.mode === 'CSOSN'
    ? { icms_situacao_tributaria: it.icms.csosn }
    : { icms_situacao_tributaria: it.icms.cst, icms_modalidade_base_calculo: 3, icms_reducao_base_calculo: it.icms.reducaoPct, icms_base_calculo: it.icms.base, icms_aliquota: it.icms.aliquota, icms_valor: it.icms.value }
  return {
    natureza_operacao: d.nature,
    data_emissao: d.issuedAt,
    tipo_documento: d.type === 'OUT' ? 1 : 0,
    local_destino: d.interstate ? 2 : 1,
    finalidade_emissao: 1,
    consumidor_final: d.finalConsumer ? 1 : 0,
    presenca_comprador: 1,
    cnpj_emitente: d.issuer.cnpj,
    ...(d.issuer.ie ? { inscricao_estadual_emitente: d.issuer.ie } : {}),
    nome_destinatario: c.name,
    ...(c.doc.length === 11 ? { cpf_destinatario: c.doc } : { cnpj_destinatario: c.doc }),
    ...(c.ie ? { inscricao_estadual_destinatario: c.ie } : {}),
    indicador_inscricao_estadual_destinatario: c.ieIndicator,
    logradouro_destinatario: c.street, numero_destinatario: c.number, complemento_destinatario: c.complement ?? undefined,
    bairro_destinatario: c.district, municipio_destinatario: c.city, ...(c.cityCode ? { codigo_municipio_destinatario: c.cityCode } : {}),
    uf_destinatario: c.uf, cep_destinatario: c.zip, telefone_destinatario: c.phone ?? undefined, email_destinatario: c.email ?? undefined,
    modalidade_frete: 9,
    informacoes_adicionais_contribuinte: d.additionalInfo || undefined,
    items: [{
      numero_item: 1, codigo_produto: it.code, descricao: it.description, cfop: it.cfop, codigo_ncm: it.ncm,
      unidade_comercial: 'UN', quantidade_comercial: 1, valor_unitario_comercial: it.amount, valor_bruto: it.amount,
      unidade_tributavel: 'UN', quantidade_tributavel: 1, valor_unitario_tributavel: it.amount,
      icms_origem: 0, ...icms,
      pis_situacao_tributaria: it.pis.cst, ...(it.pis.aliquota > 0 ? { pis_base_calculo: it.pis.base, pis_aliquota_porcentual: it.pis.aliquota, pis_valor: it.pis.value } : {}),
      cofins_situacao_tributaria: it.cofins.cst, ...(it.cofins.aliquota > 0 ? { cofins_base_calculo: it.cofins.base, cofins_aliquota_porcentual: it.cofins.aliquota, cofins_valor: it.cofins.value } : {}),
      informacoes_adicionais_item: it.extra,
    }],
    formas_pagamento: d.payments.map((p) => ({ forma_pagamento: p.method, valor_pagamento: p.amount, ...(pagDesc(p.method) ? { descricao_pagamento: pagDesc(p.method) } : {}) })),
  }
}

function focusStatus(j: any): ProviderResult<Emitted> {
  const s = String(j?.status ?? '')
  const data: Emitted = { accessKey: j?.chave_nfe ?? undefined, number: j?.numero ? String(j.numero) : undefined, series: j?.serie ? String(j.serie) : undefined, sefazCode: j?.status_sefaz ? String(j.status_sefaz) : undefined, sefazMessage: j?.mensagem_sefaz ?? undefined }
  if (s === 'autorizado') return { state: 'CONFIRMED', externalId: j?.ref ?? null, protocol: j?.protocolo ?? null, data: { ...data, xml: j?.caminho_xml_nota_fiscal, pdfUrl: j?.caminho_danfe } }
  if (s === 'cancelado') return { state: 'CANCELLED', externalId: j?.ref ?? null, data }
  if (s === 'erro_autorizacao' || s === 'denegado') return { state: 'REJECTED', errorCode: data.sefazCode ?? null, errorMessage: data.sefazMessage ?? 'Nota rejeitada pela SEFAZ.', data }
  return { state: 'PROCESSING', externalId: j?.ref ?? null, data }
}

export const focusNfe: FiscalProvider = {
  info: { id: 'FOCUS_NFE', label: 'Focus NFe', mode: 'API', webhooks: true },
  async test(ctx): Promise<TestResult> {
    try {
      await http(`${focusBase(ctx)}/v2/nfe/autodrive-teste-conexao`, { headers: focusAuth(ctx), timeoutMs: 10_000 })
      return { ok: true, message: 'Conexão estabelecida.' }
    } catch (e) {
      if (e instanceof ProviderError && e.code === '404') return { ok: true, message: 'Conexão estabelecida.' }
      if (e instanceof ProviderError && (e.code === '401' || e.code === '403' || /permiss|autoriz|token/i.test(e.message))) return { ok: false, message: 'Token recusado pela Focus NFe.' }
      return { ok: false, message: 'Não foi possível alcançar a Focus NFe.' }
    }
  },
  async emit(ctx, input) {
    const d = draftOf(input)
    const r = await http(`${focusBase(ctx)}/v2/nfe?ref=${encodeURIComponent(input.reference)}`, { method: 'POST', body: focusPayload(d), headers: focusAuth(ctx) })
    const st = focusStatus({ ...r.json, ref: input.reference })
    return st.state === 'REJECTED' ? st : { ...st, state: st.state === 'CONFIRMED' ? 'CONFIRMED' : 'PROCESSING', externalId: input.reference }
  },
  async status(ctx, reference) {
    const r = await http(`${focusBase(ctx)}/v2/nfe/${encodeURIComponent(reference)}?completa=0`, { headers: focusAuth(ctx) })
    const st = focusStatus({ ...r.json, ref: reference })
    if (st.state === 'CONFIRMED' && st.data?.xml) {
      const x = await http(`${focusBase(ctx)}${st.data.xml}`, { headers: focusAuth(ctx), raw: true }).catch(() => null)
      if (x?.text) st.data.xml = x.text
    }
    return st
  },
  async cancel(ctx, reference, reason) {
    const r = await http(`${focusBase(ctx)}/v2/nfe/${encodeURIComponent(reference)}`, { method: 'DELETE', body: { justificativa: justify(reason) }, headers: focusAuth(ctx) })
    const s = String(r.json?.status ?? '')
    if (s === 'cancelado') return { state: 'CANCELLED', externalId: reference, protocol: r.json?.protocolo ?? null }
    return { state: 'REJECTED', errorCode: r.json?.status_sefaz ?? null, errorMessage: r.json?.mensagem_sefaz ?? 'Cancelamento recusado.' }
  },
  async correct(ctx, reference, text) {
    const t = text.trim()
    if (t.length < 15) throw new ProviderError('A correção precisa de pelo menos 15 caracteres.', 'CCE', true, false)
    const r = await http(`${focusBase(ctx)}/v2/nfe/${encodeURIComponent(reference)}/carta_correcao`, { method: 'POST', body: { correcao: t.slice(0, 1000) }, headers: focusAuth(ctx) })
    return String(r.json?.status ?? '') === 'autorizado' ? { state: 'CONFIRMED', protocol: r.json?.protocolo ?? null } : { state: 'REJECTED', errorMessage: r.json?.mensagem_sefaz ?? 'Carta de correção recusada.' }
  },
  async downloadXml(ctx, reference) { return (await focusNfe.status(ctx, reference))?.data?.xml as string | undefined ?? null },
  async downloadPdf(ctx, reference) {
    const st = await focusNfe.status(ctx, reference)
    const p = (st?.data as Emitted | undefined)?.pdfUrl
    return p ? { url: `${focusBase(ctx)}${p}` } : null
  },
  async events() { return null },
}

// ── PlugNotas ───────────────────────────────────────────────────────────────

function plugBase(ctx: ProviderContext) { return hom(ctx) ? 'https://api.sandbox.plugnotas.com.br' : 'https://api.plugnotas.com.br' }
function plugAuth(ctx: ProviderContext) { return { 'x-api-key': requireCred(ctx.credentials, 'apiKey', 'x-api-key') } }

function plugPayload(d: NfeDraft) {
  const c = d.counterpart
  const it = d.item
  const icms = it.icms.mode === 'CSOSN'
    ? { origem: '0', cst: it.icms.csosn }
    : { origem: '0', cst: it.icms.cst, baseCalculo: { modalidadeDeterminacao: 3, valor: it.icms.base }, percentualReducao: it.icms.reducaoPct, aliquota: it.icms.aliquota, valor: it.icms.value }
  return [{
    idIntegracao: d.reference,
    natureza: d.nature,
    tipo: d.type === 'OUT' ? 1 : 0,
    presencial: true,
    consumidorFinal: d.finalConsumer,
    emitente: { cpfCnpj: d.issuer.cnpj },
    destinatario: {
      cpfCnpj: c.doc, razaoSocial: c.name, email: c.email ?? undefined, ...(c.ie ? { inscricaoEstadual: c.ie } : {}), indicadorInscricaoEstadual: c.ieIndicator,
      endereco: { logradouro: c.street, numero: c.number, complemento: c.complement ?? undefined, bairro: c.district, codigoCidade: c.cityCode ?? undefined, descricaoCidade: c.city, estado: c.uf, cep: c.zip },
    },
    itens: [{
      codigo: it.code, descricao: it.description, ncm: it.ncm, cfop: it.cfop,
      valorUnitario: { comercial: it.amount, tributavel: it.amount }, valor: it.amount,
      quantidade: { comercial: 1, tributavel: 1 }, unidade: { comercial: 'UN', tributavel: 'UN' },
      informacoesAdicionais: it.extra,
      tributos: {
        icms,
        pis: { cst: it.pis.cst, ...(it.pis.aliquota > 0 ? { baseCalculo: { valor: it.pis.base }, aliquota: it.pis.aliquota, valor: it.pis.value } : {}) },
        cofins: { cst: it.cofins.cst, ...(it.cofins.aliquota > 0 ? { baseCalculo: { valor: it.cofins.base }, aliquota: it.cofins.aliquota, valor: it.cofins.value } : {}) },
      },
    }],
    pagamentos: d.payments.map((p) => ({ aVista: true, meio: p.method, valor: p.amount, ...(pagDesc(p.method) ? { descricaoMeio: pagDesc(p.method) } : {}) })),
    responsavelTecnico: undefined,
    informacoesComplementares: d.additionalInfo || undefined,
  }]
}

function plugStatus(row: any): ProviderResult<Emitted> {
  const s = String(row?.situacao ?? row?.status ?? '').toUpperCase()
  const data: Emitted = { accessKey: row?.chave ?? undefined, number: row?.numero ? String(row.numero) : undefined, series: row?.serie ? String(row.serie) : undefined, sefazMessage: row?.mensagem ?? undefined }
  if (s === 'CONCLUIDO' || s === 'AUTORIZADO' || s === 'AUTORIZADA') return { state: 'CONFIRMED', externalId: row?.id ?? null, protocol: row?.protocolo ?? null, data }
  if (s === 'CANCELADO' || s === 'CANCELADA') return { state: 'CANCELLED', externalId: row?.id ?? null, data }
  if (s === 'REJEITADO' || s === 'REJEITADA' || s === 'DENEGADO') return { state: 'REJECTED', errorMessage: row?.mensagem ?? 'Nota rejeitada pela SEFAZ.', data }
  return { state: 'PROCESSING', externalId: row?.id ?? null, data }
}

export const plugNotas: FiscalProvider = {
  info: { id: 'PLUGNOTAS', label: 'PlugNotas', mode: 'API', webhooks: true },
  async test(ctx) {
    try {
      await http(`${plugBase(ctx)}/nfe/autodrive-teste/resumo`, { headers: plugAuth(ctx), timeoutMs: 10_000 })
      return { ok: true, message: 'Conexão estabelecida.' }
    } catch (e) {
      if (e instanceof ProviderError && (e.code === '404' || e.code === '400')) return { ok: true, message: 'Conexão estabelecida.' }
      if (e instanceof ProviderError && (e.code === '401' || e.code === '403')) return { ok: false, message: 'Chave recusada pelo PlugNotas.' }
      return { ok: false, message: 'Não foi possível alcançar o PlugNotas.' }
    }
  },
  async emit(ctx, input) {
    const r = await http(`${plugBase(ctx)}/nfe`, { method: 'POST', body: plugPayload(draftOf(input)), headers: plugAuth(ctx) })
    const id = r.json?.documents?.[0]?.id ?? null
    return { state: 'PROCESSING', externalId: id ?? input.reference, protocol: r.json?.protocol ?? null }
  },
  async status(ctx, reference) {
    const r = await http(`${plugBase(ctx)}/nfe/${encodeURIComponent(reference)}/resumo`, { headers: plugAuth(ctx) })
    const st = plugStatus(Array.isArray(r.json) ? r.json[0] : r.json)
    if (st.state === 'CONFIRMED') {
      const x = await http(`${plugBase(ctx)}/nfe/${encodeURIComponent(reference)}/xml`, { headers: plugAuth(ctx), raw: true }).catch(() => null)
      if (x?.text) st.data = { ...(st.data ?? {}), xml: x.text }
    }
    return st
  },
  async cancel(ctx, reference, reason) {
    await http(`${plugBase(ctx)}/nfe/${encodeURIComponent(reference)}/cancelamento`, { method: 'POST', body: { justificativa: justify(reason) }, headers: plugAuth(ctx) })
    const s = await http(`${plugBase(ctx)}/nfe/${encodeURIComponent(reference)}/cancelamento/status`, { headers: plugAuth(ctx) }).catch(() => null)
    const sit = String(s?.json?.situacao ?? s?.json?.status ?? '').toUpperCase()
    return sit.startsWith('CANCEL') || sit === 'CONCLUIDO' ? { state: 'CANCELLED', externalId: reference } : { state: 'PROCESSING', externalId: reference }
  },
  async correct(ctx, reference, text) {
    if (text.trim().length < 15) throw new ProviderError('A correção precisa de pelo menos 15 caracteres.', 'CCE', true, false)
    await http(`${plugBase(ctx)}/nfe/${encodeURIComponent(reference)}/cce`, { method: 'POST', body: { correcao: text.trim().slice(0, 1000) }, headers: plugAuth(ctx) })
    return { state: 'PROCESSING', externalId: reference }
  },
  async downloadXml(ctx, reference) { const x = await http(`${plugBase(ctx)}/nfe/${encodeURIComponent(reference)}/xml`, { headers: plugAuth(ctx), raw: true }).catch(() => null); return x?.text ?? null },
  async downloadPdf(ctx, reference) { return { url: `${plugBase(ctx)}/nfe/${encodeURIComponent(reference)}/pdf` } },
  async events() { return null },
}

// ── Nuvem Fiscal / ACBr API ─────────────────────────────────────────────────

function nuvemLike(id: 'NUVEM_FISCAL' | 'ACBR_API', label: string, urls: { prod: string; hom: string; auth: string }): FiscalProvider {
  const base = (ctx: ProviderContext) => (hom(ctx) ? urls.hom : urls.prod)
  const token = (ctx: ProviderContext) => cachedToken(`${id}:${ctx.connectionId ?? ctx.tenantId}`, async () => {
    const r = await http(urls.auth, { form: { grant_type: 'client_credentials', client_id: requireCred(ctx.credentials, 'clientId', 'Client ID'), client_secret: requireCred(ctx.credentials, 'clientSecret', 'Client Secret'), scope: 'empresa nfe nfse' } })
    return { token: String(r.json?.access_token ?? ''), expiresIn: Number(r.json?.expires_in ?? 3600) }
  })
  const auth = async (ctx: ProviderContext) => ({ Authorization: `Bearer ${await token(ctx)}` })
  const toInf = (d: NfeDraft) => {
    const c = d.counterpart, it = d.item
    const ICMS = it.icms.mode === 'CSOSN'
      ? { ICMSSN102: { orig: 0, CSOSN: it.icms.csosn } }
      : it.icms.cst === '20'
        ? { ICMS20: { orig: 0, CST: '20', modBC: 3, pRedBC: it.icms.reducaoPct, vBC: it.icms.base, pICMS: it.icms.aliquota, vICMS: it.icms.value } }
        : { ICMS90: { orig: 0, CST: it.icms.cst } }
    const pc = (t: NfeDraft['item']['pis'], k: 'PIS' | 'COFINS') => t.aliquota > 0
      ? { [`${k}Aliq`]: { CST: t.cst, vBC: t.base, [`p${k}`]: t.aliquota, [`v${k}`]: t.value } }
      : { [`${k}Outr`]: { CST: t.cst, vBC: 0, [`p${k}`]: 0, [`v${k}`]: 0 } }
    return {
      versao: '4.00',
      ide: { natOp: d.nature, mod: 55, tpNF: d.type === 'OUT' ? 1 : 0, idDest: d.interstate ? 2 : 1, finNFe: 1, indFinal: d.finalConsumer ? 1 : 0, indPres: 1, dhEmi: d.issuedAt },
      emit: { CNPJ: d.issuer.cnpj, ...(d.issuer.ie ? { IE: d.issuer.ie } : {}), CRT: d.issuer.crt },
      dest: {
        ...(c.doc.length === 11 ? { CPF: c.doc } : { CNPJ: c.doc }), xNome: c.name, indIEDest: c.ieIndicator, ...(c.ie ? { IE: c.ie } : {}), ...(c.email ? { email: c.email } : {}),
        enderDest: { xLgr: c.street, nro: c.number, ...(c.complement ? { xCpl: c.complement } : {}), xBairro: c.district, cMun: c.cityCode, xMun: c.city, UF: c.uf, CEP: c.zip, cPais: 1058, xPais: 'BRASIL', ...(c.phone ? { fone: c.phone.replace(/\D/g, '') } : {}) },
      },
      det: [{ nItem: 1, prod: { cProd: it.code, cEAN: 'SEM GTIN', xProd: it.description, NCM: it.ncm, CFOP: it.cfop, uCom: 'UN', qCom: 1, vUnCom: it.amount, vProd: it.amount, cEANTrib: 'SEM GTIN', uTrib: 'UN', qTrib: 1, vUnTrib: it.amount, indTot: 1 }, imposto: { ICMS, PIS: pc(it.pis, 'PIS'), COFINS: pc(it.cofins, 'COFINS') }, infAdProd: it.extra }],
      transp: { modFrete: 9 },
      pag: { detPag: d.payments.map((p) => ({ tPag: p.method, vPag: p.amount, ...(pagDesc(p.method) ? { xPag: pagDesc(p.method) } : {}) })) },
      ...(d.additionalInfo ? { infAdic: { infCpl: d.additionalInfo } } : {}),
    }
  }
  const toStatus = (j: any): ProviderResult<Emitted> => {
    const s = String(j?.status ?? '').toLowerCase()
    const data: Emitted = { accessKey: j?.chave ?? undefined, number: j?.numero ? String(j.numero) : undefined, series: j?.serie ? String(j.serie) : undefined, sefazCode: j?.autorizacao?.codigo_status ? String(j.autorizacao.codigo_status) : undefined, sefazMessage: j?.autorizacao?.motivo_status ?? undefined }
    if (s === 'autorizado') return { state: 'CONFIRMED', externalId: j?.id ?? null, protocol: j?.autorizacao?.numero_protocolo ?? null, data }
    if (s === 'cancelado') return { state: 'CANCELLED', externalId: j?.id ?? null, data }
    if (s === 'rejeitado' || s === 'denegado' || s === 'erro') return { state: 'REJECTED', errorCode: data.sefazCode ?? null, errorMessage: data.sefazMessage ?? 'Nota rejeitada pela SEFAZ.', data }
    return { state: 'PROCESSING', externalId: j?.id ?? null, data }
  }
  const provider: FiscalProvider = {
    info: { id, label, mode: 'API', webhooks: false },
    async test(ctx) {
      try { await token(ctx); return { ok: true, message: 'Conexão estabelecida.' } }
      catch (e) { return { ok: false, message: e instanceof ProviderError && e.rejected ? 'Client ID ou Client Secret recusados.' : `Não foi possível alcançar ${label}.` } }
    },
    async emit(ctx, input) {
      const r = await http(`${base(ctx)}/nfe`, { method: 'POST', headers: await auth(ctx), body: { ambiente: hom(ctx) ? 'homologacao' : 'producao', referencia: input.reference.slice(0, 50), infNFe: toInf(draftOf(input)) } })
      const st = toStatus(r.json)
      return st.state === 'PROCESSING' || st.state === 'CONFIRMED' ? { ...st, state: 'PROCESSING', externalId: r.json?.id ?? null } : st
    },
    async status(ctx, ref) {
      const r = await http(`${base(ctx)}/nfe/${encodeURIComponent(ref)}`, { headers: await auth(ctx) })
      const st = toStatus(r.json)
      if (st.state === 'CONFIRMED') {
        const x = await http(`${base(ctx)}/nfe/${encodeURIComponent(ref)}/xml`, { headers: await auth(ctx), raw: true }).catch(() => null)
        if (x?.text) st.data = { ...(st.data ?? {}), xml: x.text }
      }
      return st
    },
    async cancel(ctx, ref, reason) {
      const r = await http(`${base(ctx)}/nfe/${encodeURIComponent(ref)}/cancelamento`, { method: 'POST', headers: await auth(ctx), body: { justificativa: justify(reason) } })
      const s = String(r.json?.status ?? '').toLowerCase()
      return s === 'registrado' || s === 'cancelado' || s === 'autorizado' ? { state: 'CANCELLED', externalId: ref, protocol: r.json?.numero_protocolo ?? null } : s === 'pendente' ? { state: 'PROCESSING', externalId: ref } : { state: 'REJECTED', errorMessage: r.json?.motivo_status ?? 'Cancelamento recusado.' }
    },
    async correct(ctx, ref, text) {
      if (text.trim().length < 15) throw new ProviderError('A correção precisa de pelo menos 15 caracteres.', 'CCE', true, false)
      const r = await http(`${base(ctx)}/nfe/${encodeURIComponent(ref)}/carta-correcao`, { method: 'POST', headers: await auth(ctx), body: { correcao: text.trim().slice(0, 1000) } })
      return String(r.json?.status ?? '').toLowerCase() === 'registrado' ? { state: 'CONFIRMED' } : { state: 'PROCESSING' }
    },
    async downloadXml(ctx, ref) { const x = await http(`${base(ctx)}/nfe/${encodeURIComponent(ref)}/xml`, { headers: await auth(ctx), raw: true }).catch(() => null); return x?.text ?? null },
    async downloadPdf(ctx, ref) { return { url: `${base(ctx)}/nfe/${encodeURIComponent(ref)}/pdf` } },
    async events() { return null },
  }
  return provider
}

export const nuvemFiscal = nuvemLike('NUVEM_FISCAL', 'Nuvem Fiscal', { prod: 'https://api.nuvemfiscal.com.br', hom: 'https://api.sandbox.nuvemfiscal.com.br', auth: 'https://auth.nuvemfiscal.com.br/oauth/token' })
export const acbrApi = nuvemLike('ACBR_API', 'ACBr API', { prod: 'https://prod.acbr.api.br', hom: 'https://hom.acbr.api.br', auth: 'https://auth.acbr.api.br/oauth/token' })
