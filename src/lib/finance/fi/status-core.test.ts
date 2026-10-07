import { describe, expect, it } from 'vitest'
import {
  ATTEMPT_STATUS, ATTEMPT_STATUS_META, PROPOSAL_STATUS_META, FUNDING_META,
  checkAttemptTransition, checkFormalizationTransition, checkFundingTransition, checkLienTransition,
  deriveProposalStatus, formatFiCode, nextAction, parseFiCodeSeq, rankOffers, type Offer,
} from './status-core'

const approved = { proposalStatus: 'APROVADA', hasSelectedOffer: true, formalizationStatus: 'NAO_INICIADA' }

describe('tentativa por banco — máquina de estados', () => {
  it('mesmo status é idempotente (webhook duplicado não muda nada)', () => {
    expect(checkAttemptTransition('APROVADA', 'APROVADA')).toEqual({ ok: true, noop: true })
  })
  it('fluxo normal: enviando → em análise → pré-aprovada → aprovada', () => {
    expect(checkAttemptTransition('ENVIANDO', 'EM_ANALISE').ok).toBe(true)
    expect(checkAttemptTransition('EM_ANALISE', 'PRE_APROVADA').ok).toBe(true)
    expect(checkAttemptTransition('PRE_APROVADA', 'APROVADA').ok).toBe(true)
  })
  it('recusada é final: não volta para aprovada', () => {
    const r = checkAttemptTransition('RECUSADA', 'APROVADA')
    expect(r.ok).toBe(false)
  })
  it('aprovada não regride para em análise (webhook atrasado)', () => {
    expect(checkAttemptTransition('APROVADA', 'EM_ANALISE').ok).toBe(false)
  })
  it('timeout leva a verificando, e verificando só sai com resposta ou falha confirmada', () => {
    expect(checkAttemptTransition('ENVIANDO', 'VERIFICANDO').ok).toBe(true)
    expect(checkAttemptTransition('VERIFICANDO', 'FALHA_ENVIO').ok).toBe(true)
    expect(checkAttemptTransition('VERIFICANDO', 'APROVADA').ok).toBe(true)
    expect(checkAttemptTransition('VERIFICANDO', 'ENVIANDO').ok).toBe(false)
  })
  it('status desconhecido nunca vira sucesso', () => {
    const r = checkAttemptTransition('ENVIADA', 'FUNDED')
    expect(r.ok).toBe(false)
  })
  it('substituição só de tentativa aberta', () => {
    expect(checkAttemptTransition('EM_ANALISE', 'SUBSTITUIDA').ok).toBe(true)
    expect(checkAttemptTransition('RECUSADA', 'SUBSTITUIDA').ok).toBe(false)
  })
  it('todo status tem rótulo em português', () => {
    for (const s of ATTEMPT_STATUS) expect(ATTEMPT_STATUS_META[s].label).toMatch(/[a-zà-ú]/i)
    expect(Object.values(PROPOSAL_STATUS_META).map((m) => m.label)).not.toContain('Approved')
    expect(FUNDING_META.PAGO.label).toBe('Pago')
  })
})

describe('situação consolidada da ficha', () => {
  it('sem tentativas = rascunho', () => {
    expect(deriveProposalStatus('SIMULACAO', [])).toBe('SIMULACAO')
  })
  it('uma aprovada e outra recusada = aprovada', () => {
    expect(deriveProposalStatus('ENVIADA', [{ status: 'APROVADA' }, { status: 'RECUSADA' }])).toBe('APROVADA')
  })
  it('todas recusadas = recusada', () => {
    expect(deriveProposalStatus('ENVIADA', [{ status: 'RECUSADA' }, { status: 'RECUSADA' }])).toBe('RECUSADA')
  })
  it('versões substituídas (inativas) não contam', () => {
    expect(deriveProposalStatus('ENVIADA', [{ status: 'RECUSADA', active: false }, { status: 'EM_ANALISE', active: true }])).toBe('EM_ANALISE')
  })
  it('cancelamento manual prevalece', () => {
    expect(deriveProposalStatus('CANCELADA', [{ status: 'APROVADA' }])).toBe('CANCELADA')
  })
  it('só falhas de envio continuam rascunho (nada chegou ao banco)', () => {
    expect(deriveProposalStatus('ENVIADA', [{ status: 'FALHA_ENVIO' }])).toBe('SIMULACAO')
  })
})

describe('pós-aprovação', () => {
  it('não existe RECUSADA → PAGO', () => {
    const r = checkFundingTransition('NAO_ESPERADO', 'PAGO', { proposalStatus: 'RECUSADA', hasSelectedOffer: false, formalizationStatus: 'NAO_INICIADA' })
    expect(r.ok).toBe(false)
  })
  it('pagamento exige contrato assinado', () => {
    expect(checkFundingTransition('AGUARDANDO', 'PAGO', approved).ok).toBe(false)
    expect(checkFundingTransition('AGUARDANDO', 'PAGO', { ...approved, formalizationStatus: 'ASSINADA' }).ok).toBe(true)
  })
  it('pago é final', () => {
    expect(checkFundingTransition('PAGO', 'AGUARDANDO', { ...approved, formalizationStatus: 'ASSINADA' }).ok).toBe(false)
  })
  it('formalização só depois de escolher proposta aprovada', () => {
    expect(checkFormalizationTransition('NAO_INICIADA', 'EM_ANDAMENTO', { ...approved, hasSelectedOffer: false }).ok).toBe(false)
    expect(checkFormalizationTransition('NAO_INICIADA', 'EM_ANDAMENTO', approved).ok).toBe(true)
    expect(checkFormalizationTransition('NAO_INICIADA', 'CONCLUIDA', approved).ok).toBe(false)
  })
  it('gravame: não iniciado → solicitado → registrado → baixado', () => {
    expect(checkLienTransition('NAO_INICIADO', 'SOLICITADO', approved).ok).toBe(true)
    expect(checkLienTransition('SOLICITADO', 'REGISTRADO', approved).ok).toBe(true)
    expect(checkLienTransition('REGISTRADO', 'BAIXADO', approved).ok).toBe(true)
    expect(checkLienTransition('BAIXADO', 'REGISTRADO', approved).ok).toBe(false)
  })
})

describe('próxima ação', () => {
  const base = { status: 'SIMULACAO', missingFields: 0, attempts: [], hasSelectedOffer: false, formalizationStatus: 'NAO_INICIADA', lienStatus: 'NAO_INICIADO', fundingStatus: 'NAO_ESPERADO' }
  it('ficha incompleta pede completar', () => {
    expect(nextAction({ ...base, missingFields: 2 }).label).toBe('Completar 2 informações da ficha')
  })
  it('banco não integrado pede registrar a resposta', () => {
    expect(nextAction({ ...base, status: 'ENVIADA', attempts: [{ status: 'ENVIADA', mode: 'MANUAL' }] }).key).toBe('REGISTRAR_RESPOSTA')
  })
  it('pendência do banco pede documentos', () => {
    expect(nextAction({ ...base, status: 'EM_ANALISE', attempts: [{ status: 'PENDENTE' }] }).key).toBe('SOLICITAR_DOCUMENTOS')
  })
  it('todas recusadas sugere ajustar proposta', () => {
    expect(nextAction({ ...base, status: 'RECUSADA', attempts: [{ status: 'RECUSADA' }] }).label).toMatch(/Ajustar/)
  })
  it('assinada sem gravame pede gravame; pago conclui', () => {
    const sel = { ...base, status: 'APROVADA', hasSelectedOffer: true, formalizationStatus: 'ASSINADA', attempts: [{ status: 'APROVADA' }] }
    expect(nextAction(sel).key).toBe('SOLICITAR_GRAVAME')
    expect(nextAction({ ...sel, fundingStatus: 'PAGO' }).key).toBe('CONCLUIDO')
  })
})

describe('organização das ofertas', () => {
  const offers: Offer[] = [
    { submissionId: 'a', bankName: 'A', status: 'APROVADA', downPayment: 10000, installments: 48, installmentValue: 2100, amount: 80000, cetMonthly: 2.1, returnPercent: 4 },
    { submissionId: 'b', bankName: 'B', status: 'APROVADA', downPayment: 5000, installments: 60, installmentValue: 1900, amount: 85000, cetMonthly: 2.3, returnPercent: 2 },
    { submissionId: 'c', bankName: 'C', status: 'RECUSADA', downPayment: 0, installments: 12, installmentValue: 100, amount: 1, cetMonthly: 0.1, returnPercent: 9 },
  ]
  it('ignora recusadas e separa cliente × loja', () => {
    const r = rankOffers(offers, false)
    expect(r.MELHOR_PARCELA).toBe('b')
    expect(r.MENOR_ENTRADA).toBe('b')
    expect(r.MENOR_PRAZO).toBe('a')
    expect(r.MENOR_CUSTO).toBe('a')
    expect(r.MELHOR_RETORNO_LOJA).toBeUndefined()
  })
  it('retorno da loja só para quem pode ver', () => {
    expect(rankOffers(offers, true).MELHOR_RETORNO_LOJA).toBe('a')
  })
})

describe('código rastreável', () => {
  it('formata e lê FI-AAAA-NNNNNN', () => {
    expect(formatFiCode(2026, 381)).toBe('FI-2026-000381')
    expect(parseFiCodeSeq('FI-2026-000381')).toBe(381)
    expect(parseFiCodeSeq('X')).toBeNull()
  })
})
