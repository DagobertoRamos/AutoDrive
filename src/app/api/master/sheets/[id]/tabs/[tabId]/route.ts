// =============================================================================
// /api/master/sheets/[id]/tabs/[tabId]
// PATCH  — atualiza aba
// DELETE — remove aba
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z }             from 'zod'
import { requireMaster } from '@/lib/master-guards'
import { prisma }        from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'

const updateTabSchema = z.object({
  sheetName:      z.string().min(1).optional(),
  internalName:   z.string().optional(),
  gid:            z.string().optional().nullable(),
  monthReference: z.string().optional().nullable(),
  description:    z.string().optional().nullable(),
  sortOrder:      z.number().int().optional(),
  active:         z.boolean().optional(),
  headerRow:      z.number().int().min(1).optional(),
})

export async function PATCH(req: NextRequest, ctxArg: { params: { id: string; tabId: string } | Promise<{ id: string; tabId: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const { error } = await requireMaster()
  if (error) return error

  try {
    const body   = await req.json()
    const parsed = updateTabSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ success: false, errors: parsed.error.flatten().fieldErrors }, { status: 400 })
    }

    const tab = await prisma.googleSheetTab.update({
      where: { id: params.tabId, configId: params.id },
      data:  parsed.data,
    })

    return NextResponse.json({ success: true, data: tab })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function DELETE(_req: NextRequest, ctxArg: { params: { id: string; tabId: string } | Promise<{ id: string; tabId: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const { error } = await requireMaster()
  if (error) return error

  try {
    await prisma.googleSheetTab.delete({ where: { id: params.tabId, configId: params.id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
