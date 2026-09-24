// =============================================================================
// GET|POST /api/internal/site/feed-import/run
// Cron (Vercel, de hora em hora): importa o estoque das lojas configuradas em
// SITE_FEED_IMPORT (hoje só a AutoDrive, a partir do site antigo).
// Header: Authorization: Bearer <CRON_SECRET>  ou  x-cron-secret: <CRON_SECRET>
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { feedImportSources, runFeedImport } from '@/lib/site/feed-import'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${secret}` || req.headers.get('x-cron-secret') === secret
}

async function handle(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const sources = feedImportSources()
  const results = []
  for (const src of sources) results.push(await runFeedImport(src))
  return NextResponse.json({ success: results.every((r) => r.ok), sources: sources.length, results })
}

export const GET = handle
export const POST = handle
