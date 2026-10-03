import { describe, expect, it } from 'vitest'
import { DEBT_FIELDS, PAYMENT_FIELDS, describeChanges, diffChildren, isLockedPayment, type DebtRow, type PaymentRow } from './children-sync-core'

const pay = (o: Partial<PaymentRow>): PaymentRow => ({
  id: 'p1', type: 'PIX', status: 'PENDENTE', value: 1000, method: null, bank: null, cardBrand: null, pixKey: null, installments: null,
  installmentValue: null, installmentIntervalDays: null, returnPct: null, vehiclePlate: null, firstDueDate: null, dueDate: '2026-10-06', notes: null, authorizationCode: null, ...o,
})

describe('edição da negociação — pagamentos e débitos por id', () => {
  it('reabrir e salvar sem mexer não altera nada', () => {
    const cur = [pay({}), pay({ id: 'p2', type: 'SINAL', status: 'CONFIRMADO', value: 500, method: 'PIX' })]
    const d = diffChildren(cur, cur.map((x) => ({ ...x, status: null })), PAYMENT_FIELDS, isLockedPayment)
    expect(d).toEqual({ create: [], update: [], remove: [], kept: [] })
  })

  it('altera só o campo mudado, inclui novo e remove o retirado', () => {
    const cur = [pay({}), pay({ id: 'p3', type: 'BOLETO', value: 200 })]
    const d = diffChildren(cur, [pay({ value: 1200 }), pay({ id: 'tmp_x', type: 'DINHEIRO', value: 50 })], PAYMENT_FIELDS, isLockedPayment)
    expect(d.update).toEqual([{ id: 'p1', data: { value: 1200 }, changes: [{ field: 'value', from: '1000', to: '1200' }] }])
    expect(d.create.map((c) => c.id)).toEqual(['tmp_x'])
    expect(d.remove).toEqual(['p3'])
    expect(describeChanges(d.update[0].changes)).toBe('valor: 1000 → 1200')
  })

  it('pagamento confirmado pelo financeiro não é alterado nem removido', () => {
    const cur = [pay({ status: 'CONFIRMADO' }), pay({ id: 'p9', status: 'CANCELADO' })]
    const d = diffChildren(cur, [pay({ value: 1, status: null })], PAYMENT_FIELDS, isLockedPayment)
    expect(d.update).toEqual([])
    expect(d.remove).toEqual([])
    expect(d.kept.sort()).toEqual(['p1', 'p9'])
  })

  it('débitos: datas comparadas pelo dia', () => {
    const debt: DebtRow = { id: 'd1', vehicleRole: 'VENDIDO', type: 'DOCUMENTACAO', description: null, value: 1490, dueDate: '2026-10-10', responsavel: 'COMPRADOR', notes: null }
    expect(diffChildren([debt], [{ ...debt, dueDate: '2026-10-10T12:00:00.000Z' }], DEBT_FIELDS).update).toEqual([])
  })
})
