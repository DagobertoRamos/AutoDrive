import { describe, expect, it } from 'vitest'
import { lineFingerprint, matchScore, parseCsv, parseMoney, parseOfx, sumsMatch } from './bank-statement-core'

// Fuso do banco montado em partes: o Tailwind lê os arquivos de src e trataria
// o trecho literal como classe CSS (quebrou o build).
const TZ = ['[', '-3', ':BRT', ']'].join('')
const OFX = `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261005120000${TZ}<TRNAMT>-1500.00<FITID>ABC1<MEMO>PIX ENVIADO DESPACHANTE
</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261006<TRNAMT>60000.00<FITID>ABC2<NAME>BANCO TESTE SA<MEMO>TED FINANCIAMENTO
</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`

describe('extrato bancário', () => {
  it('lê OFX', () => {
    const l = parseOfx(OFX)
    expect(l).toEqual([
      { date: '2026-10-05', amount: -1500, description: 'PIX ENVIADO DESPACHANTE', document: 'ABC1' },
      { date: '2026-10-06', amount: 60000, description: 'BANCO TESTE SA — TED FINANCIAMENTO', document: 'ABC2' },
    ])
  })

  it('lê CSV com valor único e com crédito/débito', () => {
    expect(parseCsv('Data;Histórico;Valor\n05/10/2026;Tarifa;-12,90\n06/10/2026;"PIX, recebido";1.234,56')).toEqual([
      { date: '2026-10-05', amount: -12.9, description: 'Tarifa', document: null },
      { date: '2026-10-06', amount: 1234.56, description: 'PIX, recebido', document: null },
    ])
    expect(parseCsv('data,descricao,credito,debito\n2026-10-07,Deposito,100.00,\n2026-10-07,Saque,,50.00')).toEqual([
      { date: '2026-10-07', amount: 100, description: 'Deposito', document: null },
      { date: '2026-10-07', amount: -50, description: 'Saque', document: null },
    ])
  })

  it('valores', () => {
    expect(parseMoney('R$ 1.500,00 D')).toBe(-1500)
    expect(parseMoney('(10,50)')).toBe(-10.5)
    expect(parseMoney('abc')).toBeNull()
  })

  it('pontua: valor obrigatório, data e descrição ajudam', () => {
    const line = { date: '2026-10-05', amount: -1500, description: 'PIX ENVIADO DESPACHANTE', document: null }
    expect(matchScore(line, { id: 'a', signedAmount: -1400, date: '2026-10-05', description: 'x', counterparty: null, documentNumber: null })).toBe(0)
    const same = matchScore(line, { id: 'b', signedAmount: -1500, date: '2026-10-05', description: 'Despachante — transferência', counterparty: null, documentNumber: null })
    const far = matchScore(line, { id: 'c', signedAmount: -1500, date: '2026-10-20', description: 'Outro', counterparty: null, documentNumber: null })
    expect(same).toBeGreaterThanOrEqual(90)
    expect(far).toBeLessThan(same)
  })

  it('1×N e idempotência', () => {
    expect(sumsMatch(-300, [{ signedAmount: -100 }, { signedAmount: -200 }])).toBe(true)
    expect(sumsMatch(-300, [{ signedAmount: -100 }])).toBe(false)
    const l = { date: '2026-10-05', amount: -1500, description: 'X', document: 'F1' }
    expect(lineFingerprint('acc', l)).toBe(lineFingerprint('acc', { ...l, description: 'outro texto' }))
  })
})
