// =============================================================================
// /api/master/users/[id] — Detalhar, editar e controlar usuário (MASTER only)
//
// GET    — detalhar usuário
// PATCH  — editar dados, role, status, resetar senha, forçar troca, revogar sessões
// DELETE — excluir usuário (com salvaguardas)
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireMaster, logMasterAction } from '@/lib/master-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const { error } = await requireMaster()
  if (error) return error

  try {
    const user = await prisma.user.findUnique({
      where: { id: params.id },
      select: {
        id:                 true,
        name:               true,
        email:              true,
        cpf:                true,
        phone:              true,
        role:               true,
        status:             true,
        tenantId:           true,
        unitId:             true,
        mustChangePassword: true,
        image:              true,
        lastLoginAt:        true,
        createdAt:          true,
        updatedAt:          true,
        tenant:   { select: { id: true, name: true, publicId: true, status: true, plan: true } },
        unit:     { select: { id: true, name: true } },
        position: { select: { id: true, name: true, slug: true, baseRole: true } },
        _count: {
          select: {
            auditLogs:    true,
            notifications: true,
          },
        },
      },
    })

    if (!user) {
      return NextResponse.json({ success: false, error: 'Usuário não encontrado.' }, { status: 404 })
    }

    // Últimos audit logs do usuário
    const recentAudit = await prisma.auditLog.findMany({
      where:   { userId: params.id },
      orderBy: { createdAt: 'desc' },
      take:    10,
      select:  { action: true, entity: true, status: true, ipAddress: true, createdAt: true },
    })

    return NextResponse.json({ success: true, data: { ...user, recentAudit } })
  } catch (err) {
    console.error('[GET /api/master/users/:id]', err)
    return handlePrismaError(err)
  }
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const { session, error } = await requireMaster()
  if (error) return error

  try {
    const existing = await prisma.user.findUnique({
      where: { id: params.id },
      select: { id: true, email: true, role: true, status: true, tenantId: true },
    })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Usuário não encontrado.' }, { status: 404 })
    }

    const body = await req.json()
    const {
      name, email, role, status, tenantId, unitId, positionId,
      mustChangePassword,
      // Dados pessoais
      phone, cpf,
      // Sub-cadastro vendedor (opcional — só se role=VENDEDOR)
      seller: sellerData,
      // Ações especiais
      resetPassword, newPassword,
      action, reason,
    } = body

    // ── Ação especial: resetar senha ──────────────────────────────────────────
    if (action === 'RESET_PASSWORD') {
      if (!newPassword?.trim() || newPassword.length < 6) {
        return NextResponse.json(
          { success: false, error: 'Nova senha deve ter pelo menos 6 caracteres.' },
          { status: 400 },
        )
      }
      const hash = await bcrypt.hash(newPassword, 12)
      await prisma.user.update({
        where: { id: params.id },
        data:  { passwordHash: hash, mustChangePassword: true },
      })
      await logMasterAction(session, 'RESET_USER_PASSWORD', 'User', params.id, {
        tenantId: existing.tenantId,
        reason:   reason ?? 'Reset por MASTER',
        req,
      })
      return NextResponse.json({ success: true, message: 'Senha resetada com sucesso.' })
    }

    // ── Ação especial: banir/ativar/bloquear/inativar ─────────────────────────
    if (action === 'SET_STATUS') {
      if (!status) {
        return NextResponse.json({ success: false, error: 'Status é obrigatório.' }, { status: 400 })
      }
      await prisma.user.update({
        where: { id: params.id },
        data:  { status: status as never },
      })
      await logMasterAction(session, `USER_STATUS_${status}`, 'User', params.id, {
        tenantId: existing.tenantId,
        beforeData: { status: existing.status },
        afterData:  { status },
        reason,
        req,
      })
      return NextResponse.json({ success: true, message: `Status do usuário alterado para ${status}.` })
    }

    // ── Atualização geral ─────────────────────────────────────────────────────
    const updateData: Record<string, unknown> = {}

    if (name             != null) updateData.name               = String(name).trim()
    if (email            != null) updateData.email              = String(email).trim().toLowerCase()
    if (role             != null) updateData.role               = role as never
    if (status           != null) updateData.status             = status as never
    if (tenantId         != null) updateData.tenantId           = tenantId || null
    if (unitId           != null) updateData.unitId             = unitId   || null
    if (mustChangePassword != null) updateData.mustChangePassword = Boolean(mustChangePassword)
    if (phone            != null) updateData.phone              = String(phone).trim() || null
    if (cpf              != null) updateData.cpf                = String(cpf).replace(/\D/g, '') || null
    if (resetPassword    === true) {
      updateData.mustChangePassword = true
    }
    if (positionId !== undefined) {
      if (!positionId) {
        updateData.positionId = null
      } else {
        const pos = await prisma.position.findUnique({
          where: { id: String(positionId) },
          select: { id: true, tenantId: true },
        })
        const targetTenant = (updateData.tenantId as string | null | undefined) ?? existing.tenantId
        if (!pos || (pos.tenantId !== null && pos.tenantId !== targetTenant)) {
          return NextResponse.json(
            { success: false, error: 'Cargo inválido para este tenant.' },
            { status: 400 },
          )
        }
        updateData.positionId = pos.id
      }
    }

    const updated = await prisma.user.update({
      where: { id: params.id },
      data:  updateData,
      select: {
        id: true, name: true, email: true, role: true,
        status: true, tenantId: true, unitId: true,
        mustChangePassword: true, updatedAt: true,
      },
    })

    // Transferência: o registro Seller acompanha a unidade do usuário.
    if (unitId) {
      await prisma.seller.updateMany({ where: { userId: params.id }, data: { unitId: String(unitId) } }).catch(() => {})
    }

    // ── Sub-cadastro Seller (se role atual=VENDEDOR e bloco enviado) ─────────
    if (sellerData && typeof sellerData === 'object' && updated.role === 'VENDEDOR') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sellerPayload: any = {}
      if (sellerData.fullName       != null) sellerPayload.fullName       = String(sellerData.fullName).trim()
      if (sellerData.shortName      != null) sellerPayload.shortName      = String(sellerData.shortName).trim() || null
      if (sellerData.whatsapp       != null) sellerPayload.whatsapp       = String(sellerData.whatsapp).trim() || null
      if (sellerData.cargo          != null) sellerPayload.cargo          = String(sellerData.cargo).trim() || null
      if (sellerData.notes          != null) sellerPayload.notes          = String(sellerData.notes) || null
      if (sellerData.active         != null) sellerPayload.active         = Boolean(sellerData.active)
      if (sellerData.receivesCharge != null) sellerPayload.receivesCharge = Boolean(sellerData.receivesCharge)
      if (Object.keys(sellerPayload).length > 0) {
        try {
          await prisma.seller.update({ where: { userId: params.id }, data: sellerPayload })
        } catch (sellerErr) {
          // Vendedor pode não existir ainda — não bloqueia atualização do User.
          console.warn('[PATCH user] seller update skipped:', sellerErr instanceof Error ? sellerErr.message : sellerErr)
        }
      }
    }

    await logMasterAction(session, 'UPDATE_USER', 'User', params.id, {
      tenantId: existing.tenantId,
      beforeData: { role: existing.role, status: existing.status },
      afterData:  { role: updated.role, status: updated.status },
      reason,
      req,
    })

    return NextResponse.json({ success: true, data: updated, message: 'Usuário atualizado com sucesso.' })
  } catch (err) {
    console.error('[PATCH /api/master/users/:id]', err)
    return handlePrismaError(err)
  }
}

// ── DELETE ─────────────────────────────────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const { session, error } = await requireMaster()
  if (error) return error

  try {
    const existing = await prisma.user.findUnique({
      where: { id: params.id },
      select: { id: true, email: true, role: true, status: true, tenantId: true, name: true },
    })

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Usuário não encontrado.' }, { status: 404 })
    }

    // ── Guard 1: autoexclusão ─────────────────────────────────────────────────
    if (session?.id && session.id === params.id) {
      return NextResponse.json(
        { success: false, error: 'Você não pode excluir seu próprio usuário.' },
        { status: 403 },
      )
    }

    // ── Guard 2: último MASTER ativo ──────────────────────────────────────────
    if (existing.role === 'MASTER') {
      const activeMasters = await prisma.user.count({
        where: { role: 'MASTER', status: 'ATIVO', id: { not: params.id } },
      })
      if (activeMasters < 1) {
        return NextResponse.json(
          { success: false, error: 'Não é possível excluir/inativar o último MASTER ativo do sistema.' },
          { status: 409 },
        )
      }
    }

    // ── Política: SEMPRE soft delete (inativar) ───────────────────────────────
    //
    // User tem 30+ relações non-cascade (auditLogs, sellers, managers,
    // notifications, pendencies, importJobs, contractParseResults, deals
    // como manager/approver/canceller, etc). Hard delete praticamente sempre
    // viola FK constraint. Pra evitar o erro genérico "referência interna
    // inválida" que o usuário tava vendo, optamos por SOFT DELETE seguro:
    // status = INATIVO. O usuário deixa de logar mas todos os históricos
    // permanecem íntegros.
    //
    // Hard delete físico ficaria pra uma rota separada (futura) que faria
    // cascade explícito ou exigiria zerar manualmente as FKs.
    // ─────────────────────────────────────────────────────────────────────────

    if (existing.status === 'INATIVO') {
      return NextResponse.json({
        success: true,
        message: `Usuário ${existing.name} já estava inativado.`,
        already: true,
      })
    }

    await prisma.user.update({
      where: { id: params.id },
      data:  { status: 'INATIVO' },
    })

    await logMasterAction(session, 'INACTIVATE_USER', 'User', params.id, {
      tenantId:   existing.tenantId,
      beforeData: { email: existing.email, role: existing.role, status: existing.status },
      afterData:  { status: 'INATIVO' },
      reason:     `Inativado via Painel MASTER (perfil ${existing.role}).`,
      req,
    })

    return NextResponse.json({
      success: true,
      message: existing.role === 'MASTER'
        ? `MASTER ${existing.name} inativado.`
        : `Usuário ${existing.name} inativado (dados históricos preservados).`,
    })
  } catch (err) {
    console.error('[DELETE /api/master/users/:id]', err)
    return handlePrismaError(err)
  }
}
