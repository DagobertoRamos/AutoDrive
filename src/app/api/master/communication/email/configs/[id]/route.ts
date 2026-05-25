// =============================================================================
// /api/master/communication/email/configs/[id]
// GET    — busca um EmailConfig (smtpPass mascarado)
// PATCH  — atualiza (encrypt smtpPass se vier não-mascarado)
// DELETE — remove
// =============================================================================

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { EmailPurpose } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireMaster, logMasterAction } from '@/lib/master-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { encrypt, isMasked, MASKED } from '@/lib/crypto'

const purposeEnum = z.nativeEnum(EmailPurpose)

const providerEnum = z.enum(['smtp', 'sendgrid', 'resend', 'mailgun', 'ses'])

const updateSchema = z.object({
  name:       z.string().min(1).optional(),
  purpose:    purposeEnum.optional(),
  isDefault:  z.boolean().optional(),
  provider:   providerEnum.optional(),
  smtpHost:   z.string().nullable().optional(),
  smtpPort:   z.coerce.number().int().positive().optional(),
  smtpSecure: z.boolean().optional(),
  smtpUser:   z.string().nullable().optional(),
  smtpPass:   z.string().optional(),
  apiKey:     z.string().optional(),
  domain:     z.string().nullable().optional(),
  region:     z.string().nullable().optional(),
  fromName:   z.string().min(1).optional(),
  fromEmail:  z.string().email().optional(),
  replyTo:    z.string().email().or(z.literal('')).nullable().optional(),
  active:     z.boolean().optional(),
})

function mask<T extends { smtpPass: string | null; apiKey?: string | null }>(cfg: T) {
  return {
    ...cfg,
    smtpPass: cfg.smtpPass ? MASKED : '',
    apiKey:   cfg.apiKey   ? MASKED : '',
  }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await requireMaster()
  if (error) return error
  try {
    const cfg = await prisma.emailConfig.findUnique({ where: { id: params.id } })
    if (!cfg) return NextResponse.json({ success: false, error: 'Não encontrado.' }, { status: 404 })
    return NextResponse.json({ success: true, data: mask(cfg) })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireMaster()
  if (error) return error

  try {
    const raw = await req.json().catch(() => null)
    const parsed = updateSchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? 'Dados inválidos.' },
        { status: 400 },
      )
    }
    const data = parsed.data

    const existing = await prisma.emailConfig.findUnique({ where: { id: params.id } })
    if (!existing) return NextResponse.json({ success: false, error: 'Não encontrado.' }, { status: 404 })

    // Se isDefault=true, desmarca outros do mesmo (tenantId, purpose)
    const targetPurpose = (data.purpose ?? existing.purpose) as EmailPurpose
    const targetTenant  = existing.tenantId
    if (data.isDefault === true) {
      await prisma.emailConfig.updateMany({
        where: { tenantId: targetTenant, purpose: targetPurpose, NOT: { id: existing.id } },
        data:  { isDefault: false },
      })
    }

    const updateData: Record<string, unknown> = {}
    for (const k of ['name','purpose','isDefault','provider','smtpPort','smtpSecure','fromName','fromEmail','active'] as const) {
      if (data[k] !== undefined) updateData[k] = data[k]
    }
    // Strings nuláveis: aceitar string vazia como null
    for (const k of ['smtpHost','smtpUser','domain','region'] as const) {
      if (data[k] !== undefined) updateData[k] = data[k] || null
    }
    if (data.replyTo !== undefined) updateData.replyTo = data.replyTo || null
    if (data.smtpPass !== undefined && data.smtpPass !== '' && !isMasked(data.smtpPass)) {
      updateData.smtpPass = encrypt(data.smtpPass)
    }
    if (data.apiKey !== undefined && data.apiKey !== '' && !isMasked(data.apiKey)) {
      updateData.apiKey = encrypt(data.apiKey)
    }

    const updated = await prisma.emailConfig.update({
      where: { id: params.id },
      data:  updateData,
    })

    await logMasterAction(session, 'UPDATE_EMAIL_CONFIG', 'EmailConfig', updated.id, {
      afterData: { name: updated.name, purpose: updated.purpose, isDefault: updated.isDefault },
      req,
    })

    return NextResponse.json({ success: true, data: mask(updated) })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireMaster()
  if (error) return error
  try {
    const existing = await prisma.emailConfig.findUnique({ where: { id: params.id } })
    if (!existing) return NextResponse.json({ success: false, error: 'Não encontrado.' }, { status: 404 })

    await prisma.emailConfig.delete({ where: { id: params.id } })

    await logMasterAction(session, 'DELETE_EMAIL_CONFIG', 'EmailConfig', params.id, {
      beforeData: { name: existing.name, purpose: existing.purpose }, req,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
