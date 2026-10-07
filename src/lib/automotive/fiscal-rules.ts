// =============================================================================
// Regras fiscais de revenda de veículos USADOS — pré-preenchidas a partir da
// legislação (pesquisa 2026-10-07). A loja/contador confirma e ajusta em
// Configurações › Operações › Regras fiscais. Puro.
// Fontes: Conv. ICM 15/81 e ICMS 33/93 (CONFAZ); RICMS/SP Anexo II art. 11
// (redução de 90% da BC até 31/12/2026, Dec. 69.268/2024); Lei 9.716/98 art. 5º
// (PIS/COFINS: equiparação à consignação); LC 116 item 10.05 (intermediação).
// =============================================================================

export type TaxRegime = 'SIMPLES' | 'NORMAL'

export interface FiscalRules {
  regime: TaxRegime
  /** Código de Regime Tributário da NF-e: 1 Simples, 2 Simples excesso, 3 Normal. */
  crt: 1 | 2 | 3
  ncmDefault: string
  cfop: {
    saleInState: string; saleOutState: string
    purchaseInState: string; purchaseOutState: string
    consignInState: string; consignOutState: string
    consignedSaleInState: string; consignedSaleOutState: string
    consignReturnInState: string; consignReturnOutState: string
    transferOut: string; transferIn: string
  }
  icms: { cst: string; csosn: string; aliquota: number; reducaoPct: number; validoAte: string | null; fundamento: string }
  pisCofins: { equiparacaoConsignacao: boolean; cstPis: string; cstCofins: string; aliquotaPis: number; aliquotaCofins: number }
  naturezaVenda: string
  naturezaCompra: string
  naturezaConsignacao: string
  naturezaTransferencia: string
  infCpl: string
  nfse: { itemLc116: string; descricao: string }
  /** Quando a loja revisou/confirmou com o contador. */
  confirmedAt: string | null
}

const CFOP_PADRAO: FiscalRules['cfop'] = {
  saleInState: '5102', saleOutState: '6102',
  purchaseInState: '1102', purchaseOutState: '2102',
  consignInState: '1917', consignOutState: '2917',
  consignedSaleInState: '5115', consignedSaleOutState: '6115',
  consignReturnInState: '5918', consignReturnOutState: '6918',
  transferOut: '5152', transferIn: '1152',
}

/** Redução da base de cálculo do ICMS por UF (veículo usado). Só SP confirmada. */
const ICMS_UF: Record<string, { aliquota: number; reducaoPct: number; validoAte: string | null; fundamento: string }> = {
  SP: { aliquota: 18, reducaoPct: 90, validoAte: '2026-12-31', fundamento: 'RICMS/SP Anexo II art. 11 (Dec. 66.391/2021 e 69.268/2024)' },
}
const ICMS_PADRAO = { aliquota: 18, reducaoPct: 80, validoAte: null, fundamento: 'Convênio ICM 15/81 — confirme o percentual da sua UF' }

export function defaultFiscalRules(uf: string | null | undefined, regime: TaxRegime = 'SIMPLES'): FiscalRules {
  const icmsUf = ICMS_UF[(uf ?? '').toUpperCase()] ?? ICMS_PADRAO
  return {
    regime, crt: regime === 'SIMPLES' ? 1 : 3,
    ncmDefault: '',
    cfop: { ...CFOP_PADRAO },
    icms: { cst: '20', csosn: '102', ...icmsUf },
    pisCofins: regime === 'SIMPLES'
      ? { equiparacaoConsignacao: false, cstPis: '49', cstCofins: '49', aliquotaPis: 0, aliquotaCofins: 0 }
      : { equiparacaoConsignacao: true, cstPis: '01', cstCofins: '01', aliquotaPis: 0.65, aliquotaCofins: 3 },
    naturezaVenda: 'Venda de veículo usado',
    naturezaCompra: 'Compra de veículo usado',
    naturezaConsignacao: 'Entrada de veículo em consignação',
    naturezaTransferencia: 'Transferência de veículo entre estabelecimentos',
    infCpl: '',
    nfse: { itemLc116: '10.05', descricao: 'Intermediação na venda de veículo' },
    confirmedAt: null,
  }
}

const str = (v: unknown, max: number, fb: string) => (typeof v === 'string' ? v.trim().slice(0, max) : fb)
const num = (v: unknown, fb: number, min = 0, max = 100) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : fb)
const cfopOk = (v: unknown, fb: string) => (typeof v === 'string' && /^\d{4}$/.test(v.replace(/\D/g, '')) ? v.replace(/\D/g, '') : fb)

export function normalizeFiscalRules(raw: unknown, uf: string | null): FiscalRules {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>
  const regime: TaxRegime = r.regime === 'NORMAL' ? 'NORMAL' : 'SIMPLES'
  const d = defaultFiscalRules(uf, regime)
  const cfop = Object.fromEntries(Object.entries(d.cfop).map(([k, v]) => [k, cfopOk(r.cfop?.[k], v)])) as FiscalRules['cfop']
  return {
    regime, crt: r.crt === 2 ? 2 : regime === 'SIMPLES' ? 1 : 3,
    ncmDefault: typeof r.ncmDefault === 'string' && /^\d{8}$/.test(r.ncmDefault.replace(/\D/g, '')) ? r.ncmDefault.replace(/\D/g, '') : '',
    cfop,
    icms: {
      cst: str(r.icms?.cst, 3, d.icms.cst), csosn: str(r.icms?.csosn, 3, d.icms.csosn),
      aliquota: num(r.icms?.aliquota, d.icms.aliquota), reducaoPct: num(r.icms?.reducaoPct, d.icms.reducaoPct),
      validoAte: typeof r.icms?.validoAte === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.icms.validoAte) ? r.icms.validoAte : r.icms?.validoAte === null ? null : d.icms.validoAte,
      fundamento: str(r.icms?.fundamento, 200, d.icms.fundamento),
    },
    pisCofins: {
      equiparacaoConsignacao: typeof r.pisCofins?.equiparacaoConsignacao === 'boolean' ? r.pisCofins.equiparacaoConsignacao : d.pisCofins.equiparacaoConsignacao,
      cstPis: str(r.pisCofins?.cstPis, 2, d.pisCofins.cstPis), cstCofins: str(r.pisCofins?.cstCofins, 2, d.pisCofins.cstCofins),
      aliquotaPis: num(r.pisCofins?.aliquotaPis, d.pisCofins.aliquotaPis), aliquotaCofins: num(r.pisCofins?.aliquotaCofins, d.pisCofins.aliquotaCofins),
    },
    naturezaVenda: str(r.naturezaVenda, 60, d.naturezaVenda) || d.naturezaVenda,
    naturezaCompra: str(r.naturezaCompra, 60, d.naturezaCompra) || d.naturezaCompra,
    naturezaConsignacao: str(r.naturezaConsignacao, 60, d.naturezaConsignacao) || d.naturezaConsignacao,
    naturezaTransferencia: str(r.naturezaTransferencia, 60, d.naturezaTransferencia) || d.naturezaTransferencia,
    infCpl: str(r.infCpl, 2000, ''),
    nfse: { itemLc116: str(r.nfse?.itemLc116, 10, d.nfse.itemLc116), descricao: str(r.nfse?.descricao, 200, d.nfse.descricao) },
    confirmedAt: typeof r.confirmedAt === 'string' ? r.confirmedAt : null,
  }
}

export type FiscalOperation = 'SALE' | 'CONSIGNED_SALE' | 'PURCHASE' | 'CONSIGNMENT_IN' | 'CONSIGNMENT_RETURN' | 'TRANSFER_OUT'

/** CFOP da operação, dentro (5/1) ou fora (6/2) do estado. */
export function cfopFor(rules: FiscalRules, op: FiscalOperation, interstate: boolean): string {
  const c = rules.cfop
  switch (op) {
    case 'SALE': return interstate ? c.saleOutState : c.saleInState
    case 'CONSIGNED_SALE': return interstate ? c.consignedSaleOutState : c.consignedSaleInState
    case 'PURCHASE': return interstate ? c.purchaseOutState : c.purchaseInState
    case 'CONSIGNMENT_IN': return interstate ? c.consignOutState : c.consignInState
    case 'CONSIGNMENT_RETURN': return interstate ? c.consignReturnOutState : c.consignReturnInState
    case 'TRANSFER_OUT': return c.transferOut
  }
}

/** Redução vigente na data (vencida = sem redução, e a tela avisa). */
export function icmsReductionOn(rules: FiscalRules, date: Date): { reducaoPct: number; expired: boolean } {
  if (rules.icms.validoAte && date > new Date(`${rules.icms.validoAte}T23:59:59-03:00`)) return { reducaoPct: 0, expired: true }
  return { reducaoPct: rules.icms.reducaoPct, expired: false }
}
