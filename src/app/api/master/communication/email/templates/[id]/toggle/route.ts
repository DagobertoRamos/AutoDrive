// =============================================================================
// POST /api/master/communication/email/templates/[id]/toggle
// =============================================================================

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireMaster, logMasterAction } from '@/lib/master-guards'
import { handlePrismaError } from '@/lib/prisma-errors'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireMaster()
  if (error) return error
  try {
    const tpl = await prisma.emailTemplate.findUnique({ where: { id: params.id } })
    if (!tpl) return NextResponse.json({ success: false, error: 'Não encontrado.' }, { status: 404 })

    const updated = await prisma.emailTemplate.update({
      where: { id: params.id },
      data:  { active: !tpl.active },
    })

    await logMasterAction(session, 'TOGGLE_EMAIL_TEMPLATE', 'EmailTemplate', params.id, {
      afterData: { active: updated.active }, req,
    })

    return NextResponse.json({ success: true, data: { id: updated.id, active: updated.active } })
  } catch (err) {
    return handlePrismaError(err)
  }
}
