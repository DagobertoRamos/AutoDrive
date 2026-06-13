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
import { runDealProcessor }               from '@/lib/sheets-deal-processor'

export async function POST(req: NextRequest, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const { session, error } = await requireMaster()
  if (error) return error

  try {
    const body   = await req.json().catch(() => ({}))
    const dryRun = body.dryRun === true
    const tabId  = body.tabId as string | undefined

    // ── Carrega o importador com abas ativas para validar antes de bloquear ────
    const config = await prisma.googleSheetConfig.findUnique({
      where:   { id: params.id },
      include: {
        autoSync: true,
        tabs:     { where: { active: true } },
      },
    })

    if (!config) {
      return NextResponse.json({ success: false, error: 'Importador não encontrado.' }, { status: 404 })
    }

    // ── Validações antes de adquirir o lock ───────────────────────────────────
    if (!config.tenantId) {
      return NextResponse.json(
        { success: false, error: 'Importador sem tenant vinculado. Configure o tenant na aba Configurações.' },
        { status: 400 },
      )
    }
    if (!config.unitId) {
      return NextResponse.json(
        { success: false, error: 'Importador sem unidade vinculada. Configure a unidade na aba Configurações.' },
        { status: 400 },
      )
    }
    if (config.tabs.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Nenhuma aba ativa cadastrada. Adicione e ative pelo menos uma aba antes de executar.' },
        { status: 400 },
      )
    }

    // ── Garante que a config de auto-sync existe ──────────────────────────────
    let autoSync = config.autoSync
    if (!autoSync) {
      autoSync = await prisma.googleSheetsAutoSyncConfig.create({
        data: { importerId: params.id },
      })
    }

    // ── Verifica lock (ignora lock expirado) ──────────────────────────────────
    const now = new Date()
    if (autoSync.isRunning && autoSync.lockUntil && autoSync.lockUntil > now) {
      return NextResponse.json(
        { success: false, error: 'Atualização já em andamento. Aguarde a execução terminar.', errorCode: 'LOCKED' },
        { status: 409 },
      )
    }

    const lockUntil = new Date(now.getTime() + autoSync.timeoutSeconds * 1_000)

    // ── Adquire lock ──────────────────────────────────────────────────────────
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

    // ── Executa a importação (lock sempre liberado no finally) ─────────────────
    let jobStatus: 'SUCCESS' | 'ERROR' = 'SUCCESS'
    let lastError: string | null       = null
    let summary = {
      totalRows: 0, newRecords: 0, updatedRecords: 0, errorRows: 0,
      sheetsRead: [] as string[], sheetsNotFound: [] as string[],
      errors: [] as string[], durationMs: 0,
    }
    let dealSummary: {
      dealsCreated: number; dealsUpdated: number; provisionalSellers: number
      errors: number; totalRows: number
    } | null = null

    try {
      summary = await runCoreImport({
        configId:      params.id,
        tabId,
        dryRun,
        maxRows:       autoSync.maxRowsPerRun,
        triggeredById: session.id,
      })
      if (summary.errors.length > 0) {
        jobStatus = 'ERROR'
        lastError = summary.errors[0]
      }

      // Processa negociações a partir do staging (sempre, não depende de flag)
      if (!dryRun) {
        try {
          const ds = await runDealProcessor({
            configId:      params.id,
            dryRun:        false,
            triggeredById: session.id,
          })
          dealSummary = {
            dealsCreated:      ds.dealsCreated,
            dealsUpdated:      ds.dealsUpdated,
            provisionalSellers:ds.provisionalSellers,
            errors:            ds.errors,
            totalRows:         ds.totalRows,
          }
          if (ds.errors > 0) {
            summary.errors.push(...ds.errorDetails.slice(0, 10).map(e => `[Deal] ${e}`))
          }
        } catch (dealErr) {
          // Falha no processamento de negociações não interrompe o ciclo principal
          const msg = dealErr instanceof Error ? dealErr.message : String(dealErr)
          summary.errors.push(`[Negociações] ${msg}`)
        }
      }
    } catch (runErr) {
      const msg = runErr instanceof Error ? runErr.message : String(runErr)
      summary.errors = [msg]
      jobStatus  = 'ERROR'
      lastError  = msg
    } finally {
      // ── Libera lock SEMPRE — mesmo que a atualização do job falhe ────────────
      const finishedAt = new Date()
      const nextRunAt  = computeNextRunAt(
        autoSync.frequencyMinutes,
        (autoSync.allowedDays as number[]) ?? [],
        autoSync.startTime,
        autoSync.endTime,
        finishedAt,
      )

      await prisma.googleSheetsAutoSyncConfig.update({
        where: { id: autoSync.id },
        data:  {
          isRunning:  false,
          lockUntil:  null,
          status:     autoSync.enabled ? (jobStatus === 'ERROR' ? 'ERRO' : 'AGUARDANDO') : 'PAUSADO',
          lastRunAt:  finishedAt,
          nextRunAt:  nextRunAt ?? null,
          lastStatus: jobStatus,
          lastError,
        },
      }).catch(() => { /* silencia — não pode bloquear a resposta */ })

      // Atualiza job com resultado
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
            ...(dealSummary ? { dealSummary } : {}),
          },
        },
      }).catch(() => { /* silencia — lock já foi liberado */ })
    }

    return NextResponse.json({
      success:        jobStatus === 'SUCCESS',
      dryRun,
      jobId:          job.id,
      message:        dryRun ? 'Simulação concluída.' : 'Execução manual concluída.',
      // `error` exposto diretamente para o frontend poder exibir
      error:          jobStatus === 'ERROR' ? (lastError ?? 'Falha na importação.') : undefined,
      totalRows:      summary.totalRows,
      newRecords:     summary.newRecords,
      updatedRecords: summary.updatedRecords,
      errorRows:      summary.errorRows,
      sheetsRead:     summary.sheetsRead,
      sheetsNotFound: summary.sheetsNotFound,
      errors:         summary.errors.slice(0, 20),
      ...(dealSummary ? { dealSummary } : {}),
    })
  } catch (err) {
    // Erro fatal (antes ou depois do lock) — tenta liberar lock e retorna 500
    await prisma.googleSheetsAutoSyncConfig.updateMany({
      where: { importerId: params.id, isRunning: true },
      data:  { isRunning: false, lockUntil: null, status: 'ERRO', lastStatus: 'ERROR' },
    }).catch(() => {})
    return handlePrismaError(err)
  }
}
