// =============================================================================
// /api/master/sheets/[id]/tabs
// GET  — lista abas do importador
// POST — adiciona nova aba
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z }             from 'zod'
import { requireMaster } from '@/lib/master-guards'
import { prisma }        from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'

const createTabSchema = z.object({
  sheetName:     z.string().min(1, 'Nome da aba obrigatório'),
  internalName:  z.string().optional(),
  gid:           z.string().optional(),            // GID numérico da aba
  monthReference: z.string().optional(),           // "Abril", "Maio", etc.
  description:   z.string().optional(),
  sortOrder:     z.number().int().optional().default(0),
  active:        z.boolean().default(true),
  headerRow:     z.number().int().min(1).default(1),
})

export async function GET(_req: NextRequest, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const { error } = await requireMaster()
  if (error) return error

  try {
    const tabs = await prisma.googleSheetTab.findMany({
      where:   { configId: params.id },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    })
    return NextResponse.json({ success: true, data: tabs })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: NextRequest, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const { error } = await requireMaster()
  if (error) return error

  try {
    // Verifica que o importador existe
    const config = await prisma.googleSheetConfig.findUnique({ where: { id: params.id } })
    if (!config) return NextResponse.json({ success: false, error: 'Importador não encontrado.' }, { status: 404 })

    const body   = await req.json()
    const parsed = createTabSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ success: false, errors: parsed.error.flatten().fieldErrors }, { status: 400 })
    }

    const { sheetName, internalName, ...rest } = parsed.data

    const tab = await prisma.googleSheetTab.create({
      data: {
        configId:    params.id,
        sheetName,
        internalName: internalName ?? sheetName,
        ...rest,
      },
    })

    return NextResponse.json({ success: true, data: tab }, { status: 201 })
  } catch (err) {
    return handlePrismaError(err)
  }
}
