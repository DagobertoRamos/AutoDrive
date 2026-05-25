// =============================================================================
// /api/master/communication/whatsapp/templates
// GET  — lista (filtro ?purpose=…)
// POST — cria
// =============================================================================

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireMaster, logMasterAction } from '@/lib/master-guards'
import { handlePrismaError } from '@/lib/prisma-errors'

const WHATSAPP_PURPOSES = ['GENERAL','NOTICES','PROFILE_CHANGED','PASSWORD_RESET','PENDENCY','NEGOTIATION'] as const

const createSchema = z.object({
  tenantId:            z.string().nullable().optional(),
  name:                z.string().min(1, 'Nome obrigatório.'),
  description:         z.string().optional(),
  templateName:        z.string().min(1, 'Nome técnico (Meta) obrigatório.'),
  purpose:             z.enum(WHATSAPP_PURPOSES).optional().default('GENERAL'),
  bodyText:            z.string().optional(),
  variables:           z.array(z.string()).optional().default([]),
  hasHeaderImage:      z.boolean().optional().default(false),
  headerImageUrl:      z.string().url().or(z.literal('')).optional(),
  expectedParamsCount: z.coerce.number().int().min(0).optional().default(0),
  active:              z.boolean().optional().default(true),
})

export async function GET(req: NextRequest) {
  const { error } = await requireMaster()
  if (error) return error
  try {
    const url = new URL(req.url)
    const purpose = url.searchParams.get('purpose')

    const where: Prisma.WhatsappTemplateWhereInput = {}
    if (purpose && (WHATSAPP_PURPOSES as readonly string[]).includes(purpose)) {
      where.purpose = purpose
    }

    const list = await prisma.whatsappTemplate.findMany({
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
    const created = await prisma.whatsappTemplate.create({
      data: {
        tenantId:            d.tenantId ?? null,
        name:                d.name,
        description:         d.description ?? null,
        templateName:        d.templateName,
        purpose:             d.purpose ?? 'GENERAL',
        bodyText:            d.bodyText ?? null,
        variables:           d.variables ?? [],
        hasHeaderImage:      d.hasHeaderImage ?? false,
        headerImageUrl:      d.headerImageUrl || null,
        expectedParamsCount: d.expectedParamsCount ?? 0,
        active:              d.active ?? true,
      },
    })

    await logMasterAction(session, 'CREATE_WHATSAPP_TEMPLATE', 'WhatsappTemplate', created.id, {
      afterData: { name: created.name, purpose: created.purpose, templateName: created.templateName }, req,
    })

    return NextResponse.json({ success: true, data: created })
  } catch (err) {
    return handlePrismaError(err)
  }
}
