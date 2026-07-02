// =============================================================================
// API: /api/commissions/recalc — RECÁLCULO MANUAL AUTORIZADO por período (Parte 15)
//
// POST { period: "yyyy-MM", unitId?, sellerId?, apply?: boolean }
//   • apply omitido/false → PRÉVIA (dryRun): mostra o que MUDARIA, sem gravar.
//   • apply === true       → aplica de fato e registra auditoria.
//
// Restrito a MASTER/ADM/GERENTE_GERAL/FINANCEIRO (permissão commissions.recalc).
// Sempre escopado ao tenant da sessão — nunca cruza lojas.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { recalcCommissionsForPeriod, isValidPeriod } from '@/lib/commission/recalc'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    if (!canAccessModule(session.user.role, 'commissions.recalc')) {
      return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })
    }
    { const gate = await assertModuleEnabled(session.user, 'commissions'); if (gate) return gate }

    const body = await req.json().catch(() => ({}))
    const period = String(body?.period ?? '').trim()
    if (!isValidPeriod(period)) {
      return NextResponse.json({ success: false, error: 'Período inválido. Use o formato AAAA-MM.' }, { status: 400 })
    }

    const unitId   = body?.unitId ? String(body.unitId) : null
    const sellerId = body?.sellerId ? String(body.sellerId) : null
    const apply    = body?.apply === true

    const result = await recalcCommissionsForPeriod({
      tenantId: session.user.tenantId ?? null,
      period,
      unitId,
      sellerId,
      dryRun: !apply,
      triggeredBy: session.user.id,
    })

    return NextResponse.json({ success: true, data: result })
  } catch (err) {
    return handlePrismaError(err)
  }
}
