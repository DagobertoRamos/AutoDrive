import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findUnique: vi.fn() },
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

import { buildCommissionAccessWhere, buildCommissionExtractAccessWhere, buildNegotiationAccessWhere } from '@/lib/negotiation-access'
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
    manager: { id: 'manager-1', unitId: 'unit-1' },
  })
})

// OWN de comissão (calculation): vendedor OU gerente OU usuário-ganhador.
const OWN_CALC = { OR: [
  { sellerId: 'seller-1' },
  { managerId: 'manager-1' },
  { ruleDetails: { path: ['employeeUserId'], equals: 'user-1' } },
] }
// OWN de extrato: usuário-ganhador OU vendedor.
const OWN_EXTRACT = { OR: [{ userId: 'user-1' }, { sellerId: 'seller-1' }] }

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

  it('comissão: GERENTE vê SÓ a própria (não a unidade inteira)', async () => {
    await expect(buildCommissionAccessWhere(user('GERENTE'))).resolves.toEqual({
      AND: [{ tenantId: 'tenant-1' }, OWN_CALC],
    })
  })

  it('comissão: GERENTE_GERAL também vê só a própria (só fin/adm veem tudo)', async () => {
    await expect(buildCommissionAccessWhere(user('GERENTE_GERAL'))).resolves.toEqual({
      AND: [{ tenantId: 'tenant-1' }, OWN_CALC],
    })
  })

  it('comissão: ADM vê o tenant inteiro (fechamento)', async () => {
    await expect(buildCommissionAccessWhere(user('ADM'), { period: '2026-07' })).resolves.toEqual({
      tenantId: 'tenant-1',
      period: '2026-07',
    })
  })

  it('extrato: VENDEDOR só vê o próprio (userId OU sellerId)', async () => {
    await expect(buildCommissionExtractAccessWhere(user('VENDEDOR'))).resolves.toEqual({
      AND: [{ tenantId: 'tenant-1' }, OWN_EXTRACT],
    })
  })

  it('extrato: VENDEDOR_LIDER também é restrito ao próprio', async () => {
    await expect(buildCommissionExtractAccessWhere(user('VENDEDOR_LIDER'))).resolves.toEqual({
      AND: [{ tenantId: 'tenant-1' }, OWN_EXTRACT],
    })
  })

  it('extrato: FINANCEIRO vê o tenant inteiro (conferir/pagar)', async () => {
    await expect(buildCommissionExtractAccessWhere(user('FINANCEIRO'), { period: '2026-07' })).resolves.toEqual({
      tenantId: 'tenant-1',
      period: '2026-07',
    })
  })

  it('extrato: GERENTE vê só o próprio (não a unidade)', async () => {
    await expect(buildCommissionExtractAccessWhere(user('GERENTE'))).resolves.toEqual({
      AND: [{ tenantId: 'tenant-1' }, OWN_EXTRACT],
    })
  })
})
