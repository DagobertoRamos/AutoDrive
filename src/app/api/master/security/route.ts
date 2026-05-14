// =============================================================================
// /api/master/security — Política de segurança global (MASTER only)
//
// GET   — retorna política atual
// PATCH — atualiza política
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireMaster, logMasterAction } from '@/lib/master-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const { error } = await requireMaster()
  if (error) return error

  try {
    let policy = await prisma.securityPolicy.findFirst({
      where: { scope: 'GLOBAL' },
    })

    // Criar com defaults se não existir
    if (!policy) {
      policy = await prisma.securityPolicy.create({
        data: { scope: 'GLOBAL' },
      })
    }

    return NextResponse.json({ success: true, data: policy })
  } catch (err) {
    console.error('[GET /api/master/security]', err)
    return handlePrismaError(err)
  }
}

export async function PATCH(req: NextRequest) {
  const { session, error } = await requireMaster()
  if (error) return error

  try {
    const body = await req.json()

    const {
      minPasswordLength, requireUppercase, requireNumber, requireSpecialChar,
      passwordExpiryDays, sessionMaxAgeSecs, inactivityTimeoutSecs,
      maxActiveSessions, maxLoginAttempts, lockoutDurationMins,
      require2FA, require2FAForMaster, masterIpAllowlist,
      dataRetentionDays,
    } = body

    const data: Record<string, unknown> = { updatedById: session.id }

    if (minPasswordLength     != null) data.minPasswordLength     = Math.max(6, Number(minPasswordLength))
    if (requireUppercase      != null) data.requireUppercase      = Boolean(requireUppercase)
    if (requireNumber         != null) data.requireNumber         = Boolean(requireNumber)
    if (requireSpecialChar    != null) data.requireSpecialChar    = Boolean(requireSpecialChar)
    if (passwordExpiryDays    != null) data.passwordExpiryDays    = Math.max(0, Number(passwordExpiryDays))
    if (sessionMaxAgeSecs     != null) data.sessionMaxAgeSecs     = Math.max(900, Number(sessionMaxAgeSecs)) // min 15min
    if (inactivityTimeoutSecs != null) data.inactivityTimeoutSecs = Math.max(0, Number(inactivityTimeoutSecs))
    if (maxActiveSessions     != null) data.maxActiveSessions     = Math.max(1, Number(maxActiveSessions))
    if (maxLoginAttempts      != null) data.maxLoginAttempts      = Math.max(3, Number(maxLoginAttempts))
    if (lockoutDurationMins   != null) data.lockoutDurationMins   = Math.max(1, Number(lockoutDurationMins))
    if (require2FA            != null) data.require2FA            = Boolean(require2FA)
    if (require2FAForMaster   != null) data.require2FAForMaster   = Boolean(require2FAForMaster)
    if (dataRetentionDays     != null) data.dataRetentionDays     = Math.max(30, Number(dataRetentionDays))
    if (Array.isArray(masterIpAllowlist)) data.masterIpAllowlist  = masterIpAllowlist.map(String)

    // Upsert singleton
    let policy = await prisma.securityPolicy.findFirst({ where: { scope: 'GLOBAL' } })
    if (!policy) {
      policy = await prisma.securityPolicy.create({ data: { scope: 'GLOBAL' } })
    }

    const updated = await prisma.securityPolicy.update({
      where: { id: policy.id },
      data,
    })

    await logMasterAction(session, 'UPDATE_SECURITY_POLICY', 'SecurityPolicy', updated.id, {
      afterData: {
        require2FA: updated.require2FA,
        require2FAForMaster: updated.require2FAForMaster,
        maxLoginAttempts: updated.maxLoginAttempts,
      },
      req,
    })

    return NextResponse.json({
      success: true,
      data: updated,
      message: 'Política de segurança atualizada com sucesso.',
    })
  } catch (err) {
    console.error('[PATCH /api/master/security]', err)
    return handlePrismaError(err)
  }
}
