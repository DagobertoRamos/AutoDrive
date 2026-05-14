// =============================================================================
// /api/master/plans/[id] — Detalhar, atualizar e excluir plano (MASTER only)
// GET    — detalhe do plano
// PATCH  — atualização parcial
// DELETE — excluir (bloqueado se há tenants usando)
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireMaster, logMasterAction } from '@/lib/master-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { prisma } from '@/lib/prisma'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { error } = await requireMaster()
  if (error) return error

  try {
    const plan = await prisma.plan.findUnique({ where: { id: params.id } })
    if (!plan) {
      return NextResponse.json({ success: false, error: 'Plano não encontrado.' }, { status: 404 })
    }
    const tenantCount = await prisma.tenant.count({ where: { plan: plan.code as never } })
    return NextResponse.json({ success: true, data: { ...plan, tenantCount } })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { session, error } = await requireMaster()
  if (error) return error

  try {
    const existing = await prisma.plan.findUnique({ where: { id: params.id } })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Plano não encontrado.' }, { status: 404 })
    }

    const body = await req.json()
    const {
      name, description, active,
      priceMonthly, priceYearly,
      maxUsers, maxVehicles, maxUnits, maxStorageMb,
      whatsappMonthly, emailMonthly, trialDays,
      allowWhiteLabel, allowCustomDomain, allowGoogleSheets,
      allowAdvancedReports, allowApiAccess,
      modules, sortOrder, notes,
    } = body

    const updated = await prisma.plan.update({
      where: { id: params.id },
      data: {
        ...(name             != null && { name:               String(name).trim() }),
        ...(description      != null && { description:        String(description).trim() || null }),
        ...(active           != null && { active:             Boolean(active) }),
        ...(priceMonthly     != null && { priceMonthly:       Number(priceMonthly) }),
        ...(priceYearly      != null && { priceYearly:        Number(priceYearly) }),
        ...(maxUsers         != null && { maxUsers:           Math.max(1, Number(maxUsers)) }),
        ...(maxVehicles      != null && { maxVehicles:        Math.max(1, Number(maxVehicles)) }),
        ...(maxUnits         != null && { maxUnits:           Math.max(1, Number(maxUnits)) }),
        ...(maxStorageMb     != null && { maxStorageMb:       Math.max(1, Number(maxStorageMb)) }),
        ...(whatsappMonthly  != null && { whatsappMonthly:   Math.max(0, Number(whatsappMonthly)) }),
        ...(emailMonthly     != null && { emailMonthly:      Math.max(0, Number(emailMonthly)) }),
        ...(trialDays        != null && { trialDays:         Math.max(0, Number(trialDays)) }),
        ...(allowWhiteLabel    != null && { allowWhiteLabel:    Boolean(allowWhiteLabel) }),
        ...(allowCustomDomain  != null && { allowCustomDomain:  Boolean(allowCustomDomain) }),
        ...(allowGoogleSheets  != null && { allowGoogleSheets:  Boolean(allowGoogleSheets) }),
        ...(allowAdvancedReports != null && { allowAdvancedReports: Boolean(allowAdvancedReports) }),
        ...(allowApiAccess     != null && { allowApiAccess:    Boolean(allowApiAccess) }),
        ...(Array.isArray(modules) && { modules }),
        ...(sortOrder        != null && { sortOrder: Number(sortOrder) }),
        ...(notes            != null && { notes: String(notes).trim() || null }),
      },
    })

    await logMasterAction(session, 'UPDATE_PLAN', 'Plan', params.id, {
      beforeData: { name: existing.name, active: existing.active },
      afterData:  { name: updated.name, active: updated.active },
      req,
    })

    return NextResponse.json({ success: true, data: updated })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { session, error } = await requireMaster()
  if (error) return error

  try {
    const plan = await prisma.plan.findUnique({ where: { id: params.id } })
    if (!plan) {
      return NextResponse.json({ success: false, error: 'Plano não encontrado.' }, { status: 404 })
    }

    // Bloquear exclusão se há tenants usando
    const tenantCount = await prisma.tenant.count({ where: { plan: plan.code as never } })
    if (tenantCount > 0) {
      return NextResponse.json(
        { success: false, error: `Não é possível excluir: ${tenantCount} tenant(s) usam este plano. Desative-o primeiro.` },
        { status: 409 },
      )
    }

    await prisma.plan.delete({ where: { id: params.id } })

    await logMasterAction(session, 'DELETE_PLAN', 'Plan', params.id, {
      beforeData: { code: plan.code, name: plan.name },
      req,
    })

    return NextResponse.json({ success: true, message: 'Plano excluído com sucesso.' })
  } catch (err) {
    return handlePrismaError(err)
  }
}
