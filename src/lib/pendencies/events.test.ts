import { describe, it, expect } from 'vitest'
import { buildTimeline, eventLabel, PENDENCY_EVENT } from './events'

describe('eventLabel', () => {
  it('rotula mudança de prioridade e prazo', () => {
    expect(eventLabel({ type: PENDENCY_EVENT.PRIORITY_CHANGED, prevPriority: 'MEDIA', newPriority: 'ALTA' })).toBe('Prioridade: Média → Alta')
    expect(eventLabel({ type: PENDENCY_EVENT.STATUS_CHANGED, prevStatus: 'ABERTA', newStatus: 'FINALIZADA' })).toBe('Status: Aberta → Finalizada')
  })
  it('rotula eventos de pop-up, escalonamento e penalidade', () => {
    expect(eventLabel({ type: PENDENCY_EVENT.POPUP_SHOWN })).toBe('Pop-up de cobrança exibido')
    expect(eventLabel({ type: PENDENCY_EVENT.ESCALATED })).toBe('Escalonada para gestão')
    expect(eventLabel({ type: PENDENCY_EVENT.PENALTY_APPLIED })).toBe('Penalidade aplicada')
  })
  it('cai no próprio tipo quando desconhecido', () => {
    expect(eventLabel({ type: 'FOO' })).toBe('FOO')
  })
})

describe('buildTimeline — mescla e ordena por data desc', () => {
  it('junta as 4 fontes em ordem cronológica reversa', () => {
    const tl = buildTimeline({
      events: [{ id: 'e1', type: PENDENCY_EVENT.PRIORITY_CHANGED, prevPriority: 'MEDIA', newPriority: 'ALTA', authorName: 'Ana', createdAt: '2026-07-02T10:00:00Z' }],
      statusHistory: [{ id: 's1', previousStatus: 'ABERTA', newStatus: 'EM_ANDAMENTO', createdAt: '2026-07-01T10:00:00Z', changedByUser: { name: 'Bob' } }],
      comments: [{ id: 'c1', content: 'ok', createdAt: '2026-07-03T10:00:00Z', user: { name: 'Ana' } }],
      notificationLogs: [{ id: 'n1', channel: 'WEBPUSH', status: 'SENT', sentCount: 2, createdAt: '2026-07-04T10:00:00Z' }],
    })
    expect(tl.map((t) => t.id)).toEqual(['nl_n1', 'cm_c1', 'ev_e1', 'st_s1'])
    expect(tl[2].by).toBe('Ana')
    expect(tl[2].title).toBe('Prioridade: Média → Alta')
    expect(tl[0].title).toBe('Lembrete enviado (2)')
  })
  it('lida com fontes vazias/ausentes', () => {
    expect(buildTimeline({})).toEqual([])
    expect(buildTimeline({ comments: [] })).toEqual([])
  })
  it('escalonamento no notification log ganha rótulo próprio', () => {
    const tl = buildTimeline({ notificationLogs: [{ id: 'n2', channel: 'ESCALATION', status: 'SENT', createdAt: '2026-07-04T10:00:00Z' }] })
    expect(tl[0].title).toBe('Escalonamento notificado')
  })
})
