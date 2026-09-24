// =============================================================================
// GET /api/site-admin/visits?period=hoje|7|30|90 — relatório de visitas do site
// (porta de /admin/visitas do dagobertoeasycar): totais, por dia, origens,
// aparelhos, páginas, carros mais vistos (com leads), buscas e cidades.
// Dias corridos no fuso de São Paulo. Gate: site.
// =============================================================================

import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { forbiddenResponse, getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModuleForUser } from '@/lib/tenant-modules'
import { vehicleTitle } from '@/lib/site/listing-core'

export const dynamic = 'force-dynamic'

const PERIOD_DAYS: Record<string, number> = { hoje: 1, '7': 7, '30': 30, '90': 90 }
const TZ = 'America/Sao_Paulo'
const DAY = Prisma.sql`to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${TZ}, 'YYYY-MM-DD')`

/** Meia-noite (São Paulo) de `days-1` dias atrás. */
function periodStart(days: number): Date {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())
  return new Date(new Date(`${today}T00:00:00-03:00`).getTime() - (days - 1) * 86_400_000)
}

type Count = { key: string | null; n: number }

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'site')) return forbiddenResponse('Sem acesso ao site da loja.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const key = new URL(req.url).searchParams.get('period') ?? '30'
  const days = PERIOD_DAYS[key] ?? 30
  const since = periodStart(days)
  const W = Prisma.sql`"tenantId" = ${tenantId} AND "createdAt" >= ${since}`
  const PV = Prisma.sql`${W} AND event = 'PAGEVIEW'`
  const by = (col: Prisma.Sql, where: Prisma.Sql, measure: Prisma.Sql = Prisma.sql`count(*)`, limit = 10) =>
    prisma.$queryRaw<Count[]>`SELECT ${col} AS key, (${measure})::int AS n FROM site_events WHERE ${where} GROUP BY 1 ORDER BY 2 DESC LIMIT ${limit}`

  try {
    const [totals, perDay, sources, devices, sections, vehicles, searches, cities, leads, leadsByVehicle] = await Promise.all([
      prisma.$queryRaw<{ views: number; visitors: number; sessions: number; newVisitors: number; whatsapp: number }[]>`
        SELECT count(*) FILTER (WHERE event = 'PAGEVIEW')::int AS views,
               count(DISTINCT "visitorId") FILTER (WHERE event = 'PAGEVIEW')::int AS visitors,
               count(DISTINCT "sessionId") FILTER (WHERE event = 'PAGEVIEW')::int AS sessions,
               count(*) FILTER (WHERE event = 'PAGEVIEW' AND "isNewVisitor")::int AS "newVisitors",
               count(*) FILTER (WHERE event = 'WHATSAPP_CLICK')::int AS whatsapp
        FROM site_events WHERE ${W}`,
      prisma.$queryRaw<{ day: string; views: number; visitors: number }[]>`
        SELECT ${DAY} AS day, count(*)::int AS views, count(DISTINCT "visitorId")::int AS visitors
        FROM site_events WHERE ${PV} GROUP BY 1 ORDER BY 1`,
      // Cada entrada (primeira página da sessão) tem a origem; o resto é "interno".
      by(Prisma.sql`source`, Prisma.sql`${PV} AND source <> 'interno'`),
      by(Prisma.sql`device`, PV, Prisma.sql`count(DISTINCT "visitorId")`),
      by(Prisma.sql`section`, PV),
      by(Prisma.sql`"vehicleId"`, Prisma.sql`${PV} AND "vehicleId" IS NOT NULL`, Prisma.sql`count(*)`, 15),
      by(Prisma.sql`"searchQuery"`, Prisma.sql`${PV} AND "searchQuery" IS NOT NULL`),
      by(Prisma.sql`coalesce(city || ' / ' || region, city, region)`, Prisma.sql`${PV} AND (city IS NOT NULL OR region IS NOT NULL)`, Prisma.sql`count(DISTINCT "visitorId")`),
      prisma.marketingLead.count({ where: { tenantId, source: 'SITE', createdAt: { gte: since } } }),
      prisma.marketingLead.groupBy({ by: ['vehicleId'], where: { tenantId, source: 'SITE', createdAt: { gte: since }, vehicleId: { not: null } }, _count: { _all: true } }),
    ])

    const ids = vehicles.map((v) => v.key).filter((x): x is string => !!x)
    const cars = ids.length ? await prisma.vehicle.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, brand: true, model: true, version: true, year: true, modelYear: true } }) : []
    const titleOf = new Map(cars.map((c) => [c.id, vehicleTitle(c)]))
    const leadsOf = new Map(leadsByVehicle.map((l) => [l.vehicleId, l._count._all]))

    // Dias sem visita também aparecem (barra zerada).
    const series: { day: string; views: number; visitors: number }[] = []
    const got = new Map(perDay.map((d) => [d.day, d]))
    for (let i = 0; i < days; i++) {
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(since.getTime() + i * 86_400_000 + 3_600_000))
      series.push(got.get(day) ?? { day, views: 0, visitors: 0 })
    }

    const t = totals[0] ?? { views: 0, visitors: 0, sessions: 0, newVisitors: 0, whatsapp: 0 }
    return NextResponse.json({
      success: true,
      data: {
        period: key in PERIOD_DAYS ? key : '30', since, totals: { ...t, leads },
        perDay: series, sources, devices, sections, searches, cities,
        vehicles: vehicles.map((v) => ({ id: v.key, title: titleOf.get(v.key ?? '') ?? 'Veículo removido', views: v.n, leads: leadsOf.get(v.key) ?? 0 })),
      },
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
