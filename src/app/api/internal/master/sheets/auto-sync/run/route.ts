// =============================================================================
// POST /api/internal/master/sheets/auto-sync/run
// Endpoint de cron protegido por CRON_SECRET.
// Percorre todos os importadores com auto-sync ativo e executa os que:
//   - estão habilitados
//   - estão dentro do dia/horário permitido
//   - não estão em lock
//   - superaram o intervalo desde a última execução
//
// Header obrigatório: Authorization: Bearer <CRON_SECRET>
//               ou:   x-cron-secret: <CRON_SECRET>
//
// Configurar CRON_SECRET no .env e na plataforma de hospedagem.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { prisma }              from '@/lib/prisma'
import { runCoreImport, computeNextRunAt } from '@/lib/sheets-core-import'

// ── Autenticação do cron ──────────────────────────────────────────────────────

function validateCronSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[auto-sync/cron] CRON_SECRET não configurado — endpoint recusando todas as requisições.')
    return false
  }

  const authHeader = req.headers.get('authorization')
  const secretHeader = req.headers.get('x-cron-secret')

  if (authHeader?.startsWith('Bearer ') && authHeader.slice(7) === secret) return true
  if (secretHeader === secret) return true
  return false
}

// ── Verifica janela de execução ───────────────────────────────────────────────

function isWithinWindow(
  allowedDays: number[],
  startTime: string,
  endTime: string,
  now: Date,
): boolean {
  const dayOfWeek = now.getDay()
  if (!allowedDays.includes(dayOfWeek)) return false

  const [startH, startM] = startTime.split(':').map(Number)
  const [endH,   endM  ] = endTime.split(':').map(Number)
  const minOfDay = now.getHours() * 60 + now.getMinutes()

  return minOfDay >= startH * 60 + startM && minOfDay <= endH * 60 + endM
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!validateCronSecret(req)) {
    return NextResponse.json({ success: false, error: 'Não autorizado.' }, { status: 401 })
  }

  const cronStartedAt = new Date()
  const results: Array<{
    importerId:  string
    importerName: string
    skipped?:    string
    success?:    boolean
    jobId?:      string
    summary?:    Record<string, unknown>
    error?:      string
  }> = []

  try {
    // Busca todos os importadores com auto-sync habilitado
    const configs = await prisma.googleSheetsAutoSyncConfig.findMany({
      where:   { enabled: true },
      include: { importer: { select: { id: true, name: true, active: true } } },
    })

    if (configs.length === 0) {
      return NextResponse.json({ success: true, message: 'Nenhum importador com auto-sync ativo.', results: [] })
    }

    const now = new Date()

    for (const autoSync of configs) {
      const importerName = autoSync.importer?.name ?? autoSync.importerId

      // Importador inativo
      if (!autoSync.importer?.active) {
        results.push({ importerId: autoSync.importerId, importerName, skipped: 'Importador inativo.' })
        continue
      }

      // Verifica janela de dia/horário
      const allowedDays = (autoSync.allowedDays as number[]) ?? []
      if (!isWithinWindow(allowedDays, autoSync.startTime, autoSync.endTime, now)) {
        results.push({ importerId: autoSync.importerId, importerName, skipped: 'Fora da janela de execução.' })
        continue
      }

      // Verifica se ainda não chegou o momento (intervalo desde última execução)
      if (autoSync.lastRunAt) {
        const nextDue = new Date(autoSync.lastRunAt.getTime() + autoSync.frequencyMinutes * 60_000)
        if (now < nextDue) {
          results.push({
            importerId: autoSync.importerId,
            importerName,
            skipped: `Aguardando próxima execução (${nextDue.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}).`,
          })
          continue
        }
      }

      // Verifica lock (execução em andamento)
      if (autoSync.isRunning && autoSync.lockUntil && autoSync.lockUntil > now) {
        results.push({ importerId: autoSync.importerId, importerName, skipped: 'Execução já em andamento (lock ativo).' })
        continue
      }

      const dryRun    = autoSync.mode === 'SIMULATION'
      const lockUntil = new Date(now.getTime() + autoSync.timeoutSeconds * 1_000)

      // Aplica lock
      await prisma.googleSheetsAutoSyncConfig.update({
        where: { id: autoSync.id },
        data:  { isRunning: true, lockUntil, status: 'RODANDO' },
      })

      // Cria job de rastreamento
      const job = await prisma.googleSheetsAutoSyncJob.create({
        data: {
          importerId:  autoSync.importerId,
          configId:    autoSync.id,
          status:      'RUNNING',
          triggerType: 'AUTO',
        },
      })

      let summary
      let jobStatus: 'SUCCESS' | 'ERROR' = 'SUCCESS'
      let lastError: string | null = null

      try {
        summary = await runCoreImport({
          configId: autoSync.importerId,
          dryRun,
          maxRows:  autoSync.maxRowsPerRun,
        })
        if (summary.errors.length > 0) jobStatus = 'ERROR'
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        summary = {
          totalRows: 0, newRecords: 0, updatedRecords: 0, errorRows: 0,
          sheetsRead: [], sheetsNotFound: [], errors: [msg], durationMs: 0,
        }
        jobStatus = 'ERROR'
        lastError = msg
        console.error(`[auto-sync/cron] Erro no importador ${importerName}:`, msg)
      }

      const finishedAt = new Date()

      await prisma.googleSheetsAutoSyncJob.update({
        where: { id: job.id },
        data:  {
          status:         jobStatus,
          finishedAt,
          durationMs:     summary.durationMs,
          rowsRead:       summary.totalRows,
          rowsImported:   summary.newRecords,
          rowsUpdated:    summary.updatedRecords,
          rowsError:      summary.errorRows,
          sheetsRead:     summary.sheetsRead,
          sheetsNotFound: summary.sheetsNotFound,
          errors:         summary.errors.length > 0 ? summary.errors : undefined,
          summary: {
            dryRun,
            totalRows:      summary.totalRows,
            newRecords:     summary.newRecords,
            updatedRecords: summary.updatedRecords,
            errorRows:      summary.errorRows,
          },
        },
      })

      // Atualiza config + libera lock
      const nextRunAt = computeNextRunAt(
        autoSync.frequencyMinutes,
        allowedDays,
        autoSync.startTime,
        autoSync.endTime,
        finishedAt,
      )

      await prisma.googleSheetsAutoSyncConfig.update({
        where: { id: autoSync.id },
        data:  {
          isRunning: false,
          lockUntil: null,
          status:    'AGUARDANDO',
          lastRunAt: finishedAt,
          nextRunAt: nextRunAt ?? null,
          lastStatus: jobStatus,
          lastError,
        },
      })

      results.push({
        importerId:   autoSync.importerId,
        importerName,
        success:      jobStatus === 'SUCCESS',
        jobId:        job.id,
        summary: {
          dryRun,
          totalRows:      summary.totalRows,
          newRecords:     summary.newRecords,
          updatedRecords: summary.updatedRecords,
          errorRows:      summary.errorRows,
          durationMs:     summary.durationMs,
        },
        ...(lastError ? { error: lastError } : {}),
      })
    }

    return NextResponse.json({
      success:    true,
      message:    `Cron executado. ${results.filter(r => r.success).length} importadores processados.`,
      cronDurationMs: Date.now() - cronStartedAt.getTime(),
      results,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[auto-sync/cron] Erro fatal:', msg)
    return NextResponse.json(
      { success: false, error: msg, results },
      { status: 500 },
    )
  }
}
