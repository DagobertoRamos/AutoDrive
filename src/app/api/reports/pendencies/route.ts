// =============================================================================
// /api/reports/pendencies?view=abertas|resolvidas|sla|responsavel|unidade
// Relatórios de pendências sobre Pendency. Multi-tenant via tenantWhere; gated
// por canAccessModule('logs'). read-only.
//  - abertas:   não finalizadas/canceladas + quebra prioridade/status + vencidas
//  - resolvidas: FINALIZADA + tempo médio de resolução
//  - sla:       com prazo (sla/dueDate) classificadas em no-prazo vs vencida
//  - responsavel/unidade: agregado por responsável/unidade
// =============================================================================

import { NextResponse } from 'next/server'
import type { PendencyStatus } from '@prisma/client'
import { getSessionUser, assertTenantId, tenantWhere, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'
import { assertModuleEnabled } from '@/lib/tenant-modules'

const VIEWS = ['abertas', 'resolvidas', 'sla', 'responsavel', 'unidade'] as const
type View = (typeof VIEWS)[number]

const CLOSED: PendencyStatus[] = ['FINALIZADA', 'CANCELADA']

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'logs')) return forbiddenResponse('Sem acesso a relatórios.')
  { const gate = await assertModuleEnabled(user, 'logs'); if (gate) return gate }

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)
    const { searchParams } = new URL(req.url)
    const viewParam = (searchParams.get('view') ?? 'abertas') as View
    const view: View = VIEWS.includes(viewParam) ? viewParam : 'abertas'
    const now = new Date()

    const isOverdue = (p: { status: PendencyStatus; slaDeadline: Date | null; dueDate: Date | null }) =>
      !CLOSED.includes(p.status) && (
        (p.slaDeadline != null && p.slaDeadline < now) || (p.dueDate != null && p.dueDate < now)
      )

    // ---- Agregados por responsável / unidade ----------------------------
    if (view === 'responsavel' || view === 'unidade') {
      const where = tenantWhere(user.role, tenantId, {})
      const rows = await prisma.pendency.findMany({
        where: where as never,
        take: 5000,
        select: { responsibleId: true, unitId: true, status: true, slaDeadline: true, dueDate: true },
      })
      const keyOf = (r: typeof rows[number]) => (view === 'responsavel' ? r.responsibleId : r.unitId)
      const agg = new Map<string, { total: number; abertas: number; resolvidas: number; vencidas: number }>()
      for (const r of rows) {
        const k = keyOf(r) ?? '__sem__'
        const e = agg.get(k) ?? { total: 0, abertas: 0, resolvidas: 0, vencidas: 0 }
        e.total++
        if (r.status === 'FINALIZADA') e.resolvidas++
        else if (r.status !== 'CANCELADA') e.abertas++
        if (isOverdue(r)) e.vencidas++
        agg.set(k, e)
      }
      const ids = [...agg.keys()].filter((k) => k !== '__sem__')
      const nameMap: Record<string, string> = {}
      if (view === 'responsavel' && ids.length) {
        const sellers = await prisma.seller.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, shortName: true } })
        sellers.forEach((s) => { nameMap[s.id] = s.shortName || s.fullName })
      } else if (view === 'unidade' && ids.length) {
        const units = await prisma.unit.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
        units.forEach((u) => { nameMap[u.id] = u.name })
      }
      const grouped = [...agg.entries()].map(([k, v]) => ({ name: k === '__sem__' ? '—' : (nameMap[k] ?? '—'), ...v })).sort((a, b) => b.total - a.total)
      return NextResponse.json({
        success: true, view,
        summary: { grupos: grouped.length, total: rows.length, abertas: grouped.reduce((s, g) => s + g.abertas, 0), vencidas: grouped.reduce((s, g) => s + g.vencidas, 0) },
        grouped,
      })
    }

    // ---- Listas (abertas / resolvidas / sla) ----------------------------
    const extra: Record<string, unknown> = {}
    if (view === 'abertas') extra.status = { notIn: CLOSED }
    if (view === 'resolvidas') extra.status = 'FINALIZADA'
    if (view === 'sla') { extra.status = { notIn: CLOSED }; extra.OR = [{ slaDeadline: { not: null } }, { dueDate: { not: null } }] }
    const where = tenantWhere(user.role, tenantId, extra)

    const [pends, byStatus, byPriority] = await Promise.all([
      prisma.pendency.findMany({
        where: where as never,
        orderBy: view === 'resolvidas' ? [{ resolvedAt: 'desc' }] : [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        take: 500,
        select: {
          id: true, customerName: true, plate: true, vehicle: true, description: true,
          priority: true, status: true, dueDate: true, slaDeadline: true, resolvedAt: true, createdAt: true,
          responsible: { select: { fullName: true, shortName: true } },
          unit: { select: { name: true } },
        },
      }),
      prisma.pendency.groupBy({ by: ['status'], where: where as never, _count: { _all: true } }),
      prisma.pendency.groupBy({ by: ['priority'], where: where as never, _count: { _all: true } }),
    ])

    const data = pends.map((p) => {
      const resolMs = p.resolvedAt ? p.resolvedAt.getTime() - p.createdAt.getTime() : null
      return {
        id: p.id, customerName: p.customerName, plate: p.plate, vehicle: p.vehicle,
        description: p.description, priority: p.priority, status: p.status,
        responsavel: p.responsible?.shortName || p.responsible?.fullName || '—',
        unidade: p.unit?.name ?? '—',
        dueDate: p.dueDate, slaDeadline: p.slaDeadline, resolvedAt: p.resolvedAt, createdAt: p.createdAt,
        vencida: isOverdue(p),
        horasResolucao: resolMs != null ? Math.round(resolMs / 36e5) : null,
      }
    })

    const vencidas = data.filter((d) => d.vencida).length
    const resolvidasData = data.filter((d) => d.horasResolucao != null)
    const summary: Record<string, number> = {
      count: data.length,
      vencidas,
    }
    if (view === 'resolvidas') {
      summary.tempoMedioHoras = resolvidasData.length ? Math.round(resolvidasData.reduce((s, d) => s + (d.horasResolucao ?? 0), 0) / resolvidasData.length) : 0
    }
    if (view === 'sla') {
      summary.noPrazo = data.length - vencidas
      summary.percentVencidas = data.length ? Math.round((vencidas / data.length) * 100) : 0
    }

    return NextResponse.json({
      success: true, view, summary,
      byStatus: byStatus.map((g) => ({ status: g.status, count: g._count._all })).sort((a, b) => b.count - a.count),
      byPriority: byPriority.map((g) => ({ priority: g.priority, count: g._count._all })),
      data,
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
