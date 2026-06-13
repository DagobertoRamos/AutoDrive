// =============================================================================
// GET  /api/notification-rules — Listar regras de notificação
// POST /api/notification-rules — Criar nova regra
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const ALLOWED_ROLES = ['MASTER', 'ADM', 'GERENTE_GERAL']

const schema = z.object({
  name:              z.string().min(2, 'Nome obrigatório'),
  description:       z.string().optional(),
  module:            z.enum(['DEALS', 'PENDENCIES', 'COMMISSIONS', 'STOCK', 'CRM', 'WHATSAPP']),
  conditionType:     z.string().min(1, 'Tipo de condição obrigatório'),
  conditionConfig:   z.record(z.unknown()).optional(),
  priority:          z.enum(['BAIXA', 'MEDIA', 'ALTA', 'URGENTE']).default('MEDIA'),
  severity:          z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  slaMinutes:        z.number().int().min(0).optional().nullable(),
  channels:          z.array(z.enum(['APP_WEB', 'APP_MOBILE', 'WHATSAPP', 'EMAIL', 'PUSH'])).default(['APP_WEB']),
  targetRoles:       z.array(z.string()).default(['GERENTE']),
  escalationRoles:   z.array(z.string()).default([]),
  escalationAfterMinutes: z.number().int().min(0).optional().nullable(),
  maxPerDay:         z.number().int().min(1).max(100).default(10),
  isActive:          z.boolean().default(true),
  startsAt:          z.string().datetime().optional().nullable(),
  endsAt:            z.string().datetime().optional().nullable(),
  // scope preenchido automaticamente baseado no role
})

export async function GET(req: NextRequest) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    }

    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ success: false, error: 'Sem permissão' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const moduleFilter = searchParams.get('module') || undefined
    const isActive = searchParams.get('isActive')

    const where: Record<string, unknown> = {}

    if (session.user.role === 'MASTER') {
      // MASTER vê todas
    } else {
      // ADM/Gerente vê as globais + as do seu tenant
      where.OR = [
        { scope: 'GLOBAL' },
        { tenantId: session.user.tenantId },
      ]
    }

    if (moduleFilter) where.module = moduleFilter
    if (isActive !== null) where.isActive = isActive === 'true'

    const rules = await prisma.notificationRule.findMany({
      where,
      include: {
        creator: { select: { id: true, name: true, role: true } },
      },
      orderBy: [{ scope: 'asc' }, { createdAt: 'desc' }],
    })

    return NextResponse.json({ success: true, data: rules })
  } catch (err) {
    console.error('[GET /api/notification-rules]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    }

    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ success: false, error: 'Sem permissão' }, { status: 403 })
    }

    const data = schema.parse(await req.json())

    // MASTER pode criar global; ADM/Gerente cria para seu tenant
    const scope    = session.user.role === 'MASTER' ? 'GLOBAL' : 'TENANT'
    const tenantId = session.user.role === 'MASTER' ? null : session.user.tenantId

    const rule = await prisma.notificationRule.create({
      data: {
        scope,
        tenantId,
        name:             data.name,
        description:      data.description,
        module:           data.module,
        conditionType:    data.conditionType,
        conditionConfig:  data.conditionConfig as never ?? undefined,
        priority:         data.priority,
        severity:         data.severity,
        slaMinutes:       data.slaMinutes,
        channels:         data.channels,
        targetRoles:      data.targetRoles,
        escalationRoles:  data.escalationRoles,
        escalationAfterMinutes: data.escalationAfterMinutes,
        maxPerDay:        data.maxPerDay,
        isActive:         data.isActive,
        startsAt:         data.startsAt ? new Date(data.startsAt) : undefined,
        endsAt:           data.endsAt   ? new Date(data.endsAt)   : undefined,
        createdByUserId:  session.user.id,
      },
    })

    return NextResponse.json({ success: true, data: rule }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: err.errors[0]?.message }, { status: 400 })
    }
    console.error('[POST /api/notification-rules]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
