// =============================================================================
// GET /api/master/sheets/[id]/auto-sync/jobs
// Histórico paginado de execuções do auto-sync.
// Query: page, perPage, status, triggerType
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireMaster }   from '@/lib/master-guards'
import { prisma }          from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'

export async function GET(req: NextRequest, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const { error } = await requireMaster()
  if (error) return error

  try {
    const { searchParams } = new URL(req.url)
    const page        = Math.max(1, Number(searchParams.get('page')    ?? 1))
    const perPage     = Math.min(50, Math.max(5, Number(searchParams.get('perPage') ?? 20)))
    const statusFilter = searchParams.get('status')      ?? undefined
    const typeFilter   = searchParams.get('triggerType') ?? undefined

    // Confirma que o importador existe e tem autoSync
    const autoSync = await prisma.googleSheetsAutoSyncConfig.findUnique({
      where: { importerId: params.id },
    })
    if (!autoSync) {
      return NextResponse.json({ success: true, data: [], total: 0, page, perPage })
    }

    const where = {
      configId:    autoSync.id,
      ...(statusFilter ? { status: statusFilter as never } : {}),
      ...(typeFilter   ? { triggerType: typeFilter as never } : {}),
    }

    const [jobs, total] = await prisma.$transaction([
      prisma.googleSheetsAutoSyncJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip:    (page - 1) * perPage,
        take:    perPage,
        include: { createdBy: { select: { id: true, name: true, email: true } } },
      }),
      prisma.googleSheetsAutoSyncJob.count({ where }),
    ])

    return NextResponse.json({
      success: true,
      data:    jobs,
      total,
      page,
      perPage,
      pages:   Math.ceil(total / perPage),
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
