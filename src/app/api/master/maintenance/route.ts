// =============================================================================
// /api/master/maintenance — Modo de manutenção (MASTER only)
// GET   — estado atual da manutenção global
// POST  — ativar/desativar manutenção
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireMaster, logMasterAction } from '@/lib/master-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const { error } = await requireMaster()
  if (error) return error

  try {
    const modes = await prisma.maintenanceMode.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
    })
    // O modo global mais recente
    const global = modes.find(m => m.scope === 'GLOBAL') ?? null
    return NextResponse.json({ success: true, data: { global, history: modes } })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireMaster()
  if (error) return error

  try {
    const body = await req.json()
    const { active, message, startAt, endAt, scope, scopeId, allowedRoles } = body

    if (active == null) {
      return NextResponse.json(
        { success: false, error: 'Campo "active" é obrigatório.' },
        { status: 400 },
      )
    }

    const mode = await prisma.maintenanceMode.create({
      data: {
        active:       Boolean(active),
        message:      message ? String(message).trim() : null,
        startAt:      startAt ? new Date(startAt) : null,
        endAt:        endAt   ? new Date(endAt)   : null,
        scope:        scope   ? String(scope)      : 'GLOBAL',
        scopeId:      scopeId ? String(scopeId)   : null,
        allowedRoles: Array.isArray(allowedRoles) ? allowedRoles : ['MASTER'],
        activatedBy:  session.id,
      },
    })

    await logMasterAction(
      session,
      active ? 'MAINTENANCE_ON' : 'MAINTENANCE_OFF',
      'MaintenanceMode',
      mode.id,
      { afterData: { active, scope, message }, req },
    )

    return NextResponse.json({
      success: true,
      data: mode,
      message: active ? 'Modo manutenção ativado.' : 'Modo manutenção desativado.',
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
