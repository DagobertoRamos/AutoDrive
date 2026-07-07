import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prismaMock, notifyMock } = vi.hoisted(() => ({
  prismaMock: {
    agentPersonalQueueItem: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    sellerQueueAttendance: { findFirst: vi.fn(), create: vi.fn() },
    sellerQueueEntry: { updateMany: vi.fn(), findUnique: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prismaMockTx)),
  },
  notifyMock: { notify: vi.fn().mockResolvedValue(undefined), notifyByRole: vi.fn().mockResolvedValue(undefined) },
}))
const prismaMockTx = {
  sellerQueueAttendance: { create: vi.fn().mockResolvedValue({ id: 'att-1' }) },
  sellerQueueEntry: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  agentPersonalQueueItem: { update: vi.fn().mockResolvedValue({}) },
}

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/seller-queue/queue', () => ({
  getOrCreateQueue: vi.fn().mockResolvedValue({ id: 'queue-1' }),
  logQueueEvent: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/services/notification.service', () => ({ notify: notifyMock.notify, notifyByRole: notifyMock.notifyByRole }))

import { enqueuePersonalItem, startPersonalItem, transferPersonalItem, listPersonalQueueForAgent, setPersonalItemPriority, reschedulePersonalItem, getAgentQueueState } from '@/lib/seller-queue/personal-queue'

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.agentPersonalQueueItem.create.mockResolvedValue({ id: 'item-1' })
  prismaMock.sellerQueueAttendance.findFirst.mockResolvedValue(null) // não ocupado por padrão
})

describe('enqueuePersonalItem', () => {
  it('usa a prioridade padrão do tipo quando não informada (RETORNO=30) e notifica o responsável', async () => {
    await enqueuePersonalItem({ tenantId: 't1', unitId: 'u1', agentUserId: 'a1', itemType: 'RETORNO', createdByUserId: 'c1', customerName: 'João' })
    expect(prismaMock.agentPersonalQueueItem.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ priority: 30, status: 'AGUARDANDO', itemType: 'RETORNO', agentUserId: 'a1' }) }))
    expect(notifyMock.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 'a1' }))
  })

  it('respeita a prioridade explícita', async () => {
    await enqueuePersonalItem({ tenantId: 't1', unitId: 'u1', agentUserId: 'a1', itemType: 'OUTRO', createdByUserId: 'c1', priority: 99 })
    expect(prismaMock.agentPersonalQueueItem.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ priority: 99 }) }))
  })
})

describe('startPersonalItem — guardas', () => {
  it('item inexistente → erro', async () => {
    prismaMock.agentPersonalQueueItem.findUnique.mockResolvedValue(null)
    expect((await startPersonalItem({ tenantId: 't1', unitId: 'u1', itemId: 'x', actorId: 'a1', actorRole: 'VENDEDOR' })).ok).toBe(false)
  })

  it('item já em atendimento → erro', async () => {
    prismaMock.agentPersonalQueueItem.findUnique.mockResolvedValue({ id: 'i1', tenantId: 't1', unitId: 'u1', agentUserId: 'a1', status: 'EM_ATENDIMENTO', itemType: 'RETORNO' })
    expect((await startPersonalItem({ tenantId: 't1', unitId: 'u1', itemId: 'i1', actorId: 'a1', actorRole: 'VENDEDOR' })).ok).toBe(false)
  })

  it('vendedor tentando iniciar item de outro (sem ser gestão) → erro', async () => {
    prismaMock.agentPersonalQueueItem.findUnique.mockResolvedValue({ id: 'i1', tenantId: 't1', unitId: 'u1', agentUserId: 'a2', status: 'AGUARDANDO', itemType: 'RETORNO' })
    expect((await startPersonalItem({ tenantId: 't1', unitId: 'u1', itemId: 'i1', actorId: 'a1', actorRole: 'VENDEDOR' })).ok).toBe(false)
  })

  it('responsável já ocupado → erro (não inicia dois ao mesmo tempo)', async () => {
    prismaMock.agentPersonalQueueItem.findUnique.mockResolvedValue({ id: 'i1', tenantId: 't1', unitId: 'u1', agentUserId: 'a1', status: 'AGUARDANDO', itemType: 'RETORNO' })
    prismaMock.sellerQueueAttendance.findFirst.mockResolvedValue({ id: 'att-x' })
    expect((await startPersonalItem({ tenantId: 't1', unitId: 'u1', itemId: 'i1', actorId: 'a1', actorRole: 'VENDEDOR' })).ok).toBe(false)
  })

  it('responsável livre inicia o próprio item → cria atendimento', async () => {
    prismaMock.agentPersonalQueueItem.findUnique.mockResolvedValue({ id: 'i1', tenantId: 't1', unitId: 'u1', agentUserId: 'a1', status: 'AGUARDANDO', itemType: 'RETORNO', arrivalId: null, leadId: null, dealId: null, customerId: null })
    const r = await startPersonalItem({ tenantId: 't1', unitId: 'u1', itemId: 'i1', actorId: 'a1', actorRole: 'VENDEDOR' })
    expect(r.ok).toBe(true)
    expect(r.attendanceId).toBe('att-1')
  })
})

describe('transferPersonalItem', () => {
  it('destino de outra unidade → erro', async () => {
    prismaMock.agentPersonalQueueItem.findUnique.mockResolvedValue({ id: 'i1', tenantId: 't1', unitId: 'u1', agentUserId: 'a1', status: 'AGUARDANDO', itemType: 'RETORNO', customerName: null, notes: null })
    prismaMock.user.findUnique.mockResolvedValue({ tenantId: 't1', unitId: 'u2', status: 'ATIVO' })
    expect((await transferPersonalItem({ tenantId: 't1', itemId: 'i1', toUserId: 'b1', actorId: 'm1' })).ok).toBe(false)
  })

  it('destino válido → transfere e notifica', async () => {
    prismaMock.agentPersonalQueueItem.findUnique.mockResolvedValue({ id: 'i1', tenantId: 't1', unitId: 'u1', agentUserId: 'a1', status: 'AGUARDANDO', itemType: 'RETORNO', customerName: 'Ana', notes: null })
    prismaMock.user.findUnique.mockResolvedValue({ tenantId: 't1', unitId: 'u1', status: 'ATIVO' })
    const r = await transferPersonalItem({ tenantId: 't1', itemId: 'i1', toUserId: 'b1', actorId: 'm1' })
    expect(r.ok).toBe(true)
    expect(prismaMock.agentPersonalQueueItem.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ agentUserId: 'b1', status: 'AGUARDANDO' }) }))
    expect(notifyMock.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 'b1' }))
  })
})

describe('setPersonalItemPriority', () => {
  it('atualiza a prioridade (clampada 0–100) do próprio item', async () => {
    prismaMock.agentPersonalQueueItem.findUnique.mockResolvedValue({ id: 'i1', tenantId: 't1', agentUserId: 'a1', status: 'AGUARDANDO' })
    const r = await setPersonalItemPriority({ tenantId: 't1', itemId: 'i1', priority: 250, actorId: 'a1', actorRole: 'VENDEDOR' })
    expect(r.ok).toBe(true)
    expect(r.priority).toBe(100)
    expect(prismaMock.agentPersonalQueueItem.update).toHaveBeenCalledWith(expect.objectContaining({ data: { priority: 100 } }))
  })
  it('bloqueia item de outro (sem ser gestão)', async () => {
    prismaMock.agentPersonalQueueItem.findUnique.mockResolvedValue({ id: 'i1', tenantId: 't1', agentUserId: 'a2', status: 'AGUARDANDO' })
    expect((await setPersonalItemPriority({ tenantId: 't1', itemId: 'i1', priority: 50, actorId: 'a1', actorRole: 'VENDEDOR' })).ok).toBe(false)
  })
})

describe('reschedulePersonalItem', () => {
  it('reseta prioridade e chegada (manda para o fim)', async () => {
    prismaMock.agentPersonalQueueItem.findUnique.mockResolvedValue({ id: 'i1', tenantId: 't1', agentUserId: 'a1', status: 'AGUARDANDO' })
    const r = await reschedulePersonalItem({ tenantId: 't1', itemId: 'i1', actorId: 'a1', actorRole: 'VENDEDOR' })
    expect(r.ok).toBe(true)
    const data = prismaMock.agentPersonalQueueItem.update.mock.calls[0][0].data
    expect(data.priority).toBe(0)
    expect(data.status).toBe('AGUARDANDO')
    expect(data.queuedAt).toBeInstanceOf(Date)
  })
})

describe('getAgentQueueState', () => {
  it('em atendimento → BUSY', async () => {
    prismaMock.sellerQueueAttendance.findFirst.mockResolvedValue({ id: 'att' })
    expect(await getAgentQueueState('q1', 'a1')).toBe('BUSY')
  })
  it('sem entry → AWAY', async () => {
    prismaMock.sellerQueueAttendance.findFirst.mockResolvedValue(null)
    prismaMock.sellerQueueEntry.findUnique.mockResolvedValue(null)
    expect(await getAgentQueueState('q1', 'a1')).toBe('AWAY')
  })
  it('pausado → PAUSED', async () => {
    prismaMock.sellerQueueAttendance.findFirst.mockResolvedValue(null)
    prismaMock.sellerQueueEntry.findUnique.mockResolvedValue({ status: 'PAUSED', blocked: false })
    expect(await getAgentQueueState('q1', 'a1')).toBe('PAUSED')
  })
  it('aguardando → FREE', async () => {
    prismaMock.sellerQueueAttendance.findFirst.mockResolvedValue(null)
    prismaMock.sellerQueueEntry.findUnique.mockResolvedValue({ status: 'WAITING', blocked: false })
    expect(await getAgentQueueState('q1', 'a1')).toBe('FREE')
  })
})

describe('listPersonalQueueForAgent', () => {
  it('calcula tempo aguardando e o rótulo do tipo', async () => {
    const queuedAt = new Date(Date.now() - 90_000) // 90s atrás
    prismaMock.agentPersonalQueueItem.findMany.mockResolvedValue([
      { id: 'i1', itemType: 'POS_VENDA', status: 'AGUARDANDO', priority: 10, customerName: 'Zé', customerPhone: null, dealId: null, leadId: null, source: null, queuedAt, agentUserId: 'a1' },
    ])
    const out = await listPersonalQueueForAgent('t1', 'u1', 'a1')
    expect(out[0].itemTypeLabel).toBe('Pós-venda')
    expect(out[0].waitingSeconds).toBeGreaterThanOrEqual(89)
  })
})
