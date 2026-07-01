// =============================================================================
// /api/internal/pendencies/auto-archive/run — job protegido de arquivamento.
// Usa CRON_SECRET (padrão existente) ou PENDENCIES_JOB_SECRET, se configurado.
// Header: Authorization: Bearer <secret> ou x-cron-secret.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { archiveResolvedPendenciesJob } from '@/lib/pendencies/auto-archive'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function receivedSecret(req: NextRequest): string {
  const x = req.headers.get('x-cron-secret')
  if (x) return x
  const auth = req.headers.get('authorization')
  return auth?.startsWith('Bearer ') ? auth.slice(7) : ''
}

function authorized(req: NextRequest): boolean {
  const got = receivedSecret(req)
  const secrets = [process.env.PENDENCIES_JOB_SECRET, process.env.CRON_SECRET].filter((value): value is string => Boolean(value))
  return secrets.length > 0 && secrets.includes(got)
}

async function run(req: NextRequest) {
  if (!authorized(req)) {
    if (new URL(req.url).searchParams.get('diag') === '1') {
      const got = receivedSecret(req)
      return NextResponse.json({
        success: false,
        diag: {
          cronSecretSet: Boolean(process.env.CRON_SECRET),
          pendenciesJobSecretSet: Boolean(process.env.PENDENCIES_JOB_SECRET),
          gotLen: got.length,
        },
      }, { status: 401 })
    }
    return NextResponse.json({ success: false, error: 'Não autorizado.' }, { status: 401 })
  }

  const searchParams = new URL(req.url).searchParams
  const tenantId = searchParams.get('tenantId') || undefined
  const limitParam = Number(searchParams.get('limit'))
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined
  const startedAt = Date.now()

  try {
    const report = await archiveResolvedPendenciesJob({ tenantId, limit })
    return NextResponse.json({ success: true, durationMs: Date.now() - startedAt, ...report })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[pendencies/auto-archive/run] erro:', msg)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}

export const GET = run
export const POST = run
