import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog, forbiddenResponse, getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { assertModuleEnabled, canAccessModuleForUser } from '@/lib/tenant-modules'
import { applyCrmScope, normalizePhone, resolveCrmScope } from '@/lib/crm/shared'

function leadPriorityOf(row: {
  source: string | null
  status: string
  lastContactAt: Date | null
  convertedDealId: string | null
  createdAt: Date
}) {
  const now = Date.now()
  const lastTouch = row.lastContactAt?.getTime() ?? row.createdAt.getTime()
  const hoursWithoutTouch = (now - lastTouch) / 3600000
  if (row.status === 'CONVERTED') return 'LOW'
  if (row.status === 'LOST' || row.status === 'DISCARDED') return 'LOW'
  if (row.source === 'AUTOCONF' && !row.convertedDealId && hoursWithoutTouch >= 24) return 'URGENT'
  if (hoursWithoutTouch >= 48) return 'HIGH'
  if (row.status === 'NEW' || row.status === 'ASSIGNED' || row.status === 'QUALIFIED') return 'HIGH'
  return 'NORMAL'
}

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm')) return forbiddenResponse('Sem acesso ao CRM.')
  { const gate = await assertModuleEnabled(user, 'crm'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))

  try {
    const scope = await resolveCrmScope(user)
    if (!scope) return forbiddenResponse('Sem acesso aos leads do CRM.')
    const sp = new URL(req.url).searchParams
    const page = Math.max(1, Number(sp.get('page') ?? 1))
    const perPage = Math.min(100, Math.max(1, Number(sp.get('perPage') ?? 25)))
    const search = sp.get('search')?.trim()
    const status = sp.get('status')?.trim() || undefined
    const onlyDelayed = sp.get('delayed') === 'true'
    const onlyAutoconf = sp.get('source') === 'AUTOCONF'
    const priority = sp.get('priority')?.trim() || ''
    const where = applyCrmScope({ tenantId }, scope, user)

    if (status) where.status = status as never
    if (onlyAutoconf) where.source = 'AUTOCONF'
    if (scope === 'all' && sp.get('unitId')) where.unitId = sp.get('unitId')
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } },
        { source: { contains: search, mode: 'insensitive' } },
      ]
    }
    if (onlyDelayed) {
      where.lastContactAt = { lt: new Date(Date.now() - 48 * 60 * 60 * 1000) }
      where.status = { notIn: ['CONVERTED', 'LOST', 'DISCARDED'] }
    }

    const [rows, users, units] = await Promise.all([
      prisma.marketingLead.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }],
        take: 300,
        select: {
          id: true, name: true, phone: true, email: true, source: true, status: true,
          unitId: true, assignedToUserId: true, customerId: true, vehicleId: true,
          convertedDealId: true, lostReason: true, notes: true, lastContactAt: true,
          createdAt: true, updatedAt: true,
        },
      }),
      prisma.user.findMany({ where: { tenantId }, select: { id: true, name: true } }),
      prisma.unit.findMany({ where: { tenantId }, select: { id: true, name: true } }),
    ])

    const userNames = new Map(users.map((item) => [item.id, item.name]))
    const unitNames = new Map(units.map((item) => [item.id, item.name]))

    const enriched = rows.map((row) => {
      const priorityLevel = leadPriorityOf(row)
      return {
        ...row,
        priority: priorityLevel,
        assignedToUserName: row.assignedToUserId ? userNames.get(row.assignedToUserId) ?? null : null,
        unitName: row.unitId ? unitNames.get(row.unitId) ?? null : null,
      }
    })
    const filtered = priority ? enriched.filter((row) => row.priority === priority) : enriched
    const sorted = filtered.sort((a, b) => {
      const order = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 }
      const byPriority = order[a.priority as keyof typeof order] - order[b.priority as keyof typeof order]
      if (byPriority !== 0) return byPriority
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
    const total = sorted.length
    const paged = sorted.slice((page - 1) * perPage, page * perPage)

    return NextResponse.json({
      success: true,
      data: paged,
      meta: { total, page, perPage, totalPages: Math.max(1, Math.ceil(total / perPage)), scope },
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm.lead.create')) return forbiddenResponse('Sem permissão para criar lead.')
  { const gate = await assertModuleEnabled(user, 'crm'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const name = String(body.name ?? '').trim() || null
    const phone = String(body.phone ?? '').trim() || null
    const email = String(body.email ?? '').trim() || null
    const source = String(body.source ?? 'MANUAL').trim() || 'MANUAL'
    const notes = String(body.notes ?? '').trim() || null
    const explicitAssigned = body.assignedToUserId ? String(body.assignedToUserId) : null
    if (!name && !phone && !email) {
      return NextResponse.json({ success: false, error: 'Informe nome, telefone ou e-mail.' }, { status: 400 })
    }

    const canEditUnit = await canAccessModuleForUser(user, 'crm.lead.edit.unit')
    const canTransfer = await canAccessModuleForUser(user, 'crm.lead.transfer')
    const assignedToUserId = explicitAssigned && (canEditUnit || canTransfer || explicitAssigned === user.id)
      ? explicitAssigned
      : user.id
    const unitId = body.unitId && canEditUnit ? String(body.unitId) : (user.unitId ?? null)

    const phoneDigits = normalizePhone(phone)
    const existing = await prisma.marketingLead.findFirst({
      where: {
        tenantId,
        status: { notIn: ['CONVERTED', 'LOST', 'DISCARDED'] },
        OR: [
          ...(email ? [{ email: { equals: email, mode: 'insensitive' as const } }] : []),
          ...(phoneDigits ? [{ phone: { contains: phoneDigits } }] : []),
        ],
      },
      select: { id: true, assignedToUserId: true },
      orderBy: { updatedAt: 'desc' },
    })

    if (existing) {
      const updated = await prisma.marketingLead.update({
        where: { id: existing.id },
        data: {
          ...(name ? { name } : {}),
          ...(phone ? { phone } : {}),
          ...(email ? { email } : {}),
          ...(notes ? { notes } : {}),
          lastContactAt: new Date(),
          ...(canTransfer ? { assignedToUserId } : {}),
        },
      })
      await createSafeAuditLog({ userId: user.id, tenantId, action: 'CRM_LEAD_DEDUP', entity: 'MarketingLead', entityId: updated.id, userName: user.name, userRole: user.role })
      return NextResponse.json({ success: true, data: { id: updated.id, deduplicated: true } })
    }

    const lead = await prisma.marketingLead.create({
      data: {
        tenantId,
        unitId,
        name,
        phone,
        email,
        source,
        notes,
        status: 'NEW',
        assignedToUserId,
        createdById: user.id,
        metadata: { origin: 'CRM_MANUAL' },
      },
    })

    await createSafeAuditLog({ userId: user.id, tenantId, action: 'CREATE', entity: 'MarketingLead', entityId: lead.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: { id: lead.id, deduplicated: false } }, { status: 201 })
  } catch (err) {
    return handlePrismaError(err)
  }
}
