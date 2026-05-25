// =============================================================================
// /api/master/communication/email/templates/[id]
// GET / PATCH / DELETE
// =============================================================================

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { EmailPurpose } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireMaster, logMasterAction } from '@/lib/master-guards'
import { handlePrismaError } from '@/lib/prisma-errors'

const updateSchema = z.object({
  purpose:     z.nativeEnum(EmailPurpose).optional(),
  key:         z.string().min(1).regex(/^[a-z0-9_]+$/i).optional(),
  name:        z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  subject:     z.string().min(1).optional(),
  bodyHtml:    z.string().min(1).optional(),
  bodyText:    z.string().nullable().optional(),
  variables:   z.array(z.string()).optional(),
  active:      z.boolean().optional(),
})

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await requireMaster()
  if (error) return error
  try {
    const tpl = await prisma.emailTemplate.findUnique({ where: { id: params.id } })
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
    const updated = await prisma.emailTemplate.update({
      where: { id: params.id },
      data:  parsed.data,
    })

    await logMasterAction(session, 'UPDATE_EMAIL_TEMPLATE', 'EmailTemplate', updated.id, {
      afterData: { key: updated.key, purpose: updated.purpose }, req,
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
    const tpl = await prisma.emailTemplate.findUnique({ where: { id: params.id } })
    if (!tpl) return NextResponse.json({ success: false, error: 'Não encontrado.' }, { status: 404 })

    await prisma.emailTemplate.delete({ where: { id: params.id } })

    await logMasterAction(session, 'DELETE_EMAIL_TEMPLATE', 'EmailTemplate', params.id, {
      beforeData: { key: tpl.key, purpose: tpl.purpose }, req,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
