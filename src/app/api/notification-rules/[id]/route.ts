// =============================================================================
// PATCH  /api/notification-rules/[id] — Atualizar regra
// DELETE /api/notification-rules/[id] — Remover regra
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const ALLOWED_ROLES = ['MASTER', 'ADM', 'GERENTE_GERAL']

const patchSchema = z.object({
  name:              z.string().min(2).optional(),
  description:       z.string().optional(),
  priority:          z.enum(['BAIXA', 'MEDIA', 'ALTA', 'URGENTE']).optional(),
  severity:          z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  slaMinutes:        z.number().int().min(0).nullable().optional(),
  channels:          z.array(z.string()).optional(),
  targetRoles:       z.array(z.string()).optional(),
  escalationRoles:   z.array(z.string()).optional(),
  escalationAfterMinutes: z.number().int().min(0).nullable().optional(),
  maxPerDay:         z.number().int().min(1).max(100).optional(),
  isActive:          z.boolean().optional(),
  conditionConfig:   z.record(z.unknown()).optional(),
  startsAt:          z.string().datetime().nullable().optional(),
  endsAt:            z.string().datetime().nullable().optional(),
})

async function getRule(id: string, role: string, tenantId?: string | null) {
  if (role === 'MASTER') {
    return prisma.notificationRule.findUnique({ where: { id } })
  }
  return prisma.notificationRule.findFirst({
    where: { id, tenantId: tenantId! },
  })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    }

    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ success: false, error: 'Sem permissão' }, { status: 403 })
    }

    const existing = await getRule(params.id, session.user.role, session.user.tenantId)
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Regra não encontrada' }, { status: 404 })
    }

    // Apenas MASTER pode editar regras globais
    if (existing.scope === 'GLOBAL' && session.user.role !== 'MASTER') {
      return NextResponse.json(
        { success: false, error: 'Apenas o Master pode editar regras globais' },
        { status: 403 },
      )
    }

    const data = patchSchema.parse(await req.json())

    const updated = await prisma.notificationRule.update({
      where: { id: params.id },
      data: {
        ...data,
        conditionConfig: data.conditionConfig as never ?? undefined,
        startsAt: data.startsAt !== undefined ? (data.startsAt ? new Date(data.startsAt) : null) : undefined,
        endsAt:   data.endsAt   !== undefined ? (data.endsAt   ? new Date(data.endsAt)   : null) : undefined,
      },
    })

    return NextResponse.json({ success: true, data: updated })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: err.errors[0]?.message }, { status: 400 })
    }
    console.error('[PATCH /api/notification-rules/[id]]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    }

    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ success: false, error: 'Sem permissão' }, { status: 403 })
    }

    const existing = await getRule(params.id, session.user.role, session.user.tenantId)
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Regra não encontrada' }, { status: 404 })
    }

    if (existing.scope === 'GLOBAL' && session.user.role !== 'MASTER') {
      return NextResponse.json(
        { success: false, error: 'Apenas o Master pode remover regras globais' },
        { status: 403 },
      )
    }

    await prisma.notificationRule.delete({ where: { id: params.id } })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/notification-rules/[id]]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
