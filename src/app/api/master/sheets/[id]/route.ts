// =============================================================================
// /api/master/sheets/[id]
// GET    — detalhe do importador
// PATCH  — atualiza configuração
// DELETE — remove o importador e suas abas
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z }             from 'zod'
import { requireMaster, logMasterAction } from '@/lib/master-guards'
import { prisma }        from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'

const updateSchema = z.object({
  name:          z.string().min(1).max(100).optional(),
  spreadsheetId: z.string().min(1).optional(),
  description:   z.string().optional(),
  tenantId:      z.string().optional().nullable(),
  unitId:        z.string().optional().nullable(),
  dedupeField:   z.string().optional(),
  columnMapping: z.record(z.unknown()).optional(),
  active:        z.boolean().optional(),
})

export async function GET(_req: NextRequest, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const { error } = await requireMaster()
  if (error) return error

  try {
    const config = await prisma.googleSheetConfig.findUnique({
      where:   { id: params.id },
      include: {
        tabs:       { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
        importJobs: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    })
    if (!config) return NextResponse.json({ success: false, error: 'Importador não encontrado.' }, { status: 404 })
    return NextResponse.json({ success: true, data: config })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function PATCH(req: NextRequest, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const { session, error } = await requireMaster()
  if (error) return error

  try {
    const body   = await req.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ success: false, errors: parsed.error.flatten().fieldErrors }, { status: 400 })
    }

    const { columnMapping, ...rest } = parsed.data

    const config = await prisma.googleSheetConfig.update({
      where: { id: params.id },
      data:  {
        ...rest,
        ...(columnMapping ? { columnMapping: JSON.parse(JSON.stringify(columnMapping)) } : {}),
      },
      include: { tabs: true },
    })

    await logMasterAction(session, 'UPDATE_SHEETS_CONFIG', 'GoogleSheetConfig', config.id, {
      afterData: { name: config.name }, req,
    })

    return NextResponse.json({ success: true, data: config })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function DELETE(_req: NextRequest, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const { session, error } = await requireMaster()
  if (error) return error

  try {
    await prisma.googleSheetConfig.delete({ where: { id: params.id } })

    await logMasterAction(session, 'DELETE_SHEETS_CONFIG', 'GoogleSheetConfig', params.id, { req: _req })

    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
