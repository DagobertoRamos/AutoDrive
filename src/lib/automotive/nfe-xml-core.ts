// =============================================================================
// Leitura e conferência do XML da NF-e (puro, sem dependências).
// Garante que a nota vinculada é DESTE veículo e DESTA operação: chave válida,
// autorizada, emitente/destinatário certos, sentido certo, chassi igual.
// =============================================================================

export interface ParsedNfe {
  accessKey: string | null
  model: string | null       // 55 = NF-e, 65 = NFC-e
  number: string | null
  series: string | null
  /** 0 = entrada, 1 = saída (tpNF). */
  type: '0' | '1' | null
  issuedAt: Date | null
  cfop: string | null
  issuerDoc: string | null
  issuerName: string | null
  recipientDoc: string | null
  recipientName: string | null
  amount: number | null
  chassi: string | null
  /** cStat do protocolo: 100 = autorizada (150 fora de prazo). */
  statusCode: string | null
  statusText: string | null
  protocol: string | null
  authorizedAt: Date | null
}

function tag(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${name}>`))
  return m ? m[1].trim() : null
}
function block(xml: string, name: string): string {
  return tag(xml, name) ?? ''
}
const digits = (v: string | null) => (v ? v.replace(/\D/g, '') || null : null)
const date = (v: string | null) => {
  if (!v) return null
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d
}

export function parseNfeXml(xml: string): ParsedNfe {
  const src = String(xml ?? '').replace(/^﻿/, '')
  const inf = block(src, 'infNFe') || src
  const idAttr = src.match(/<(?:\w+:)?infNFe[^>]*\sId="NFe(\d{44})"/)
  const ide = block(inf, 'ide')
  const emit = block(inf, 'emit')
  const dest = block(inf, 'dest')
  const total = block(inf, 'ICMSTot')
  const prot = block(src, 'infProt')
  const veic = block(inf, 'veicProd')
  return {
    accessKey: idAttr?.[1] ?? digits(tag(prot, 'chNFe')),
    model: tag(ide, 'mod'),
    number: tag(ide, 'nNF'),
    series: tag(ide, 'serie'),
    type: ((t) => (t === '0' || t === '1' ? t : null))(tag(ide, 'tpNF')),
    issuedAt: date(tag(ide, 'dhEmi') ?? tag(ide, 'dEmi')),
    cfop: tag(block(inf, 'prod'), 'CFOP'),
    issuerDoc: digits(tag(emit, 'CNPJ') ?? tag(emit, 'CPF')),
    issuerName: tag(emit, 'xNome'),
    recipientDoc: digits(tag(dest, 'CNPJ') ?? tag(dest, 'CPF')),
    recipientName: tag(dest, 'xNome'),
    amount: ((v) => (v != null && v !== '' && isFinite(Number(v)) ? Number(v) : null))(tag(total, 'vNF')),
    chassi: veic ? (tag(veic, 'chassi')?.toUpperCase().replace(/\s/g, '') ?? null) : null,
    statusCode: tag(prot, 'cStat'),
    statusText: tag(prot, 'xMotivo'),
    protocol: tag(prot, 'nProt'),
    authorizedAt: date(tag(prot, 'dhRecbto')),
  }
}

/** Dígito verificador da chave de acesso (módulo 11, pesos 2..9). */
export function isValidAccessKey(key: string | null | undefined): boolean {
  if (!key || !/^\d{44}$/.test(key)) return false
  let sum = 0
  let w = 2
  for (let i = 42; i >= 0; i--) {
    sum += Number(key[i]) * w
    w = w === 9 ? 2 : w + 1
  }
  const r = sum % 11
  const dv = r < 2 ? 0 : 11 - r
  return dv === Number(key[43])
}

export interface NfeExpectation {
  /** OUT = nota de saída (venda); IN = nota de entrada (compra/troca/consignação). */
  direction: 'IN' | 'OUT'
  /** CNPJs da loja e filiais. */
  storeDocs: string[]
  /** CPF/CNPJ do comprador (venda) ou vendedor (entrada), quando conhecido. */
  counterpartDoc?: string | null
  chassi?: string | null
  amount?: number | null
}

export interface NfeIssue { field: string; message: string; blocking: boolean; code?: string }

export function checkNfeForOperation(n: ParsedNfe, exp: NfeExpectation): NfeIssue[] {
  const issues: NfeIssue[] = []
  const store = new Set(exp.storeDocs.map((d) => d.replace(/\D/g, '')).filter(Boolean))
  const counterpart = exp.counterpartDoc?.replace(/\D/g, '') || null

  if (!isValidAccessKey(n.accessKey)) issues.push({ field: 'accessKey', message: 'Chave de acesso inválida. Confira se o arquivo é o XML da NF-e.', blocking: true })
  if (n.model && n.model !== '55') issues.push({ field: 'model', message: 'O arquivo não é uma NF-e (modelo 55).', blocking: true })
  if (n.statusCode !== '100' && n.statusCode !== '150') {
    issues.push({ field: 'status', message: n.statusCode ? `Nota não autorizada pela SEFAZ (${n.statusText ?? n.statusCode}).` : 'O XML não tem o protocolo de autorização. Use o XML autorizado (procNFe).', blocking: true, code: n.statusCode ?? undefined })
  }

  const issuerIsStore = !!n.issuerDoc && store.has(n.issuerDoc)
  const recipientIsStore = !!n.recipientDoc && store.has(n.recipientDoc)
  if (exp.direction === 'OUT') {
    if (!issuerIsStore) issues.push({ field: 'issuer', message: 'A nota não foi emitida pelo CNPJ da loja.', blocking: true })
    if (n.type !== '1') issues.push({ field: 'type', message: 'A nota não é de saída.', blocking: true })
    if (counterpart && n.recipientDoc && n.recipientDoc !== counterpart) issues.push({ field: 'recipient', message: 'CPF/CNPJ do comprador não confere com a negociação.', blocking: true })
  } else if (issuerIsStore) {
    // Nota de entrada emitida pela própria loja (compra de pessoa física).
    if (n.type !== '0') issues.push({ field: 'type', message: 'Nota emitida pela loja precisa ser de entrada.', blocking: true })
    if (counterpart && n.recipientDoc && n.recipientDoc !== counterpart) issues.push({ field: 'recipient', message: 'CPF/CNPJ do vendedor não confere com a operação.', blocking: true })
  } else {
    // Nota de venda emitida pelo fornecedor (pessoa jurídica) para a loja.
    if (!recipientIsStore) issues.push({ field: 'recipient', message: 'A loja não é a destinatária desta nota.', blocking: true })
    if (counterpart && n.issuerDoc && n.issuerDoc !== counterpart) issues.push({ field: 'issuer', message: 'CNPJ do emitente não confere com o vendedor do veículo.', blocking: true })
  }

  const chassi = exp.chassi?.toUpperCase().replace(/\s/g, '') || null
  if (n.chassi && chassi && n.chassi !== chassi) issues.push({ field: 'chassi', message: 'O chassi da nota é de outro veículo.', blocking: true })
  if (!n.chassi && chassi) issues.push({ field: 'chassi', message: 'A nota não informa o chassi do veículo.', blocking: false })

  if (exp.amount && n.amount != null && Math.abs(n.amount - exp.amount) > Math.max(1, exp.amount * 0.01)) {
    issues.push({ field: 'amount', message: `Valor da nota (${fmt(n.amount)}) diferente do valor da operação (${fmt(exp.amount)}).`, blocking: false })
  }
  return issues
}

function fmt(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }

/** XML de evento de cancelamento (procEventoNFe, tpEvento 110111) homologado. */
export function parseCancelEvent(xml: string): { accessKey: string | null; ok: boolean; protocol: string | null; reason: string | null } {
  const src = String(xml ?? '')
  const isCancel = /<(?:\w+:)?tpEvento>110111</.test(src)
  const ret = block(src, 'retEvento') || block(src, 'infEvento')
  const cStat = tag(block(src, 'retEvento'), 'cStat')
  return {
    accessKey: digits(tag(ret, 'chNFe') ?? tag(src, 'chNFe')),
    ok: isCancel && (cStat === '135' || cStat === '155'),
    protocol: tag(block(src, 'retEvento'), 'nProt'),
    reason: tag(src, 'xJust'),
  }
}
