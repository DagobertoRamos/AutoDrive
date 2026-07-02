import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findUnique: vi.fn() },
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

import { buildCommissionAccessWhere, buildNegotiationAccessWhere } from '@/lib/negotiation-access'
import type { SessionUser } from '@/lib/auth-guards'

function user(role: SessionUser['role'], extras: Partial<SessionUser> = {}): SessionUser {
  return {
    id: 'user-1',
    name: 'Usuário',
    email: 'u@x.com',
    role,
    status: 'ATIVO',
    tenantId: 'tenant-1',
    unitId: null,
    ...extras,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.user.findUnique.mockResolvedValue({
    unitId: null,
    seller: { id: 'seller-1', unitId: 'unit-1' },
    manager: { unitId: 'unit-1' },
  })
})

describe('negotiation-access', () => {
  it('restringe VENDEDOR às próprias negociações pelo Seller.id', async () => {
    await expect(buildNegotiationAccessWhere(user('VENDEDOR'), { status: 'APROVADA' })).resolves.toEqual({
      tenantId: 'tenant-1',
      sellerId: 'seller-1',
      status: 'APROVADA',
    })
  })

  it('restringe GERENTE à unidade resolvida do cadastro', async () => {
    await expect(buildNegotiationAccessWhere(user('GERENTE'))).resolves.toEqual({
      tenantId: 'tenant-1',
      unitId: 'unit-1',
    })
  })

  it('libera GERENTE_GERAL/ADM no tenant sem aceitar outro tenant do front-end', async () => {
    await expect(buildNegotiationAccessWhere(user('GERENTE_GERAL'), { type: 'VENDA' })).resolves.toEqual({
      tenantId: 'tenant-1',
      type: 'VENDA',
    })
  })

  it('aplica o mesmo escopo em comissões', async () => {
    await expect(buildCommissionAccessWhere(user('GERENTE'))).resolves.toEqual({
      tenantId: 'tenant-1',
      unitId: 'unit-1',
    })
  })
})
