// =============================================================================
// /api/master/communication/email/templates
// GET  — lista templates (filtro opcional ?purpose=…)
// POST — cria template
// =============================================================================

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { EmailPurpose, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireMaster, logMasterAction } from '@/lib/master-guards'
import { handlePrismaError } from '@/lib/prisma-errors'

const purposeEnum = z.nativeEnum(EmailPurpose)

const createSchema = z.object({
  tenantId:    z.string().nullable().optional(),
  purpose:     purposeEnum,
  key:         z.string().min(1, 'Key obrigatória.').regex(/^[a-z0-9_]+$/i, 'Use apenas letras, números e _'),
  name:        z.string().min(1, 'Nome obrigatório.'),
  description: z.string().optional(),
  subject:     z.string().min(1, 'Assunto obrigatório.'),
  bodyHtml:    z.string().min(1, 'Corpo HTML obrigatório.'),
  bodyText:    z.string().optional(),
  variables:   z.array(z.string()).optional().default([]),
  active:      z.boolean().optional().default(true),
})

export async function GET(req: NextRequest) {
  const { error } = await requireMaster()
  if (error) return error
  try {
    const url = new URL(req.url)
    const purpose = url.searchParams.get('purpose')

    const where: Prisma.EmailTemplateWhereInput = {}
    if (purpose && (Object.values(EmailPurpose) as string[]).includes(purpose)) {
      where.purpose = purpose as EmailPurpose
    }

    const list = await prisma.emailTemplate.findMany({
      where,
      orderBy: [{ purpose: 'asc' }, { name: 'asc' }],
    })
    return NextResponse.json({ success: true, data: list })
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
    const d = parsed.data

    const created = await prisma.emailTemplate.create({
      data: {
        tenantId:    d.tenantId ?? null,
        purpose:     d.purpose,
        key:         d.key,
        name:        d.name,
        description: d.description ?? null,
        subject:     d.subject,
        bodyHtml:    d.bodyHtml,
        bodyText:    d.bodyText ?? null,
        variables:   d.variables ?? [],
        active:      d.active ?? true,
      },
    })

    await logMasterAction(session, 'CREATE_EMAIL_TEMPLATE', 'EmailTemplate', created.id, {
      afterData: { key: created.key, purpose: created.purpose }, req,
    })

    return NextResponse.json({ success: true, data: created })
  } catch (err) {
    return handlePrismaError(err)
  }
}
