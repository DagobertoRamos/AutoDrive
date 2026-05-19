// =============================================================================
// GET  /api/master/sheets/[id]/auto-sync  — Lê configuração de auto-sync
// PUT  /api/master/sheets/[id]/auto-sync  — Salva configuração de auto-sync
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z }                from 'zod'
import { requireMaster }    from '@/lib/master-guards'
import { prisma }           from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'
import { computeNextRunAt } from '@/lib/sheets-core-import'

const schema = z.object({
  enabled:             z.boolean().optional(),
  mode:                z.enum(['SIMULATION', 'REAL']).optional(),
  frequencyMinutes:    z.number().int().min(1).max(1440).optional(),
  allowedDays:         z.array(z.number().int().min(0).max(6)).optional(),
  startTime:           z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime:             z.string().regex(/^\d{2}:\d{2}$/).optional(),
  selectedTabs:        z.array(z.string()).nullable().optional(),
  actionAfterDownload: z.enum([
    'APENAS_BAIXAR',
    'IMPORTAR_PENDENCIAS',
    'IMPORTAR_E_ALERTAR',
    'IMPORTAR_E_NOTIFICAR_GERENTE',
    'IMPORTAR_E_NOTIFICAR_TODOS',
  ]).optional(),
  processDeals:        z.boolean().optional(),
  notifyOnNewRecords:  z.boolean().optional(),
  notifyOnError:       z.boolean().optional(),
  errorNotifyTarget:   z.string().nullable().optional(),
  maxRowsPerRun:       z.number().int().min(1).max(10000).optional(),
  timeoutSeconds:      z.number().int().min(10).max(600).optional(),
})

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await requireMaster()
  if (error) return error

  try {
    const config = await prisma.googleSheetConfig.findUnique({
      where:   { id: params.id },
      include: { autoSync: { include: { jobs: { orderBy: { createdAt: 'desc' }, take: 1 } } } },
    })
    if (!config) return NextResponse.json({ success: false, error: 'Importador não encontrado.' }, { status: 404 })

    const autoSync = config.autoSync

    // Computa próxima execução dinamicamente
    let nextRunAt: string | null = null
    if (autoSync?.enabled && !autoSync.isRunning) {
      const from = autoSync.lastRunAt
        ? new Date(autoSync.lastRunAt.getTime() + autoSync.frequencyMinutes * 60_000)
        : new Date()
      const next = computeNextRunAt(
        autoSync.frequencyMinutes,
        (autoSync.allowedDays as number[]) ?? [],
        autoSync.startTime,
        autoSync.endTime,
        from,
      )
      nextRunAt = next?.toISOString() ?? null
    }

    return NextResponse.json({
      success: true,
      data:    autoSync
        ? {
            ...autoSync,
            allowedDays: (autoSync.allowedDays as number[]) ?? [],
            selectedTabs: (autoSync.selectedTabs as string[] | null) ?? null,
            nextRunAt,
            lastJob: autoSync.jobs[0] ?? null,
          }
        : null,
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}

// ── PUT ───────────────────────────────────────────────────────────────────────

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await requireMaster()
  if (error) return error

  try {
    const config = await prisma.googleSheetConfig.findUnique({ where: { id: params.id } })
    if (!config) return NextResponse.json({ success: false, error: 'Importador não encontrado.' }, { status: 404 })

    const body   = await req.json().catch(() => ({}))
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.errors[0]?.message ?? 'Dados inválidos.' }, { status: 400 })
    }

    const data = parsed.data

    // Calcula nextRunAt ao habilitar ou alterar frequência/dias/horas
    let nextRunAt: Date | null | undefined = undefined
    if (data.enabled === true || data.frequencyMinutes !== undefined || data.allowedDays !== undefined) {
      const existing = await prisma.googleSheetsAutoSyncConfig.findUnique({ where: { importerId: params.id } })
      const freq     = data.frequencyMinutes ?? existing?.frequencyMinutes ?? 30
      const days     = data.allowedDays     ?? (existing?.allowedDays as number[]) ?? [1,2,3,4,5]
      const start    = data.startTime       ?? existing?.startTime                 ?? '08:00'
      const end      = data.endTime         ?? existing?.endTime                   ?? '18:00'
      const from     = existing?.lastRunAt
        ? new Date(existing.lastRunAt.getTime() + freq * 60_000)
        : new Date()
      nextRunAt = computeNextRunAt(freq, days, start, end, from) ?? null
    }

    const upsertData: Record<string, unknown> = { ...data }
    if (nextRunAt !== undefined) upsertData.nextRunAt = nextRunAt
    // Ao ativar → AGUARDANDO; ao desativar → PAUSADO + limpa nextRunAt
    if (data.enabled === true)  { upsertData.status = 'AGUARDANDO' }
    if (data.enabled === false) { upsertData.status = 'PAUSADO'; upsertData.nextRunAt = null }

    await prisma.googleSheetsAutoSyncConfig.upsert({
      where:  { importerId: params.id },
      create: { importerId: params.id, ...upsertData },
      update: upsertData,
    })

    // Relê com jobs incluídos para o frontend manter o estado correto
    const updated = await prisma.googleSheetsAutoSyncConfig.findUnique({
      where:   { importerId: params.id },
      include: { jobs: { orderBy: { createdAt: 'desc' }, take: 1 } },
    })

    return NextResponse.json({
      success: true,
      data: updated
        ? {
            ...updated,
            allowedDays:  (updated.allowedDays as number[])       ?? [],
            selectedTabs: (updated.selectedTabs as string[] | null) ?? null,
            nextRunAt:    updated.nextRunAt?.toISOString()         ?? null,
            lastJob:      updated.jobs[0]                          ?? null,
          }
        : null,
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
