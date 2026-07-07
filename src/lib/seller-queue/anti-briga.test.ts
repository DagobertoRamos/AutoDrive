import { describe, expect, it, vi } from 'vitest'

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    sellerQueueUnitConfig: {
      findUnique: vi.fn(),
    },
    sellerQueueAttendance: {
      findFirst: vi.fn(),
    },
  }
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

import { isAgentBusy } from './personal-queue'
import { finishSchema } from '../validators/seller-queue'

describe('Modo Anti-Briga & Informação Rápida Rules', () => {
  describe('finishSchema validation', () => {
    it('allows finishing with empty customer name/phone/email if it is optional or bypassed', () => {
      const payload = {
        type: 'SALE',
        result: 'CONVERTED_TO_NEGOTIATION',
        notes: 'Atendimento rápido concluído',
        customerName: '',
        customerPhone: '',
        customerEmail: '',
      }
      const parsed = finishSchema.safeParse(payload)
      expect(parsed.success).toBe(true)
    })
  })

  describe('isAgentBusy function', () => {
    it('returns true if agent has active attendance and allowWaitWithOpenAttendance is NO', async () => {
      prismaMock.sellerQueueUnitConfig.findUnique.mockResolvedValueOnce({
        config: { allowWaitWithOpenAttendance: 'NO' },
      } as any)
      prismaMock.sellerQueueAttendance.findFirst.mockResolvedValueOnce({
        id: 'att-123',
        visitType: 'CLIENTE_PORTA',
        calledAt: new Date(),
      } as any)

      const busy = await isAgentBusy('tenant-1', 'unit-1', 'agent-1')
      expect(busy).toBe(true)
    })

    it('returns false if agent has active attendance but allowWaitWithOpenAttendance is YES', async () => {
      prismaMock.sellerQueueUnitConfig.findUnique.mockResolvedValueOnce({
        config: { allowWaitWithOpenAttendance: 'YES' },
      } as any)
      prismaMock.sellerQueueAttendance.findFirst.mockResolvedValueOnce({
        id: 'att-123',
        visitType: 'CLIENTE_PORTA',
        calledAt: new Date(),
      } as any)

      const busy = await isAgentBusy('tenant-1', 'unit-1', 'agent-1')
      expect(busy).toBe(false)
    })

    it('returns false if active attendance is INFORMACAO_RAPIDA within time limit and rule is QUICK_ONLY', async () => {
      prismaMock.sellerQueueUnitConfig.findUnique.mockResolvedValueOnce({
        config: {
          allowWaitWithOpenAttendance: 'QUICK_ONLY',
          infoRapidaTimeLimitMinutes: 5,
        },
      } as any)
      prismaMock.sellerQueueAttendance.findFirst.mockResolvedValueOnce({
        id: 'att-123',
        visitType: 'INFORMACAO_RAPIDA',
        calledAt: new Date(),
      } as any)

      const busy = await isAgentBusy('tenant-1', 'unit-1', 'agent-1')
      expect(busy).toBe(false)
    })

    it('returns true if active attendance is INFORMACAO_RAPIDA but has exceeded time limit and rule is QUICK_ONLY', async () => {
      prismaMock.sellerQueueUnitConfig.findUnique.mockResolvedValueOnce({
        config: {
          allowWaitWithOpenAttendance: 'QUICK_ONLY',
          infoRapidaTimeLimitMinutes: 5,
        },
      } as any)
      
      const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000)
      prismaMock.sellerQueueAttendance.findFirst.mockResolvedValueOnce({
        id: 'att-123',
        visitType: 'INFORMACAO_RAPIDA',
        calledAt: tenMinsAgo,
        startedAt: tenMinsAgo,
      } as any)

      const busy = await isAgentBusy('tenant-1', 'unit-1', 'agent-1')
      expect(busy).toBe(true)
    })
  })
})
