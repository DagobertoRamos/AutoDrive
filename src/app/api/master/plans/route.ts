// =============================================================================
// /api/master/plans — CRUD de planos da plataforma (MASTER only)
// GET   — lista todos os planos com contagem de tenants
// POST  — cria novo plano
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireMaster, logMasterAction } from '@/lib/master-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const { session, error } = await requireMaster()
  if (error) return error

  try {
    const plans = await prisma.plan.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    })

    // Contagem de tenants por code de plano
    const tenantCounts = await prisma.tenant.groupBy({
      by: ['plan'],
      _count: { _all: true },
    })
    const countMap: Record<string, number> = {}
    for (const t of tenantCounts) countMap[t.plan] = t._count._all

    const enriched = plans.map(p => ({ ...p, tenantCount: countMap[p.code] ?? 0 }))

    return NextResponse.json({ success: true, data: enriched })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireMaster()
  if (error) return error

  try {
    const body = await req.json()
    const {
      code, name, description,
      priceMonthly, priceYearly,
      maxUsers, maxVehicles, maxUnits, maxStorageMb,
      whatsappMonthly, emailMonthly, trialDays,
      allowWhiteLabel, allowCustomDomain, allowGoogleSheets,
      allowAdvancedReports, allowApiAccess,
      modules, sortOrder, notes,
    } = body

    if (!code?.trim() || !name?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Código e nome do plano são obrigatórios.' },
        { status: 400 },
      )
    }

    const plan = await prisma.plan.create({
      data: {
        code:               String(code).trim().toUpperCase(),
        name:               String(name).trim(),
        description:        description ? String(description).trim() : null,
        priceMonthly:       priceMonthly != null ? Number(priceMonthly) : null,
        priceYearly:        priceYearly  != null ? Number(priceYearly)  : null,
        maxUsers:           Number(maxUsers)        || 10,
        maxVehicles:        Number(maxVehicles)     || 100,
        maxUnits:           Number(maxUnits)        || 1,
        maxStorageMb:       Number(maxStorageMb)    || 1024,
        whatsappMonthly:    Number(whatsappMonthly) || 1000,
        emailMonthly:       Number(emailMonthly)    || 5000,
        trialDays:          Number(trialDays)       || 14,
        allowWhiteLabel:    Boolean(allowWhiteLabel),
        allowCustomDomain:  Boolean(allowCustomDomain),
        allowGoogleSheets:  allowGoogleSheets !== false,
        allowAdvancedReports: Boolean(allowAdvancedReports),
        allowApiAccess:     Boolean(allowApiAccess),
        modules:            Array.isArray(modules) ? modules : [],
        sortOrder:          Number(sortOrder) || 0,
        notes:              notes ? String(notes).trim() : null,
      },
    })

    await logMasterAction(session, 'CREATE_PLAN', 'Plan', plan.id, {
      afterData: { code: plan.code, name: plan.name },
      req,
    })

    return NextResponse.json({ success: true, data: plan }, { status: 201 })
  } catch (err) {
    return handlePrismaError(err)
  }
}
