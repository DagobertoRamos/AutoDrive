// =============================================================================
// /api/master/feature-flags — CRUD de feature flags (MASTER only)
// GET  — lista todas as flags com override por tenant
// POST — cria nova flag
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireMaster, logMasterAction } from '@/lib/master-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const { error } = await requireMaster()
  if (error) return error

  try {
    const flags = await prisma.featureFlag.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        tenantFlags: {
          select: { tenantId: true, enabled: true },
        },
      },
    })
    return NextResponse.json({ success: true, data: flags })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireMaster()
  if (error) return error

  try {
    const body = await req.json()
    const { key, name, description, enabled, rolloutPct, notes } = body

    if (!key?.trim() || !name?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Chave e nome são obrigatórios.' },
        { status: 400 },
      )
    }

    const flag = await prisma.featureFlag.create({
      data: {
        key:         String(key).trim().toLowerCase().replace(/\s+/g, '_'),
        name:        String(name).trim(),
        description: description ? String(description).trim() : null,
        enabled:     Boolean(enabled),
        rolloutPct:  Math.min(100, Math.max(0, Number(rolloutPct) || 0)),
        notes:       notes ? String(notes).trim() : null,
      },
    })

    await logMasterAction(session, 'CREATE_FEATURE_FLAG', 'FeatureFlag', flag.id, {
      afterData: { key: flag.key, enabled: flag.enabled },
      req,
    })

    return NextResponse.json({ success: true, data: flag }, { status: 201 })
  } catch (err) {
    return handlePrismaError(err)
  }
}
