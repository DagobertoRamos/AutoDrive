// Acesso às rotas da ficha do veículo (preparação, recebimento, extrato).
//   read    → quem vê o estoque ou o financeiro
//   write   → quem gerencia o estoque (preparação)
//   finance → financeiro ou gestores (extrato tem margem/lucro)
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, assertTenantId, tenantWhere, unauthorizedResponse, forbiddenResponse, type SessionUser } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'

const MANAGERS = new Set(['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE'])

export function canSeeVehicleFinance(role: string | null | undefined): boolean {
  return canAccessModule(role as never, 'finance') || MANAGERS.has(String(role))
}

export async function vehicleGuard(vehicleId: string, mode: 'read' | 'write' | 'finance'):
  Promise<{ error: NextResponse } | { user: SessionUser; vehicle: { id: string; tenantId: string | null } }> {
  const user = await getSessionUser()
  if (!user) return { error: unauthorizedResponse() }
  const ok = mode === 'read' ? canAccessModule(user.role, 'stock') || canAccessModule(user.role, 'finance')
    : mode === 'write' ? canAccessModule(user.role, 'stock.manage')
    : canSeeVehicleFinance(user.role)
  if (!ok) return { error: forbiddenResponse(mode === 'finance' ? 'Extrato financeiro: acesso do financeiro ou da gerência.' : 'Sem permissão.') }
  const tenantId = assertTenantId(user.tenantId, user.role)
  const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, ...tenantWhere(user.role, tenantId) }, select: { id: true, tenantId: true } })
  if (!vehicle) return { error: NextResponse.json({ success: false, error: 'Veículo não encontrado.' }, { status: 404 }) }
  return { user, vehicle }
}
