// =============================================================================
// /api/master/users — Gestão global de usuários (MASTER only)
//
// GET  — lista todos os usuários da plataforma com filtros
// POST — cria usuário em qualquer tenant
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { requireMaster, logMasterAction } from '@/lib/master-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { sendActivationEmail } from '@/lib/auth-mailer'

export async function GET(req: NextRequest) {
  const { error } = await requireMaster()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const tenantId  = searchParams.get('tenantId')
  const role      = searchParams.get('role')
  const status    = searchParams.get('status')
  const search    = searchParams.get('search')
  const page      = Math.max(1, Number(searchParams.get('page') || 1))
  const limit     = Math.min(100, Math.max(1, Number(searchParams.get('limit') || 50)))
  const skip      = (page - 1) * limit

  try {
    const where: Record<string, unknown> = {}
    if (tenantId) where.tenantId = tenantId
    if (role)     where.role     = role
    if (status)   where.status   = status
    if (search) {
      where.OR = [
        { name:  { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id:                 true,
          name:               true,
          email:              true,
          role:               true,
          status:             true,
          tenantId:           true,
          unitId:             true,
          mustChangePassword: true,
          lastLoginAt:        true,
          createdAt:          true,
          tenant:   { select: { id: true, name: true, publicId: true, status: true } },
          unit:     { select: { id: true, name: true } },
          position: { select: { id: true, name: true, slug: true, baseRole: true } },
        },
      }),
      prisma.user.count({ where }),
    ])

    return NextResponse.json({
      success: true,
      data: users,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    })
  } catch (err) {
    console.error('[GET /api/master/users]', err)
    return handlePrismaError(err)
  }
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireMaster()
  if (error) return error

  try {
    const body = await req.json()
    const { name, email, password, role, status, tenantId, unitId, mustChangePassword, positionId } = body

    if (!name?.trim() || !email?.trim() || !password?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Nome, e-mail e senha são obrigatórios.' },
        { status: 400 },
      )
    }

    // MASTER pode criar sem tenantId (outro MASTER/SUPPORT), demais precisam de tenantId
    const targetRole = role ?? 'USUARIO'
    if (targetRole !== 'MASTER' && !tenantId) {
      return NextResponse.json(
        { success: false, error: 'Usuários não-MASTER precisam de tenantId.' },
        { status: 400 },
      )
    }

    // Verificar se tenant existe (se fornecido)
    if (tenantId) {
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } })
      if (!tenant) {
        return NextResponse.json({ success: false, error: 'Tenant não encontrado.' }, { status: 404 })
      }
    }

    // Valida positionId (sistema ou do mesmo tenant)
    let validatedPositionId: string | null = null
    if (positionId) {
      const pos = await prisma.position.findUnique({
        where: { id: String(positionId) },
        select: { id: true, tenantId: true },
      })
      if (!pos || (pos.tenantId !== null && pos.tenantId !== (tenantId ?? null))) {
        return NextResponse.json(
          { success: false, error: 'Cargo inválido para este tenant.' },
          { status: 400 },
        )
      }
      validatedPositionId = pos.id
    }

    const passwordHash = await bcrypt.hash(password, 12)

    const user = await prisma.user.create({
      data: {
        name:               String(name).trim(),
        email:              String(email).trim().toLowerCase(),
        passwordHash,
        role:               targetRole as never,
        status:             status ?? 'ATIVO',
        tenantId:           tenantId ?? null,
        unitId:             unitId   ?? null,
        mustChangePassword: mustChangePassword !== false,
        positionId:         validatedPositionId,
      },
    })

    await logMasterAction(session, 'CREATE_USER', 'User', user.id, {
      tenantId: tenantId ?? null,
      afterData: { email: user.email, role: user.role, tenantId: user.tenantId },
      req,
    })

    // ── Envio do e-mail de ativação ─────────────────────────────────────────
    // Quando o usuário é criado em estado PENDENTE (não acessa imediatamente),
    // ou explicitamente solicitado via `sendActivationEmail: true` no body,
    // geramos um token e enviamos o link de ativação. O envio é best-effort:
    // falhas SMTP NÃO impedem a criação do usuário.
    const shouldSendActivation =
      body?.sendActivationEmail === true ||
      (status ?? 'ATIVO') === 'PENDENTE'

    if (shouldSendActivation) {
      try {
        const token       = crypto.randomBytes(32).toString('hex')
        const EXPIRES_MS  = 7 * 24 * 60 * 60 * 1000 // 7 dias
        const expiresAt   = new Date(Date.now() + EXPIRES_MS)

        await prisma.passwordReset.create({
          data: { userId: user.id, token, expiresAt },
        })

        const result = await sendActivationEmail({
          user: { id: user.id, name: user.name, email: user.email, tenantId: user.tenantId },
          token,
          expiresAtMs: EXPIRES_MS,
        })

        if (!result.success) {
          console.error(
            `[master/users CREATE] FALHA AO ENVIAR ATIVAÇÃO para ${user.email}:`,
            result.errorCode, result.errorMessage,
          )
        } else {
          console.info(
            `[master/users CREATE] ativação enviada para ${user.email} (messageId=${result.messageId ?? '-'})`,
          )
        }
      } catch (mailErr) {
        console.error('[master/users CREATE] erro ao gerar/enviar token de ativação:', mailErr)
      }
    }

    // Não retornar passwordHash
    const { passwordHash: _ph, ...safeUser } = user as typeof user & { passwordHash: string }
    return NextResponse.json(
      { success: true, data: safeUser, message: 'Usuário criado com sucesso.' },
      { status: 201 },
    )
  } catch (err) {
    console.error('[POST /api/master/users]', err)
    return handlePrismaError(err)
  }
}
