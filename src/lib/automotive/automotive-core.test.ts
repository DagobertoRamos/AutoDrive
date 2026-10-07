import { describe, it, expect } from 'vitest'
import { overallStatus, type OperationDimensions } from './status-core'
import { canAdvance, nextStage, stageTimeline } from './transfer-core'
import { resolveCapabilities, normalizeOpsConfig, operationRequirements, DEFAULT_OPS_CONFIG } from './capabilities'
import { evaluateSaleReadiness, type ReadinessFacts } from './readiness-core'
import { planExternalCall, stateFromError, ProviderError, attemptKey, redact } from './external-core'
import { parseNfeXml, checkNfeForOperation, isValidAccessKey, parseCancelEvent } from './nfe-xml-core'
import { translateProviderError } from './errors-core'
import { stockIndicators, classify } from './reconcile-core'

const base: OperationDimensions = {
  kind: 'SALE', commercialStatus: 'SOLD', financialStatus: 'PAID', fiscalStatus: 'AUTHORIZED', renaveStatus: 'EXIT_CONFIRMED',
  transferStatus: 'CRLV_ISSUED', inspectionStatus: 'NOT_REQUIRED', restrictionStatus: 'CLEAR', documentStatus: 'COMPLETE', financingStatus: 'NOT_APPLICABLE',
}

describe('overallStatus', () => {
  it('venda completa = concluída', () => {
    expect(overallStatus(base)).toMatchObject({ label: 'CONCLUÍDO', tone: 'ok' })
  })
  it('mostra só a etapa atual da transferência', () => {
    const s = overallStatus({ ...base, transferStatus: 'SELLER_SIGNED' })
    expect(s.message).toBe('Aguardando assinatura do comprador.')
    expect(s.nextAction?.key).toBe('transfer.instructions')
  })
  it('ordem: pagamento → nota → RENAVE → transferência', () => {
    expect(overallStatus({ ...base, financialStatus: 'PENDING', fiscalStatus: 'PENDING' }).message).toBe('Aguardando pagamento.')
    expect(overallStatus({ ...base, fiscalStatus: 'PENDING', renaveStatus: 'PENDING' }).message).toBe('NF-e de saída pendente.')
    expect(overallStatus({ ...base, renaveStatus: 'PENDING', transferStatus: 'PENDING' }).nextAction?.key).toBe('renave.exit')
  })
  it('timeout nunca vira erro', () => {
    expect(overallStatus({ ...base, renaveStatus: 'UNKNOWN' })).toMatchObject({ label: 'VERIFICANDO', tone: 'attention' })
  })
  it('cancelada com NF-e autorizada pede cancelamento da nota', () => {
    expect(overallStatus({ ...base, commercialStatus: 'CANCELLED' }).nextAction?.key).toBe('fiscal.cancel')
  })
  it('restrição bloqueante prevalece', () => {
    expect(overallStatus({ ...base, restrictionStatus: 'BLOCKED' }).tone).toBe('critical')
  })
  it('entrada regularizada', () => {
    const op = { ...base, kind: 'PURCHASE', commercialStatus: 'ACQUIRED', renaveStatus: 'ENTRY_CONFIRMED', transferStatus: 'NOT_APPLICABLE' }
    expect(overallStatus(op)).toMatchObject({ label: 'ESTOQUE', message: 'Regularizado.' })
    expect(overallStatus({ ...op, renaveStatus: 'PENDING' }).nextAction?.key).toBe('renave.entry')
  })
})

describe('transferência', () => {
  const rules = { inspectionRequired: true }
  it('não pula etapa nem volta', () => {
    expect(canAdvance('PENDING', 'INTENT_REGISTERED', rules).ok).toBe(true)
    expect(canAdvance('PENDING', 'ATPV_ISSUED', rules).ok).toBe(false)
    expect(canAdvance('BUYER_SIGNED', 'SELLER_SIGNED', rules).ok).toBe(false)
    expect(canAdvance('CRLV_ISSUED', 'CRLV_ISSUED', rules).ok).toBe(false)
  })
  it('pula vistoria quando a UF dispensa', () => {
    expect(nextStage('BUYER_SIGNED', { inspectionRequired: false })).toBe('FEES_PAID')
    expect(nextStage('BUYER_SIGNED', rules)).toBe('INSPECTION_DONE')
  })
  it('linha de etapas', () => {
    const t = stageTimeline('ATPV_ISSUED', rules)
    expect(t.find((s) => s.state === 'current')?.stage).toBe('SELLER_SIGNED')
  })
})

describe('capacidades e configuração', () => {
  it('camadas: padrão → global → UF → loja', () => {
    const caps = resolveCapabilities('sp', { '*': { 'renave.consignment': false }, SP: { 'renave.consignment': true } }, { 'transfer.digital': false })
    expect(caps['renave.consignment']).toBe(true)
    expect(caps['transfer.digital']).toBe(false)
    expect(resolveCapabilities('RJ', { SP: { 'renave.consignment': true } }, null)['renave.consignment']).toBe(false)
  })
  it('normaliza lixo', () => {
    const c = normalizeOpsConfig({ enforcement: { renaveEntry: 'XX' }, tracking: { renave: 'sim' } })
    expect(c.enforcement.renaveEntry).toBe('WARN')
    expect(c.tracking.renave).toBe(true)
  })
  it('consignado só exige RENAVE com a capacidade ligada', () => {
    const caps = resolveCapabilities(null, null, null)
    expect(operationRequirements('CONSIGNMENT', DEFAULT_OPS_CONFIG, caps).renave).toBe(false)
    expect(operationRequirements('SALE', DEFAULT_OPS_CONFIG, caps, { consigned: true }).renave).toBe(false)
    expect(operationRequirements('SALE', DEFAULT_OPS_CONFIG, caps).renave).toBe(true)
  })
})

describe('prontidão para venda', () => {
  const facts: ReadinessFacts = {
    stock: { canSelect: true, warning: null }, restrictions: [], renaveStock: 'IN', renaveRequired: true,
    fiscalEntry: 'AUTHORIZED', fiscalRequired: true, cautelarStatus: 'APROVADA', inspection: null, hasCrlv: true, consigned: false, consignment: null,
  }
  it('tudo ok = pronto', () => {
    expect(evaluateSaleReadiness(facts, DEFAULT_OPS_CONFIG).ready).toBe(true)
  })
  it('restrição judicial sempre bloqueia', () => {
    const r = evaluateSaleReadiness({ ...facts, restrictions: [{ kind: 'JUDICIAL', blocking: true }] }, DEFAULT_OPS_CONFIG)
    expect(r.ready).toBe(false)
    expect(r.blockers[0].label).toBe('Restrição judicial')
  })
  it('RENAVE pendente só avisa no padrão e bloqueia com BLOCK', () => {
    const f = { ...facts, renaveStock: 'NONE' as const }
    expect(evaluateSaleReadiness(f, DEFAULT_OPS_CONFIG)).toMatchObject({ ready: true })
    expect(evaluateSaleReadiness(f, DEFAULT_OPS_CONFIG).warnings[0].key).toBe('renave')
    expect(evaluateSaleReadiness(f, { enforcement: { ...DEFAULT_OPS_CONFIG.enforcement, renaveEntry: 'BLOCK' } }).ready).toBe(false)
  })
  it('laudo reprovado bloqueia', () => {
    expect(evaluateSaleReadiness({ ...facts, cautelarStatus: 'REPROVADA' }, DEFAULT_OPS_CONFIG).ready).toBe(false)
  })
})

describe('chamadas externas', () => {
  it('clique duplo devolve o existente; timeout consulta antes de repetir', () => {
    expect(planExternalCall(null)).toBe('SUBMIT')
    expect(planExternalCall({ state: 'CONFIRMED', attempts: 1 })).toBe('RETURN_EXISTING')
    expect(planExternalCall({ state: 'UNKNOWN', attempts: 1 })).toBe('CHECK_STATUS')
    expect(planExternalCall({ state: 'SUBMITTED', attempts: 1 })).toBe('CHECK_STATUS')
    expect(planExternalCall({ state: 'REJECTED', attempts: 1 })).toBe('RESUBMIT')
  })
  it('timeout = UNKNOWN; recusa = REJECTED', () => {
    expect(stateFromError(new Error('ETIMEDOUT'))).toBe('UNKNOWN')
    expect(stateFromError(new ProviderError('CPF', '999', true))).toBe('REJECTED')
  })
  it('chave por tentativa e segredos ocultos', () => {
    expect(attemptKey('RENAVE:EXIT:x', 1)).toBe('RENAVE:EXIT:x')
    expect(attemptKey('RENAVE:EXIT:x', 2)).toBe('RENAVE:EXIT:x#2')
    expect(redact({ token: 'abc', a: { password: 1, ok: 2 } })).toEqual({ token: '[oculto]', a: { password: '[oculto]', ok: 2 } })
  })
})

function withDv(k43: string): string {
  let sum = 0, w = 2
  for (let i = 42; i >= 0; i--) { sum += Number(k43[i]) * w; w = w === 9 ? 2 : w + 1 }
  const r = sum % 11
  return k43 + String(r < 2 ? 0 : 11 - r)
}

const KEY = withDv('3526101234567800019055001000001234100000123')
const nfe = (o: { tpNF?: string; emit?: string; dest?: string; chassi?: string; cStat?: string; vNF?: string } = {}) => `<?xml version="1.0"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="NFe${KEY}" versao="4.00">
<ide><mod>55</mod><serie>1</serie><nNF>1234</nNF><dhEmi>2026-10-07T09:35:00-03:00</dhEmi><tpNF>${o.tpNF ?? '1'}</tpNF></ide>
<emit><CNPJ>${o.emit ?? '12345678000190'}</CNPJ><xNome>LOJA</xNome></emit>
<dest><CPF>${o.dest ?? '11122233344'}</CPF><xNome>JOAO DA SILVA</xNome></dest>
<det nItem="1"><prod><CFOP>5102</CFOP><veicProd><chassi>${o.chassi ?? '9BWZZZ377VT004251'}</chassi></veicProd></prod></det>
<total><ICMSTot><vNF>${o.vNF ?? '100000.00'}</vNF></ICMSTot></total>
</infNFe></NFe><protNFe><infProt><chNFe>${KEY}</chNFe><dhRecbto>2026-10-07T09:35:10-03:00</dhRecbto><nProt>135260000000001</nProt><cStat>${o.cStat ?? '100'}</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe></nfeProc>`

describe('NF-e XML', () => {
  const exp = { direction: 'OUT' as const, storeDocs: ['12.345.678/0001-90'], counterpartDoc: '111.222.333-44', chassi: '9bwzzz377vt004251', amount: 100000 }
  it('lê os campos', () => {
    const n = parseNfeXml(nfe())
    expect(n).toMatchObject({ accessKey: KEY, number: '1234', series: '1', type: '1', cfop: '5102', amount: 100000, chassi: '9BWZZZ377VT004251', statusCode: '100' })
    expect(isValidAccessKey(KEY)).toBe(true)
    expect(isValidAccessKey(KEY.slice(0, 43) + ((Number(KEY[43]) + 1) % 10))).toBe(false)
  })
  it('nota certa passa', () => {
    expect(checkNfeForOperation(parseNfeXml(nfe()), exp).filter((i) => i.blocking)).toEqual([])
  })
  it('chassi de outro carro bloqueia (nunca vincular ao veículo errado)', () => {
    const issues = checkNfeForOperation(parseNfeXml(nfe({ chassi: '9BWZZZ377VT999999' })), exp)
    expect(issues.some((i) => i.field === 'chassi' && i.blocking)).toBe(true)
  })
  it('comprador diferente, emitente de fora, não autorizada, sentido errado', () => {
    expect(checkNfeForOperation(parseNfeXml(nfe({ dest: '99999999999' })), exp).some((i) => i.field === 'recipient')).toBe(true)
    expect(checkNfeForOperation(parseNfeXml(nfe({ emit: '99999999000199' })), exp).some((i) => i.field === 'issuer')).toBe(true)
    expect(checkNfeForOperation(parseNfeXml(nfe({ cStat: '204' })), exp).some((i) => i.field === 'status')).toBe(true)
    expect(checkNfeForOperation(parseNfeXml(nfe({ tpNF: '0' })), exp).some((i) => i.field === 'type')).toBe(true)
  })
  it('entrada: nota própria (PF) e nota do fornecedor (PJ)', () => {
    const own = checkNfeForOperation(parseNfeXml(nfe({ tpNF: '0' })), { ...exp, direction: 'IN' })
    expect(own.filter((i) => i.blocking)).toEqual([])
    const supplier = checkNfeForOperation(parseNfeXml(nfe({ emit: '55566677000188', tpNF: '1' }).replace('<CPF>11122233344</CPF>', '<CNPJ>12345678000190</CNPJ>')), { direction: 'IN', storeDocs: ['12345678000190'], counterpartDoc: '55566677000188' })
    expect(supplier.filter((i) => i.blocking)).toEqual([])
  })
  it('valor diferente só avisa', () => {
    const i = checkNfeForOperation(parseNfeXml(nfe({ vNF: '90000.00' })), exp)
    expect(i.find((x) => x.field === 'amount')?.blocking).toBe(false)
  })
  it('evento de cancelamento', () => {
    const ev = `<procEventoNFe><evento><infEvento><chNFe>${KEY}</chNFe><tpEvento>110111</tpEvento><detEvento><xJust>Venda desfeita pelo cliente</xJust></detEvento></infEvento></evento><retEvento><infEvento><cStat>135</cStat><chNFe>${KEY}</chNFe><nProt>1352600001</nProt></infEvento></retEvento></procEventoNFe>`
    expect(parseCancelEvent(ev)).toMatchObject({ accessKey: KEY, ok: true, reason: 'Venda desfeita pelo cliente' })
  })
})

describe('erros amigáveis', () => {
  it('traduz', () => {
    expect(translateProviderError('FISCAL', '281', null).message).toBe('Certificado digital vencido.')
    expect(translateProviderError('RENAVE', null, 'CPF do adquirente não confere').message).toBe('CPF do comprador não confere.')
    expect(translateProviderError('RENAVE', null, 'socket hang up').message).toMatch(/Estamos verificando/)
    expect(translateProviderError('RENAVE', null, 'SOAP FAULT xyz').message).toBe('Não foi possível concluir a operação no RENAVE.')
  })
})

describe('reconciliação', () => {
  const opts = { renaveTracked: true, fiscalTracked: true }
  it('indicadores', () => {
    const r = stockIndicators([
      { vehicleId: '1', stockStatus: 'DISPONIVEL', renave: 'IN', fiscalEntry: 'AUTHORIZED' },
      { vehicleId: '2', stockStatus: 'DISPONIVEL', renave: 'NONE', fiscalEntry: 'NONE' },
      { vehicleId: '3', stockStatus: 'EM_SERVICO', renave: 'OUT', fiscalEntry: 'AUTHORIZED' },
      { vehicleId: '4', stockStatus: 'VENDIDO', renave: 'IN', fiscalEntry: 'AUTHORIZED' },
      { vehicleId: '5', stockStatus: 'VENDIDO', renave: 'IN', fiscalEntry: 'AUTHORIZED', soldWithinGrace: true },
    ], opts)
    expect(r).toEqual({ total: 3, renaveOk: 1, pending: 1, divergent: 2, nfePending: 1 })
  })
  it('sem acompanhamento não gera ruído', () => {
    expect(classify({ vehicleId: '1', stockStatus: 'DISPONIVEL', renave: 'NONE', fiscalEntry: 'NONE' }, { renaveTracked: false, fiscalTracked: false })).toEqual([])
  })
})
