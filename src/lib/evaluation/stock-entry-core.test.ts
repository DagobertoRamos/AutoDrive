import { describe, expect, it } from 'vitest'
import {
  blockConfirmStockEntry, blockRequestStockEntry, buildEntryPendencies,
  EVAL_AWAITING_STOCK, PENDENCY_NOTES, PENDENCY_RECEIVE, PENDENCY_SERVICES,
} from './stock-entry-core'

describe('blockRequestStockEntry', () => {
  it('libera quando liberada e cliente aceitou', () => {
    expect(blockRequestStockEntry({ status: 'LIBERADA', customerDecision: 'ACEITA' })).toBeNull()
    expect(blockRequestStockEntry({ status: 'APPROVED', customerDecision: 'aceita' })).toBeNull()
  })
  it('bloqueia sem aceite, sem liberação, já no estoque ou já com o gestor', () => {
    expect(blockRequestStockEntry({ status: 'LIBERADA', customerDecision: 'PENDENTE' })).toMatch(/aceitou/)
    expect(blockRequestStockEntry({ status: 'AGUARDANDO_APROVACAO', customerDecision: 'ACEITA' })).toMatch(/liberada/)
    expect(blockRequestStockEntry({ status: 'LIBERADA', customerDecision: 'ACEITA', vehicleId: 'v1' })).toMatch(/já gerou/)
    expect(blockRequestStockEntry({ status: EVAL_AWAITING_STOCK, customerDecision: 'ACEITA' })).toMatch(/gestor/)
  })
})

describe('blockConfirmStockEntry', () => {
  it('gestor confirma a partir de AGUARDANDO_ENTRADA ou direto de LIBERADA+ACEITA', () => {
    expect(blockConfirmStockEntry({ status: EVAL_AWAITING_STOCK })).toBeNull()
    expect(blockConfirmStockEntry({ status: 'LIBERADA', customerDecision: 'ACEITA' })).toBeNull()
  })
  it('bloqueia duplicidade e proposta não aceita', () => {
    expect(blockConfirmStockEntry({ status: EVAL_AWAITING_STOCK, vehicleId: 'v1' })).toMatch(/já gerou/)
    expect(blockConfirmStockEntry({ status: 'LIBERADA', customerDecision: 'RECUSADA' })).toMatch(/não aceitou/)
    expect(blockConfirmStockEntry({ status: 'DRAFT', customerDecision: 'ACEITA' })).toMatch(/liberada/)
  })
})

describe('buildEntryPendencies', () => {
  it('cria os 4 portões: avaliação resolvida, recebimento pendente', () => {
    const p = buildEntryPendencies({ services: [] })
    expect(p.map((x) => [x.label, x.resolved])).toEqual([
      ['Avaliação', true], ['Negociação de entrada', false], ['Perícia', false], [PENDENCY_RECEIVE, false],
    ])
  })
  it('perícia pendente conta como resolvida; sem perícia não', () => {
    expect(buildEntryPendencies({ services: [], cautelarStatus: 'PENDENTE' })[2].resolved).toBe(true)
    expect(buildEntryPendencies({ services: [], cautelarStatus: 'SEM_CAUTELAR' })[2].resolved).toBe(false)
  })
  it('negociação vinculada concluída já nasce resolvida', () => {
    const n = buildEntryPendencies({ services: [], negotiationLabel: '#123', negotiationClosed: true })[1]
    expect(n.resolved).toBe(true)
    expect(n.notes).toContain('#123')
  })
  it('lista só serviços em aberto, com total, e as observações', () => {
    const p = buildEntryPendencies({
      services: [
        { description: 'Pintura para-choque', estimatedCost: 450, status: 'PREDICTED' },
        { description: 'Higienização', estimatedCost: '150.00', status: 'APPROVED' },
        { description: 'Polimento', estimatedCost: 300, status: 'DONE' },
        { description: 'Troca de pneu', estimatedCost: 800, status: 'CANCELED' },
      ],
      pendencyNotes: '  Falta 2ª chave  ',
    })
    expect(p.map((x) => x.label).slice(4)).toEqual([PENDENCY_SERVICES, PENDENCY_NOTES])
    const svc = p[4].notes ?? ''
    expect(svc).toContain('Pintura para-choque')
    expect(svc).toContain('Higienização')
    expect(svc).not.toContain('Polimento')
    expect(svc).not.toContain('Troca de pneu')
    expect(svc).toMatch(/Total previsto: R\$\s600,00/)
    expect(p[5].notes).toBe('Falta 2ª chave')
  })
})
