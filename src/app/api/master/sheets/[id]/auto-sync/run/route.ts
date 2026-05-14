// =============================================================================
// POST /api/master/sheets/[id]/auto-sync/run
// Execução manual do auto-sync (MASTER only).
// Cria GoogleSheetsAutoSyncJob, respeita lock e atualiza config.
// Body: { dryRun?: boolean, tabId?: string }
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireMaster }       from '@/lib/master-guards'
import { prisma }              from '@/lib/prisma'
import { handlePrismaError }   from '@/lib/prisma-errors'
import { runCoreImport, computeNextRunAt } from '@/lib/sheets-core-import'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireMaster()
  if (error) return error

  try {
    const body   = await req.json().catch(() => ({}))
    const dryRun = body.dryRun === true
    const tabId  = body.tabId as string | undefined

    // Garante que o importador existe
    const config = await prisma.googleSheetConfig.findUnique({
      where:   { id: params.id },
      include: { autoSync: true },
    })
    if (!config) return NextResponse.json({ success: false, error: 'Importador não encontrado.' }, { status: 404 })

    let autoSync = config.autoSync

    // Cria config padrão se ainda não existir
    if (!autoSync) {
      autoSync = await prisma.googleSheetsAutoSyncConfig.create({
        data: { importerId: params.id },
      })
    }

    // Verifica lock (exceto se o lock já expirou)
    const now = new Date()
    if (autoSync.isRunning && autoSync.lockUntil && autoSync.lockUntil > now) {
      return NextResponse.json(
        { success: false, error: 'Atualização já em andamento. Aguarde a execução terminar.', errorCode: 'LOCKED' },
        { status: 409 },
      )
    }

    const lockUntil = new Date(now.getTime() + autoSync.timeoutSeconds * 1_000)

    // Aplica lock
    await prisma.googleSheetsAutoSyncConfig.update({
      where: { id: autoSync.id },
      data:  { isRunning: true, lockUntil, status: 'RODANDO' },
    })

    // Cria job de rastreamento
    const job = await prisma.googleSheetsAutoSyncJob.create({
      data: {
        importerId:      params.id,
        configId:        autoSync.id,
        status:          'RUNNING',
        triggerType:     dryRun ? 'SIMULATION' : 'MANUAL',
        createdByUserId: session.id,
      },
    })

    let summary
    let jobStatus: 'SUCCESS' | 'ERROR' = 'SUCCESS'
    let lastError: string | null = null

    try {
      summary = await runCoreImport({
        configId:  params.id,
        tabId,
        dryRun,
        maxRows:   autoSync.maxRowsPerRun,
        triggeredById: session.id,
      })
      if (summary.errors.length > 0) jobStatus = 'ERROR'
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      summary = {
        totalRows: 0, newRecords: 0, updatedRecords: 0, errorRows: 0,
        sheetsRead: [], sheetsNotFound: [], errors: [msg], durationMs: 0,
      }
      jobStatus  = 'ERROR'
      lastError  = msg
    }

    const finishedAt = new Date()

    // Atualiza job
    await prisma.googleSheetsAutoSyncJob.update({
      where: { id: job.id },
      data:  {
        status:        jobStatus,
        finishedAt,
        durationMs:    summary.durationMs,
        rowsRead:      summary.totalRows,
        rowsImported:  summary.newRecords,
        rowsUpdated:   summary.updatedRecords,
        rowsError:     summary.errorRows,
        sheetsRead:    summary.sheetsRead,
        sheetsNotFound: summary.sheetsNotFound,
        errors:        summary.errors.length > 0 ? summary.errors : undefined,
        summary: {
          dryRun,
          totalRows:      summary.totalRows,
          newRecords:     summary.newRecords,
          updatedRecords: summary.updatedRecords,
          errorRows:      summary.errorRows,
        },
      },
    })

    // Computa próxima execução
    const nextRunAt = computeNextRunAt(
      autoSync.frequencyMinutes,
      (autoSync.allowedDays as number[]) ?? [],
      autoSync.startTime,
      autoSync.endTime,
      finishedAt,
    )

    // Libera lock e atualiza config
    await prisma.googleSheetsAutoSyncConfig.update({
      where: { id: autoSync.id },
      data:  {
        isRunning: false,
        lockUntil: null,
        status:    autoSync.enabled ? 'AGUARDANDO' : 'PAUSADO',
        lastRunAt: finishedAt,
        nextRunAt: nextRunAt ?? null,
        lastStatus: jobStatus,
        lastError,
      },
    })

    return NextResponse.json({
      success:     jobStatus === 'SUCCESS',
      dryRun,
      jobId:       job.id,
      message:     dryRun ? 'Simulação concluída.' : 'Execução manual concluída.',
      ...summary,
    })
  } catch (err) {
    // Libera lock em caso de erro fatal
    await prisma.googleSheetsAutoSyncConfig.updateMany({
      where: { importerId: params.id, isRunning: true },
      data:  { isRunning: false, lockUntil: null, status: 'ERRO', lastStatus: 'ERROR' },
    }).catch(() => {})
    return handlePrismaError(err)
  }
}
