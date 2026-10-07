// =============================================================================
// /api/master/tenants/[id] — Detalhar, atualizar e excluir tenant (MASTER only)
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { requireMaster, logMasterAction } from '@/lib/master-guards'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'
import { countsRetention, effectivePurgeAt } from '@/lib/tenant-lifecycle/core'
import { ensureRetention } from '@/lib/tenant-lifecycle/retention'
import { deleteTenantCompletely } from '@/lib/tenant-lifecycle/delete-now'

export const maxDuration = 300

// ── GET ──────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
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

    // Loja desativada: prazo de guarda de 5 anos até a exclusão automática.
    let retention = null
    if (countsRetention(tenant.status)) {
      const rec = await ensureRetention(tenant)
      retention = { ...rec, effectivePurgeAt: effectivePurgeAt(rec).toISOString() }
    }

    return NextResponse.json({ success: true, data: { ...tenant, retention } })
  } catch (err) {
    console.error('[GET /api/master/tenants/:id]', err)
    return handlePrismaError(err)
  }
}

// ── PUT ──────────────────────────────────────────────────────────────────────

export async function PUT(
  req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
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

    if (name != null && !String(name).trim()) {
      return NextResponse.json({ success: false, error: 'Informe o nome de exibição.' }, { status: 400 })
    }

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

// DELETE ?dryRun=1 → prévia { rows, files }. DELETE { confirmName } → apaga a
// loja inteira (banco + arquivos), como se nunca tivesse existido.
export async function DELETE(
  req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  const params = await Promise.resolve(ctxArg.params)
  const { session, error } = await requireMaster()
  if (error) return error

  try {
    const existing = await prisma.tenant.findUnique({ where: { id: params.id }, select: { id: true, name: true, cnpj: true } })
    if (!existing) return NextResponse.json({ success: false, error: 'Loja não encontrada.' }, { status: 404 })

    if (new URL(req.url).searchParams.get('dryRun') === '1') {
      const prev = await deleteTenantCompletely(params.id, { dryRun: true })
      if (!prev.ok) return NextResponse.json({ success: false, error: `A exclusão seria bloqueada: ${prev.error}` }, { status: 409 })
      return NextResponse.json({ success: true, data: { rows: prev.rows, files: prev.files, name: existing.name } })
    }

    const body = await req.json().catch(() => ({})) as { confirmName?: string }
    if ((body.confirmName ?? '').trim().toLowerCase() !== existing.name.trim().toLowerCase()) {
      return NextResponse.json({ success: false, error: 'Digite o nome da loja para confirmar.' }, { status: 400 })
    }

    const r = await deleteTenantCompletely(params.id)
    if (!r.ok) return NextResponse.json({ success: false, error: `Nada foi apagado: ${r.error}` }, { status: 409 })

    // Registro do MASTER (sem vínculo com a loja, que deixou de existir).
    await logMasterAction(session, 'DELETE_TENANT', 'Tenant', params.id, {
      tenantId: null,
      beforeData: { name: existing.name },
      afterData: { rows: r.rows, files: r.files, filesFailed: r.filesFailed },
      req,
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      message: `Loja ${existing.name} excluída: ${r.rows} registro(s) e ${r.files} arquivo(s) apagados${r.filesFailed ? ` (${r.filesFailed} arquivo(s) já não existiam)` : ''}.`,
    })
  } catch (err) {
    console.error('[DELETE /api/master/tenants/:id]', err)
    return handlePrismaError(err)
  }
}
