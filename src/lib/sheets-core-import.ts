// =============================================================================
// src/lib/sheets-core-import.ts
// Lógica central de importação do Google Sheets.
// Usada tanto pelo endpoint manual (/api/master/sheets/[id]/import)
// quanto pelo auto-sync (/api/master/sheets/[id]/auto-sync/run e cron).
// =============================================================================

import { prisma }          from '@/lib/prisma'
import { google }          from 'googleapis'
import { buildGoogleAuth } from '@/lib/google-auth'

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface CoreImportOptions {
  configId:        string
  tabId?:          string    // undefined = todas as abas ativas
  dryRun?:         boolean
  maxRows?:        number    // 0 = sem limite
  triggeredById?:  string    // userId (para ImportJob)
}

export interface CoreImportSummary {
  totalRows:      number
  newRecords:     number
  updatedRecords: number
  errorRows:      number
  sheetsRead:     string[]
  sheetsNotFound: string[]
  errors:         string[]
  durationMs:     number
}

// ── Função principal ──────────────────────────────────────────────────────────

export async function runCoreImport(opts: CoreImportOptions): Promise<CoreImportSummary> {
  const startedAt = new Date()

  const config = await prisma.googleSheetConfig.findUnique({
    where:   { id: opts.configId },
    include: {
      tabs: {
        where:   { active: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      },
    },
  })

  if (!config)           throw new Error('Importador não encontrado.')
  if (!config.tenantId)  throw new Error('Tenant vinculado não configurado.')
  if (!config.unitId)    throw new Error('Unidade vinculada não configurada.')
  if (config.tabs.length === 0) throw new Error('Nenhuma aba ativa cadastrada.')

  const activeTabs = opts.tabId
    ? config.tabs.filter(t => t.id === opts.tabId)
    : config.tabs

  const mapping    = (config.columnMapping ?? {}) as Record<string, string>
  const auth       = await buildGoogleAuth()
  const sheets     = google.sheets({ version: 'v4', auth })
  const maxRows    = opts.maxRows && opts.maxRows > 0 ? opts.maxRows : Infinity

  let totalRows      = 0
  let newRecords     = 0
  let updatedRecords = 0
  let errorRows      = 0
  const errors:         string[] = []
  const sheetsRead:     string[] = []
  const sheetsNotFound: string[] = []

  for (const tab of activeTabs) {
    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: config.spreadsheetId,
        range:         `${tab.sheetName}!A1:ZZ`,
      })

      sheetsRead.push(tab.sheetName)
      const rows     = response.data.values ?? []
      if (rows.length < 2) continue

      const dataRows = rows.slice(tab.headerRow ?? 1)
      let rowIndex   = tab.headerRow ?? 1

      for (const rawRow of dataRows) {
        if (totalRows >= maxRows) break
        totalRows++
        rowIndex++

        const row: Record<string, string> = {}
        Object.entries(mapping).forEach(([idx, field]) => {
          row[field] = String(rawRow[Number(idx)] ?? '').trim()
        })

        if (!row.negotiation) { errorRows++; continue }
        if (!row.customerName && !row.unit) { errorRows++; continue }

        const dedupeField = (config.dedupeField ?? 'negotiation') as keyof typeof row
        const dedupeValue = row[dedupeField]
        if (!dedupeValue) { errorRows++; continue }

        if (opts.dryRun) { newRecords++; continue }

        // ── Salva na staging table SheetImportRow (sempre, independente do vendedor) ──
        if (config.tenantId && config.unitId) {
          try {
            const dedupeKey = `${config.id}:${tab.sheetName}:${row.negotiation}`
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const existingRow = await (prisma.sheetImportRow as any).findFirst({
              where: { dedupeKey },
            })

            const stagingData = {
              configId:      config.id,
              tabId:         tab.id,
              sheetName:     tab.sheetName,
              rowIndex,
              referenceMonth:tab.monthReference ?? undefined,
              rawData:       row,
              externalId:    row.negotiation    || undefined,
              dedupeKey,
              customerName:  row.customerName   || row.unit || undefined,
              sellerName:    row.sellerName      || undefined,
              plate:         row.plate           || undefined,
              vehicleModel:  row.vehicle         || undefined,
              saleDate:      row.saleDate        || undefined,
              statusMain:    row.statusMain      || undefined,
              statusDetail:  row.statusDetail    || undefined,
              saleValue:     row.saleValue       || undefined,
              docValue:      row.docValue        || undefined,
              financedValue: row.financedValue   || undefined,
              bank:          row.bank            || undefined,
              returnType:    row.returnType      || undefined,
              dealType:      row.dealType        || undefined,
              timeInStock:   row.timeInStock     || undefined,
              updatedAt:     new Date(),
            }

            if (existingRow && ['NEGOCIACAO_CRIADA', 'NEGOCIACAO_ATUALIZADA'].includes(existingRow.status)) {
              // Já processado com sucesso — só atualiza rawData para manter dados frescos
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (prisma.sheetImportRow as any).update({
                where: { id: existingRow.id },
                data:  { rawData: row, updatedAt: new Date() },
              })
            } else if (existingRow) {
              // Existe mas não foi processado com sucesso → reseta para PENDENTE
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (prisma.sheetImportRow as any).update({
                where: { id: existingRow.id },
                data:  { ...stagingData, status: 'PENDENTE', errorMessage: null, processedAt: null },
              })
            } else {
              // Nova linha — cria como PENDENTE para o deal processor processar
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (prisma.sheetImportRow as any).create({ data: { ...stagingData, status: 'PENDENTE' } })
            }
          } catch {
            // Falha no staging não impede o fluxo de pendências (não-bloqueante)
          }
        }

        // Linha salva na staging — o deal processor criará negociação e pendência vinculada
        newRecords++
      }

      if (!opts.dryRun) {
        await prisma.googleSheetTab.update({
          where: { id: tab.id },
          data:  { lastSyncAt: new Date(), lastSyncStatus: 'SUCCESS', totalRowsLast: dataRows.length },
        }).catch(() => {})
      }
    } catch (tabErr) {
      const msg = tabErr instanceof Error ? tabErr.message : String(tabErr)
      if (msg.includes('Unable to parse range') || msg.includes('not found')) {
        sheetsNotFound.push(tab.sheetName)
      } else {
        errors.push(`Aba ${tab.sheetName}: ${msg}`)
      }
      await prisma.googleSheetTab.update({
        where: { id: tab.id },
        data:  { lastSyncAt: new Date(), lastSyncStatus: 'ERROR', lastSyncError: msg },
      }).catch(() => {})
    }
  }

  if (!opts.dryRun) {
    await prisma.googleSheetConfig.update({
      where: { id: config.id },
      data:  { lastSyncAt: new Date(), syncStatus: errors.length > 0 ? 'ERROR' : 'SUCCESS' },
    }).catch(() => {})
  }

  return {
    totalRows,
    newRecords,
    updatedRecords,
    errorRows,
    sheetsRead,
    sheetsNotFound,
    errors:     errors.slice(0, 50),
    durationMs: Date.now() - startedAt.getTime(),
  }
}

// ── Helper: calcula próxima execução ─────────────────────────────────────────

export function computeNextRunAt(
  frequencyMinutes: number,
  allowedDays: number[],
  startTime: string,
  endTime: string,
  fromNow: Date = new Date(),
): Date | null {
  if (!allowedDays.length) return null

  const [startH, startM] = startTime.split(':').map(Number)
  const [endH,   endM  ] = endTime.split(':').map(Number)

  // Tenta até 7 dias à frente
  for (let d = 0; d < 7 * 24 * 60; d += frequencyMinutes) {
    const candidate = new Date(fromNow.getTime() + d * 60_000)
    const dayOfWeek = candidate.getDay()
    const h = candidate.getHours()
    const m = candidate.getMinutes()
    const minOfDay = h * 60 + m

    if (!allowedDays.includes(dayOfWeek)) continue
    if (minOfDay < startH * 60 + startM)  continue
    if (minOfDay > endH * 60 + endM)       continue

    return candidate
  }

  return null
}
