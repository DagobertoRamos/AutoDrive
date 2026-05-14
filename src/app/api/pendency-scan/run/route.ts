// =============================================================================
// POST /api/pendency-scan/run — Dispara varredura manual de pendências
// Apenas MASTER ou ADM podem acionar manualmente.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { scanTenant, scanAllTenants } from '@/services/pendencyScanner'
import { z } from 'zod'

const schema = z.object({
  tenantId: z.string().optional(), // se omitido e MASTER: varre todos os tenants
})

export async function POST(req: NextRequest) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    }

    const isMaster = session.user.role === 'MASTER'
    const isAdm    = session.user.role === 'ADM'

    if (!isMaster && !isAdm) {
      return NextResponse.json({ success: false, error: 'Sem permissão' }, { status: 403 })
    }

    const body = req.headers.get('content-type')?.includes('application/json')
      ? schema.parse(await req.json())
      : {}

    const targetTenantId = body.tenantId ?? (isMaster ? undefined : session.user.tenantId)

    let report: unknown

    if (isMaster && !targetTenantId) {
      // MASTER sem tenantId especificado → varre todos
      report = await scanAllTenants()
    } else if (targetTenantId) {
      const results = await scanTenant(targetTenantId)
      report = {
        startedAt:    results[0] ? new Date() : new Date(),
        finishedAt:   new Date(),
        results,
        totalCreated: results.reduce((s, r) => s + r.created, 0),
        totalUpdated: results.reduce((s, r) => s + r.updated, 0),
        totalErrors:  results.reduce((s, r) => s + r.errors.length, 0),
      }
    } else {
      return NextResponse.json({ success: false, error: 'tenantId obrigatório' }, { status: 400 })
    }

    return NextResponse.json({ success: true, data: report })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: err.errors[0]?.message }, { status: 400 })
    }
    console.error('[POST /api/pendency-scan/run]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
