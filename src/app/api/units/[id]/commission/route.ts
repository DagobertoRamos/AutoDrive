// =============================================================================
// /api/units/[id]/commission — chave de comissão da unidade + cargos que recebem.
// GET  → { enabled, roles }
// PUT  → { enabled, roles }  (gate: registrations.units + MASTER/ADM/GERENTE)
// =============================================================================

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { getUnitCommissionConfig, setUnitCommissionConfig } from '@/lib/commission/unit-config'

// Cargos que podem receber comissão (para validar o que vier do form).
// ADM incluído: ADM também pode vender (em qualquer unidade) e receber comissão.
const ELIGIBLE_ROLES = ['ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE', 'VENDEDOR_LIDER', 'VENDEDOR', 'FINANCEIRO']

async function unitTenant(unitId: string): Promise<string | null> {
  const u = await prisma.unit.findUnique({ where: { id: unitId }, select: { tenantId: true } }).catch(() => null)
  return u?.tenantId ?? null
}

export async function GET(_req: Request, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  const params = await Promise.resolve(ctxArg.params)
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 })
    { const gate = await assertModuleEnabled(session.user, 'registrations.units'); if (gate) return gate }
    const tenantId = session.user.tenantId ?? (await unitTenant(params.id))
    if (!tenantId) return NextResponse.json({ success: true, data: { enabled: true, roles: [] } })
    const data = await getUnitCommissionConfig(tenantId, params.id)
    return NextResponse.json({ success: true, data, eligibleRoles: ELIGIBLE_ROLES })
  } catch (err) {
    console.error('[units/commission GET]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}

export async function PUT(req: Request, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  const params = await Promise.resolve(ctxArg.params)
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 })
    { const gate = await assertModuleEnabled(session.user, 'registrations.units'); if (gate) return gate }
    if (!['MASTER', 'ADM', 'GERENTE'].includes(session.user.role)) {
      return NextResponse.json({ success: false, error: 'Sem permissão' }, { status: 403 })
    }
    const tenantId = session.user.tenantId ?? (await unitTenant(params.id))
    if (!tenantId) return NextResponse.json({ success: false, error: 'Unidade sem tenant' }, { status: 400 })

    const body = await req.json().catch(() => ({}))
    const enabled = !!body?.enabled
    const roles = Array.isArray(body?.roles) ? body.roles.filter((r: unknown): r is string => typeof r === 'string' && ELIGIBLE_ROLES.includes(r)) : []

    await setUnitCommissionConfig(tenantId, params.id, { enabled, roles })
    await createSafeAuditLog({
      userId: session.user.id, tenantId, action: 'UPDATE', entity: 'UnitCommission', entityId: params.id,
      userName: session.user.name, userRole: session.user.role,
    })
    return NextResponse.json({ success: true, data: { enabled, roles } })
  } catch (err) {
    console.error('[units/commission PUT]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
