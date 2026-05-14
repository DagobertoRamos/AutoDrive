// =============================================================================
// API: /api/pendencies — AutoDrive
// Listagem e criação de pendências
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessModule } from '@/lib/permissions'
import { z } from 'zod'

const MANAGER_ROLES  = ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE']
const SELLER_ROLES   = ['VENDEDOR', 'USUARIO_LIDER', 'USUARIO']

const PENDENCY_INCLUDE = {
  responsible:    { select: { id: true, fullName: true, shortName: true, whatsapp: true } },
  manager:        { select: { id: true, fullName: true, whatsapp: true } },
  unit:           { select: { id: true, name: true } },
  resolvedByUser: { select: { id: true, name: true } },
  assignedUser:   { select: { id: true, name: true, role: true } },
} as const

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const status        = searchParams.get('status')       || undefined
    const priority      = searchParams.get('priority')     || undefined
    const severity      = searchParams.get('severity')     || undefined
    const unitId        = searchParams.get('unitId')       || undefined
    const sellerId      = searchParams.get('sellerId')     || undefined
    const managerId     = searchParams.get('managerId')    || undefined
    const originModule  = searchParams.get('originModule') || undefined
    const assignedOnly  = searchParams.get('assignedOnly') === 'true'
    const slaVencida    = searchParams.get('slaVencida')   === 'true'
    const search        = searchParams.get('search')       || undefined
    const page          = Math.max(1, Number(searchParams.get('page')    ?? 1))
    const perPage       = Math.min(100, Number(searchParams.get('perPage') ?? 50))

    const where: Record<string, unknown> = {}

    if (status)       where.status       = status
    if (priority)     where.priority     = priority
    if (severity)     where.severity     = severity
    if (unitId)       where.unitId       = unitId
    if (managerId)    where.managerId    = managerId
    if (originModule) where.originModule = originModule
    if (assignedOnly) where.assignedUserId = { not: null }
    if (slaVencida)   where.AND = [
      { slaDeadline: { lt: new Date() } },
      { status: { notIn: ['FINALIZADA', 'CANCELADA'] } },
    ]

    if (search) {
      where.OR = [
        { customerName: { contains: search, mode: 'insensitive' } },
        { plate:        { contains: search, mode: 'insensitive' } },
        { vehicle:      { contains: search, mode: 'insensitive' } },
        { negotiation:  { contains: search, mode: 'insensitive' } },
        { description:  { contains: search, mode: 'insensitive' } },
      ]
    }

    // Restrições de escopo por role
    if (SELLER_ROLES.includes(session.user.role)) {
      // Vendedor/usuário vê apenas suas próprias pendências
      const seller = await prisma.seller.findFirst({ where: { userId: session.user.id } })
      if (seller) where.responsibleId = seller.id
    } else if (sellerId) {
      where.responsibleId = sellerId
    }

    // Gerente vê apenas pendências da sua unidade
    if (session.user.role === 'GERENTE' && session.user.unitId) {
      where.unitId = session.user.unitId
    }

    // ADM vê apenas pendências do seu tenant
    if (session.user.role === 'ADM' && session.user.tenantId) {
      where.tenantId = session.user.tenantId
    }

    const [total, pendencies] = await Promise.all([
      prisma.pendency.count({ where: where as never }),
      prisma.pendency.findMany({
        where:   where as never,
        include: PENDENCY_INCLUDE,
        orderBy: [
          { priority: 'desc' },    // enum: URGENTE > MEDIA > BAIXA > ALTA (desc alphabetical)
          { slaDeadline: 'asc' },  // SLA mais próximo primeiro (nulls last by default)
          { dueDate: 'asc' },
          { createdAt: 'desc' },
        ],
        skip:    (page - 1) * perPage,
        take:    perPage,
      }),
    ])

    return NextResponse.json({
      success: true,
      data:    pendencies,
      meta: {
        total,
        page,
        perPage,
        totalPages:  Math.ceil(total / perPage),
        hasNextPage: page * perPage < total,
        hasPrevPage: page > 1,
      },
    })
  } catch (err) {
    console.error('[GET /api/pendencies]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

const createSchema = z.object({
  customerName:   z.string().min(1, 'Nome do cliente obrigatório'),
  plate:          z.string().optional(),
  vehicle:        z.string().optional(),
  negotiation:    z.string().optional(),
  description:    z.string().optional(),
  priority:       z.enum(['BAIXA', 'MEDIA', 'ALTA', 'URGENTE']).default('MEDIA'),
  severity:       z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  type:           z.string().optional(),
  unitId:         z.string().min(1, 'Unidade obrigatória'),
  responsibleId:  z.string().min(1, 'Responsável obrigatório'),
  managerId:      z.string().optional(),
  assignedUserId: z.string().optional(),
  customerId:     z.string().optional(),
  vehicleId:      z.string().optional(),
  contractId:     z.string().optional(),
  dueDate:        z.string().optional(),
  slaMinutes:     z.number().int().min(0).optional(),
  originModule:   z.string().optional().default('MANUAL'),
  originRecordId: z.string().optional(),
  notes:          z.string().optional(),
  source:         z.string().optional().default('MANUAL'),
})

export async function POST(req: NextRequest) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    }

    if (!canAccessModule(session.user.role, 'pendencies')) {
      return NextResponse.json({ success: false, error: 'Sem permissão' }, { status: 403 })
    }

    const body   = await req.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Dados inválidos', errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const { dueDate, slaMinutes, ...rest } = parsed.data

    const slaDeadline = slaMinutes
      ? new Date(Date.now() + slaMinutes * 60 * 1000)
      : null

    const pendency = await prisma.pendency.create({
      data: {
        ...rest,
        dueDate:     dueDate ? new Date(dueDate) : null,
        slaMinutes:  slaMinutes,
        slaDeadline,
        status:      'ABERTA',
        allowedDays: [],
      },
      include: PENDENCY_INCLUDE,
    })

    // Histórico de status
    await prisma.pendencyStatusHistory.create({
      data: {
        pendencyId:     pendency.id,
        newStatus:      'ABERTA',
        changedByUserId:session.user.id,
      },
    }).catch(() => {})

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId:    session.user.id,
        userName:  session.user.name,
        userRole:  session.user.role,
        action:    'CREATE',
        entity:    'Pendency',
        entityId:  pendency.id,
        afterData: { status: 'ABERTA', priority: pendency.priority, customerName: pendency.customerName },
      },
    }).catch(() => {})

    return NextResponse.json({ success: true, data: pendency }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/pendencies]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
