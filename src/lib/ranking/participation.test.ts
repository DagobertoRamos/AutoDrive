import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyRankingParticipationFilter } from '@/lib/ranking/participation'
import { prisma } from '@/lib/prisma'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    systemSetting: {
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  },
}))

const findFirst = vi.mocked(prisma.systemSetting.findFirst)

describe('ranking participation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('usa a lista legada de excluídos quando não há configuração granular', async () => {
    findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ value: JSON.stringify(['u2']) } as never)

    const rows = await applyRankingParticipationFilter(
      [{ userId: 'u1' }, { userId: 'u2' }],
      { tenantId: 'tenant-1', rankingType: 'GENERAL' },
    )

    expect(rows.map((row) => row.userId)).toEqual(['u1'])
  })

  it('configuração granular explícita sobrescreve exclusão legada', async () => {
    findFirst
      .mockResolvedValueOnce({
        value: JSON.stringify([
          { userId: 'u2', unitId: null, rankingType: 'GENERAL', participates: true },
          { userId: 'u3', unitId: null, rankingType: 'GENERAL', participates: false },
        ]),
      } as never)
      .mockResolvedValueOnce({ value: JSON.stringify(['u2']) } as never)

    const rows = await applyRankingParticipationFilter(
      [{ userId: 'u1' }, { userId: 'u2' }, { userId: 'u3' }],
      { tenantId: 'tenant-1', rankingType: 'GENERAL' },
    )

    expect(rows.map((row) => row.userId)).toEqual(['u1', 'u2'])
  })
})
