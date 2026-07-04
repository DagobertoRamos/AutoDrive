import { describe, expect, it, vi } from 'vitest'
import { canAccessModuleForUser } from './tenant-modules'

const mockDb = vi.hoisted(() => ({
  findUnique: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    userModule: {
      findUnique: mockDb.findUnique,
    },
  },
}))

describe('tenant-modules user overrides', () => {
  it('keeps role permission when there is no override', async () => {
    mockDb.findUnique.mockResolvedValueOnce(null)
    await expect(canAccessModuleForUser({ id: 'u1', role: 'GERENTE' }, 'queue.reorder')).resolves.toBe(true)
  })

  it('allows an extra permission beyond the base role', async () => {
    mockDb.findUnique.mockResolvedValueOnce({ allowed: true })
    await expect(canAccessModuleForUser({ id: 'u1', role: 'VENDEDOR' }, 'queue.call_current_seller')).resolves.toBe(true)
  })

  it('denies a permission that the role would normally have', async () => {
    mockDb.findUnique.mockResolvedValueOnce({ allowed: false })
    await expect(canAccessModuleForUser({ id: 'u1', role: 'GERENTE' }, 'queue.reorder')).resolves.toBe(false)
  })
})
