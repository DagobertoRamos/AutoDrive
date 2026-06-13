// =============================================================================
// /api/master/feature-flags/[id]
// PATCH  — atualizar flag (incluindo toggle por tenant)
// DELETE — excluir flag
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireMaster, logMasterAction } from '@/lib/master-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const { session, error } = await requireMaster()
  if (error) return error

  try {
    const flag = await prisma.featureFlag.findUnique({ where: { id: params.id } })
    if (!flag) {
      return NextResponse.json({ success: false, error: 'Flag não encontrada.' }, { status: 404 })
    }

    const body = await req.json()
    const { name, description, enabled, rolloutPct, notes, tenantId, tenantEnabled } = body

    // Toggle por tenant específico
    if (tenantId != null && tenantEnabled != null) {
      await prisma.tenantFeatureFlag.upsert({
        where:  { tenantId_flagKey: { tenantId, flagKey: flag.key } },
        create: { tenantId, flagKey: flag.key, enabled: Boolean(tenantEnabled) },
        update: { enabled: Boolean(tenantEnabled) },
      })
      await logMasterAction(session, 'TOGGLE_FLAG_TENANT', 'TenantFeatureFlag', flag.id, {
        tenantId, afterData: { flagKey: flag.key, enabled: tenantEnabled }, req,
      })
      return NextResponse.json({ success: true, message: 'Override por tenant atualizado.' })
    }

    // Atualizar flag global
    const updated = await prisma.featureFlag.update({
      where: { id: params.id },
      data: {
        ...(name        != null && { name:        String(name).trim() }),
        ...(description != null && { description: String(description).trim() || null }),
        ...(enabled     != null && { enabled:     Boolean(enabled) }),
        ...(rolloutPct  != null && { rolloutPct:  Math.min(100, Math.max(0, Number(rolloutPct))) }),
        ...(notes       != null && { notes:       String(notes).trim() || null }),
      },
    })

    await logMasterAction(session, 'UPDATE_FEATURE_FLAG', 'FeatureFlag', params.id, {
      beforeData: { enabled: flag.enabled },
      afterData:  { enabled: updated.enabled },
      req,
    })

    return NextResponse.json({ success: true, data: updated })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function DELETE(
  req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const { session, error } = await requireMaster()
  if (error) return error

  try {
    const flag = await prisma.featureFlag.findUnique({ where: { id: params.id } })
    if (!flag) {
      return NextResponse.json({ success: false, error: 'Flag não encontrada.' }, { status: 404 })
    }

    await prisma.featureFlag.delete({ where: { id: params.id } })

    await logMasterAction(session, 'DELETE_FEATURE_FLAG', 'FeatureFlag', params.id, {
      beforeData: { key: flag.key, name: flag.name }, req,
    })

    return NextResponse.json({ success: true, message: 'Flag excluída.' })
  } catch (err) {
    return handlePrismaError(err)
  }
}
