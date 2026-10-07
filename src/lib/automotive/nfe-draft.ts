// =============================================================================
// Rascunho NEUTRO da NF-e de veículo usado (puro). Cada adapter fiscal traduz
// este rascunho para o formato do seu provedor. Para usado, o grupo veicProd
// (veículo novo) NÃO é usado: chassi, RENAVAM e placa vão em infAdProd.
// =============================================================================

import { cfopFor, icmsReductionOn, type FiscalOperation, type FiscalRules } from './fiscal-rules'

export interface Party {
  name: string
  doc: string // CPF ou CNPJ, só dígitos
  ie?: string | null
  street?: string | null; number?: string | null; complement?: string | null; district?: string | null
  city?: string | null; cityCode?: string | null; uf?: string | null; zip?: string | null
  phone?: string | null; email?: string | null
}

export interface NfeDraft {
  reference: string
  operation: FiscalOperation
  nature: string
  type: 'IN' | 'OUT'
  issuedAt: string
  interstate: boolean
  finalConsumer: boolean
  issuer: { cnpj: string; ie?: string | null; crt: 1 | 2 | 3; uf: string | null }
  counterpart: Party & { ieIndicator: 1 | 2 | 9 }
  item: {
    code: string; description: string; ncm: string; cfop: string; amount: number
    icms: { mode: 'CST'; cst: string; reducaoPct: number; base: number; aliquota: number; value: number } | { mode: 'CSOSN'; csosn: string }
    pis: { cst: string; base: number; aliquota: number; value: number }
    cofins: { cst: string; base: number; aliquota: number; value: number }
    extra: string
  }
  payments: { method: string; amount: number }[]
  additionalInfo: string
}

export interface DraftInput {
  reference: string
  operation: FiscalOperation
  rules: FiscalRules
  issuer: { cnpj: string; ie?: string | null; uf: string | null }
  counterpart: Party
  vehicle: { brand?: string | null; model?: string | null; version?: string | null; year?: number | null; modelYear?: number | null; color?: string | null; plate?: string | null; chassi?: string | null; renavam?: string | null; km?: number | null }
  amount: number
  /** Custo de aquisição (PIS/COFINS por equiparação à consignação). */
  cost?: number | null
  payments?: { method: string; amount: number }[]
  now?: Date
}

const r2 = (n: number) => Math.round(n * 100) / 100
const digits = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '')

/** Campos que faltam para emitir (mensagens de tela). */
export function missingForDraft(i: DraftInput): string[] {
  const m: string[] = []
  if (!i.rules.ncmDefault) m.push('NCM padrão nas regras fiscais')
  if (digits(i.issuer.cnpj).length !== 14) m.push('CNPJ da loja')
  const c = i.counterpart
  if (!c.name) m.push('Nome do cliente')
  if (![11, 14].includes(digits(c.doc).length)) m.push('CPF/CNPJ do cliente')
  if (!c.street) m.push('Endereço do cliente')
  if (!c.number) m.push('Número do endereço')
  if (!c.district) m.push('Bairro')
  if (!c.city || !c.uf) m.push('Cidade/UF do cliente')
  if (digits(c.zip).length !== 8) m.push('CEP do cliente')
  if (!i.vehicle.chassi) m.push('Chassi do veículo')
  if (!(i.amount > 0)) m.push('Valor da operação')
  return m
}

const OUT_OPS = new Set<FiscalOperation>(['SALE', 'CONSIGNED_SALE', 'CONSIGNMENT_RETURN', 'TRANSFER_OUT'])

export function buildNfeDraft(i: DraftInput): NfeDraft {
  const now = i.now ?? new Date()
  const rules = i.rules
  const interstate = !!i.issuer.uf && !!i.counterpart.uf && i.issuer.uf.toUpperCase() !== i.counterpart.uf.toUpperCase()
  const cfop = cfopFor(rules, i.operation, interstate)
  const out = OUT_OPS.has(i.operation)
  const amount = r2(i.amount)
  const v = i.vehicle
  const desc = [v.brand, v.model, v.version].filter(Boolean).join(' ').toUpperCase().slice(0, 100) || 'VEÍCULO USADO'
  const extra = [
    'VEÍCULO USADO',
    v.chassi ? `CHASSI ${v.chassi}` : null,
    v.renavam ? `RENAVAM ${v.renavam}` : null,
    v.plate ? `PLACA ${v.plate}` : null,
    v.year || v.modelYear ? `ANO ${v.year ?? '-'}/${v.modelYear ?? '-'}` : null,
    v.color ? `COR ${v.color.toUpperCase()}` : null,
    v.km != null ? `KM ${v.km}` : null,
  ].filter(Boolean).join(' · ').slice(0, 500)

  // ICMS só na saída do estoque próprio/consignado; entrada fica sem destaque.
  let icms: NfeDraft['item']['icms']
  if (rules.regime === 'SIMPLES') icms = { mode: 'CSOSN', csosn: rules.icms.csosn }
  else {
    const { reducaoPct } = icmsReductionOn(rules, now)
    const taxed = out && i.operation !== 'TRANSFER_OUT' && i.operation !== 'CONSIGNMENT_RETURN'
    const base = taxed ? r2(amount * (1 - reducaoPct / 100)) : 0
    icms = { mode: 'CST', cst: taxed ? rules.icms.cst : '90', reducaoPct: taxed ? reducaoPct : 0, base, aliquota: taxed ? rules.icms.aliquota : 0, value: taxed ? r2(base * rules.icms.aliquota / 100) : 0 }
  }

  // PIS/COFINS: na venda, com equiparação à consignação a base é a margem.
  const saleLike = i.operation === 'SALE' || i.operation === 'CONSIGNED_SALE'
  const pcBase = !saleLike ? 0 : rules.pisCofins.equiparacaoConsignacao ? Math.max(0, r2(amount - (i.cost ?? 0))) : amount
  const tax = (cst: string, aliquota: number) => ({ cst, base: aliquota > 0 ? pcBase : 0, aliquota: saleLike ? aliquota : 0, value: saleLike ? r2(pcBase * aliquota / 100) : 0 })
  const nature = i.operation === 'PURCHASE' ? rules.naturezaCompra : i.operation === 'CONSIGNMENT_IN' ? rules.naturezaConsignacao : i.operation === 'TRANSFER_OUT' ? rules.naturezaTransferencia : rules.naturezaVenda

  const counterDoc = digits(i.counterpart.doc)
  return {
    reference: i.reference,
    operation: i.operation,
    nature,
    type: out ? 'OUT' : 'IN',
    issuedAt: now.toISOString(),
    interstate,
    finalConsumer: counterDoc.length === 11,
    issuer: { cnpj: digits(i.issuer.cnpj), ie: i.issuer.ie ?? null, crt: rules.crt, uf: i.issuer.uf },
    counterpart: { ...i.counterpart, doc: counterDoc, zip: digits(i.counterpart.zip), ieIndicator: counterDoc.length === 14 && i.counterpart.ie ? 1 : 9 },
    item: {
      code: (v.plate ?? v.chassi ?? 'VEICULO').replace(/\W/g, '').slice(0, 60),
      description: desc, ncm: rules.ncmDefault, cfop, amount, icms,
      pis: tax(rules.pisCofins.cstPis, rules.pisCofins.aliquotaPis),
      cofins: tax(rules.pisCofins.cstCofins, rules.pisCofins.aliquotaCofins),
      extra,
    },
    payments: out ? (i.payments?.length ? i.payments : [{ method: '90', amount }]) : [{ method: '90', amount: 0 }],
    additionalInfo: [rules.infCpl, rules.regime === 'NORMAL' && icms.mode === 'CST' && icms.reducaoPct > 0 ? `Base de cálculo do ICMS reduzida: ${rules.icms.fundamento}.` : null].filter(Boolean).join(' ').slice(0, 2000),
  }
}

/** Forma de pagamento da negociação → código tPag da NF-e. */
export function tPagOf(type: string): string {
  switch (String(type).toUpperCase()) {
    case 'DINHEIRO': return '01'
    case 'CARTAO_CREDITO': return '03'
    case 'CARTAO_DEBITO': return '04'
    case 'BOLETO': return '15'
    case 'PIX': return '17'
    case 'TRANSFERENCIA': return '18'
    case 'FINANCIAMENTO': return '99'
    default: return '99'
  }
}
