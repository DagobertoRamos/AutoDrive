// =============================================================================
// POST /api/master/communication/whatsapp/templates/[id]/toggle
// =============================================================================

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireMaster, logMasterAction } from '@/lib/master-guards'
import { handlePrismaError } from '@/lib/prisma-errors'

export async function POST(req: NextRequest, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const { session, error } = await requireMaster()
  if (error) return error
  try {
    const tpl = await prisma.whatsappTemplate.findUnique({ where: { id: params.id } })
    if (!tpl) return NextResponse.json({ success: false, error: 'Não encontrado.' }, { status: 404 })

    const updated = await prisma.whatsappTemplate.update({
      where: { id: params.id },
      data:  { active: !tpl.active },
    })

    await logMasterAction(session, 'TOGGLE_WHATSAPP_TEMPLATE', 'WhatsappTemplate', params.id, {
      afterData: { active: updated.active }, req,
    })

    return NextResponse.json({ success: true, data: { id: updated.id, active: updated.active } })
  } catch (err) {
    return handlePrismaError(err)
  }
}
