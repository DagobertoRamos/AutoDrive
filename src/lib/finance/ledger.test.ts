import { describe, expect, it } from 'vitest'
import {
  addMonths, balanceAsOf, balancesByAccount, buildCashflow, dropInternalTransfers, dueSummary, listBuckets,
  makeScope, monthEnd, projectDailyBalance, runningBalance, spYmd, toCsv, type LedgerAccount, type LedgerEntry,
} from './ledger'

const D = (ymd: string) => new Date(`${ymd}T12:00:00Z`)
const acc = (id: string, opening: number, openingDate: string | null = null, extra: Partial<LedgerAccount> = {}): LedgerAccount => ({
  id, name: id, openingBalance: opening, openingDate: openingDate ? D(openingDate) : null, includeInTotal: true, active: true, ...extra,
})
let n = 0
const ent = (p: Partial<LedgerEntry> & Pick<LedgerEntry, 'type' | 'amount'>): LedgerEntry => ({
  id: `e${++n}`, status: p.type === 'RECEITA' ? 'RECEBIDO' : 'PAGO', paidDate: null, dueDate: null, accountId: null, transferGroupId: null, ...p,
})

describe('datas em SP', () => {
  it('meia-noite UTC ainda é o dia anterior em SP', () => {
    expect(spYmd(new Date('2026-10-01T02:00:00Z'))).toBe('2026-09-30')
    expect(spYmd(new Date('2026-10-01T12:00:00Z'))).toBe('2026-10-01')
    expect(spYmd(null)).toBeNull()
  })
  it('meses', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(monthEnd('2028-02')).toBe('2028-02-29')
  })
})

describe('saldo de conta', () => {
  const accounts = [acc('a', 1000, '2026-10-01'), acc('b', 500), acc('c', 99, null, { includeInTotal: false })]
  const entries = [
    ent({ type: 'RECEITA', amount: 200, paidDate: D('2026-10-05'), accountId: 'a' }),
    ent({ type: 'DESPESA', amount: 50, paidDate: D('2026-09-20'), accountId: 'a' }), // antes do saldo inicial: ignora
    ent({ type: 'DESPESA', amount: 100, paidDate: D('2026-10-03'), accountId: 'b' }),
    ent({ type: 'DESPESA', amount: 30, status: 'PREVISTO', dueDate: D('2026-10-04'), accountId: 'b' }), // previsto não conta
    ent({ type: 'RECEITA', amount: 10, paidDate: D('2026-10-02') }), // sem conta
    ent({ type: 'RECEITA', amount: 7, paidDate: D('2026-10-02'), accountId: 'c' }),
  ]
  it('conta isolada', () => {
    expect(balanceAsOf(entries, makeScope(accounts, 'a'), null)).toBe(1200)
    expect(balanceAsOf(entries, makeScope(accounts, 'b'), null)).toBe(400)
    expect(balanceAsOf(entries, makeScope(accounts, 'c'), null)).toBe(106)
  })
  it('consolidado inclui "Sem conta" e exclui conta fora do total', () => {
    expect(balanceAsOf(entries, makeScope(accounts, 'all'), null)).toBe(1610)
  })
  it('saldo inicial só vale a partir da data dele', () => {
    expect(balanceAsOf(entries, makeScope(accounts, 'a'), '2026-09-30')).toBe(0)
    expect(balanceAsOf(entries, makeScope(accounts, 'a'), '2026-10-04')).toBe(1000)
  })
  it('saldos por conta + sem conta', () => {
    const r = balancesByAccount(entries, accounts)
    expect(r.byAccount.get('b')).toBe(400)
    expect(r.noAccount).toBe(10)
  })
  it('conta inexistente cai em "Sem conta"', () => {
    const e = [ent({ type: 'RECEITA', amount: 5, paidDate: D('2026-10-02'), accountId: 'apagada' })]
    expect(balanceAsOf(e, makeScope(accounts, 'all'), null)).toBe(1505)
  })
})

describe('transferências e extrato', () => {
  it('remove só transferências internas ao escopo', () => {
    const items = [
      { g: 't1', v: -100 }, { g: 't1', v: 100 },
      { g: 't2', v: -50 }, // outra perna fora do escopo
      { g: null, v: 10 },
    ]
    expect(dropInternalTransfers(items, (i) => i.g, (i) => i.v)).toEqual([{ g: 't2', v: -50 }, { g: null, v: 10 }])
  })
  it('saldo corrente e totais', () => {
    const r = runningBalance(100, [{ amount: 50 }, { amount: -30.1 }, { amount: -20 }])
    expect(r.lines.map((l) => l.balance)).toEqual([150, 119.9, 99.9])
    expect(r.closing).toBe(99.9)
    expect(r.totalIn).toBe(50)
    expect(r.totalOut).toBe(50.1)
  })
  it('csv com separador ; e aspas', () => {
    expect(toCsv([['a;b', 1.5, null]])).toBe('"a;b";1,50;')
  })
})

describe('projeções', () => {
  it('saldo diário com vencidos no dia 0', () => {
    const p = projectDailyBalance(1000, '2026-10-06', 3, [
      { ymd: '2026-10-01', amount: -200 }, // vencido
      { ymd: '2026-10-07', amount: 300 },
      { ymd: '2026-10-09', amount: -100 },
      { ymd: '2026-12-01', amount: 999 }, // fora da janela
    ])
    expect(p.map((x) => x.balance)).toEqual([800, 1100, 1100, 1000])
    expect(p[0].saidas).toBe(200)
  })
  it('janelas de vencimento', () => {
    const s = dueSummary([
      { ymd: '2026-10-01', amount: 10 }, { ymd: '2026-10-06', amount: 20 },
      { ymd: '2026-10-12', amount: 30 }, { ymd: '2026-10-13', amount: 40 }, { ymd: '2026-11-10', amount: 50 },
    ], '2026-10-06')
    expect(s.overdue).toEqual({ count: 1, total: 10 })
    expect(s.today).toEqual({ count: 1, total: 20 })
    expect(s.next7).toEqual({ count: 2, total: 50 })
    expect(s.next30).toEqual({ count: 3, total: 90 })
  })
})

describe('fluxo de caixa', () => {
  it('buckets mensais respeitam o período', () => {
    expect(listBuckets('2026-09-15', '2026-11-10', 'month').map((b) => [b.key, b.start, b.end])).toEqual([
      ['2026-09', '2026-09-15', '2026-09-30'], ['2026-10', '2026-10-01', '2026-10-31'], ['2026-11', '2026-11-01', '2026-11-10'],
    ])
  })
  it('realizado no passado, ancora no saldo atual e projeta o futuro', () => {
    const b = buildCashflow({
      from: '2026-10-04', to: '2026-10-08', today: '2026-10-06', granularity: 'day', startBalance: 1000, currentBalance: 1150,
      items: [
        { ymd: '2026-10-04', amount: 100, realized: true },
        { ymd: '2026-10-05', amount: -50, realized: true },
        { ymd: '2026-10-06', amount: 100, realized: true }, // já no saldo atual
        { ymd: '2026-10-06', amount: -30, realized: false }, // previsto de hoje
        { ymd: '2026-10-08', amount: 200, realized: false },
      ],
    })
    expect(b.map((x) => x.kind)).toEqual(['realized', 'realized', 'mixed', 'projected', 'projected'])
    expect(b.map((x) => x.acumulado)).toEqual([1100, 1050, 1120, 1120, 1320])
    expect(b[2].entradas).toBe(100)
    expect(b[2].saidas).toBe(30)
  })
  it('sem âncora (filtro de centro de custo) acumula do zero', () => {
    const b = buildCashflow({
      from: '2026-09-01', to: '2026-11-30', today: '2026-10-06', granularity: 'month', startBalance: 0, currentBalance: null,
      items: [{ ymd: '2026-09-10', amount: -10, realized: true }, { ymd: '2026-10-20', amount: 50, realized: false }, { ymd: '2026-11-02', amount: -5, realized: false }],
    })
    expect(b.map((x) => x.acumulado)).toEqual([-10, 40, 35])
    expect(b.map((x) => x.kind)).toEqual(['realized', 'mixed', 'projected'])
  })
})
