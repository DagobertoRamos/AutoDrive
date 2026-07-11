// =============================================================================
// GET  /api/quality/events — lista eventos de qualidade (gestão).
// POST /api/quality/events — aplica evento manual (retroativo suportado).
// Gate: GET = sellerQueue.reports; POST = sellerQueue.manage.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { canAccessModule } from '@/lib/permissions'
import { unitFromRequest, getUnitConfig } from '@/lib/seller-queue/queue'
import { applyQualityEvent } from '@/lib/quality/events'
import { MANUAL_APPLY_TYPES, QUALITY_EVENT_TYPE_LABELS, QualityEventType } from '@/lib/quality/types'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'sellerQueue.reports')) return forbiddenResponse('Sem acesso.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const sp = new URL(req.url).searchParams
  const sellerId   = sp.get('sellerId') ?? undefined
  const category   = sp.get('category') ?? undefined
  const type       = sp.get('type')     ?? undefined
  const onlyActive = sp.get('active') === 'true'
  const page       = Math.max(1, Number(sp.get('page')    ?? 1))
  const perPage    = Math.min(50, Math.max(1, Number(sp.get('perPage') ?? 25)))

  try {
    const where = {
      tenantId,
      ...(sellerId  ? { sellerId }   : {}),
      ...(category  ? { category }   : {}),
      ...(type      ? { type }       : {}),
      ...(onlyActive ? { active: true } : {}),
    }
    const [total, rows] = await Promise.all([
      prisma.qualityEvent.count({ where }),
      prisma.qualityEvent.findMany({ where, orderBy: { appliedAt: 'desc' }, skip: (page-1)*perPage, take: perPage }),
    ])

    const sellerIds = [...new Set(rows.map(r => r.sellerId))]
    const users = sellerIds.length ? await prisma.user.findMany({ where: { id: { in: sellerIds } }, select: { id: true, name: true } }).catch(() => []) : []
    const nameOf = new Map(users.map(u => [u.id, u.name]))

    return NextResponse.json({
      success: true,
      data: rows.map(r => ({ ...r, sellerName: nameOf.get(r.sellerId) ?? r.sellerId, typeLabel: QUALITY_EVENT_TYPE_LABELS[r.type as QualityEventType] ?? r.type })),
      meta: { total, page, perPage, totalPages: Math.max(1, Math.ceil(total / perPage)) },
    })
  } catch (err) { return NextResponse.json({ success: false, error: 'Erro.' }, { status: 500 }) }
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'sellerQueue.manage')) return forbiddenResponse('Sem permissão.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const unitId = unitFromRequest(req, user.unitId)

  try {
    const b = await req.json().catch(() => ({}))
    const sellerId = b?.sellerId ? String(b.sellerId).trim() : null
    const type     = b?.type     ? String(b.type)             : null
    const reason   = b?.reason   ? String(b.reason).trim()    : ''
    const points   = typeof b?.points === 'number' ? b.points : undefined
    const appliedAt = b?.appliedAt ? new Date(b.appliedAt) : undefined

    if (!sellerId) return NextResponse.json({ success: false, error: 'Informe o vendedor.' }, { status: 400 })
    if (!type || !MANUAL_APPLY_TYPES.has(type as QualityEventType)) return NextResponse.json({ success: false, error: `Tipo inválido para aplicação manual. Tipos válidos: ${[...MANUAL_APPLY_TYPES].join(', ')}` }, { status: 400 })
    if (!reason || reason.length < 5) return NextResponse.json({ success: false, error: 'Motivo obrigatório (mín. 5 caracteres).' }, { status: 400 })

    const seller = await prisma.user.findFirst({ where: { id: sellerId, tenantId }, select: { id: true, name: true } })
    if (!seller) return NextResponse.json({ success: false, error: 'Vendedor não encontrado.' }, { status: 404 })

    const unitCfg = await getUnitConfig(tenantId, unitId ?? '')

    const eventId = await applyQualityEvent({
      tenantId, sellerId, unitId,
      type: type as QualityEventType,
      reason, points, appliedAt,
      referenceId:   b?.referenceId   ? String(b.referenceId)   : null,
      referenceType: b?.referenceType ? String(b.referenceType) : null,
      appliedById: user.id,
      cfgJson: unitCfg?.config,
    })

    if (!eventId) return NextResponse.json({ success: false, error: 'Erro ao aplicar evento.' }, { status: 500 })
    return NextResponse.json({ success: true, data: { eventId, sellerId, sellerName: seller.name, type, points } }, { status: 201 })
  } catch (err) { return NextResponse.json({ success: false, error: 'Erro.' }, { status: 500 }) }
}
