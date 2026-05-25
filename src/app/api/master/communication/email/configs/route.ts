// =============================================================================
// /api/master/communication/email/configs
// GET  — lista todos os EmailConfig (smtpPass mascarado)
// POST — cria um novo EmailConfig
// =============================================================================

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { EmailPurpose } from '@prisma/client'
import { prisma }            from '@/lib/prisma'
import { requireMaster, logMasterAction } from '@/lib/master-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { encrypt, MASKED }   from '@/lib/crypto'

const purposeEnum = z.nativeEnum(EmailPurpose)

const providerEnum = z.enum(['smtp', 'sendgrid', 'resend', 'mailgun', 'ses'])

const createSchema = z.object({
  tenantId:   z.string().nullable().optional(),
  name:       z.string().min(1, 'Nome obrigatório.'),
  purpose:    purposeEnum.default('SYSTEM' as EmailPurpose),
  isDefault:  z.boolean().optional(),
  provider:   providerEnum.default('smtp'),
  smtpHost:   z.string().optional().nullable(),
  smtpPort:   z.coerce.number().int().positive().default(587),
  smtpSecure: z.boolean().optional().default(false),
  smtpUser:   z.string().optional().nullable(),
  smtpPass:   z.string().optional().nullable(),
  apiKey:     z.string().optional().nullable(),
  domain:     z.string().optional().nullable(),
  region:     z.string().optional().nullable(),
  fromName:   z.string().min(1, 'Nome do remetente obrigatório.'),
  fromEmail:  z.string().email('E-mail do remetente inválido.'),
  replyTo:    z.string().email().or(z.literal('')).optional(),
  active:     z.boolean().optional().default(true),
}).superRefine((data, ctx) => {
  const p = data.provider
  if (p === 'smtp') {
    if (!data.smtpHost) ctx.addIssue({ code: 'custom', path: ['smtpHost'], message: 'Host SMTP obrigatório.' })
    if (!data.smtpUser) ctx.addIssue({ code: 'custom', path: ['smtpUser'], message: 'Usuário SMTP obrigatório.' })
    if (!data.smtpPass) ctx.addIssue({ code: 'custom', path: ['smtpPass'], message: 'Senha SMTP obrigatória.' })
  } else if (p === 'sendgrid' || p === 'resend') {
    if (!data.apiKey) ctx.addIssue({ code: 'custom', path: ['apiKey'], message: 'API key obrigatória.' })
  } else if (p === 'mailgun') {
    if (!data.apiKey) ctx.addIssue({ code: 'custom', path: ['apiKey'], message: 'API key obrigatória.' })
    if (!data.domain) ctx.addIssue({ code: 'custom', path: ['domain'], message: 'Domínio Mailgun obrigatório.' })
  } else if (p === 'ses') {
    if (!data.smtpUser) ctx.addIssue({ code: 'custom', path: ['smtpUser'], message: 'Access Key obrigatória.' })
    if (!data.smtpPass) ctx.addIssue({ code: 'custom', path: ['smtpPass'], message: 'Secret Key obrigatória.' })
  }
})

function maskConfig<T extends { smtpPass: string | null; apiKey?: string | null }>(cfg: T) {
  return {
    ...cfg,
    smtpPass: cfg.smtpPass ? MASKED : '',
    apiKey:   cfg.apiKey   ? MASKED : '',
  }
}

export async function GET() {
  const { error } = await requireMaster()
  if (error) return error

  try {
    const configs = await prisma.emailConfig.findMany({
      orderBy: [{ purpose: 'asc' }, { isDefault: 'desc' }, { createdAt: 'asc' }],
    })
    return NextResponse.json({ success: true, data: configs.map(maskConfig) })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireMaster()
  if (error) return error

  try {
    const raw = await req.json().catch(() => null)
    const parsed = createSchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? 'Dados inválidos.' },
        { status: 400 },
      )
    }
    const data = parsed.data

    // Se marcado como default, desmarca outros do mesmo (tenantId, purpose)
    if (data.isDefault) {
      await prisma.emailConfig.updateMany({
        where: { tenantId: data.tenantId ?? null, purpose: data.purpose },
        data:  { isDefault: false },
      })
    }

    const created = await prisma.emailConfig.create({
      data: {
        tenantId:   data.tenantId ?? null,
        name:       data.name,
        purpose:    data.purpose,
        isDefault:  data.isDefault ?? false,
        provider:   data.provider,
        smtpHost:   data.smtpHost || null,
        smtpPort:   data.smtpPort,
        smtpSecure: data.smtpSecure ?? false,
        smtpUser:   data.smtpUser  || null,
        smtpPass:   data.smtpPass  ? encrypt(data.smtpPass) : null,
        apiKey:     data.apiKey    ? encrypt(data.apiKey)   : null,
        domain:     data.domain    || null,
        region:     data.region    || null,
        fromName:   data.fromName,
        fromEmail:  data.fromEmail,
        replyTo:    data.replyTo || null,
        active:     data.active ?? true,
      },
    })

    await logMasterAction(session, 'CREATE_EMAIL_CONFIG', 'EmailConfig', created.id, {
      afterData: { name: created.name, purpose: created.purpose, fromEmail: created.fromEmail },
      req,
    })

    return NextResponse.json({ success: true, data: maskConfig(created) })
  } catch (err) {
    return handlePrismaError(err)
  }
}
