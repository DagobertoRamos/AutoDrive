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
  { params }: { params: { id: string } },
) {
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
        tenant: { select: { id: true, name: true, publicId: true, status: true, plan: true } },
        unit:   { select: { id: true, name: true } },
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
  { params }: { params: { id: string } },
) {
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
      name, email, role, status, tenantId, unitId,
      mustChangePassword,
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
    if (resetPassword    === true) {
      updateData.mustChangePassword = true
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
  { params }: { params: { id: string } },
) {
  const { session, error } = await requireMaster()
  if (error) return error

  try {
    const existing = await prisma.user.findUnique({
      where: { id: params.id },
      include: {
        _count: {
          select: { auditLogs: true, pendenciesResolved: true, commissionExtracts: true },
        },
      },
    })

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Usuário não encontrado.' }, { status: 404 })
    }

    // Não permite excluir outro MASTER por esta rota (medida de segurança)
    if (existing.role === 'MASTER') {
      return NextResponse.json(
        { success: false, error: 'Não é permitido excluir usuários MASTER por esta rota.' },
        { status: 403 },
      )
    }

    // Preferência: inativar ao invés de deletar fisicamente se tem dados vinculados
    const hasData = existing._count.auditLogs > 0 ||
                    existing._count.pendenciesResolved > 0 ||
                    existing._count.commissionExtracts > 0

    if (hasData) {
      // Soft delete — inativar
      await prisma.user.update({
        where: { id: params.id },
        data:  { status: 'INATIVO' },
      })
      await logMasterAction(session, 'INACTIVATE_USER', 'User', params.id, {
        tenantId: existing.tenantId,
        beforeData: { email: existing.email, role: existing.role },
        reason: 'Inativado por MASTER (dados históricos preservados)',
        req,
      })
      return NextResponse.json({
        success: true,
        message: 'Usuário inativado (dados históricos preservados).',
      })
    }

    await prisma.user.delete({ where: { id: params.id } })

    await logMasterAction(session, 'DELETE_USER', 'User', params.id, {
      beforeData: { email: existing.email, role: existing.role },
      req,
    })

    return NextResponse.json({ success: true, message: 'Usuário excluído com sucesso.' })
  } catch (err) {
    console.error('[DELETE /api/master/users/:id]', err)
    return handlePrismaError(err)
  }
}
