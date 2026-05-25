// =============================================================================
// /api/master/communication/whatsapp/templates/[id]
// GET / PATCH / DELETE
// =============================================================================

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireMaster, logMasterAction } from '@/lib/master-guards'
import { handlePrismaError } from '@/lib/prisma-errors'

const WHATSAPP_PURPOSES = ['GENERAL','NOTICES','PROFILE_CHANGED','PASSWORD_RESET','PENDENCY','NEGOTIATION'] as const

const updateSchema = z.object({
  name:                z.string().min(1).optional(),
  description:         z.string().nullable().optional(),
  templateName:        z.string().min(1).optional(),
  purpose:             z.enum(WHATSAPP_PURPOSES).optional(),
  bodyText:            z.string().nullable().optional(),
  variables:           z.array(z.string()).optional(),
  hasHeaderImage:      z.boolean().optional(),
  headerImageUrl:      z.string().url().or(z.literal('')).nullable().optional(),
  expectedParamsCount: z.coerce.number().int().min(0).optional(),
  active:              z.boolean().optional(),
})

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await requireMaster()
  if (error) return error
  try {
    const tpl = await prisma.whatsappTemplate.findUnique({ where: { id: params.id } })
    if (!tpl) return NextResponse.json({ success: false, error: 'Não encontrado.' }, { status: 404 })
    return NextResponse.json({ success: true, data: tpl })
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
    const d = parsed.data
    const data: Record<string, unknown> = { ...d }
    if (d.headerImageUrl !== undefined) data.headerImageUrl = d.headerImageUrl || null

    const updated = await prisma.whatsappTemplate.update({
      where: { id: params.id },
      data,
    })

    await logMasterAction(session, 'UPDATE_WHATSAPP_TEMPLATE', 'WhatsappTemplate', updated.id, {
      afterData: { name: updated.name, purpose: updated.purpose }, req,
    })

    return NextResponse.json({ success: true, data: updated })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireMaster()
  if (error) return error
  try {
    const tpl = await prisma.whatsappTemplate.findUnique({ where: { id: params.id } })
    if (!tpl) return NextResponse.json({ success: false, error: 'Não encontrado.' }, { status: 404 })

    await prisma.whatsappTemplate.delete({ where: { id: params.id } })

    await logMasterAction(session, 'DELETE_WHATSAPP_TEMPLATE', 'WhatsappTemplate', params.id, {
      beforeData: { name: tpl.name, purpose: tpl.purpose }, req,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
