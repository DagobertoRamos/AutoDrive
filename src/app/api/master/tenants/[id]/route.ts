// =============================================================================
// /api/master/tenants/[id] — Detalhar, atualizar e excluir tenant (MASTER only)
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { requireMaster, logMasterAction } from '@/lib/master-guards'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'

// ── GET ──────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { error } = await requireMaster()
  if (error) return error

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: params.id },
      include: {
        // ⚠️ Tenant tem: units, users, modules, deals — NÃO tem pendencies direto
        units: {
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        },
        _count: {
          select: {
            users:   true,
            units:   true,
            deals:   true,
            modules: true,
          },
        },
      },
    })

    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant não encontrado.' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: tenant })
  } catch (err) {
    console.error('[GET /api/master/tenants/:id]', err)
    return handlePrismaError(err)
  }
}

// ── PUT ──────────────────────────────────────────────────────────────────────

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { session, error } = await requireMaster()
  if (error) return error

  try {
    const body = await req.json()

    // Whitelist explícita — sem ...rest
    const {
      name, razaoSocial, nomeFantasia, cnpj, phone, email,
      address, logradouro, numero, complemento, bairro, city, state,
      slogan, primaryColor, secondaryColor, plan, status,
      maxUsers, maxVehicles, maxUnits,
      responsavel, responsavelEmail, responsavelPhone, notes, trialEndsAt,
    } = body

    const existing = await prisma.tenant.findUnique({ where: { id: params.id } })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Tenant não encontrado.' }, { status: 404 })
    }

    const updated = await prisma.tenant.update({
      where: { id: params.id },
      data: {
        ...(name             != null && { name:             String(name).trim() }),
        ...(razaoSocial      != null && { razaoSocial:      String(razaoSocial).trim()      || null }),
        ...(nomeFantasia     != null && { nomeFantasia:     String(nomeFantasia).trim()     || null }),
        ...(cnpj             != null && { cnpj:             String(cnpj).trim()             || null }),
        ...(phone            != null && { phone:            String(phone).trim()            || null }),
        ...(email            != null && { email:            String(email).trim()            || null }),
        ...(address          != null && { address:          String(address).trim()          || null }),
        ...(logradouro       != null && { logradouro:       String(logradouro).trim()       || null }),
        ...(numero           != null && { numero:           String(numero).trim()           || null }),
        ...(complemento      != null && { complemento:      String(complemento).trim()      || null }),
        ...(bairro           != null && { bairro:           String(bairro).trim()           || null }),
        ...(city             != null && { city:             String(city).trim()             || null }),
        ...(state            != null && { state:            String(state).trim()            || null }),
        ...(slogan           != null && { slogan:           String(slogan).trim()           || null }),
        ...(primaryColor     != null && { primaryColor:     String(primaryColor) }),
        ...(secondaryColor   != null && { secondaryColor:   String(secondaryColor)          || null }),
        ...(plan             != null && { plan:             String(plan)    as never }),
        ...(status           != null && { status:           String(status)  as never }),
        ...(maxUsers         != null && { maxUsers:         Math.max(1, Number(maxUsers)    || 10) }),
        ...(maxVehicles      != null && { maxVehicles:      Math.max(1, Number(maxVehicles) || 100) }),
        ...(maxUnits         != null && { maxUnits:         Math.max(1, Number(maxUnits)    || 1) }),
        ...(responsavel      != null && { responsavel:      String(responsavel).trim()      || null }),
        ...(responsavelEmail != null && { responsavelEmail: String(responsavelEmail).trim() || null }),
        ...(responsavelPhone != null && { responsavelPhone: String(responsavelPhone).trim() || null }),
        ...(notes            != null && { notes:            String(notes).trim()            || null }),
        ...(trialEndsAt      != null && { trialEndsAt:      trialEndsAt ? new Date(trialEndsAt) : null }),
      },
    })

    await logMasterAction(session, 'UPDATE_TENANT', 'Tenant', params.id, {
      afterData: { name: updated.name, status: updated.status, plan: updated.plan },
      req,
    })

    return NextResponse.json({ success: true, data: updated, message: 'Tenant atualizado com sucesso.' })
  } catch (err) {
    console.error('[PUT /api/master/tenants/:id]', err)
    return handlePrismaError(err)
  }
}

// ── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { session, error } = await requireMaster()
  if (error) return error

  try {
    const existing = await prisma.tenant.findUnique({
      where: { id: params.id },
      include: { _count: { select: { users: true, deals: true } } },
    })

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Tenant não encontrado.' }, { status: 404 })
    }

    if (existing._count.users > 0 || existing._count.deals > 0) {
      return NextResponse.json(
        { success: false, error: 'Não é possível excluir um tenant com usuários ou negociações cadastradas.' },
        { status: 409 },
      )
    }

    await prisma.tenant.delete({ where: { id: params.id } })

    await logMasterAction(session, 'DELETE_TENANT', 'Tenant', params.id, {
      beforeData: { name: existing.name },
      req,
    })

    return NextResponse.json({ success: true, message: 'Tenant excluído com sucesso.' })
  } catch (err) {
    console.error('[DELETE /api/master/tenants/:id]', err)
    return handlePrismaError(err)
  }
}
